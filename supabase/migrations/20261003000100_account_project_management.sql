-- Owner-only member removal is workspace-scoped. It deliberately leaves the
-- global profile and Supabase Auth account untouched.
create or replace function public.owner_remove_workspace_member(
  p_workspace uuid,
  p_member uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
     or not public.is_workspace_owner(p_workspace, auth.uid())
     or not public.is_workspace_member(p_workspace)
     or not public.workspace_is_writable(p_workspace) then
    raise exception 'Only this workspace''s Owner can delete members'
      using errcode = 'insufficient_privilege';
  end if;

  if p_member = auth.uid() then
    raise exception 'You cannot delete yourself from this workspace'
      using errcode = 'insufficient_privilege';
  end if;

  if public.is_workspace_owner(p_workspace, p_member) then
    raise exception 'Workspace Owners cannot be deleted here'
      using errcode = 'insufficient_privilege';
  end if;

  if public.is_platform_admin(p_member) then
    raise exception 'System Administrators cannot be deleted here'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.workspace_members
   where workspace_id = p_workspace
     and user_id = p_member;

  if not found then
    raise exception 'Member not found in this workspace';
  end if;
end;
$$;

revoke all on function public.owner_remove_workspace_member(uuid, uuid) from public, anon;
grant execute on function public.owner_remove_workspace_member(uuid, uuid) to authenticated;

-- The project's existing ON DELETE CASCADE relationships perform dependent
-- cleanup in the same transaction. Issues are deleted first because their
-- workflow-status FK is RESTRICT rather than CASCADE.
create or replace function public.admin_delete_project(
  p_workspace uuid,
  p_project uuid
)
returns text[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_key text;
  v_storage_paths text[];
begin
  perform public.assert_platform_admin();

  select name, key
    into v_name, v_key
    from public.projects
   where id = p_project
     and workspace_id = p_workspace
   for update;

  if not found then
    raise exception 'Project not found in this workspace';
  end if;

  select coalesce(array_agg(a.storage_path), array[]::text[])
    into v_storage_paths
    from public.attachments a
    join public.issues i on i.id = a.issue_id
   where i.project_id = p_project;

  perform public.log_platform_action(
    'project.deleted',
    'project',
    p_project,
    jsonb_build_object(
      'workspace_id', p_workspace,
      'name', v_name,
      'key', v_key
    )
  );

  delete from public.issues
   where project_id = p_project;

  delete from public.projects
   where id = p_project
     and workspace_id = p_workspace;

  return v_storage_paths;
end;
$$;

revoke all on function public.admin_delete_project(uuid, uuid) from public, anon;
grant execute on function public.admin_delete_project(uuid, uuid) to authenticated;
