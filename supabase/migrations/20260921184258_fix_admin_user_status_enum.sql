create or replace function public.admin_set_user_active(
  p_user   uuid,
  p_active boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_platform_admin();

  if public.is_platform_admin(p_user) and not p_active then
    raise exception 'Deactivate a System Administrator from the Settings page, not the user list';
  end if;

  update public.profiles
     set is_active = p_active,
         updated_at = now()
   where id = p_user;

  update public.workspace_members
     set status = case
       when p_active then 'active'::public.member_status
       else 'suspended'::public.member_status
     end
   where user_id = p_user
     and status <> 'invited';

  perform public.log_platform_action(
    case when p_active then 'user.reactivated' else 'user.suspended' end,
    'user',
    p_user,
    jsonb_build_object('reason', p_reason)
  );
end;
$$;