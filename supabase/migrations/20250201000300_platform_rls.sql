-- ===========================================================================
-- MIRA — 08. Row-Level Security for the three-tier model
--
-- Replaces the role-based policies from migration 03 with capability-based
-- ones, and secures the new platform tables.
--
-- Two invariants this file exists to guarantee:
--
--   * A user in Workspace A cannot read a single row belonging to Workspace B.
--   * A Manager or Member cannot reach a project they are not a member of,
--     even inside their own workspace.
--
-- `supabase/tests/tenant-isolation.sql` asserts both.
-- ===========================================================================

alter table public.platform_admins      enable row level security;
alter table public.platform_audit_log   enable row level security;
alter table public.admin_impersonations enable row level security;
alter table public.workspace_owners     enable row level security;
alter table public.capabilities         enable row level security;
alter table public.positions            enable row level security;
alter table public.position_permissions enable row level security;
alter table public.project_members      enable row level security;
alter table public.workflows            enable row level security;

-- ===========================================================================
-- Platform tier
-- ===========================================================================

-- platform_admins: an admin sees the roster; nobody else sees it exists.
drop policy if exists platform_admins_select on public.platform_admins;
create policy platform_admins_select on public.platform_admins
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

-- Only `must_change_password` is meant to change from the app, and it does so
-- through admin_mark_password_changed(). Creating admins is a service-role /
-- seed-script operation.
drop policy if exists platform_admins_update_self on public.platform_admins;
create policy platform_admins_update_self on public.platform_admins
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- platform_audit_log: readable by admins, written only by log_platform_action().
drop policy if exists platform_audit_select on public.platform_audit_log;
create policy platform_audit_select on public.platform_audit_log
  for select to authenticated
  using (public.is_platform_admin());

drop policy if exists admin_impersonations_select on public.admin_impersonations;
create policy admin_impersonations_select on public.admin_impersonations
  for select to authenticated
  using (public.is_platform_admin());

-- ===========================================================================
-- Workspaces
-- ===========================================================================

-- Tenants may never create a workspace; that is a platform action.
drop policy if exists workspaces_insert on public.workspaces;

-- Read: members and owners of a readable workspace, plus System Admins.
drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces
  for select to authenticated
  using (
    public.is_platform_admin()
    or (
      deleted_at is null
      and status in ('active', 'archived')
      and (
        public.is_workspace_owner(id)
        or exists (
          select 1 from public.workspace_members m
           where m.workspace_id = workspaces.id
             and m.user_id = auth.uid()
             and m.status = 'active'
        )
      )
    )
  );

-- Write: the company profile only, and only with `workspace.settings`.
-- Plan, limits, status and dates are unreachable from here — see the column
-- grants at the foot of this file.
drop policy if exists workspaces_update_admin on public.workspaces;
create policy workspaces_update_settings on public.workspaces
  for update to authenticated
  using (public.can_do(id, 'workspace.settings'))
  with check (public.can_do(id, 'workspace.settings'));

-- Deleting a workspace is a platform action with its own confirmation flow.
drop policy if exists workspaces_delete_owner on public.workspaces;

-- ---------------------------------------------------------------------------
-- workspace_owners — visible inside the tenant, writable only by the platform
-- (through admin_assign_owner / admin_remove_owner, which are definer-owned).
-- ---------------------------------------------------------------------------
drop policy if exists workspace_owners_select on public.workspace_owners;
create policy workspace_owners_select on public.workspace_owners
  for select to authenticated
  using (public.is_platform_admin() or public.is_workspace_member(workspace_id));

-- ===========================================================================
-- Positions and capabilities
-- ===========================================================================

-- The capability vocabulary is reference data: everyone signed in may read it
-- so the position editor can render the checklist.
drop policy if exists capabilities_select on public.capabilities;
create policy capabilities_select on public.capabilities
  for select to authenticated
  using (true);

drop policy if exists positions_select on public.positions;
create policy positions_select on public.positions
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists positions_write on public.positions;
create policy positions_write on public.positions
  for all to authenticated
  using (public.can_do(workspace_id, 'position.manage'))
  with check (public.can_do(workspace_id, 'position.manage'));

drop policy if exists position_permissions_select on public.position_permissions;
create policy position_permissions_select on public.position_permissions
  for select to authenticated
  using (
    exists (
      select 1 from public.positions p
       where p.id = position_permissions.position_id
         and public.is_workspace_member(p.workspace_id)
    )
  );

