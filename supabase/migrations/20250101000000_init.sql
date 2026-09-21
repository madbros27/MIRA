-- ===========================================================================
-- MIRA — 01. Schema
-- Extensions, enums, tables and indexes.
-- ===========================================================================

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "pg_trgm" with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.workspace_role as enum ('admin', 'lead', 'member', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.issue_type as enum ('epic', 'story', 'task', 'bug', 'subtask');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.issue_priority as enum ('highest', 'high', 'medium', 'low', 'lowest');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.status_category as enum ('todo', 'in_progress', 'done');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sprint_status as enum ('planned', 'active', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_type as enum (
    'assigned', 'mentioned', 'status_changed', 'commented',
    'issue_created', 'sprint_started', 'sprint_completed', 'invited'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invite_status as enum ('pending', 'accepted', 'revoked', 'expired');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user, kept in sync by a trigger on auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  job_title   text,
  timezone    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Public profile mirror of auth.users.';

-- ---------------------------------------------------------------------------
-- workspaces — the multi-tenant boundary
-- ---------------------------------------------------------------------------
create table if not exists public.workspaces (
  id          uuid primary key default extensions.gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 1 and 80),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  description text,
  avatar_url  text,
  owner_id    uuid not null references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         public.workspace_role not null default 'member',
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_idx on public.workspace_members (user_id);

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id            uuid primary key default extensions.gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  name          text not null check (char_length(trim(name)) between 1 and 80),
  key           text not null check (key ~ '^[A-Z][A-Z0-9]{1,9}$'),
  description   text,
  lead_id       uuid references public.profiles (id) on delete set null,
  icon          text not null default 'Rocket',
  color         text not null default '#5B5BD6',
  is_archived   boolean not null default false,
  issue_counter integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, key)
);

create index if not exists projects_workspace_idx on public.projects (workspace_id);

-- ---------------------------------------------------------------------------
-- project_statuses — the configurable workflow columns of a project
-- ---------------------------------------------------------------------------
create table if not exists public.project_statuses (
  id         uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 40),
  category   public.status_category not null default 'todo',
  color      text not null default '#64748B',
  position   integer not null default 0,
  wip_limit  integer check (wip_limit is null or wip_limit > 0),
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create index if not exists project_statuses_project_idx
  on public.project_statuses (project_id, position);

-- Allowed workflow transitions. An empty set for a given `from` status means
-- "any transition is allowed" — projects only become restrictive once a lead
-- defines transitions explicitly.
create table if not exists public.status_transitions (
  id             uuid primary key default extensions.gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  from_status_id uuid not null references public.project_statuses (id) on delete cascade,
  to_status_id   uuid not null references public.project_statuses (id) on delete cascade,
  unique (from_status_id, to_status_id),
  check (from_status_id <> to_status_id)
);

create index if not exists status_transitions_project_idx
  on public.status_transitions (project_id);

-- ---------------------------------------------------------------------------
-- sprints
-- ---------------------------------------------------------------------------
create table if not exists public.sprints (
  id               uuid primary key default extensions.gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  name             text not null check (char_length(trim(name)) between 1 and 80),
  goal             text,
  start_date       timestamptz,
  end_date         timestamptz,
  status           public.sprint_status not null default 'planned',
  retrospective    text,
  committed_points numeric(7, 1),
  completed_points numeric(7, 1),
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (start_date is null or end_date is null or end_date >= start_date)
);

create index if not exists sprints_project_idx on public.sprints (project_id, status);

-- Only one active sprint per project.
create unique index if not exists sprints_one_active_per_project
  on public.sprints (project_id)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- issues
-- ---------------------------------------------------------------------------
create table if not exists public.issues (
  id               uuid primary key default extensions.gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  issue_number     integer not null,
  type             public.issue_type not null default 'task',
  title            text not null check (char_length(trim(title)) between 1 and 300),
  description      text,
  status_id        uuid not null references public.project_statuses (id) on delete restrict,
  priority         public.issue_priority not null default 'medium',
  assignee_id      uuid references public.profiles (id) on delete set null,
  reporter_id      uuid references public.profiles (id) on delete set null,
  epic_id          uuid references public.issues (id) on delete set null,
  parent_id        uuid references public.issues (id) on delete cascade,
  sprint_id        uuid references public.sprints (id) on delete set null,
  story_points     numeric(5, 1) check (story_points is null or story_points >= 0),
  due_date         date,
  board_position   double precision not null default 0,
  backlog_position double precision not null default 0,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (project_id, issue_number),
  check (id <> parent_id),
  check (id <> epic_id)
);

-- Full-text search vector over title + description.
alter table public.issues
  drop column if exists search_vector;
alter table public.issues
  add column search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) stored;

