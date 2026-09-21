-- ===========================================================================
-- MIRA — 03. Row-Level Security
--
-- The rule, in one sentence: a row is visible only if you are a member of the
-- workspace that owns it, and writable only if your role in that workspace
-- allows it.
--
--   admin  — everything, including workspace settings and member management
--   lead   — project settings, workflow, sprints, delete issues
--   member — create/edit issues, comments, attachments
--   viewer — read only
-- ===========================================================================

-- Two more SECURITY DEFINER lookups used by the policies below.
create or replace function public.shares_workspace(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members theirs
      on theirs.workspace_id = mine.workspace_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_user
  );
$$;

create or replace function public.comment_issue(p_comment uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.issue_id from public.comments c where c.id = p_comment;
$$;

create or replace function public.auth_email()
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'email', ''),
    (select email from public.profiles where id = auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere. No table in `public` is left open.
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.workspaces          enable row level security;
alter table public.workspace_members   enable row level security;
alter table public.projects            enable row level security;
alter table public.project_statuses    enable row level security;
alter table public.status_transitions  enable row level security;
alter table public.sprints             enable row level security;
alter table public.issues              enable row level security;
alter table public.labels              enable row level security;
alter table public.issue_labels        enable row level security;
alter table public.comments            enable row level security;
alter table public.comment_revisions   enable row level security;
alter table public.attachments         enable row level security;
alter table public.activity_log        enable row level security;
alter table public.watchers            enable row level security;
alter table public.notifications       enable row level security;
alter table public.saved_filters       enable row level security;
alter table public.workspace_invites   enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_workspace(id));

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------------
drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces
  for select to authenticated
  using (public.is_workspace_member(id));

drop policy if exists workspaces_insert on public.workspaces;
create policy workspaces_insert on public.workspaces
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists workspaces_update_admin on public.workspaces;
create policy workspaces_update_admin on public.workspaces
  for update to authenticated
  using (public.has_workspace_role(id, array['admin']::public.workspace_role[]))
  with check (public.has_workspace_role(id, array['admin']::public.workspace_role[]));

drop policy if exists workspaces_delete_owner on public.workspaces;
create policy workspaces_delete_owner on public.workspaces
  for delete to authenticated
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- workspace_members
-- ---------------------------------------------------------------------------
drop policy if exists workspace_members_select on public.workspace_members;
create policy workspace_members_select on public.workspace_members
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_members_insert_admin on public.workspace_members;
create policy workspace_members_insert_admin on public.workspace_members
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['admin']::public.workspace_role[]));

drop policy if exists workspace_members_update_admin on public.workspace_members;
create policy workspace_members_update_admin on public.workspace_members
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['admin']::public.workspace_role[]))
  with check (public.has_workspace_role(workspace_id, array['admin']::public.workspace_role[]));

-- An admin can remove anyone; anyone can remove themselves (leave workspace).
drop policy if exists workspace_members_delete on public.workspace_members;
create policy workspace_members_delete on public.workspace_members
  for delete to authenticated
  using (
    user_id = auth.uid()
    or public.has_workspace_role(workspace_id, array['admin']::public.workspace_role[])
  );

-- ---------------------------------------------------------------------------
-- projects — create/edit/archive/delete is admin + lead
-- ---------------------------------------------------------------------------
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert to authenticated
  with check (
    public.has_workspace_role(workspace_id, array['admin', 'lead']::public.workspace_role[])
  );

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update to authenticated
  using (
    public.has_workspace_role(workspace_id, array['admin', 'lead']::public.workspace_role[])
  )
  with check (
    public.has_workspace_role(workspace_id, array['admin', 'lead']::public.workspace_role[])
  );

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete to authenticated
  using (
    public.has_workspace_role(workspace_id, array['admin', 'lead']::public.workspace_role[])
  );

