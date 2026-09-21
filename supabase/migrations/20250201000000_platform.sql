-- ===========================================================================
-- MIRA — 05. Platform tier
--
-- Turns the single-tier tracker into a three-tier SaaS:
--
--   System Administrator   platform_admins        sells & operates MIRA
--   Owner                  workspace_owners       bought MIRA for a company
--   User                   workspace_members      works inside that company
--
-- Everything here is additive. The existing product tables keep their shape;
-- what changes is *who* is allowed to see them, which is resolved through
-- positions -> capabilities (see 06_platform_functions.sql) instead of the
-- old four-value `workspace_role` enum.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.workspace_status as enum ('active', 'suspended', 'archived', 'deleted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.member_status as enum ('invited', 'active', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.project_role as enum ('lead', 'manager', 'member', 'viewer');
exception when duplicate_object then null; end $$;

-- ===========================================================================
-- Platform tier
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- platform_admins — the people who run MIRA itself. Deliberately NOT a row in
-- workspace_members: a system administrator belongs to no tenant.
-- ---------------------------------------------------------------------------
create table if not exists public.platform_admins (
  id                   uuid primary key default extensions.gen_random_uuid(),
  user_id              uuid not null unique references auth.users (id) on delete cascade,
  name                 text,
  email                text not null,
  must_change_password boolean not null default true,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  last_login_at        timestamptz
);

create unique index if not exists platform_admins_email_key
  on public.platform_admins (lower(email));

comment on table public.platform_admins is
  'System Administrators. Platform-wide scope; cannot sign in at the tenant portal.';

-- ---------------------------------------------------------------------------
-- platform_audit_log — append-only. Every administrative action lands here.
-- No UPDATE/DELETE grant exists for any client role (see RLS migration).
-- ---------------------------------------------------------------------------
create table if not exists public.platform_audit_log (
  id          uuid primary key default extensions.gen_random_uuid(),
  actor_id    uuid references auth.users (id) on delete set null,
  actor_email text,
  action      text not null,
  target_type text,
  target_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists platform_audit_log_created_idx
  on public.platform_audit_log (created_at desc);
create index if not exists platform_audit_log_actor_idx
  on public.platform_audit_log (actor_id, created_at desc);
create index if not exists platform_audit_log_target_idx
  on public.platform_audit_log (target_type, target_id, created_at desc);

-- ---------------------------------------------------------------------------
-- admin_impersonations — time-boxed, read-only "view as owner" sessions.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_impersonations (
  id           uuid primary key default extensions.gen_random_uuid(),
  admin_id     uuid not null references public.platform_admins (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  reason       text,
  started_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '30 minutes',
  ended_at     timestamptz
);

create index if not exists admin_impersonations_admin_idx
  on public.admin_impersonations (admin_id, started_at desc);
create index if not exists admin_impersonations_workspace_idx
  on public.admin_impersonations (workspace_id, started_at desc);

-- ===========================================================================
-- Tenant lifecycle — workspaces become billable, expiring, suspendable things
-- ===========================================================================

alter table public.workspaces
  add column if not exists company_name        text,
  add column if not exists plan                text not null default 'trial',
  add column if not exists seat_limit          integer not null default 10,
  add column if not exists project_limit       integer not null default 5,
  add column if not exists status              public.workspace_status not null default 'active',
  add column if not exists starts_at           timestamptz not null default now(),
  add column if not exists expires_at          timestamptz,
  add column if not exists created_by_admin_id uuid references public.platform_admins (id) on delete set null,
  add column if not exists deleted_at          timestamptz,
  add column if not exists timezone            text not null default 'UTC',
  add column if not exists working_days        smallint[] not null default '{1,2,3,4,5}',
  add column if not exists issue_key_prefix    text;

alter table public.workspaces
  drop constraint if exists workspaces_seat_limit_check,
  drop constraint if exists workspaces_project_limit_check;

alter table public.workspaces
  add constraint workspaces_seat_limit_check check (seat_limit > 0),
  add constraint workspaces_project_limit_check check (project_limit > 0);

-- A workspace is now created by a System Administrator *before* an Owner
-- exists, so ownership can no longer be a NOT NULL column.
alter table public.workspaces alter column owner_id drop not null;

create index if not exists workspaces_status_idx on public.workspaces (status)
  where deleted_at is null;

-- People gain a phone number and a platform-wide kill switch. `is_active` is
-- set by a System Administrator and blocks sign-in everywhere at once.
alter table public.profiles
  add column if not exists phone     text,
  add column if not exists is_active boolean not null default true;

-- ---------------------------------------------------------------------------
-- workspace_owners — who bought this workspace. Co-owners are allowed; exactly
-- one of them is primary.
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_owners (
  id                  uuid primary key default extensions.gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  user_id             uuid not null references public.profiles (id) on delete cascade,
  is_primary          boolean not null default false,
  assigned_by_admin_id uuid references public.platform_admins (id) on delete set null,
  assigned_at         timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create unique index if not exists workspace_owners_one_primary
  on public.workspace_owners (workspace_id)
  where is_primary;

create index if not exists workspace_owners_user_idx
  on public.workspace_owners (user_id);

-- ===========================================================================
-- Capability-based permissions
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- capabilities — the fixed vocabulary. A lookup table rather than an enum so
-- the Owner's position editor can render labels and groups straight from the
-- database, and so adding one later is a plain INSERT.
-- ---------------------------------------------------------------------------
create table if not exists public.capabilities (
  key         text primary key,
  label       text not null,
  description text,
  group_name  text not null,
  position    integer not null default 0
);

insert into public.capabilities (key, label, description, group_name, position) values
  ('project.create',        'Create projects',        'Start a new project in this workspace.',                 'Projects',   10),
  ('project.edit',          'Edit projects',          'Rename, re-scope and configure the workflow of a project.', 'Projects', 20),
  ('project.delete',        'Delete projects',        'Permanently remove a project and its issues.',            'Projects',  30),
  ('project.archive',       'Archive projects',       'Make a project read-only without deleting it.',           'Projects',  40),
  ('project.view_all',      'View all projects',      'See every project in the workspace, not only assigned ones.', 'Projects', 50),
  ('issue.create',          'Create issues',          'Raise new issues in accessible projects.',                'Issues',    60),
  ('issue.edit_any',        'Edit any issue',         'Change issues reported or assigned to someone else.',     'Issues',    70),
  ('issue.edit_own',        'Edit own issues',        'Change issues you reported or are assigned to.',          'Issues',    80),
  ('issue.delete',          'Delete issues',          'Delete issues raised by anyone.',                         'Issues',    90),
  ('issue.assign',          'Assign issues',          'Set or change the assignee of an issue.',                 'Issues',   100),
  ('issue.transition',      'Move issues',            'Drag issues between board columns.',                      'Issues',   110),
  ('sprint.create',         'Create sprints',         'Plan a new sprint.',                                      'Sprints',  120),
  ('sprint.start',          'Start sprints',          'Begin a planned sprint.',                                 'Sprints',  130),
  ('sprint.complete',       'Complete sprints',       'Close an active sprint and roll over its work.',          'Sprints',  140),
  ('member.invite',         'Invite people',          'Send workspace invitations.',                             'People',   150),
  ('member.remove',         'Remove people',          'Revoke workspace access.',                                'People',   160),
  ('member.assign_position','Assign positions',       'Change which position a member holds.',                   'People',   170),
  ('position.manage',       'Manage positions',       'Create positions and edit their capabilities.',           'People',   180),
  ('report.view',           'View reports',           'Open dashboards, burndown and velocity.',                 'Insights', 190),
  ('report.export',         'Export reports',         'Download report data as CSV.',                            'Insights', 200),
  ('workspace.settings',    'Workspace settings',     'Edit company profile, branding and defaults.',            'Workspace',210),
  ('billing.view',          'View plan & usage',      'See seats, project limits and renewal date.',             'Workspace',220)
on conflict (key) do update
  set label = excluded.label,
      description = excluded.description,
      group_name = excluded.group_name,
      position = excluded.position;

-- ---------------------------------------------------------------------------
-- positions — job titles the Owner defines. Seeded with sensible defaults on
-- workspace creation, then fully editable.
-- ---------------------------------------------------------------------------
create table if not exists public.positions (
  id                uuid primary key default extensions.gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  name              text not null check (char_length(trim(name)) between 1 and 60),
  slug              text,
  description       text,
  is_system_default boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists positions_workspace_name_key
  on public.positions (workspace_id, lower(name));
create unique index if not exists positions_workspace_slug_key
  on public.positions (workspace_id, slug)
  where slug is not null;

comment on column public.positions.slug is
  'Stable identifier for the seeded defaults (admin, manager, hr, ...). NULL for custom positions.';

-- ---------------------------------------------------------------------------
-- position_permissions — the capability checklist for one position.
-- ---------------------------------------------------------------------------
create table if not exists public.position_permissions (
  id          uuid primary key default extensions.gen_random_uuid(),
  position_id uuid not null references public.positions (id) on delete cascade,
  capability  text not null references public.capabilities (key) on delete cascade,
  allowed     boolean not null default true,
  unique (position_id, capability)
);

create index if not exists position_permissions_position_idx
  on public.position_permissions (position_id)
  where allowed;

-- ---------------------------------------------------------------------------
-- workspace_members gains a position, a reporting line and a lifecycle status.
--
-- The legacy `role` column stays: it is kept in sync with the member's
-- position by a trigger so older queries keep working, but it is no longer
-- what the RLS policies consult.
-- ---------------------------------------------------------------------------
alter table public.workspace_members
  add column if not exists id                 uuid not null default extensions.gen_random_uuid(),
  add column if not exists position_id        uuid references public.positions (id) on delete set null,
  add column if not exists reports_to_user_id uuid references public.profiles (id) on delete set null,
  add column if not exists status             public.member_status not null default 'active',
  add column if not exists title              text,
  add column if not exists joined_at          timestamptz not null default now();

create index if not exists workspace_members_position_idx
  on public.workspace_members (position_id);
create index if not exists workspace_members_status_idx
  on public.workspace_members (workspace_id, status);

-- A member cannot report to themselves.
alter table public.workspace_members
  drop constraint if exists workspace_members_no_self_report;
alter table public.workspace_members
  add constraint workspace_members_no_self_report
  check (reports_to_user_id is null or reports_to_user_id <> user_id);

-- ---------------------------------------------------------------------------
-- project_members — the scoping rule that makes Managers and Members safe.
--
-- Workspace membership alone grants NOTHING at project level. Access requires
-- either a row here or the `project.view_all` capability.
-- ---------------------------------------------------------------------------
create table if not exists public.project_members (
  id           uuid primary key default extensions.gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  project_role public.project_role not null default 'member',
  added_by     uuid references public.profiles (id) on delete set null,
  added_at     timestamptz not null default now(),
  unique (project_id, user_id)
);

create index if not exists project_members_user_idx on public.project_members (user_id);
create index if not exists project_members_project_idx on public.project_members (project_id);

-- Projects record their author and their planned window.
alter table public.projects
  add column if not exists created_by  uuid references public.profiles (id) on delete set null,
  add column if not exists start_date  date,
  add column if not exists target_date date,
  add column if not exists status      text not null default 'active';

-- ---------------------------------------------------------------------------
-- workflows — a named workflow per project. `project_statuses` are its steps.
-- ---------------------------------------------------------------------------
create table if not exists public.workflows (
  id         uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null unique references public.projects (id) on delete cascade,
  name       text not null default 'Default workflow',
  created_at timestamptz not null default now()
);

alter table public.project_statuses
  add column if not exists workflow_id uuid references public.workflows (id) on delete cascade;

create index if not exists project_statuses_workflow_idx
  on public.project_statuses (workflow_id, position);

-- ---------------------------------------------------------------------------
-- Invitations now carry a position, not a coarse role.
-- ---------------------------------------------------------------------------
alter table public.workspace_invites
  add column if not exists position_id uuid references public.positions (id) on delete set null,
  add column if not exists full_name   text;

-- ===========================================================================
-- Spec-compatibility views
--
-- The brief names two tables that this codebase already had under different
-- names. Rather than duplicate storage, expose the spec names as
-- security-invoker views so RLS on the base table still applies.
-- ===========================================================================

drop view if exists public.invitations;
create view public.invitations
with (security_invoker = on) as
  select
    i.id,
    i.workspace_id,
    i.email,
    i.position_id,
    i.token,
    i.invited_by,
    i.expires_at,
    i.accepted_at,
    i.status,
    i.created_at
  from public.workspace_invites i;

drop view if exists public.workflow_statuses;
create view public.workflow_statuses
with (security_invoker = on) as
  select
    s.id,
    coalesce(s.workflow_id, w.id) as workflow_id,
    s.project_id,
    s.name,
    s.category,
    s.color,
    s.position,
    s.wip_limit,
    s.created_at
  from public.project_statuses s
  left join public.workflows w on w.project_id = s.project_id;

comment on view public.invitations is
  'Spec-named view over workspace_invites. Security invoker: base-table RLS applies.';
comment on view public.workflow_statuses is
  'Spec-named view over project_statuses joined to its workflow.';