drop policy if exists position_permissions_write on public.position_permissions;
create policy position_permissions_write on public.position_permissions
  for all to authenticated
  using (
    exists (
      select 1 from public.positions p
       where p.id = position_permissions.position_id
         and public.can_do(p.workspace_id, 'position.manage')
    )
  )
  with check (
    exists (
      select 1 from public.positions p
       where p.id = position_permissions.position_id
         and public.can_do(p.workspace_id, 'position.manage')
    )
  );

-- ===========================================================================
-- Workspace membership — governed by member.* capabilities
-- ===========================================================================
drop policy if exists workspace_members_select on public.workspace_members;
create policy workspace_members_select on public.workspace_members
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_members_insert_admin on public.workspace_members;
create policy workspace_members_insert on public.workspace_members
  for insert to authenticated
  with check (public.can_do(workspace_id, 'member.invite'));

drop policy if exists workspace_members_update_admin on public.workspace_members;
create policy workspace_members_update on public.workspace_members
  for update to authenticated
  using (
    public.can_do(workspace_id, 'member.assign_position')
    or public.can_do(workspace_id, 'member.remove')
  )
  with check (
    public.can_do(workspace_id, 'member.assign_position')
    or public.can_do(workspace_id, 'member.remove')
  );

-- Anyone may leave; removing someone else needs `member.remove`. An Owner's
-- seat cannot be revoked by a member — ownership is a platform-level fact.
drop policy if exists workspace_members_delete on public.workspace_members;
create policy workspace_members_delete on public.workspace_members
  for delete to authenticated
  using (
    (user_id = auth.uid() and not public.is_workspace_owner(workspace_id))
    or (
      public.can_do(workspace_id, 'member.remove')
      and not public.is_workspace_owner(workspace_id, user_id)
    )
  );

-- ===========================================================================
-- Projects — creation, editing and deletion are separate capabilities, and
-- visibility is project-scoped (see can_read_project).
-- ===========================================================================
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (public.can_read_project(id));

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert to authenticated
  with check (public.can_do(workspace_id, 'project.create'));

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update to authenticated
  using (
    public.can_read_project(id)
    and public.workspace_is_writable(workspace_id)
    and (
      public.can_do(workspace_id, 'project.edit')
      or public.can_do(workspace_id, 'project.archive')
    )
  )
  with check (
    public.can_read_project(id)
    and public.workspace_is_writable(workspace_id)
    and (
      public.can_do(workspace_id, 'project.edit')
      or public.can_do(workspace_id, 'project.archive')
    )
  );

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete to authenticated
  using (public.can_read_project(id) and public.can_do(workspace_id, 'project.delete'));

-- ---------------------------------------------------------------------------
-- project_members — the roster of a project. Readable by anyone who can see
-- the project; writable by whoever can administer it.
-- ---------------------------------------------------------------------------
drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members
  for select to authenticated
  using (public.can_read_project(project_id));

drop policy if exists project_members_write on public.project_members;
create policy project_members_write on public.project_members
  for all to authenticated
  using (public.can_admin_project(project_id))
  with check (public.can_admin_project(project_id));

-- ---------------------------------------------------------------------------
-- workflows
-- ---------------------------------------------------------------------------
drop policy if exists workflows_select on public.workflows;
create policy workflows_select on public.workflows
  for select to authenticated
  using (public.can_read_project(project_id));

drop policy if exists workflows_write on public.workflows;
create policy workflows_write on public.workflows
  for all to authenticated
  using (public.can_admin_project(project_id))
  with check (public.can_admin_project(project_id));

-- ===========================================================================
-- Issues — "edit own" and "edit any" are different capabilities
-- ===========================================================================
drop policy if exists issues_insert on public.issues;
create policy issues_insert on public.issues
  for insert to authenticated
  with check (
    public.can_write_project(project_id)
    and public.has_capability(auth.uid(), public.project_workspace(project_id), 'issue.create')
  );

drop policy if exists issues_update on public.issues;
create policy issues_update on public.issues
  for update to authenticated
  using (
    public.can_write_project(project_id)
    and (
      public.has_capability(auth.uid(), public.project_workspace(project_id), 'issue.edit_any')
      or (
        public.has_capability(auth.uid(), public.project_workspace(project_id), 'issue.edit_own')
        and (reporter_id = auth.uid() or assignee_id = auth.uid())
      )
      -- `issue.transition` alone lets a member drag their board column.
      or public.has_capability(auth.uid(), public.project_workspace(project_id), 'issue.transition')
    )
  )
  with check (public.can_write_project(project_id));