-- ---------------------------------------------------------------------------
-- project_statuses & status_transitions — the workflow, owned by leads
-- ---------------------------------------------------------------------------
drop policy if exists project_statuses_select on public.project_statuses;
create policy project_statuses_select on public.project_statuses
  for select to authenticated
  using (public.can_read_project(project_id));

drop policy if exists project_statuses_write on public.project_statuses;
create policy project_statuses_write on public.project_statuses
  for all to authenticated
  using (public.can_admin_project(project_id))
  with check (public.can_admin_project(project_id));

drop policy if exists status_transitions_select on public.status_transitions;
create policy status_transitions_select on public.status_transitions
  for select to authenticated
  using (public.can_read_project(project_id));

drop policy if exists status_transitions_write on public.status_transitions;
create policy status_transitions_write on public.status_transitions
  for all to authenticated
  using (public.can_admin_project(project_id))
  with check (public.can_admin_project(project_id));

-- ---------------------------------------------------------------------------
-- sprints
-- ---------------------------------------------------------------------------
drop policy if exists sprints_select on public.sprints;
create policy sprints_select on public.sprints
  for select to authenticated
  using (public.can_read_project(project_id));

drop policy if exists sprints_write on public.sprints;
create policy sprints_write on public.sprints
  for all to authenticated
  using (public.can_admin_project(project_id))
  with check (public.can_admin_project(project_id));

-- ---------------------------------------------------------------------------
-- issues
-- ---------------------------------------------------------------------------
drop policy if exists issues_select on public.issues;
create policy issues_select on public.issues
  for select to authenticated
  using (public.can_read_project(project_id));

drop policy if exists issues_insert on public.issues;
create policy issues_insert on public.issues
  for insert to authenticated
  with check (public.can_write_project(project_id));

drop policy if exists issues_update on public.issues;
create policy issues_update on public.issues
  for update to authenticated
  using (public.can_write_project(project_id))
  with check (public.can_write_project(project_id));

-- Leads/admins can delete anything; a member may delete an issue they raised.
drop policy if exists issues_delete on public.issues;
create policy issues_delete on public.issues
  for delete to authenticated
  using (
    public.can_admin_project(project_id)
    or (public.can_write_project(project_id) and reporter_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- labels
-- ---------------------------------------------------------------------------
drop policy if exists labels_select on public.labels;
create policy labels_select on public.labels
  for select to authenticated
  using (public.can_read_project(project_id));

drop policy if exists labels_insert on public.labels;
create policy labels_insert on public.labels
  for insert to authenticated
  with check (public.can_write_project(project_id));

drop policy if exists labels_update on public.labels;
create policy labels_update on public.labels
  for update to authenticated
  using (public.can_admin_project(project_id))
  with check (public.can_admin_project(project_id));

drop policy if exists labels_delete on public.labels;
create policy labels_delete on public.labels
  for delete to authenticated
  using (public.can_admin_project(project_id));

-- ---------------------------------------------------------------------------
-- issue_labels
-- ---------------------------------------------------------------------------
drop policy if exists issue_labels_select on public.issue_labels;
create policy issue_labels_select on public.issue_labels
  for select to authenticated
  using (public.can_read_issue(issue_id));

drop policy if exists issue_labels_write on public.issue_labels;
create policy issue_labels_write on public.issue_labels
  for all to authenticated
  using (public.can_write_issue(issue_id))
  with check (public.can_write_issue(issue_id));

-- ---------------------------------------------------------------------------
-- comments — authors own their words
-- ---------------------------------------------------------------------------
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to authenticated
  using (public.can_read_issue(issue_id));

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_write_issue(issue_id));

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own on public.comments
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
  for delete to authenticated
  using (
    author_id = auth.uid()
    or public.can_admin_project(public.issue_project(issue_id))
  );

drop policy if exists comment_revisions_select on public.comment_revisions;
create policy comment_revisions_select on public.comment_revisions
  for select to authenticated
  using (public.can_read_issue(public.comment_issue(comment_id)));

-- ---------------------------------------------------------------------------
-- attachments
-- ---------------------------------------------------------------------------
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments
  for select to authenticated
  using (public.can_read_issue(issue_id));

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (uploaded_by = auth.uid() and public.can_write_issue(issue_id));

drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments
  for delete to authenticated
  using (
    uploaded_by = auth.uid()
    or public.can_admin_project(public.issue_project(issue_id))
  );

-- ---------------------------------------------------------------------------
-- activity_log — readable, append-only, written by triggers only
-- ---------------------------------------------------------------------------
drop policy if exists activity_log_select on public.activity_log;
create policy activity_log_select on public.activity_log
  for select to authenticated
  using (public.can_read_issue(issue_id));

-- ---------------------------------------------------------------------------
-- watchers
-- ---------------------------------------------------------------------------
drop policy if exists watchers_select on public.watchers;
create policy watchers_select on public.watchers
  for select to authenticated
  using (public.can_read_issue(issue_id));

drop policy if exists watchers_insert_self on public.watchers;
create policy watchers_insert_self on public.watchers
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_read_issue(issue_id));

