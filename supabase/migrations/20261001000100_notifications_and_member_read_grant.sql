-- Creation events use the existing notification type to avoid changing the
-- notification enum or client contract.
create or replace function public.notify_project_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notifications
    (user_id, workspace_id, project_id, actor_id, type, title, body, payload)
  select m.user_id, new.workspace_id, new.id, auth.uid(), 'issue_created',
         'New project: ' || new.name, new.description,
         jsonb_build_object('project_key', new.key)
    from public.workspace_members m
   where m.workspace_id = new.workspace_id
     and m.user_id is distinct from auth.uid();

  return new;
end;
$$;

drop trigger if exists projects_notify_created on public.projects;
create trigger projects_notify_created
  after insert on public.projects
  for each row execute function public.notify_project_created();

create or replace function public.notify_sprint_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace uuid;
  v_project_key text;
begin
  select p.workspace_id, p.key
    into v_workspace, v_project_key
    from public.projects p
   where p.id = new.project_id;

  insert into public.notifications
    (user_id, workspace_id, project_id, actor_id, type, title, body, payload)
  select m.user_id, v_workspace, new.project_id, auth.uid(), 'issue_created',
         'New sprint: ' || new.name, new.goal,
         jsonb_build_object('sprint_id', new.id, 'project_key', v_project_key)
    from public.workspace_members m
   where m.workspace_id = v_workspace
     and m.user_id is distinct from auth.uid();

  return new;
end;
$$;

drop trigger if exists sprints_notify_created on public.sprints;
create trigger sprints_notify_created
  after insert on public.sprints
  for each row execute function public.notify_sprint_created();

-- Table privileges and row visibility are separate: authenticated users may
-- query memberships, while the existing RLS policy limits rows to their own
-- workspaces. No access is granted to anon.
grant select on table public.workspace_members to authenticated;