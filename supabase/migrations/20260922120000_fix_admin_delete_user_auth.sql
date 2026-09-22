-- The original delete RPC was deployed with a service_role-only grant and
-- logged after deleting the target auth row. Admin API calls use the caller's
-- authenticated client so auth.uid() remains available to the guard.
create or replace function public.admin_delete_user(
  p_user uuid,
  p_confirm_email text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
begin
  perform public.assert_platform_admin();

  select email
    into v_email
  from auth.users
  where id = p_user;

  if v_email is null then
    raise exception 'User not found';
  end if;

  if p_confirm_email is null or v_email <> p_confirm_email then
    raise exception 'Email confirmation does not match';
  end if;

  if public.is_platform_admin(p_user) then
    raise exception 'System Administrator accounts cannot be deleted from the user list';
  end if;

  -- The legacy ownership pointer is restrictive; clear it without deleting
  -- the workspace. The normalized workspace_owners rows cascade with profile.
  update public.workspaces
     set owner_id = null
   where owner_id = p_user;

  -- The audit row is written before the auth row is removed. The target_id is
  -- intentionally not an FK, so the record remains after the cascade.
  perform public.log_platform_action(
    'user.deleted',
    'user',
    p_user,
    jsonb_build_object('email', v_email)
  );

  delete from auth.users
  where id = p_user;
end;
$$;

revoke all on function public.admin_delete_user(uuid, text) from public;
grant execute on function public.admin_delete_user(uuid, text) to authenticated;
grant execute on function public.admin_delete_user(uuid, text) to service_role;

-- Owners use the same active profile and membership gates as other members.
-- Without these checks, ownership could bypass a global suspension.
create or replace function public.current_workspace_ids(p_user uuid default auth.uid())
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.id
    from public.workspaces w
   where w.deleted_at is null
     and w.status in ('active', 'archived')
     and exists (
       select 1
         from public.profiles p
         join public.workspace_members m on m.user_id = p.id
        where p.id = p_user
          and p.is_active
          and m.workspace_id = w.id
          and m.status = 'active'
     );
$$;

create or replace function public.is_workspace_member(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
        from public.profiles p
        join public.workspace_members m on m.user_id = p.id
       where p.id = auth.uid()
         and p.is_active
         and m.workspace_id = p_workspace
         and m.status = 'active'
    );
$$;

create or replace function public.has_capability(
  p_user uuid,
  p_workspace uuid,
  p_capability text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_user is not null
    and p_workspace is not null
    and exists (
      select 1
        from public.profiles p
        join public.workspace_members m on m.user_id = p.id
       where p.id = p_user
         and p.is_active
         and m.workspace_id = p_workspace
         and m.status = 'active'
         and (
           public.is_workspace_owner(p_workspace, p_user)
           or exists (
             select 1
               from public.position_permissions pp
              where pp.position_id = m.position_id
                and pp.capability = p_capability
                and pp.allowed
           )
         )
    );
$$;
