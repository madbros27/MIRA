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

revoke all on function public.claim_pending_invites(uuid, text) from public;

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