drop policy if exists issues_delete on public.issues;
create policy issues_delete on public.issues
  for delete to authenticated
  using (
    public.can_write_project(project_id)
    and (
      public.has_capability(auth.uid(), public.project_workspace(project_id), 'issue.delete')
      or reporter_id = auth.uid()
    )
  );

-- ===========================================================================
-- Sprints — each lifecycle step is its own capability
-- ===========================================================================
drop policy if exists sprints_write on public.sprints;

drop policy if exists sprints_insert on public.sprints;
create policy sprints_insert on public.sprints
  for insert to authenticated
  with check (
    public.can_read_project(project_id)
    and public.can_do(public.project_workspace(project_id), 'sprint.create')
  );

drop policy if exists sprints_update on public.sprints;
create policy sprints_update on public.sprints
  for update to authenticated
  using (
    public.can_read_project(project_id)
    and (
      public.can_do(public.project_workspace(project_id), 'sprint.create')
      or public.can_do(public.project_workspace(project_id), 'sprint.start')
      or public.can_do(public.project_workspace(project_id), 'sprint.complete')
    )
  )
  with check (public.can_read_project(project_id));

drop policy if exists sprints_delete on public.sprints;
create policy sprints_delete on public.sprints
  for delete to authenticated
  using (
    public.can_read_project(project_id)
    and public.can_do(public.project_workspace(project_id), 'sprint.create')
  );

-- ===========================================================================
-- Invitations — gated by member.invite, still visible to the invitee
-- ===========================================================================
drop policy if exists workspace_invites_select on public.workspace_invites;
create policy workspace_invites_select on public.workspace_invites
  for select to authenticated
  using (
    public.can_do(workspace_id, 'member.invite')
    or lower(email) = lower(coalesce(public.auth_email(), ''))
  );

drop policy if exists workspace_invites_insert on public.workspace_invites;
create policy workspace_invites_insert on public.workspace_invites
  for insert to authenticated
  with check (public.can_do(workspace_id, 'member.invite'));

drop policy if exists workspace_invites_update on public.workspace_invites;
create policy workspace_invites_update on public.workspace_invites
  for update to authenticated
  using (public.can_do(workspace_id, 'member.invite'))
  with check (public.can_do(workspace_id, 'member.invite'));

drop policy if exists workspace_invites_delete on public.workspace_invites;
create policy workspace_invites_delete on public.workspace_invites
  for delete to authenticated
  using (public.can_do(workspace_id, 'member.invite'));

-- ===========================================================================
-- Reports gating
--
-- Reports are derived from issues, so `report.view` cannot be a table policy.
-- It is enforced in the UI and, for the export path, by this helper which the
-- CSV route calls before streaming anything.
-- ===========================================================================
create or replace function public.can_export_reports(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_capability(auth.uid(), p_workspace, 'report.export');
$$;

-- ===========================================================================
-- Grants
-- ===========================================================================
grant select, insert, update, delete on
  public.positions,
  public.position_permissions,
  public.project_members,
  public.workflows
to authenticated;

grant select on
  public.capabilities,
  public.platform_admins,
  public.platform_audit_log,
  public.admin_impersonations,
  public.workspace_owners,
  public.invitations,
  public.workflow_statuses
to authenticated;

grant update on public.platform_admins to authenticated;

grant execute on all functions in schema public to authenticated;

-- The audit trail is append-only, and only through log_platform_action().
revoke insert, update, delete on public.platform_audit_log from authenticated;
revoke insert, update, delete on public.admin_impersonations from authenticated;
revoke insert, delete on public.platform_admins from authenticated;
revoke insert, update, delete on public.workspace_owners from authenticated;
revoke insert, update, delete on public.capabilities from authenticated;

-- ---------------------------------------------------------------------------
-- Column-level lockdown on workspaces.
--
-- This is the teeth behind "only the System Administrator changes plan
-- limits". Even a workspace Owner holding `workspace.settings` physically
-- cannot UPDATE these columns: the privilege is not granted. The admin RPCs
-- are SECURITY DEFINER and owned by the database owner, so they are unaffected.
-- ---------------------------------------------------------------------------
revoke update on public.workspaces from authenticated;
grant update (
  name, description, avatar_url, company_name,
  timezone, working_days, issue_key_prefix, updated_at
) on public.workspaces to authenticated;

revoke all on all tables in schema public from anon;
