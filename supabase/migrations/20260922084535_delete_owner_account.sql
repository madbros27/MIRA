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
  -- Only the MIRA System Administrator can perform this operation
  perform public.assert_platform_admin();

  -- Get the user's email
  select email
    into v_email
  from auth.users
  where id = p_user;

  if v_email is null then
    raise exception 'User not found';
  end if;

  -- Require exact email confirmation
  if lower(trim(v_email)) <> lower(trim(p_confirm_email)) then
    raise exception 'Email confirmation does not match';
  end if;

  -- Never allow deletion of a System Administrator here
  if public.is_platform_admin(p_user) then
    raise exception 'System Administrator accounts cannot be deleted from the user list';
  end if;

  -- Delete the Auth account.
  -- Related application records should be handled by the existing
  -- foreign-key cascade rules.
  delete from auth.users
  where id = p_user;

  -- Record the action
  perform public.log_platform_action(
    'user.deleted',
    'user',
    p_user,
    jsonb_build_object('email', v_email)
  );
end;
$$;

revoke all on function public.admin_delete_user(uuid, text) from public;

grant execute on function public.admin_delete_user(uuid, text)
to service_role;