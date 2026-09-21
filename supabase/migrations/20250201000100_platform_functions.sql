-- ===========================================================================
-- MIRA — 06. Platform functions
--
-- Permission resolution lives here, in one place, as SECURITY DEFINER
-- functions. RLS policies call these; the application mirrors them in
-- `lib/permissions/capabilities.ts` purely to decide what to *render*.
--
-- The resolution order for any tenant row is always:
--
--   1. Is the caller a System Administrator?   -> read across all tenants
--   2. Is the workspace readable at all?       -> suspended/deleted => no
--   3. Is the caller an Owner of it?           -> everything
--   4. Does the caller's position grant the capability?
--   5. For project rows: is the caller in project_members (or view_all)?
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Platform tier
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.platform_admins pa
     where pa.user_id = p_user and pa.is_active
  );
$$;

comment on function public.is_platform_admin(uuid) is
  'True for System Administrators. Grants cross-tenant READ; writes to tenant data still fail.';

-- ---------------------------------------------------------------------------
-- 2. Workspace lifecycle
-- ---------------------------------------------------------------------------

-- Readable: active or archived. Suspended and deleted workspaces are invisible
-- to their own members — enforced here, not in the UI.
create or replace function public.workspace_is_readable(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspaces w
     where w.id = p_workspace
       and w.deleted_at is null
       and w.status in ('active', 'archived')
  );
$$;

-- Writable: active, not expired. Archived workspaces are read-only.
create or replace function public.workspace_is_writable(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspaces w
     where w.id = p_workspace
       and w.deleted_at is null
       and w.status = 'active'
       and (w.expires_at is null or w.expires_at > now())
  );
$$;

