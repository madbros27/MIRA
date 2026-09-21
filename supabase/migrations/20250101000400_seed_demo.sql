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
