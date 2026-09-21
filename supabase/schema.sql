-- ===========================================================================
-- MIRA — complete schema
--
-- GENERATED FILE — do not edit by hand.
-- Built from supabase/migrations by `npm run db:schema`.
--
-- Paste this whole file into the Supabase SQL editor, or prefer the CLI:
--   supabase link --project-ref <ref> && supabase db push
-- ===========================================================================


-- >>> 20250101000000_init.sql -------------------------------------------

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


-- >>> 20250101000100_functions.sql --------------------------------------

-- ===========================================================================
-- MIRA — 02. Functions & triggers
--
-- Membership helpers are SECURITY DEFINER so that RLS policies can ask
-- "is the caller a member of this workspace?" without recursing back into the
-- policies of workspace_members itself.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.slugify(p_text text)
returns text
language sql
immutable
set search_path = pg_temp
as $$
  select coalesce(
    nullif(
      trim(both '-' from regexp_replace(lower(p_text), '[^a-z0-9]+', '-', 'g')),
      ''
    ),
    'workspace'
  );
$$;

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_workspace_member(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace
      and m.user_id = auth.uid()
  );
$$;

-- Named `current_workspace_role` rather than `workspace_role` so the function
-- never shadows the enum type of the same name in a function-style cast.
create or replace function public.current_workspace_role(p_workspace uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.role
  from public.workspace_members m
  where m.workspace_id = p_workspace
    and m.user_id = auth.uid();
$$;

create or replace function public.has_workspace_role(
  p_workspace uuid,
  p_roles public.workspace_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace
      and m.user_id = auth.uid()
      and m.role = any (p_roles)
  );
$$;

create or replace function public.project_workspace(p_project uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.workspace_id from public.projects p where p.id = p_project;
$$;

create or replace function public.issue_project(p_issue uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.project_id from public.issues i where i.id = p_issue;
$$;

-- Read access: any member of the owning workspace.
create or replace function public.can_read_project(p_project uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.is_workspace_member(public.project_workspace(p_project));
$$;

-- Write access: admin, lead or member (viewers are read-only).
create or replace function public.can_write_project(p_project uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.has_workspace_role(
    public.project_workspace(p_project),
    array['admin', 'lead', 'member']::public.workspace_role[]
  );
$$;

-- Administer a project (workflow, labels, delete, sprint lifecycle).
create or replace function public.can_admin_project(p_project uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.has_workspace_role(
    public.project_workspace(p_project),
    array['admin', 'lead']::public.workspace_role[]
  );
$$;

create or replace function public.can_read_issue(p_issue uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.can_read_project(public.issue_project(p_issue));
$$;

create or replace function public.can_write_issue(p_issue uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.can_write_project(public.issue_project(p_issue));
$$;

create or replace function public.issue_key(p_project uuid, p_number integer)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.key || '-' || p_number from public.projects p where p.id = p_project;
$$;

-- ---------------------------------------------------------------------------
-- profiles <- auth.users
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  v_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    v_name,
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    )
  )
  on conflict (id) do update
    set email      = excluded.email,
        full_name  = coalesce(public.profiles.full_name, excluded.full_name),
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);

  -- Give every new account a workspace with demo data so the product is never
  -- an empty shell on first login. Seeding must never be able to block signup,
  -- hence the guard and the swallowed-but-logged failure.
  if to_regprocedure('public.bootstrap_demo_workspace(uuid, text)') is not null then
    begin
      perform public.bootstrap_demo_workspace(new.id, v_name);
    exception when others then
      raise warning 'MIRA: demo workspace bootstrap failed for %: %', new.id, sqlerrm;
    end;
  end if;

  -- Honour any pending invites addressed to this email.
  begin
    perform public.claim_pending_invites(new.id, new.email);
  exception when others then
    raise warning 'MIRA: invite claim failed for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

create or replace function public.handle_user_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles
     set email = new.email,
         updated_at = now()
   where id = new.id
     and email is distinct from new.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email on auth.users
  for each row execute function public.handle_user_update();

-- ---------------------------------------------------------------------------
-- Issue numbering & defaults
-- ---------------------------------------------------------------------------
create or replace function public.assign_issue_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_counter integer;
begin
  -- Atomic per-project counter -> MIRA-1, MIRA-2, ...
  update public.projects
     set issue_counter = issue_counter + 1
   where id = new.project_id
  returning issue_counter into v_counter;

  if v_counter is null then
    raise exception 'Unknown project %', new.project_id;
  end if;

  new.issue_number := v_counter;

  if new.reporter_id is null then
    new.reporter_id := auth.uid();
  end if;

  if new.status_id is null then
    select s.id into new.status_id
      from public.project_statuses s
     where s.project_id = new.project_id
     order by s.position, s.created_at
     limit 1;
  end if;

  if coalesce(new.board_position, 0) = 0 then
    select coalesce(max(i.board_position), 0) + 1024
      into new.board_position
      from public.issues i
     where i.status_id = new.status_id;
  end if;

  if coalesce(new.backlog_position, 0) = 0 then
    select coalesce(max(i.backlog_position), 0) + 1024
      into new.backlog_position
      from public.issues i
     where i.project_id = new.project_id;
  end if;

  return new;
end;
$$;

drop trigger if exists issues_assign_defaults on public.issues;
create trigger issues_assign_defaults
  before insert on public.issues
  for each row execute function public.assign_issue_defaults();

-- Keep resolved_at in sync with the status category, and guard the workflow.
create or replace function public.handle_issue_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_category public.status_category;
  v_restricted boolean;
begin
  select category into v_new_category
    from public.project_statuses where id = new.status_id;

  if tg_op = 'UPDATE' and new.status_id is distinct from old.status_id then
    -- Enforce custom transitions only when the project defines them.
    select exists (
      select 1 from public.status_transitions t
       where t.from_status_id = old.status_id
    ) into v_restricted;

    if v_restricted and not exists (
      select 1 from public.status_transitions t
       where t.from_status_id = old.status_id
         and t.to_status_id = new.status_id
    ) then
      raise exception
        'Transition is not allowed by this project workflow'
        using errcode = 'check_violation';
    end if;
  end if;

  if v_new_category = 'done' then
    if new.resolved_at is null then
      new.resolved_at := now();
    end if;
  else
    new.resolved_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists issues_status_change on public.issues;
create trigger issues_status_change
  before insert or update of status_id on public.issues
  for each row execute function public.handle_issue_status_change();

-- ---------------------------------------------------------------------------
-- Activity log
-- ---------------------------------------------------------------------------
create or replace function public.log_issue_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log (issue_id, actor_id, action)
    values (new.id, coalesce(v_actor, new.reporter_id), 'created');
    return new;
  end if;

  if new.title is distinct from old.title then
    insert into public.activity_log (issue_id, actor_id, action, field_changed, old_value, new_value)
    values (new.id, v_actor, 'updated', 'title', old.title, new.title);
  end if;

  if new.description is distinct from old.description then
    insert into public.activity_log (issue_id, actor_id, action, field_changed, old_value, new_value)
    values (new.id, v_actor, 'updated', 'description', null, null);
  end if;

  if new.status_id is distinct from old.status_id then
    insert into public.activity_log (issue_id, actor_id, action, field_changed, old_value, new_value)
    values (
      new.id, v_actor, 'updated', 'status',
      (select name from public.project_statuses where id = old.status_id),
      (select name from public.project_statuses where id = new.status_id)
    );
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    insert into public.activity_log (issue_id, actor_id, action, field_changed, old_value, new_value)
    values (
      new.id, v_actor, 'updated', 'assignee',
      (select full_name from public.profiles where id = old.assignee_id),
      (select full_name from public.profiles where id = new.assignee_id)
    );
  end if;

  if new.priority is distinct from old.priority then
    insert into public.activity_log (issue_id, actor_id, action, field_changed, old_value, new_value)
    values (new.id, v_actor, 'updated', 'priority', old.priority::text, new.priority::text);
  end if;

  if new.type is distinct from old.type then
    insert into public.activity_log (issue_id, actor_id, action, field_changed, old_value, new_value)
    values (new.id, v_actor, 'updated', 'type', old.type::text, new.type::text);
  end if;

  if new.story_points is distinct from old.story_points then
    insert into public.activity_log (issue_id, actor_id, action, field_changed, old_value, new_value)
    values (new.id, v_actor, 'updated', 'story_points', old.story_points::text, new.story_points::text);
  end if;

  if new.due_date is distinct from old.due_date then
    insert into public.activity_log (issue_id, actor_id, action, field_changed, old_value, new_value)
    values (new.id, v_actor, 'updated', 'due_date', old.due_date::text, new.due_date::text);
  end if;

  if new.sprint_id is distinct from old.sprint_id then
    insert into public.activity_log (issue_id, actor_id, action, field_changed, old_value, new_value)
    values (
      new.id, v_actor, 'updated', 'sprint',
      (select name from public.sprints where id = old.sprint_id),
      (select name from public.sprints where id = new.sprint_id)
    );
  end if;

  if new.epic_id is distinct from old.epic_id then
    insert into public.activity_log (issue_id, actor_id, action, field_changed, old_value, new_value)
    values (
      new.id, v_actor, 'updated', 'epic',
      (select title from public.issues where id = old.epic_id),
      (select title from public.issues where id = new.epic_id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists issues_activity_log on public.issues;
create trigger issues_activity_log
  after insert or update on public.issues
  for each row execute function public.log_issue_activity();

-- ---------------------------------------------------------------------------
-- Watchers — reporters and assignees follow their issues automatically
-- ---------------------------------------------------------------------------
create or replace function public.sync_issue_watchers()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.reporter_id is not null then
    insert into public.watchers (issue_id, user_id)
    values (new.id, new.reporter_id)
    on conflict do nothing;
  end if;

  if new.assignee_id is not null then
    insert into public.watchers (issue_id, user_id)
    values (new.id, new.assignee_id)
    on conflict do nothing;
  end if;

  return null;
end;
$$;

drop trigger if exists issues_sync_watchers on public.issues;
create trigger issues_sync_watchers
  after insert or update of assignee_id on public.issues
  for each row execute function public.sync_issue_watchers();

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create or replace function public.notify_issue_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_workspace uuid;
  v_key text;
  v_status text;
begin
  select p.workspace_id, p.key || '-' || new.issue_number
    into v_workspace, v_key
    from public.projects p
   where p.id = new.project_id;

  -- Assigned to you
  if new.assignee_id is not null
     and new.assignee_id is distinct from v_actor
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
  then
    insert into public.notifications
      (user_id, workspace_id, project_id, issue_id, actor_id, type, title, body, payload)
    values (
      new.assignee_id, v_workspace, new.project_id, new.id, v_actor, 'assigned',
      v_key || ' was assigned to you', new.title,
      jsonb_build_object('issue_key', v_key)
    );
  end if;

  -- Status changed -> every watcher except the actor
  if tg_op = 'UPDATE' and new.status_id is distinct from old.status_id then
    select name into v_status from public.project_statuses where id = new.status_id;

    insert into public.notifications
      (user_id, workspace_id, project_id, issue_id, actor_id, type, title, body, payload)
    select w.user_id, v_workspace, new.project_id, new.id, v_actor, 'status_changed',
           v_key || ' moved to ' || v_status, new.title,
           jsonb_build_object('issue_key', v_key, 'status', v_status)
      from public.watchers w
     where w.issue_id = new.id
       and w.user_id is distinct from v_actor;
  end if;

  return null;
end;
$$;

drop trigger if exists issues_notify on public.issues;
create trigger issues_notify
  after insert or update on public.issues
  for each row execute function public.notify_issue_change();

-- Comments: notify mentioned users (type "mentioned") and everyone else
-- watching the issue (type "commented"). Mentions are encoded by the client as
-- `@[Display Name](user-uuid)` so the parsing can stay server-side.
create or replace function public.notify_comment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace uuid;
  v_project uuid;
  v_key text;
  v_mentioned uuid[];
begin
  select p.workspace_id, p.id, p.key || '-' || i.issue_number
    into v_workspace, v_project, v_key
    from public.issues i
    join public.projects p on p.id = i.project_id
   where i.id = new.issue_id;

  -- The regex matches the exact UUID shape, so the ::uuid cast can never
  -- raise and break the comment insert. `regexp_matches` is set-returning and
  -- therefore called in FROM rather than in the select list.
  select coalesce(array_agg(distinct (m.groups)[1]::uuid), '{}'::uuid[])
    into v_mentioned
    from regexp_matches(
           new.body,
           '@\[[^\]]+\]\(([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)',
           'g'
         ) as m(groups)
    join public.workspace_members wm
      on wm.user_id = (m.groups)[1]::uuid
     and wm.workspace_id = v_workspace
   where (m.groups)[1]::uuid is distinct from new.author_id;

  if array_length(v_mentioned, 1) > 0 then
    insert into public.notifications
      (user_id, workspace_id, project_id, issue_id, actor_id, type, title, body, payload)
    select u, v_workspace, v_project, new.issue_id, new.author_id, 'mentioned',
           'You were mentioned on ' || v_key, left(new.body, 280),
           jsonb_build_object('issue_key', v_key, 'comment_id', new.id)
      from unnest(v_mentioned) as u;
  end if;

  insert into public.notifications
    (user_id, workspace_id, project_id, issue_id, actor_id, type, title, body, payload)
  select w.user_id, v_workspace, v_project, new.issue_id, new.author_id, 'commented',
         'New comment on ' || v_key, left(new.body, 280),
         jsonb_build_object('issue_key', v_key, 'comment_id', new.id)
    from public.watchers w
   where w.issue_id = new.issue_id
     and w.user_id is distinct from new.author_id
     and not (w.user_id = any (v_mentioned));

  -- Commenting implies watching.
  if new.author_id is not null then
    insert into public.watchers (issue_id, user_id)
    values (new.issue_id, new.author_id)
    on conflict do nothing;
  end if;

  insert into public.activity_log (issue_id, actor_id, action, field_changed)
  values (new.issue_id, new.author_id, 'commented', 'comment');

  return null;
end;
$$;

drop trigger if exists comments_notify on public.comments;
create trigger comments_notify
  after insert on public.comments
  for each row execute function public.notify_comment();

-- Keep an edit history for comments.
create or replace function public.archive_comment_revision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.body is distinct from old.body then
    insert into public.comment_revisions (comment_id, body, editor_id)
    values (old.id, old.body, auth.uid());
    new.is_edited := true;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists comments_archive_revision on public.comments;
create trigger comments_archive_revision
  before update on public.comments
  for each row execute function public.archive_comment_revision();

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'workspaces', 'projects', 'issues', 'sprints', 'saved_filters'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: project creation with a default workflow
-- ---------------------------------------------------------------------------
create or replace function public.create_project(
  p_workspace   uuid,
  p_name        text,
  p_key         text,
  p_description text default null,
  p_lead        uuid default null,
  p_icon        text default 'Rocket',
  p_color       text default '#5B5BD6'
)
returns public.projects
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_project public.projects;
begin
  insert into public.projects (workspace_id, name, key, description, lead_id, icon, color)
  values (
    p_workspace, p_name, upper(p_key), p_description,
    coalesce(p_lead, auth.uid()), p_icon, p_color
  )
  returning * into v_project;

  insert into public.project_statuses (project_id, name, category, color, position)
  values
    (v_project.id, 'To Do',       'todo',        '#64748B', 0),
    (v_project.id, 'In Progress', 'in_progress', '#2563EB', 1),
    (v_project.id, 'In Review',   'in_progress', '#A855F7', 2),
    (v_project.id, 'Done',        'done',        '#059669', 3);

  insert into public.labels (project_id, name, color)
  values
    (v_project.id, 'frontend',  '#2563EB'),
    (v_project.id, 'backend',   '#7C3AED'),
    (v_project.id, 'design',    '#DB2777'),
    (v_project.id, 'tech-debt', '#D97706');

  return v_project;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: sprint lifecycle
-- ---------------------------------------------------------------------------
create or replace function public.start_sprint(
  p_sprint uuid,
  p_start  timestamptz default now(),
  p_end    timestamptz default null
)
returns public.sprints
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_sprint public.sprints;
  v_points numeric;
begin
  select coalesce(sum(i.story_points), 0) into v_points
    from public.issues i where i.sprint_id = p_sprint;

  update public.sprints
     set status = 'active',
         start_date = p_start,
         end_date = coalesce(p_end, end_date, p_start + interval '14 days'),
         committed_points = v_points
   where id = p_sprint
  returning * into v_sprint;

  if v_sprint.id is null then
    raise exception 'Sprint not found or not permitted';
  end if;

  insert into public.notifications
    (user_id, workspace_id, project_id, actor_id, type, title, body, payload)
  select m.user_id, p.workspace_id, p.id, auth.uid(), 'sprint_started',
         v_sprint.name || ' started', v_sprint.goal,
         jsonb_build_object('sprint_id', v_sprint.id, 'project_key', p.key)
    from public.projects p
    join public.workspace_members m on m.workspace_id = p.workspace_id
   where p.id = v_sprint.project_id
     and m.user_id is distinct from auth.uid();

  return v_sprint;
end;
$$;

create or replace function public.complete_sprint(
  p_sprint        uuid,
  p_target_sprint uuid default null
)
returns public.sprints
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_sprint public.sprints;
  v_completed numeric;
begin
  select coalesce(sum(i.story_points), 0) into v_completed
    from public.issues i
    join public.project_statuses s on s.id = i.status_id
   where i.sprint_id = p_sprint
     and s.category = 'done';

  -- Unfinished work rolls into the next sprint, or back to the backlog.
  update public.issues i
     set sprint_id = p_target_sprint
   where i.sprint_id = p_sprint
     and i.status_id in (
       select s.id from public.project_statuses s where s.category <> 'done'
     );

  update public.sprints
     set status = 'completed',
         completed_points = v_completed,
         completed_at = now()
   where id = p_sprint
  returning * into v_sprint;

  if v_sprint.id is null then
    raise exception 'Sprint not found or not permitted';
  end if;

  return v_sprint;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: global search across issues, projects and comments
-- ---------------------------------------------------------------------------
create or replace function public.global_search(
  p_workspace uuid,
  p_query     text,
  p_limit     integer default 20
)
returns table (
  kind         text,
  id           uuid,
  project_id   uuid,
  project_key  text,
  project_name text,
  issue_id     uuid,
  issue_number integer,
  title        text,
  snippet      text,
  rank         real
)
language sql
stable
set search_path = public, pg_temp
as $$
  with q as (
    select
      websearch_to_tsquery('english', p_query) as tsq,
      '%' || p_query || '%' as likeq
  )
  (
    -- Issues rank highest: a +1 offset keeps a weak title match above a
    -- strong comment match.
    select 'issue'::text, i.id, p.id, p.key, p.name, i.id, i.issue_number,
           i.title, left(coalesce(i.description, ''), 160),
           (ts_rank(i.search_vector, q.tsq) + 1.0)::real
      from public.issues i
      join public.projects p on p.id = i.project_id
      cross join q
     where p.workspace_id = p_workspace
       and (i.search_vector @@ q.tsq or i.title ilike q.likeq)
     order by 10 desc, i.updated_at desc
     limit p_limit
  )
  union all
  (
    select 'project'::text, p.id, p.id, p.key, p.name, null::uuid, null::integer,
           p.name, left(coalesce(p.description, ''), 160), 0.9::real
      from public.projects p
      cross join q
     where p.workspace_id = p_workspace
       and (p.name ilike q.likeq or p.key ilike q.likeq)
     limit p_limit
  )
  union all
  (
    select 'comment'::text, c.id, p.id, p.key, p.name, i.id, i.issue_number,
           i.title, left(c.body, 160), ts_rank(c.search_vector, q.tsq)::real
      from public.comments c
      join public.issues i on i.id = c.issue_id
      join public.projects p on p.id = i.project_id
      cross join q
     where p.workspace_id = p_workspace
       and (c.search_vector @@ q.tsq or c.body ilike q.likeq)
     order by 10 desc, c.created_at desc
     limit p_limit
  );
$$;

-- ---------------------------------------------------------------------------
-- Lock down the functions a client should never call directly. PostgreSQL
-- grants EXECUTE to PUBLIC by default, and several of these are SECURITY
-- DEFINER. Trigger functions keep working: privileges are checked when the
-- trigger is created, not when it fires.
-- ---------------------------------------------------------------------------
revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_user_update() from public;
revoke all on function public.assign_issue_defaults() from public;
revoke all on function public.handle_issue_status_change() from public;
revoke all on function public.log_issue_activity() from public;
revoke all on function public.sync_issue_watchers() from public;
revoke all on function public.notify_issue_change() from public;
revoke all on function public.notify_comment() from public;
revoke all on function public.archive_comment_revision() from public;
revoke all on function public.set_updated_at() from public;
revoke all on function public.claim_pending_invites(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- RPC: notifications
-- ---------------------------------------------------------------------------
create or replace function public.mark_all_notifications_read(p_workspace uuid default null)
returns integer
language sql
set search_path = public, pg_temp
as $$
  with updated as (
    update public.notifications
       set is_read = true
     where user_id = auth.uid()
       and is_read = false
       and (p_workspace is null or workspace_id = p_workspace)
    returning 1
  )
  select count(*)::integer from updated;
$$;

-- ---------------------------------------------------------------------------
-- RPC: invites
-- ---------------------------------------------------------------------------
create or replace function public.claim_pending_invites(p_user uuid, p_email text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  with claimed as (
    update public.workspace_invites
       set status = 'accepted', accepted_at = now()
     where lower(email) = lower(p_email)
       and status = 'pending'
       and expires_at > now()
    returning workspace_id, role
  ),
  joined as (
    insert into public.workspace_members (workspace_id, user_id, role)
    select workspace_id, p_user, role from claimed
    on conflict (workspace_id, user_id) do nothing
    returning 1
  )
  select count(*)::integer into v_count from joined;

  return v_count;
end;
$$;

create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invite public.workspace_invites;
  v_email text;
begin
  select email into v_email from public.profiles where id = auth.uid();
  if v_email is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_invite
    from public.workspace_invites
   where token = p_token
     and status = 'pending'
     and expires_at > now();

  if v_invite.id is null then
    raise exception 'This invitation is invalid or has expired';
  end if;

  if lower(v_invite.email) <> lower(v_email) then
    raise exception 'This invitation was issued to a different email address';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_invite.workspace_id, auth.uid(), v_invite.role)
  on conflict (workspace_id, user_id) do nothing;

  update public.workspace_invites
     set status = 'accepted', accepted_at = now()
   where id = v_invite.id;

  return v_invite.workspace_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: workspace creation (creator becomes admin in one transaction)
-- ---------------------------------------------------------------------------
create or replace function public.create_workspace(
  p_name text,
  p_slug text default null
)
returns public.workspaces
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace public.workspaces;
  v_slug text;
  v_suffix integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_slug := coalesce(nullif(trim(p_slug), ''), public.slugify(p_name));

  while exists (select 1 from public.workspaces w where w.slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := public.slugify(p_name) || '-' || v_suffix;
  end loop;

  insert into public.workspaces (name, slug, owner_id)
  values (p_name, v_slug, auth.uid())
  returning * into v_workspace;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace.id, auth.uid(), 'admin');

  return v_workspace;
end;
$$;


-- >>> 20250101000200_rls.sql --------------------------------------------

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


-- >>> 20250101000300_storage_realtime.sql -------------------------------

-- ===========================================================================
-- MIRA — 04. Storage buckets & Realtime publication
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Buckets
--   attachments  private, path = {project_id}/{issue_id}/{uuid}-{filename}
--   avatars      public,  path = {user_id}/{filename}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 26214400, null)
on conflict (id) do update
  set public = false,
      file_size_limit = 26214400;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152;

-- Parse the leading path segment as a project id without ever raising on a
-- malformed object name (a cast failure inside a policy aborts the request).
create or replace function public.storage_path_project(p_name text)
returns uuid
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when split_part(p_name, '/', 1) ~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;

-- --- attachments -----------------------------------------------------------
drop policy if exists "MIRA attachments read" on storage.objects;
create policy "MIRA attachments read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and public.can_read_project(public.storage_path_project(name))
  );

-- Membership of the owning project is the whole test here. `storage.objects.owner`
-- is deliberately not consulted: it is populated by the Storage API rather
-- than by the client, and has changed shape across versions. The
-- `public.attachments` row policy is what restricts deletion to the uploader
-- or a project lead.
drop policy if exists "MIRA attachments insert" on storage.objects;
create policy "MIRA attachments insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.can_write_project(public.storage_path_project(name))
  );

drop policy if exists "MIRA attachments delete" on storage.objects;
create policy "MIRA attachments delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and public.can_write_project(public.storage_path_project(name))
  );

-- --- avatars ---------------------------------------------------------------
drop policy if exists "MIRA avatars read" on storage.objects;
create policy "MIRA avatars read" on storage.objects
  for select to public
  using (bucket_id = 'avatars');

drop policy if exists "MIRA avatars write own" on storage.objects;
create policy "MIRA avatars write own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "MIRA avatars update own" on storage.objects;
create policy "MIRA avatars update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);

drop policy if exists "MIRA avatars delete own" on storage.objects;
create policy "MIRA avatars delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Realtime — boards, issue detail and the notification bell all subscribe to
-- postgres_changes. RLS is still applied per subscriber.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'issues', 'comments', 'notifications', 'activity_log',
    'sprints', 'project_statuses', 'issue_labels', 'attachments'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when undefined_object then
        raise notice 'MIRA: publication supabase_realtime not found, skipping %', t;
    end;
  end loop;
end $$;

-- DELETE events must carry enough of the old row for client-side filters
-- (e.g. `project_id=eq.<id>`) to match.
alter table public.issues replica identity full;
alter table public.comments replica identity full;
alter table public.issue_labels replica identity full;


-- >>> 20250101000400_seed_demo.sql --------------------------------------

-- ===========================================================================
-- MIRA — 05. Demo seed
--
-- `bootstrap_demo_workspace` is called by the auth.users insert trigger, so
-- every new account lands in a populated workspace instead of an empty shell.
-- It is SECURITY DEFINER (it runs with no auth.uid()) and a no-op for users
-- who already belong to a workspace.
-- ===========================================================================

create or replace function public.bootstrap_demo_workspace(
  p_user uuid,
  p_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace uuid;
  v_slug      text;
  v_project   uuid;
  v_design    uuid;
  v_todo      uuid;
  v_progress  uuid;
  v_review    uuid;
  v_done      uuid;
  v_d_todo    uuid;
  v_d_done    uuid;
  v_sprint_1  uuid;
  v_sprint_2  uuid;
  v_sprint_3  uuid;
  v_epic_auth uuid;
  v_epic_board uuid;
  v_epic_mobile uuid;
  v_label_fe  uuid;
  v_label_be  uuid;
  v_label_ux  uuid;
  v_label_debt uuid;
  v_parent    uuid;
  v_display   text;
begin
  -- Already onboarded? Leave everything alone.
  if exists (select 1 from public.workspace_members m where m.user_id = p_user) then
    return null;
  end if;

  v_display := coalesce(nullif(trim(p_name), ''), 'My');
  v_slug := public.slugify(v_display) || '-' || substr(replace(p_user::text, '-', ''), 1, 6);

  insert into public.workspaces (name, slug, description, owner_id)
  values (
    v_display || '''s Team',
    v_slug,
    'Demo workspace created with your account — rename it or start a fresh one any time.',
    p_user
  )
  returning id into v_workspace;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace, p_user, 'admin');

  -- ---------------------------------------------------------------------
  -- Project 1 — MIRA Platform
  -- ---------------------------------------------------------------------
  insert into public.projects (workspace_id, name, key, description, lead_id, icon, color)
  values (
    v_workspace, 'MIRA Platform', 'MIRA',
    'The product itself: boards, backlog, sprints and reporting.',
    p_user, 'Rocket', '#5B5BD6'
  )
  returning id into v_project;

  insert into public.project_statuses (project_id, name, category, color, position, wip_limit)
  values (v_project, 'To Do', 'todo', '#64748B', 0, null)
  returning id into v_todo;
  insert into public.project_statuses (project_id, name, category, color, position, wip_limit)
  values (v_project, 'In Progress', 'in_progress', '#2563EB', 1, 4)
  returning id into v_progress;
  insert into public.project_statuses (project_id, name, category, color, position, wip_limit)
  values (v_project, 'In Review', 'in_progress', '#A855F7', 2, 3)
  returning id into v_review;
  insert into public.project_statuses (project_id, name, category, color, position, wip_limit)
  values (v_project, 'Done', 'done', '#059669', 3, null)
  returning id into v_done;

  insert into public.labels (project_id, name, color)
  values (v_project, 'frontend', '#2563EB') returning id into v_label_fe;
  insert into public.labels (project_id, name, color)
  values (v_project, 'backend', '#7C3AED') returning id into v_label_be;
  insert into public.labels (project_id, name, color)
  values (v_project, 'ux', '#DB2777') returning id into v_label_ux;
  insert into public.labels (project_id, name, color)
  values (v_project, 'tech-debt', '#D97706') returning id into v_label_debt;

  -- Sprints: one finished, one running, one being planned.
  insert into public.sprints
    (project_id, name, goal, start_date, end_date, status,
     committed_points, completed_points, completed_at, retrospective)
  values (
    v_project, 'Sprint 1', 'Ship authentication and the project shell.',
    now() - interval '28 days', now() - interval '14 days', 'completed',
    34, 29, now() - interval '14 days',
    E'## What went well\n- Auth landed two days early.\n- Pairing on RLS policies paid off.\n\n## What to improve\n- Estimates on the storage work were optimistic.\n\n## Actions\n- Break anything above 8 points into sub-tasks.'
  )
  returning id into v_sprint_1;

  insert into public.sprints
    (project_id, name, goal, start_date, end_date, status, committed_points)
  values (
    v_project, 'Sprint 2', 'Board, backlog and realtime sync feel instant.',
    now() - interval '6 days', now() + interval '8 days', 'active', 42
  )
  returning id into v_sprint_2;

  insert into public.sprints (project_id, name, goal, status)
  values (v_project, 'Sprint 3', 'Reporting and notifications.', 'planned')
  returning id into v_sprint_3;

  -- Epics
  insert into public.issues
    (project_id, type, title, description, status_id, priority, reporter_id,
     assignee_id, story_points, board_position, backlog_position)
  values (
    v_project, 'epic', 'Accounts & access control',
    'Sign-up, sign-in, OAuth and role-based permissions enforced in the database.',
    v_done, 'high', p_user, p_user, null, 1024, 1024
  )
  returning id into v_epic_auth;

  insert into public.issues
    (project_id, type, title, description, status_id, priority, reporter_id,
     assignee_id, story_points, board_position, backlog_position)
  values (
    v_project, 'epic', 'Board & backlog experience',
    'Drag-and-drop board, ordered backlog, sprint planning and live updates.',
    v_progress, 'highest', p_user, p_user, null, 2048, 2048
  )
  returning id into v_epic_board;

  insert into public.issues
    (project_id, type, title, description, status_id, priority, reporter_id,
     assignee_id, story_points, board_position, backlog_position)
  values (
    v_project, 'epic', 'Mobile & offline polish',
    'Everything works one-handed on a phone.',
    v_todo, 'medium', p_user, p_user, null, 3072, 3072
  )
  returning id into v_epic_mobile;

  -- Sprint 1 (completed) — resolved dates spread across the sprint so the
  -- burndown chart has a realistic shape.
  insert into public.issues
    (project_id, type, title, description, status_id, priority, reporter_id,
     assignee_id, epic_id, sprint_id, story_points, resolved_at,
     board_position, backlog_position)
  values
    (v_project, 'story', 'Email + password sign-up with confirmation',
     'New users can register, confirm their address and land in a seeded workspace.',
     v_done, 'high', p_user, p_user, v_epic_auth, v_sprint_1, 8,
     now() - interval '25 days', 4096, 4096),
    (v_project, 'story', 'Google OAuth sign-in',
     'Single click sign-in via Google, reusing the same profile record.',
     v_done, 'high', p_user, p_user, v_epic_auth, v_sprint_1, 5,
     now() - interval '22 days', 5120, 5120),
    (v_project, 'task', 'Row-Level Security policies for every table',
     'A row is readable only by members of the owning workspace.',
     v_done, 'highest', p_user, p_user, v_epic_auth, v_sprint_1, 13,
     now() - interval '18 days', 6144, 6144),
    (v_project, 'bug', 'Session lost after a hard refresh',
     'Cookies were not being written back from the middleware response.',
     v_done, 'high', p_user, p_user, v_epic_auth, v_sprint_1, 3,
     now() - interval '16 days', 7168, 7168);

  -- Sprint 2 (active)
  insert into public.issues
    (project_id, type, title, description, status_id, priority, reporter_id,
     assignee_id, epic_id, sprint_id, story_points, due_date, resolved_at,
     board_position, backlog_position)
  values
    (v_project, 'story', 'Drag-and-drop across board columns',
     E'Move a card between columns with the mouse, touch, or the keyboard.\n\n**Acceptance criteria**\n- Optimistic update, rolled back on failure\n- Announced to screen readers\n- Works with a horizontal swipe on mobile',
     v_done, 'highest', p_user, p_user, v_epic_board, v_sprint_2, 8,
     (now() - interval '2 days')::date, now() - interval '3 days', 8192, 8192),
    (v_project, 'story', 'Realtime board sync between viewers',
     'Two people looking at the same board see each other''s changes without refreshing.',
     v_review, 'highest', p_user, p_user, v_epic_board, v_sprint_2, 8,
     (now() + interval '3 days')::date, null, 9216, 9216),
    (v_project, 'story', 'Backlog ordering and sprint assignment',
     'Reorder the backlog by dragging, and pull items into the active sprint.',
     v_progress, 'high', p_user, p_user, v_epic_board, v_sprint_2, 5,
     (now() + interval '5 days')::date, null, 10240, 10240),
    (v_project, 'task', 'Quick filters: my issues, unassigned, overdue',
     'One-tap filters on the board toolbar that combine with the saved filters.',
     v_progress, 'medium', p_user, p_user, v_epic_board, v_sprint_2, 3,
     null, null, 11264, 11264),
    (v_project, 'bug', 'Card jumps to the wrong column on a fast drop',
     'Position is recomputed against a stale neighbour list.',
     v_todo, 'high', p_user, null, v_epic_board, v_sprint_2, 2,
     (now() + interval '1 day')::date, null, 12288, 12288),
    (v_project, 'task', 'Keyboard shortcuts: c to create, / to search',
     'Global shortcut layer that never fires while a field has focus.',
     v_todo, 'low', p_user, null, v_epic_board, v_sprint_2, 3,
     null, null, 13312, 13312),
    (v_project, 'story', 'Issue detail: comments, attachments, activity',
     'Everything about one issue on a single screen, with an audit trail.',
     v_review, 'high', p_user, p_user, v_epic_board, v_sprint_2, 8,
     null, null, 14336, 14336),
    (v_project, 'task', 'Loading skeletons for board and backlog',
     'No layout shift between the skeleton and the loaded content.',
     v_todo, 'low', p_user, null, v_epic_board, v_sprint_2, 2,
     null, null, 15360, 15360);

  -- Sub-tasks hang off the realtime story.
  select id into v_parent
    from public.issues
   where project_id = v_project
     and title = 'Realtime board sync between viewers';

  insert into public.issues
    (project_id, type, title, status_id, priority, reporter_id, assignee_id,
     parent_id, epic_id, sprint_id, story_points, board_position, backlog_position)
  values
    (v_project, 'subtask', 'Subscribe to postgres_changes for issues',
     v_done, 'medium', p_user, p_user, v_parent, v_epic_board, v_sprint_2, 2, 16384, 16384),
    (v_project, 'subtask', 'Reconcile realtime events with the query cache',
     v_progress, 'medium', p_user, p_user, v_parent, v_epic_board, v_sprint_2, 3, 17408, 17408);

  -- Backlog (no sprint yet)
  insert into public.issues
    (project_id, type, title, description, status_id, priority, reporter_id,
     assignee_id, epic_id, sprint_id, story_points, board_position, backlog_position)
  values
    (v_project, 'story', 'Burndown and velocity reports',
     'Remaining points per day against the ideal line, plus velocity over the last sprints.',
     v_todo, 'high', p_user, null, v_epic_board, v_sprint_3, 8, 18432, 18432),
    (v_project, 'story', 'In-app notification centre',
     'Assignments, mentions, status changes and comments, marked read per item.',
     v_todo, 'high', p_user, null, v_epic_board, v_sprint_3, 5, 19456, 19456),
    (v_project, 'story', 'Saved filters and a JQL-lite query builder',
     'Compose filters without writing a query language, then save and share them.',
     v_todo, 'medium', p_user, null, null, v_sprint_3, 8, 20480, 20480),
    (v_project, 'story', 'Swipe between board columns on mobile',
     'Columns become a snapping horizontal rail under 768px.',
     v_todo, 'medium', p_user, null, v_epic_mobile, null, 5, 21504, 21504),
    (v_project, 'task', 'Full-screen sheets instead of modals on small screens',
     'Dialogs become bottom sheets that can be dismissed by dragging.',
     v_todo, 'medium', p_user, null, v_epic_mobile, null, 3, 22528, 22528),
    (v_project, 'task', 'CSV export of the current issue list',
     'Export respects the active filters and column order.',
     v_todo, 'low', p_user, null, null, null, 2, 23552, 23552),
    (v_project, 'bug', 'Dark theme: low contrast on the priority chips',
     'Fails WCAG AA at 4.5:1 for the "lowest" chip.',
     v_todo, 'low', p_user, null, v_epic_mobile, null, 1, 24576, 24576),
    (v_project, 'task', 'Replace ad-hoc date formatting with a shared helper',
     'Three components format dates differently today.',
     v_todo, 'lowest', p_user, null, null, null, 2, 25600, 25600);

  -- Labels on a handful of issues
  insert into public.issue_labels (issue_id, label_id)
  select i.id, v_label_fe from public.issues i
   where i.project_id = v_project
     and i.title in (
       'Drag-and-drop across board columns',
       'Loading skeletons for board and backlog',
       'Swipe between board columns on mobile',
       'Dark theme: low contrast on the priority chips'
     )
  on conflict do nothing;

  insert into public.issue_labels (issue_id, label_id)
  select i.id, v_label_be from public.issues i
   where i.project_id = v_project
     and i.title in (
       'Row-Level Security policies for every table',
       'Realtime board sync between viewers',
       'Subscribe to postgres_changes for issues'
     )
  on conflict do nothing;

  insert into public.issue_labels (issue_id, label_id)
  select i.id, v_label_ux from public.issues i
   where i.project_id = v_project
     and i.title in (
       'Full-screen sheets instead of modals on small screens',
       'Issue detail: comments, attachments, activity'
     )
  on conflict do nothing;

  insert into public.issue_labels (issue_id, label_id)
  select i.id, v_label_debt from public.issues i
   where i.project_id = v_project
     and i.title = 'Replace ad-hoc date formatting with a shared helper'
  on conflict do nothing;

  -- A couple of comments so the issue detail view is not empty.
  insert into public.comments (issue_id, author_id, body)
  select i.id, p_user,
         E'Split this into two sub-tasks — the subscription itself and the cache reconciliation. The second one is where the sharp edges are.'
    from public.issues i
   where i.project_id = v_project
     and i.title = 'Realtime board sync between viewers';

  insert into public.comments (issue_id, author_id, body)
  select i.id, p_user,
         E'Reproduced on a 120Hz trackpad: two drop events fire before the first mutation settles.\n\n```\nboard.tsx:142  stale neighbours -> position collision\n```'
    from public.issues i
   where i.project_id = v_project
     and i.title = 'Card jumps to the wrong column on a fast drop';

  -- ---------------------------------------------------------------------
  -- Project 2 — Design System (small, shows multi-project navigation)
  -- ---------------------------------------------------------------------
  insert into public.projects (workspace_id, name, key, description, lead_id, icon, color)
  values (
    v_workspace, 'Design System', 'DES',
    'Tokens, primitives and documentation shared by every surface.',
    p_user, 'Palette', '#DB2777'
  )
  returning id into v_design;

  insert into public.project_statuses (project_id, name, category, color, position)
  values (v_design, 'To Do', 'todo', '#64748B', 0) returning id into v_d_todo;
  insert into public.project_statuses (project_id, name, category, color, position)
  values (v_design, 'In Progress', 'in_progress', '#2563EB', 1);
  insert into public.project_statuses (project_id, name, category, color, position)
  values (v_design, 'Done', 'done', '#059669', 2) returning id into v_d_done;

  insert into public.issues
    (project_id, type, title, description, status_id, priority, reporter_id,
     assignee_id, story_points, board_position, backlog_position)
  values
    (v_design, 'task', 'Colour tokens for light and dark',
     'One semantic scale, verified at AA contrast in both themes.',
     v_d_done, 'high', p_user, p_user, 5, 1024, 1024),
    (v_design, 'task', 'Typography scale',
     'Six sizes, two weights, consistent optical tracking.',
     v_d_todo, 'medium', p_user, null, 3, 2048, 2048),
    (v_design, 'story', 'Document every primitive with usage rules',
     null, v_d_todo, 'low', p_user, null, 8, 3072, 3072);

  -- A saved filter to demonstrate the query builder.
  insert into public.saved_filters (workspace_id, project_id, owner_id, name, query, is_shared)
  values (
    v_workspace, v_project, p_user, 'Open bugs by priority',
    jsonb_build_object(
      'types', jsonb_build_array('bug'),
      'statusCategories', jsonb_build_array('todo', 'in_progress'),
      'sort', 'priority'
    ),
    true
  );

  -- Seeding assigns a lot of issues to the new account, and the triggers
  -- dutifully raise a notification for each. Keep the three most recent unread
  -- so the bell is demonstrably alive without burying the user.
  update public.notifications n
     set is_read = true
   where n.user_id = p_user
     and n.id not in (
       select id
         from public.notifications
        where user_id = p_user
        order by created_at desc
        limit 3
     );

  return v_workspace;
end;
$$;

-- ---------------------------------------------------------------------------
-- Manual seeding helper — useful when you created the account before applying
-- these migrations:
--
--   select public.seed_demo_for_email('you@example.com');
-- ---------------------------------------------------------------------------
create or replace function public.seed_demo_for_email(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_name text;
begin
  select id, full_name into v_user, v_name
    from public.profiles
   where lower(email) = lower(p_email);

  if v_user is null then
    raise exception 'No profile for %. Sign up first, then re-run this.', p_email;
  end if;

  return public.bootstrap_demo_workspace(v_user, v_name);
end;
$$;

-- These two are for the signup trigger and the SQL editor, never for a client.
revoke all on function public.bootstrap_demo_workspace(uuid, text) from public;
revoke all on function public.seed_demo_for_email(text) from public;

-- Backfill profiles for accounts that existed before this schema was applied.
insert into public.profiles (id, email, full_name, avatar_url)
select
  u.id,
  u.email,
  coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    split_part(u.email, '@', 1)
  ),
  coalesce(
    u.raw_user_meta_data ->> 'avatar_url',
    u.raw_user_meta_data ->> 'picture'
  )
from auth.users u
where u.email is not null
on conflict (id) do nothing;


-- >>> 20250201000000_platform.sql ---------------------------------------

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


-- >>> 20250201000100_platform_functions.sql -----------------------------

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


-- >>> 20250201000200_platform_rpc.sql -----------------------------------

-- ===========================================================================
-- MIRA — 07. Platform RPCs
--
-- Every System Administrator write goes through one of these functions. They
-- are SECURITY DEFINER and each one re-checks `is_platform_admin()` itself, so
-- the guard cannot be skipped by calling the table directly — the RLS
-- migration grants no direct write on workspaces to platform admins.
--
-- Each mutating function also writes the audit row in the same transaction:
-- an action that happened but was not logged is not possible.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
create or replace function public.log_platform_action(
  p_action      text,
  p_target_type text default null,
  p_target_id   uuid default null,
  p_metadata    jsonb default '{}'::jsonb,
  p_ip          text default null,
  p_user_agent  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.platform_audit_log
    (actor_id, actor_email, action, target_type, target_id, metadata, ip, user_agent)
  values (
    auth.uid(),
    coalesce((select email from public.platform_admins where user_id = auth.uid()),
             (select email from public.profiles where id = auth.uid())),
    p_action, p_target_type, p_target_id, coalesce(p_metadata, '{}'::jsonb),
    p_ip, p_user_agent
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Raise unless the caller is an active System Administrator.
create or replace function public.assert_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Forbidden: this action requires a System Administrator account'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function public.admin_record_login()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.platform_admins
     set last_login_at = now()
   where user_id = auth.uid();

  if found then
    perform public.log_platform_action('admin.login', 'platform_admin', null, '{}'::jsonb);
  end if;
end;
$$;

create or replace function public.admin_mark_password_changed()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_platform_admin();
  update public.platform_admins
     set must_change_password = false
   where user_id = auth.uid();
  perform public.log_platform_action('admin.password_changed', 'platform_admin', null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Workspace lifecycle
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_workspace(
  p_name          text,
  p_slug          text default null,
  p_company_name  text default null,
  p_plan          text default 'trial',
  p_seat_limit    integer default 10,
  p_project_limit integer default 5,
  p_starts_at     timestamptz default now(),
  p_expires_at    timestamptz default null
)
returns public.workspaces
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace public.workspaces;
  v_slug      text;
  v_suffix    integer := 0;
  v_admin     uuid;
begin
  perform public.assert_platform_admin();

  select id into v_admin from public.platform_admins where user_id = auth.uid();

  v_slug := coalesce(nullif(trim(p_slug), ''), public.slugify(p_name));
  while exists (select 1 from public.workspaces w where w.slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := public.slugify(p_name) || '-' || v_suffix;
  end loop;

  insert into public.workspaces (
    name, slug, company_name, plan, seat_limit, project_limit,
    starts_at, expires_at, status, created_by_admin_id, owner_id
  )
  values (
    p_name, v_slug, coalesce(p_company_name, p_name), p_plan,
    p_seat_limit, p_project_limit, coalesce(p_starts_at, now()), p_expires_at,
    'active', v_admin, null
  )
  returning * into v_workspace;

  perform public.log_platform_action(
    'workspace.created', 'workspace', v_workspace.id,
    jsonb_build_object('name', p_name, 'slug', v_slug, 'plan', p_plan,
                       'seat_limit', p_seat_limit, 'project_limit', p_project_limit)
  );

  return v_workspace;
end;
$$;

create or replace function public.admin_update_workspace(
  p_workspace     uuid,
  p_name          text default null,
  p_company_name  text default null,
  p_plan          text default null,
  p_seat_limit    integer default null,
  p_project_limit integer default null,
  p_starts_at     timestamptz default null,
  p_expires_at    timestamptz default null,
  p_clear_expiry  boolean default false
)
returns public.workspaces
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.workspaces;
  v_after  public.workspaces;
begin
  perform public.assert_platform_admin();

  select * into v_before from public.workspaces where id = p_workspace;
  if v_before.id is null then
    raise exception 'Workspace not found';
  end if;

  update public.workspaces
     set name          = coalesce(p_name, name),
         company_name  = coalesce(p_company_name, company_name),
         plan          = coalesce(p_plan, plan),
         seat_limit    = coalesce(p_seat_limit, seat_limit),
         project_limit = coalesce(p_project_limit, project_limit),
         starts_at     = coalesce(p_starts_at, starts_at),
         expires_at    = case when p_clear_expiry then null
                              else coalesce(p_expires_at, expires_at) end,
         updated_at    = now()
   where id = p_workspace
  returning * into v_after;

  perform public.log_platform_action(
    'workspace.updated', 'workspace', p_workspace,
    jsonb_build_object(
      'before', jsonb_build_object('plan', v_before.plan, 'seat_limit', v_before.seat_limit,
                                   'project_limit', v_before.project_limit,
                                   'expires_at', v_before.expires_at),
      'after',  jsonb_build_object('plan', v_after.plan, 'seat_limit', v_after.seat_limit,
                                   'project_limit', v_after.project_limit,
                                   'expires_at', v_after.expires_at)
    )
  );

  return v_after;
end;
$$;

-- active | suspended | archived. Soft delete has its own function.
create or replace function public.admin_set_workspace_status(
  p_workspace uuid,
  p_status    public.workspace_status,
  p_reason    text default null
)
returns public.workspaces
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace public.workspaces;
  v_previous  public.workspace_status;
begin
  perform public.assert_platform_admin();

  if p_status = 'deleted' then
    raise exception 'Use admin_soft_delete_workspace() to delete a workspace';
  end if;

  select status into v_previous from public.workspaces where id = p_workspace;
  if v_previous is null then
    raise exception 'Workspace not found';
  end if;

  update public.workspaces
     set status = p_status, deleted_at = null, updated_at = now()
   where id = p_workspace
  returning * into v_workspace;

  perform public.log_platform_action(
    'workspace.status_changed', 'workspace', p_workspace,
    jsonb_build_object('from', v_previous, 'to', p_status, 'reason', p_reason)
  );

  return v_workspace;
end;
$$;

-- Soft delete. Data is retained for the retention window; the workspace
-- becomes invisible to its own members immediately.
create or replace function public.admin_soft_delete_workspace(
  p_workspace    uuid,
  p_confirm_name text
)
returns public.workspaces
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace public.workspaces;
begin
  perform public.assert_platform_admin();

  select * into v_workspace from public.workspaces where id = p_workspace;
  if v_workspace.id is null then
    raise exception 'Workspace not found';
  end if;
  if trim(p_confirm_name) is distinct from v_workspace.name then
    raise exception 'Confirmation text does not match the workspace name';
  end if;

  update public.workspaces
     set status = 'deleted', deleted_at = now(), updated_at = now()
   where id = p_workspace
  returning * into v_workspace;

  perform public.log_platform_action(
    'workspace.soft_deleted', 'workspace', p_workspace,
    jsonb_build_object('name', v_workspace.name, 'retention_days', 30)
  );

  return v_workspace;
end;
$$;

create or replace function public.admin_restore_workspace(p_workspace uuid)
returns public.workspaces
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace public.workspaces;
begin
  perform public.assert_platform_admin();

  update public.workspaces
     set status = 'active', deleted_at = null, updated_at = now()
   where id = p_workspace
  returning * into v_workspace;

  if v_workspace.id is null then
    raise exception 'Workspace not found';
  end if;

  perform public.log_platform_action('workspace.restored', 'workspace', p_workspace);
  return v_workspace;
end;
$$;

-- Irreversible. Only permitted on a workspace that is already soft-deleted.
create or replace function public.admin_hard_delete_workspace(
  p_workspace    uuid,
  p_confirm_name text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace public.workspaces;
begin
  perform public.assert_platform_admin();

  select * into v_workspace from public.workspaces where id = p_workspace;
  if v_workspace.id is null then
    raise exception 'Workspace not found';
  end if;
  if v_workspace.deleted_at is null then
    raise exception 'Soft-delete this workspace first — hard delete cannot be undone';
  end if;
  if trim(p_confirm_name) is distinct from v_workspace.name then
    raise exception 'Confirmation text does not match the workspace name';
  end if;

  -- Logged before the cascade, so the audit row survives the delete.
  perform public.log_platform_action(
    'workspace.hard_deleted', 'workspace', p_workspace,
    jsonb_build_object('name', v_workspace.name, 'slug', v_workspace.slug)
  );

  delete from public.workspaces where id = p_workspace;
end;
$$;

-- ---------------------------------------------------------------------------
-- Owners
--
-- The auth user is created by the API route with the service-role key (only
-- it can mint credentials); this function attaches that user to a workspace.
-- ---------------------------------------------------------------------------
create or replace function public.admin_assign_owner(
  p_workspace  uuid,
  p_user       uuid,
  p_is_primary boolean default true
)
returns public.workspace_owners
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner    public.workspace_owners;
  v_admin    uuid;
  v_position uuid;
begin
  perform public.assert_platform_admin();

  select id into v_admin from public.platform_admins where user_id = auth.uid();

  if public.is_platform_admin(p_user) then
    raise exception 'A System Administrator cannot also be a workspace Owner';
  end if;

  if p_is_primary then
    update public.workspace_owners set is_primary = false where workspace_id = p_workspace;
  end if;

  insert into public.workspace_owners (workspace_id, user_id, is_primary, assigned_by_admin_id)
  values (p_workspace, p_user, p_is_primary, v_admin)
  on conflict (workspace_id, user_id)
    do update set is_primary = excluded.is_primary,
                  assigned_by_admin_id = excluded.assigned_by_admin_id,
                  assigned_at = now()
  returning * into v_owner;

  if p_is_primary then
    update public.workspaces set owner_id = p_user, updated_at = now()
     where id = p_workspace;
  end if;

  -- An Owner is also a member, so they appear in the directory and in
  -- assignee pickers. Their capabilities come from ownership, not the seat.
  select id into v_position
    from public.positions where workspace_id = p_workspace and slug = 'admin';

  insert into public.workspace_members (workspace_id, user_id, role, position_id, status)
  values (p_workspace, p_user, 'admin', v_position, 'active')
  on conflict (workspace_id, user_id)
    -- Unqualified table name: that is how ON CONFLICT DO UPDATE refers to the
    -- row that already exists. Keep whatever position they already held.
    do update set status = 'active',
                  position_id = coalesce(workspace_members.position_id, v_position);

  perform public.log_platform_action(
    'owner.assigned', 'workspace', p_workspace,
    jsonb_build_object('user_id', p_user, 'is_primary', p_is_primary)
  );

  return v_owner;
end;
$$;

create or replace function public.admin_remove_owner(p_workspace uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_remaining integer;
begin
  perform public.assert_platform_admin();

  select count(*) into v_remaining
    from public.workspace_owners where workspace_id = p_workspace and user_id <> p_user;

  if v_remaining = 0 then
    raise exception 'A workspace must keep at least one Owner. Transfer ownership first.';
  end if;

  delete from public.workspace_owners
   where workspace_id = p_workspace and user_id = p_user;

  update public.workspaces w
     set owner_id = (select user_id from public.workspace_owners
                      where workspace_id = p_workspace
                      order by is_primary desc, assigned_at limit 1)
   where w.id = p_workspace and w.owner_id = p_user;

  perform public.log_platform_action(
    'owner.removed', 'workspace', p_workspace, jsonb_build_object('user_id', p_user)
  );
end;
$$;

create or replace function public.admin_transfer_workspace(
  p_workspace uuid,
  p_new_owner uuid
)
returns public.workspaces
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old       uuid;
  v_workspace public.workspaces;
begin
  perform public.assert_platform_admin();

  select user_id into v_old
    from public.workspace_owners where workspace_id = p_workspace and is_primary;

  perform public.admin_assign_owner(p_workspace, p_new_owner, true);

  if v_old is not null and v_old <> p_new_owner then
    delete from public.workspace_owners
     where workspace_id = p_workspace and user_id = v_old;
  end if;

  select * into v_workspace from public.workspaces where id = p_workspace;

  perform public.log_platform_action(
    'workspace.transferred', 'workspace', p_workspace,
    jsonb_build_object('from_user', v_old, 'to_user', p_new_owner)
  );

  return v_workspace;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cross-tenant user administration
-- ---------------------------------------------------------------------------
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

  update public.profiles set is_active = p_active, updated_at = now() where id = p_user;

  -- Suspending globally also parks every workspace seat, so RLS stops
  -- resolving capabilities for them immediately.
  update public.workspace_members
     set status = case when p_active then 'active' else 'suspended' end
   where user_id = p_user
     and status <> 'invited';

  perform public.log_platform_action(
    case when p_active then 'user.reactivated' else 'user.suspended' end,
    'user', p_user, jsonb_build_object('reason', p_reason)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Impersonation — "View as Owner". Read-only by construction: the admin holds
-- no capabilities in the tenant, so every RLS write check fails.
-- ---------------------------------------------------------------------------
create or replace function public.admin_start_impersonation(
  p_workspace uuid,
  p_reason    text default null,
  p_minutes   integer default 30
)
returns public.admin_impersonations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin   uuid;
  v_session public.admin_impersonations;
begin
  perform public.assert_platform_admin();

  if p_minutes is null or p_minutes < 1 or p_minutes > 240 then
    raise exception 'Impersonation windows run from 1 to 240 minutes';
  end if;

  select id into v_admin from public.platform_admins where user_id = auth.uid();

  -- One open session at a time keeps the audit trail unambiguous.
  update public.admin_impersonations
     set ended_at = now()
   where admin_id = v_admin and ended_at is null;

  insert into public.admin_impersonations (admin_id, workspace_id, reason, expires_at)
  values (v_admin, p_workspace, p_reason, now() + make_interval(mins => p_minutes))
  returning * into v_session;

  perform public.log_platform_action(
    'impersonation.started', 'workspace', p_workspace,
    jsonb_build_object('session_id', v_session.id, 'reason', p_reason,
                       'expires_at', v_session.expires_at, 'minutes', p_minutes)
  );

  return v_session;
end;
$$;

create or replace function public.admin_end_impersonation(p_session uuid default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid;
  v_row   public.admin_impersonations;
begin
  perform public.assert_platform_admin();
  select id into v_admin from public.platform_admins where user_id = auth.uid();

  update public.admin_impersonations
     set ended_at = now()
   where admin_id = v_admin
     and ended_at is null
     and (p_session is null or id = p_session)
  returning * into v_row;

  if v_row.id is not null then
    perform public.log_platform_action(
      'impersonation.ended', 'workspace', v_row.workspace_id,
      jsonb_build_object(
        'session_id', v_row.id,
        'duration_seconds', extract(epoch from (now() - v_row.started_at))::integer
      )
    );
  end if;
end;
$$;

-- Is there a live impersonation session for this admin into this workspace?
create or replace function public.active_impersonation(p_workspace uuid default null)
returns public.admin_impersonations
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.*
    from public.admin_impersonations i
    join public.platform_admins pa on pa.id = i.admin_id
   where pa.user_id = auth.uid()
     and i.ended_at is null
     and i.expires_at > now()
     and (p_workspace is null or i.workspace_id = p_workspace)
   order by i.started_at desc
   limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Admin read models
--
-- Returned as JSON so the dashboard is one round trip instead of eight.
-- ---------------------------------------------------------------------------
create or replace function public.admin_platform_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  perform public.assert_platform_admin();

  select jsonb_build_object(
    'workspaces', jsonb_build_object(
      'total',     (select count(*) from public.workspaces where deleted_at is null),
      'active',    (select count(*) from public.workspaces where status = 'active'  and deleted_at is null),
      'suspended', (select count(*) from public.workspaces where status = 'suspended' and deleted_at is null),
      'archived',  (select count(*) from public.workspaces where status = 'archived' and deleted_at is null),
      'deleted',   (select count(*) from public.workspaces where deleted_at is not null)
    ),
    'owners',   (select count(distinct user_id) from public.workspace_owners),
    'users',    (select count(*) from public.profiles),
    'admins',   (select count(*) from public.platform_admins where is_active),
    'projects', (select count(*) from public.projects where not is_archived),
    'issues',   (select count(*) from public.issues),
    'sprints',  (select count(*) from public.sprints where status = 'active'),
    'storage_bytes', (select coalesce(sum(file_size), 0) from public.attachments),
    'expiring_soon', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select id, name, slug, expires_at
          from public.workspaces
         where deleted_at is null
           and expires_at is not null
           and expires_at between now() and now() + interval '30 days'
         order by expires_at
         limit 10
      ) x
    ),
    'near_limits', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select w.id, w.name, w.slug, w.seat_limit, w.project_limit,
               (select count(*) from public.workspace_members m
                 where m.workspace_id = w.id and m.status = 'active') as seats_used,
               (select count(*) from public.projects p
                 where p.workspace_id = w.id and not p.is_archived) as projects_used
          from public.workspaces w
         where w.deleted_at is null and w.status = 'active'
      ) x
      where x.seats_used::numeric >= x.seat_limit * 0.8
         or x.projects_used::numeric >= x.project_limit * 0.8
    ),
    'signups', (
      select coalesce(jsonb_agg(jsonb_build_object('date', d::date, 'count', c) order by d), '[]'::jsonb)
        from (
          select date_trunc('day', g)::date as d,
                 (select count(*) from public.profiles p
                   where p.created_at >= g and p.created_at < g + interval '1 day') as c
            from generate_series(
              date_trunc('day', now()) - interval '29 days',
              date_trunc('day', now()),
              interval '1 day'
            ) g
        ) s
    ),
    'recent_activity', (
      select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
        select id, actor_email, action, target_type, target_id, metadata, created_at
          from public.platform_audit_log
         order by created_at desc
         limit 12
      ) x
    )
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.admin_workspace_detail(p_workspace uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  perform public.assert_platform_admin();

  select jsonb_build_object(
    'workspace', to_jsonb(w),
    'owners', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', o.user_id, 'is_primary', o.is_primary, 'assigned_at', o.assigned_at,
        'full_name', p.full_name, 'email', p.email, 'phone', p.phone,
        'is_active', p.is_active, 'avatar_url', p.avatar_url
      ) order by o.is_primary desc, o.assigned_at), '[]'::jsonb)
        from public.workspace_owners o
        join public.profiles p on p.id = o.user_id
       where o.workspace_id = w.id
    ),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'status', m.status, 'joined_at', m.joined_at,
        'position', pos.name, 'position_slug', pos.slug,
        'full_name', p.full_name, 'email', p.email, 'is_active', p.is_active,
        'avatar_url', p.avatar_url
      ) order by p.full_name), '[]'::jsonb)
        from public.workspace_members m
        join public.profiles p on p.id = m.user_id
        left join public.positions pos on pos.id = m.position_id
       where m.workspace_id = w.id
    ),
    'projects', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', pr.id, 'name', pr.name, 'key', pr.key, 'is_archived', pr.is_archived,
        'created_at', pr.created_at,
        'issue_count', (select count(*) from public.issues i where i.project_id = pr.id),
        'member_count', (select count(*) from public.project_members pm where pm.project_id = pr.id)
      ) order by pr.name), '[]'::jsonb)
        from public.projects pr where pr.workspace_id = w.id
    ),
    'usage', jsonb_build_object(
      'seats_used',    (select count(*) from public.workspace_members m
                         where m.workspace_id = w.id and m.status = 'active'),
      'seat_limit',    w.seat_limit,
      'projects_used', (select count(*) from public.projects p
                         where p.workspace_id = w.id and not p.is_archived),
      'project_limit', w.project_limit,
      'issue_count',   (select count(*) from public.issues i
                          join public.projects p on p.id = i.project_id
                         where p.workspace_id = w.id),
      'storage_bytes', (select coalesce(sum(a.file_size), 0) from public.attachments a
                          join public.issues i on i.id = a.issue_id
                          join public.projects p on p.id = i.project_id
                         where p.workspace_id = w.id)
    ),
    'activity', (
      select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
        select id, actor_email, action, target_type, target_id, metadata, created_at
          from public.platform_audit_log
         where target_id = w.id
            or metadata ->> 'workspace_id' = w.id::text
         order by created_at desc
         limit 30
      ) x
    )
  ) into v_result
  from public.workspaces w
  where w.id = p_workspace;

  if v_result is null then
    raise exception 'Workspace not found';
  end if;

  return v_result;
end;
$$;

-- The workspace table for /miraadmin/workspaces: one row per tenant with its
-- primary owner and live usage, in a single round trip.
create or replace function public.admin_list_workspaces(
  p_search  text default null,
  p_status  text default null,
  p_include_deleted boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_term   text := nullif(trim(coalesce(p_search, '')), '');
begin
  perform public.assert_platform_admin();

  select coalesce(jsonb_agg(entry order by entry ->> 'name'), '[]'::jsonb)
    into v_result
  from (
    select jsonb_build_object(
      'id', w.id,
      'name', w.name,
      'slug', w.slug,
      'company_name', w.company_name,
      'plan', w.plan,
      'status', w.status,
      'seat_limit', w.seat_limit,
      'project_limit', w.project_limit,
      'starts_at', w.starts_at,
      'expires_at', w.expires_at,
      'created_at', w.created_at,
      'deleted_at', w.deleted_at,
      'seats_used', (select count(*) from public.workspace_members m
                      where m.workspace_id = w.id and m.status = 'active'),
      'projects_used', (select count(*) from public.projects p
                         where p.workspace_id = w.id and not p.is_archived),
      'issue_count', (select count(*) from public.issues i
                        join public.projects p on p.id = i.project_id
                       where p.workspace_id = w.id),
      'owners', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'user_id', o.user_id, 'is_primary', o.is_primary,
          'full_name', pr.full_name, 'email', pr.email, 'avatar_url', pr.avatar_url
        ) order by o.is_primary desc), '[]'::jsonb)
          from public.workspace_owners o
          join public.profiles pr on pr.id = o.user_id
         where o.workspace_id = w.id
      )
    ) as entry
    from public.workspaces w
    where (p_include_deleted or w.deleted_at is null)
      and (p_status is null or w.status::text = p_status)
      and (
        v_term is null
        or w.name ilike '%' || v_term || '%'
        or w.slug ilike '%' || v_term || '%'
        or coalesce(w.company_name, '') ilike '%' || v_term || '%'
      )
  ) s;

  return v_result;
end;
$$;

-- Owners across the platform, for /miraadmin/owners.
create or replace function public.admin_list_owners(p_search text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_term   text := nullif(trim(coalesce(p_search, '')), '');
begin
  perform public.assert_platform_admin();

  select coalesce(jsonb_agg(entry order by entry ->> 'full_name'), '[]'::jsonb)
    into v_result
  from (
    select jsonb_build_object(
      'user_id', p.id,
      'full_name', p.full_name,
      'email', p.email,
      'phone', p.phone,
      'avatar_url', p.avatar_url,
      'is_active', p.is_active,
      'created_at', p.created_at,
      'workspaces', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'workspace_id', w.id, 'name', w.name, 'slug', w.slug,
          'status', w.status, 'plan', w.plan, 'is_primary', o.is_primary
        ) order by w.name), '[]'::jsonb)
          from public.workspace_owners o
          join public.workspaces w on w.id = o.workspace_id
         where o.user_id = p.id and w.deleted_at is null
      )
    ) as entry
    from public.profiles p
    where exists (select 1 from public.workspace_owners o where o.user_id = p.id)
      and (
        v_term is null
        or p.email ilike '%' || v_term || '%'
        or coalesce(p.full_name, '') ilike '%' || v_term || '%'
      )
  ) s;

  return v_result;
end;
$$;

-- Every user on the platform, with their tenant and position. Search-friendly.
create or replace function public.admin_list_users(
  p_search text default null,
  p_limit  integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_term   text := nullif(trim(coalesce(p_search, '')), '');
begin
  perform public.assert_platform_admin();

  select jsonb_build_object(
    'total', (
      select count(*) from public.profiles p
       where v_term is null
          or p.email ilike '%' || v_term || '%'
          or coalesce(p.full_name, '') ilike '%' || v_term || '%'
    ),
    'rows', coalesce(jsonb_agg(entry order by entry ->> 'full_name'), '[]'::jsonb)
  ) into v_result
  from (
    select jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'email', p.email,
      'phone', p.phone,
      'avatar_url', p.avatar_url,
      'is_active', p.is_active,
      'created_at', p.created_at,
      'is_platform_admin', public.is_platform_admin(p.id),
      'workspaces', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'workspace_id', w.id, 'workspace_name', w.name, 'slug', w.slug,
          'status', m.status,
          'position', pos.name,
          'is_owner', exists (select 1 from public.workspace_owners o
                               where o.workspace_id = w.id and o.user_id = p.id)
        ) order by w.name), '[]'::jsonb)
          from public.workspace_members m
          join public.workspaces w on w.id = m.workspace_id
          left join public.positions pos on pos.id = m.position_id
         where m.user_id = p.id
      )
    ) as entry
    from public.profiles p
    where v_term is null
       or p.email ilike '%' || v_term || '%'
       or coalesce(p.full_name, '') ilike '%' || v_term || '%'
    order by p.full_name
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0))
  ) s;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public signup no longer bootstraps a tenant.
--
-- The old `handle_new_user` trigger created a demo workspace for every new
-- account. Under the three-tier model an Owner is created by a System
-- Administrator and a User arrives through an invitation, so self-service
-- workspace creation is removed outright.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  v_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, email, full_name, avatar_url, phone)
  values (
    new.id,
    new.email,
    v_name,
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do update
    set email      = excluded.email,
        full_name  = coalesce(public.profiles.full_name, excluded.full_name),
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);

  -- Honour any pending invitation addressed to this email. This is the only
  -- way a brand-new account gains access to a workspace.
  begin
    perform public.claim_pending_invites(new.id, new.email);
  exception when others then
    raise warning 'MIRA: invite claim failed for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

-- Invitations now carry a position; claim them with it.
create or replace function public.claim_pending_invites(p_user uuid, p_email text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  with claimed as (
    update public.workspace_invites i
       set status = 'accepted', accepted_at = now()
      from public.workspaces w
     where w.id = i.workspace_id
       and lower(i.email) = lower(p_email)
       and i.status = 'pending'
       and i.expires_at > now()
       and w.status = 'active'
       and w.deleted_at is null
    returning i.workspace_id, i.role, i.position_id
  ),
  joined as (
    insert into public.workspace_members (workspace_id, user_id, role, position_id, status)
    select workspace_id, p_user, role, position_id, 'active' from claimed
    on conflict (workspace_id, user_id) do nothing
    returning 1
  )
  select count(*)::integer into v_count from joined;

  return v_count;
end;
$$;

create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invite public.workspace_invites;
  v_email  text;
  v_status public.workspace_status;
begin
  select email into v_email from public.profiles where id = auth.uid();
  if v_email is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_invite
    from public.workspace_invites
   where token = p_token and status = 'pending' and expires_at > now();

  if v_invite.id is null then
    raise exception 'This invitation is invalid or has expired';
  end if;

  if lower(v_invite.email) <> lower(v_email) then
    raise exception 'This invitation was issued to a different email address';
  end if;

  select status into v_status from public.workspaces
   where id = v_invite.workspace_id and deleted_at is null;

  if v_status is distinct from 'active' then
    raise exception 'This workspace is not currently accepting members';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role, position_id, status)
  values (v_invite.workspace_id, auth.uid(), v_invite.role, v_invite.position_id, 'active')
  on conflict (workspace_id, user_id)
    do update set status = 'active';

  update public.workspace_invites
     set status = 'accepted', accepted_at = now()
   where id = v_invite.id;

  return v_invite.workspace_id;
end;
$$;

-- Tenants can no longer mint their own workspaces.
create or replace function public.create_workspace(p_name text, p_slug text default null)
returns public.workspaces
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception
    'Workspaces are provisioned by a MIRA System Administrator. Contact your MIRA representative to add one.'
    using errcode = 'insufficient_privilege';
end;
$$;

-- Self-service demo seeding went with it.
drop function if exists public.seed_demo_for_email(text);
drop function if exists public.bootstrap_demo_workspace(uuid, text);

-- ---------------------------------------------------------------------------
-- Project creation, updated for project membership and the workflow table.
-- ---------------------------------------------------------------------------
create or replace function public.create_project(
  p_workspace   uuid,
  p_name        text,
  p_key         text,
  p_description text default null,
  p_lead        uuid default null,
  p_icon        text default 'Rocket',
  p_color       text default '#5B5BD6',
  p_start_date  date default null,
  p_target_date date default null,
  p_managers    uuid[] default null
)
returns public.projects
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project public.projects;
  v_manager uuid;
begin
  if not public.can_do(p_workspace, 'project.create') then
    raise exception 'You do not have permission to create projects in this workspace'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.projects (
    workspace_id, name, key, description, lead_id, icon, color,
    created_by, start_date, target_date
  )
  values (
    p_workspace, p_name, upper(p_key), p_description,
    coalesce(p_lead, auth.uid()), p_icon, p_color,
    auth.uid(), p_start_date, p_target_date
  )
  returning * into v_project;

  insert into public.project_statuses (project_id, name, category, color, position)
  values
    (v_project.id, 'To Do',       'todo',        '#64748B', 0),
    (v_project.id, 'In Progress', 'in_progress', '#2563EB', 1),
    (v_project.id, 'In Review',   'in_progress', '#A855F7', 2),
    (v_project.id, 'Done',        'done',        '#059669', 3);

  insert into public.labels (project_id, name, color)
  values
    (v_project.id, 'frontend',  '#2563EB'),
    (v_project.id, 'backend',   '#7C3AED'),
    (v_project.id, 'design',    '#DB2777'),
    (v_project.id, 'tech-debt', '#D97706');

  if p_managers is not null then
    foreach v_manager in array p_managers loop
      insert into public.project_members (project_id, user_id, project_role, added_by)
      values (v_project.id, v_manager, 'manager', auth.uid())
      on conflict (project_id, user_id) do update set project_role = 'manager';
    end loop;
  end if;

  return v_project;
end;
$$;


-- >>> 20250201000300_platform_rls.sql -----------------------------------

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