drop policy if exists watchers_delete_self on public.watchers;
create policy watchers_delete_self on public.watchers
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- notifications — strictly personal. Rows are created by triggers.
-- ---------------------------------------------------------------------------
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- saved_filters
-- ---------------------------------------------------------------------------
drop policy if exists saved_filters_select on public.saved_filters;
create policy saved_filters_select on public.saved_filters
  for select to authenticated
  using (
    owner_id = auth.uid()
    or (is_shared and public.is_workspace_member(workspace_id))
  );

drop policy if exists saved_filters_insert on public.saved_filters;
create policy saved_filters_insert on public.saved_filters
  for insert to authenticated
  with check (owner_id = auth.uid() and public.is_workspace_member(workspace_id));

drop policy if exists saved_filters_update_own on public.saved_filters;
create policy saved_filters_update_own on public.saved_filters
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists saved_filters_delete_own on public.saved_filters;
create policy saved_filters_delete_own on public.saved_filters
  for delete to authenticated
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- workspace_invites — managed by admins/leads, visible to the invitee
-- ---------------------------------------------------------------------------
drop policy if exists workspace_invites_select on public.workspace_invites;
create policy workspace_invites_select on public.workspace_invites
  for select to authenticated
  using (
    public.has_workspace_role(workspace_id, array['admin', 'lead']::public.workspace_role[])
    or lower(email) = lower(coalesce(public.auth_email(), ''))
  );

drop policy if exists workspace_invites_insert on public.workspace_invites;
create policy workspace_invites_insert on public.workspace_invites
  for insert to authenticated
  with check (
    public.has_workspace_role(workspace_id, array['admin', 'lead']::public.workspace_role[])
  );

drop policy if exists workspace_invites_update on public.workspace_invites;
create policy workspace_invites_update on public.workspace_invites
  for update to authenticated
  using (
    public.has_workspace_role(workspace_id, array['admin', 'lead']::public.workspace_role[])
  )
  with check (
    public.has_workspace_role(workspace_id, array['admin', 'lead']::public.workspace_role[])
  );

drop policy if exists workspace_invites_delete on public.workspace_invites;
create policy workspace_invites_delete on public.workspace_invites
  for delete to authenticated
  using (
    public.has_workspace_role(workspace_id, array['admin', 'lead']::public.workspace_role[])
  );

-- ---------------------------------------------------------------------------
-- Grants. RLS decides row visibility; these grants decide table visibility.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- The append-only tables are never written directly by a client; triggers
-- (SECURITY DEFINER, owned by the database owner) populate them.
revoke insert, update, delete on public.activity_log from authenticated;
revoke insert, update, delete on public.comment_revisions from authenticated;
revoke insert on public.notifications from authenticated;

-- `anon` gets nothing: every MIRA page requires a session.
revoke all on all tables in schema public from anon;