create index if not exists issues_project_idx on public.issues (project_id);
create index if not exists issues_status_idx on public.issues (status_id, board_position);
create index if not exists issues_sprint_idx on public.issues (sprint_id);
create index if not exists issues_assignee_idx on public.issues (assignee_id);
create index if not exists issues_epic_idx on public.issues (epic_id);
create index if not exists issues_parent_idx on public.issues (parent_id);
create index if not exists issues_backlog_idx on public.issues (project_id, backlog_position);
create index if not exists issues_search_idx on public.issues using gin (search_vector);
create index if not exists issues_title_trgm_idx
  on public.issues using gin (title extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- labels
-- ---------------------------------------------------------------------------
create table if not exists public.labels (
  id         uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 40),
  color      text not null default '#64748B',
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create table if not exists public.issue_labels (
  issue_id uuid not null references public.issues (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  primary key (issue_id, label_id)
);

create index if not exists issue_labels_label_idx on public.issue_labels (label_id);

-- ---------------------------------------------------------------------------
-- comments (+ edit history)
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
  id         uuid primary key default extensions.gen_random_uuid(),
  issue_id   uuid not null references public.issues (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  body       text not null check (char_length(body) between 1 and 20000),
  is_edited  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.comments
  drop column if exists search_vector;
alter table public.comments
  add column search_vector tsvector generated always as (
    to_tsvector('english', coalesce(body, ''))
  ) stored;

create index if not exists comments_issue_idx on public.comments (issue_id, created_at);
create index if not exists comments_search_idx on public.comments using gin (search_vector);

create table if not exists public.comment_revisions (
  id         uuid primary key default extensions.gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  body       text not null,
  editor_id  uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists comment_revisions_comment_idx
  on public.comment_revisions (comment_id, created_at desc);

-- ---------------------------------------------------------------------------
-- attachments — metadata for objects in the `attachments` storage bucket
-- ---------------------------------------------------------------------------
create table if not exists public.attachments (
  id           uuid primary key default extensions.gen_random_uuid(),
  issue_id     uuid not null references public.issues (id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  file_size    bigint not null default 0,
  mime_type    text,
  uploaded_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists attachments_issue_idx on public.attachments (issue_id);

-- ---------------------------------------------------------------------------
-- activity_log — append-only audit trail per issue
-- ---------------------------------------------------------------------------
create table if not exists public.activity_log (
  id            uuid primary key default extensions.gen_random_uuid(),
  issue_id      uuid not null references public.issues (id) on delete cascade,
  actor_id      uuid references public.profiles (id) on delete set null,
  action        text not null,
  field_changed text,
  old_value     text,
  new_value     text,
  created_at    timestamptz not null default now()
);

create index if not exists activity_log_issue_idx
  on public.activity_log (issue_id, created_at desc);

-- ---------------------------------------------------------------------------
-- watchers
-- ---------------------------------------------------------------------------
create table if not exists public.watchers (
  issue_id   uuid not null references public.issues (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (issue_id, user_id)
);

create index if not exists watchers_user_idx on public.watchers (user_id);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id           uuid primary key default extensions.gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  project_id   uuid references public.projects (id) on delete cascade,
  issue_id     uuid references public.issues (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null,
  type         public.notification_type not null,
  title        text not null,
  body         text,
  payload      jsonb not null default '{}'::jsonb,
  is_read      boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, is_read, created_at desc);

-- ---------------------------------------------------------------------------
-- saved_filters — the "JQL-lite" query builder store
-- ---------------------------------------------------------------------------
create table if not exists public.saved_filters (
  id           uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id   uuid references public.projects (id) on delete cascade,
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  name         text not null check (char_length(trim(name)) between 1 and 60),
  query        jsonb not null default '{}'::jsonb,
  is_shared    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists saved_filters_workspace_idx
  on public.saved_filters (workspace_id, owner_id);

-- ---------------------------------------------------------------------------
-- workspace_invites
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_invites (
  id           uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email        text not null check (position('@' in email) > 1),
  role         public.workspace_role not null default 'member',
  invited_by   uuid references public.profiles (id) on delete set null,
  token        text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  status       public.invite_status not null default 'pending',
  expires_at   timestamptz not null default now() + interval '14 days',
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);

create unique index if not exists workspace_invites_pending_unique
  on public.workspace_invites (workspace_id, lower(email))
  where status = 'pending';

create index if not exists workspace_invites_email_idx
  on public.workspace_invites (lower(email), status);