create or replace function public.is_workspace_owner(
  p_workspace uuid,
  p_user      uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspace_owners wo
     where wo.workspace_id = p_workspace
       and wo.user_id = p_user
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Membership
-- ---------------------------------------------------------------------------

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
     and (
       exists (
         select 1 from public.workspace_members m
          where m.workspace_id = w.id
            and m.user_id = p_user
            and m.status = 'active'
       )
       or exists (
         select 1 from public.workspace_owners o
          where o.workspace_id = w.id and o.user_id = p_user
       )
     );
$$;

comment on function public.current_workspace_ids(uuid) is
  'Workspaces a tenant user may enter. Excludes suspended and deleted tenants.';

-- Redefined: the old version only checked for a workspace_members row. It now
-- also honours ownership, member status, workspace lifecycle and the platform
-- tier — which upgrades every policy that already calls it.
create or replace function public.is_workspace_member(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.is_platform_admin()
    or (
      public.workspace_is_readable(p_workspace)
      and (
        public.is_workspace_owner(p_workspace)
        or exists (
          select 1 from public.workspace_members m
           where m.workspace_id = p_workspace
             and m.user_id = auth.uid()
             and m.status = 'active'
        )
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- 4. Capabilities
-- ---------------------------------------------------------------------------

-- Pure permission resolution: does this person's position grant this
-- capability? Workspace lifecycle is deliberately NOT considered here so that
-- callers can distinguish "not allowed" from "workspace is read-only".
create or replace function public.has_capability(
  p_user       uuid,
  p_workspace  uuid,
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
    and (
      -- Owners hold every capability in their own workspace, always.
      public.is_workspace_owner(p_workspace, p_user)
      or exists (
        select 1
          from public.workspace_members m
          join public.position_permissions pp on pp.position_id = m.position_id
         where m.workspace_id = p_workspace
           and m.user_id = p_user
           and m.status = 'active'
           and pp.capability = p_capability
           and pp.allowed
      )
    );
$$;

comment on function public.has_capability(uuid, uuid, text) is
  'Resolves a capability through the member''s position. Owners always true. Does not consider workspace status — pair with workspace_is_writable() for writes.';

-- Convenience wrapper for the common case: "may the caller do X here, now?"
create or replace function public.can_do(p_workspace uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.workspace_is_writable(p_workspace)
     and public.has_capability(auth.uid(), p_workspace, p_capability);
$$;

-- Legacy bridge. Older policies ask for coarse roles; map them onto
-- capabilities so both vocabularies agree during and after the migration.
create or replace function public.has_workspace_role(
  p_workspace uuid,
  p_roles     public.workspace_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.is_workspace_owner(p_workspace)
    or (
      public.workspace_is_readable(p_workspace)
      and (
        ('admin'::public.workspace_role  = any (p_roles) and public.has_capability(auth.uid(), p_workspace, 'workspace.settings'))
        or ('lead'::public.workspace_role   = any (p_roles) and public.has_capability(auth.uid(), p_workspace, 'project.edit'))
        or ('member'::public.workspace_role = any (p_roles) and public.has_capability(auth.uid(), p_workspace, 'issue.create'))
        or ('viewer'::public.workspace_role = any (p_roles) and public.is_workspace_member(p_workspace))
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- 5. Project scoping — the rule that keeps a Manager inside their own projects
-- ---------------------------------------------------------------------------

create or replace function public.project_role_of(
  p_project uuid,
  p_user    uuid default auth.uid()
)
returns public.project_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select pm.project_role
    from public.project_members pm
   where pm.project_id = p_project and pm.user_id = p_user;
$$;

create or replace function public.is_project_member(
  p_project uuid,
  p_user    uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.project_members pm
     where pm.project_id = p_project and pm.user_id = p_user
  );
$$;

-- READ. Workspace membership alone is not enough: you need a project_members
-- row, or the `project.view_all` capability (Owner / Workspace Admin).
create or replace function public.can_read_project(p_project uuid)
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
        from public.projects p
       where p.id = p_project
         and public.workspace_is_readable(p.workspace_id)
         and (
           public.is_workspace_owner(p.workspace_id)
           or public.is_project_member(p_project)
           or public.has_capability(auth.uid(), p.workspace_id, 'project.view_all')
         )
    );
$$;

-- WRITE (issues, comments, attachments). Requires a writable workspace, read
-- access to the project, a position that grants issue creation, and a project
-- role other than `viewer`.
create or replace function public.can_write_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.projects p
     where p.id = p_project
       and public.workspace_is_writable(p.workspace_id)
       and not p.is_archived
       and public.can_read_project(p_project)
       and coalesce(public.project_role_of(p_project), 'member') <> 'viewer'
       and (
         public.is_workspace_owner(p.workspace_id)
         or public.has_capability(auth.uid(), p.workspace_id, 'issue.create')
       )
  );
$$;

-- ADMIN (workflow, sprints, labels, project settings).
create or replace function public.can_admin_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.projects p
     where p.id = p_project
       and public.workspace_is_writable(p.workspace_id)
       and public.can_read_project(p_project)
       and (
         public.is_workspace_owner(p.workspace_id)
         or public.has_capability(auth.uid(), p.workspace_id, 'project.edit')
       )
  );
$$;

-- ---------------------------------------------------------------------------
-- 6. Default positions
--
-- Seeded on workspace creation. `is_system_default` only marks provenance —
-- the Owner may rename them, re-tick their capabilities or delete them.
-- ---------------------------------------------------------------------------
create or replace function public.seed_default_positions(p_workspace uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_spec jsonb := jsonb_build_array(
    jsonb_build_object(
      'slug', 'admin',
      'name', 'Workspace Admin',
      'description', 'Delegate of the Owner. Full control of this workspace.',
      'caps', to_jsonb(array(select key from public.capabilities))
    ),
    jsonb_build_object(
      'slug', 'manager',
      'name', 'Manager',
      'description', 'Runs the projects they are assigned to. No workspace settings.',
      'caps', to_jsonb(array[
        'project.edit', 'project.archive',
        'issue.create', 'issue.edit_any', 'issue.edit_own', 'issue.delete',
        'issue.assign', 'issue.transition',
        'sprint.create', 'sprint.start', 'sprint.complete',
        'report.view', 'report.export'
      ])
    ),
    jsonb_build_object(
      'slug', 'hr',
      'name', 'HR',
      'description', 'Manages people, not projects. Onboarding, positions, directory.',
      'caps', to_jsonb(array[
        'member.invite', 'member.remove', 'member.assign_position',
        'report.view'
      ])
    ),
    jsonb_build_object(
      'slug', 'team_lead',
      'name', 'Team Lead',
      'description', 'Leads delivery inside assigned projects.',
      'caps', to_jsonb(array[
        'issue.create', 'issue.edit_any', 'issue.edit_own', 'issue.assign',
        'issue.transition',
        'sprint.create', 'sprint.start', 'sprint.complete',
        'report.view'
      ])
    ),
    jsonb_build_object(
      'slug', 'member',
      'name', 'Member',
      'description', 'Developer, QA or designer. Works the issues assigned to them.',
      'caps', to_jsonb(array[
        'issue.create', 'issue.edit_own', 'issue.transition', 'report.view'
      ])
    ),
    jsonb_build_object(
      'slug', 'viewer',
      'name', 'Viewer',
      'description', 'Read-only stakeholder or client.',
      'caps', to_jsonb(array['report.view'])
    )
  );
  v_row      jsonb;
  v_position uuid;
begin
  for v_row in select * from jsonb_array_elements(v_spec) loop
    insert into public.positions (workspace_id, name, slug, description, is_system_default)
    values (
      p_workspace,
      v_row ->> 'name',
      v_row ->> 'slug',
      v_row ->> 'description',
      true
    )
    on conflict (workspace_id, lower(name)) do nothing
    returning id into v_position;

    if v_position is null then
      select id into v_position
        from public.positions
       where workspace_id = p_workspace and slug = v_row ->> 'slug';
    end if;

    if v_position is not null then
      insert into public.position_permissions (position_id, capability, allowed)
      select v_position, cap, true
        from jsonb_array_elements_text(v_row -> 'caps') as cap
      on conflict (position_id, capability) do nothing;
    end if;

    v_position := null;
  end loop;
end;
$$;

create or replace function public.workspaces_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.seed_default_positions(new.id);
  return new;
end;
$$;

drop trigger if exists workspaces_seed_positions on public.workspaces;
create trigger workspaces_seed_positions
  after insert on public.workspaces
  for each row execute function public.workspaces_after_insert();

-- Backfill for workspaces that existed before this migration.
do $$
declare v_id uuid;
begin
  for v_id in select id from public.workspaces loop
    perform public.seed_default_positions(v_id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Keep the legacy `role` column and the new `position_id` in agreement.
--
-- Older code paths still write `role`; the position editor writes
-- `position_id`. Whichever arrives, the other is derived.
-- ---------------------------------------------------------------------------
create or replace function public.sync_member_position()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text;
begin
  if new.position_id is null then
    -- role -> position
    v_slug := case new.role
      when 'admin'  then 'admin'
      when 'lead'   then 'team_lead'
      when 'member' then 'member'
      when 'viewer' then 'viewer'
      else 'member'
    end;

    select id into new.position_id
      from public.positions
     where workspace_id = new.workspace_id and slug = v_slug;

    -- A workspace whose defaults were renamed away: fall back to any position.
    if new.position_id is null then
      select id into new.position_id
        from public.positions
       where workspace_id = new.workspace_id
       order by is_system_default desc, created_at
       limit 1;
    end if;
  else
    -- position -> role, so legacy reads stay meaningful
    select p.slug into v_slug
      from public.positions p where p.id = new.position_id;

    new.role := case v_slug
      when 'admin'     then 'admin'::public.workspace_role
      when 'manager'   then 'lead'::public.workspace_role
      when 'team_lead' then 'lead'::public.workspace_role
      when 'viewer'    then 'viewer'::public.workspace_role
      else coalesce(new.role, 'member'::public.workspace_role)
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists workspace_members_sync_position on public.workspace_members;
create trigger workspace_members_sync_position
  before insert or update of role, position_id on public.workspace_members
  for each row execute function public.sync_member_position();

-- Backfill positions for pre-existing members.
update public.workspace_members m
   set position_id = p.id
  from public.positions p
 where m.position_id is null
   and p.workspace_id = m.workspace_id
   and p.slug = case m.role
        when 'admin'  then 'admin'
        when 'lead'   then 'team_lead'
        when 'member' then 'member'
        when 'viewer' then 'viewer'
       end;

-- ---------------------------------------------------------------------------
-- 8. Plan limits. Enforced in the database so no API path can exceed them.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer;
  v_used  integer;
begin
  if tg_op = 'UPDATE' and new.status <> 'active' then
    return new;
  end if;
  if new.status <> 'active' then
    return new;
  end if;

  select seat_limit into v_limit from public.workspaces where id = new.workspace_id;
  if v_limit is null then return new; end if;

  select count(*) into v_used
    from public.workspace_members
   where workspace_id = new.workspace_id
     and status = 'active'
     and user_id <> new.user_id;

  if v_used + 1 > v_limit then
    raise exception 'Seat limit reached: this workspace is licensed for % seats. Ask your MIRA administrator to raise the limit.', v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists workspace_members_seat_limit on public.workspace_members;
create trigger workspace_members_seat_limit
  before insert or update of status on public.workspace_members
  for each row execute function public.enforce_seat_limit();

create or replace function public.enforce_project_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer;
  v_used  integer;
begin
  select project_limit into v_limit from public.workspaces where id = new.workspace_id;
  if v_limit is null then return new; end if;

  select count(*) into v_used
    from public.projects
   where workspace_id = new.workspace_id and not is_archived and id <> new.id;

  if v_used + 1 > v_limit then
    raise exception 'Project limit reached: this workspace is licensed for % projects. Archive one, or ask your MIRA administrator to raise the limit.', v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists projects_project_limit on public.projects;
create trigger projects_project_limit
  before insert on public.projects
  for each row execute function public.enforce_project_limit();

-- ---------------------------------------------------------------------------
-- 9. Project bootstrap — workflow row + membership for the lead.
-- ---------------------------------------------------------------------------
create or replace function public.projects_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workflow uuid;
begin
  insert into public.workflows (project_id, name)
  values (new.id, 'Default workflow')
  on conflict (project_id) do nothing
  returning id into v_workflow;

  if new.lead_id is not null then
    insert into public.project_members (project_id, user_id, project_role, added_by)
    values (new.id, new.lead_id, 'lead', coalesce(new.created_by, new.lead_id))
    on conflict (project_id, user_id) do update set project_role = 'lead';
  end if;

  if auth.uid() is not null then
    insert into public.project_members (project_id, user_id, project_role, added_by)
    values (new.id, auth.uid(), 'manager', auth.uid())
    on conflict (project_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists projects_bootstrap on public.projects;
create trigger projects_bootstrap
  after insert on public.projects
  for each row execute function public.projects_after_insert();

-- Attach new statuses to the project's workflow.
create or replace function public.project_statuses_attach_workflow()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.workflow_id is null then
    select id into new.workflow_id from public.workflows where project_id = new.project_id;
  end if;
  return new;
end;
$$;

drop trigger if exists project_statuses_workflow on public.project_statuses;
create trigger project_statuses_workflow
  before insert on public.project_statuses
  for each row execute function public.project_statuses_attach_workflow();

-- Backfill workflows and project membership for pre-existing projects.
insert into public.workflows (project_id, name)
select p.id, 'Default workflow' from public.projects p
on conflict (project_id) do nothing;

update public.project_statuses s
   set workflow_id = w.id
  from public.workflows w
 where s.workflow_id is null and w.project_id = s.project_id;

insert into public.project_members (project_id, user_id, project_role)
select p.id, p.lead_id, 'lead'
  from public.projects p
 where p.lead_id is not null
on conflict (project_id, user_id) do nothing;

-- Existing workspaces predate project scoping: everyone who was a member of
-- the workspace keeps the access they already had.
insert into public.project_members (project_id, user_id, project_role)
select p.id,
       m.user_id,
       case m.role
         when 'admin'  then 'manager'::public.project_role
         when 'lead'   then 'manager'::public.project_role
         when 'viewer' then 'viewer'::public.project_role
         else 'member'::public.project_role
       end
  from public.projects p
  join public.workspace_members m on m.workspace_id = p.workspace_id
on conflict (project_id, user_id) do nothing;
