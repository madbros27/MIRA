-- ===========================================================================
-- MIRA — tenant isolation assertions
--
-- Run against a scratch database, never production:
--
--   supabase db reset                       # applies every migration
--   psql "$DATABASE_URL" -f supabase/tests/tenant-isolation.sql
--
-- The whole file runs inside a transaction that is rolled back at the end, so
-- it leaves nothing behind. Any failed assertion aborts with an exception.
--
-- What it proves:
--   1. A user in Workspace A reads zero rows from Workspace B.
--   2. A Member cannot reach a project they are not a member of.
--   3. A Manager is confined to their assigned projects.
--   4. An Owner cannot read another workspace.
--   5. A tenant user is not a platform admin and cannot read the audit log.
--   6. A System Administrator reads across tenants but cannot write tenant data.
--   7. A suspended workspace disappears for its own members.
--   8. Plan columns are not updatable by a tenant, whatever their capabilities.
-- ===========================================================================

begin;

set local client_min_messages to warning;

-- ---------------------------------------------------------------------------
-- Helpers: act as a given user the way PostgREST does.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $$;

create or replace function pg_temp.act_as_postgres() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create or replace function pg_temp.assert(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
  raise notice '  ok — %', p_message;
end $$;

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
do $$
declare
  v_admin_user uuid := extensions.gen_random_uuid();
  v_owner_a    uuid := extensions.gen_random_uuid();
  v_owner_b    uuid := extensions.gen_random_uuid();
  v_manager_a  uuid := extensions.gen_random_uuid();
  v_member_a   uuid := extensions.gen_random_uuid();
  v_ws_a       uuid;
  v_ws_b       uuid;
  v_proj_a1    uuid;
  v_proj_a2    uuid;
  v_proj_b1    uuid;
  v_status     uuid;
  v_admin_row  uuid;
begin
  -- auth.users rows (the profiles trigger mirrors them into public.profiles)
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data,
                          created_at, updated_at)
  values
    (v_admin_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'sysadmin@test.local',  '{"full_name":"Sys Admin"}',  now(), now()),
    (v_owner_a,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'owner-a@test.local',   '{"full_name":"Owner A"}',    now(), now()),
    (v_owner_b,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'owner-b@test.local',   '{"full_name":"Owner B"}',    now(), now()),
    (v_manager_a,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'manager-a@test.local', '{"full_name":"Manager A"}',  now(), now()),
    (v_member_a,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'member-a@test.local',  '{"full_name":"Member A"}',   now(), now());

  insert into public.platform_admins (user_id, name, email, must_change_password)
  values (v_admin_user, 'Sys Admin', 'sysadmin@test.local', false)
  returning id into v_admin_row;

  -- Two tenants, provisioned the way the product does it.
  insert into public.workspaces (name, slug, company_name, seat_limit, project_limit,
                                 created_by_admin_id)
  values ('Acme', 'acme-test', 'Acme Inc', 50, 50, v_admin_row) returning id into v_ws_a;

  insert into public.workspaces (name, slug, company_name, seat_limit, project_limit,
                                 created_by_admin_id)
  values ('Globex', 'globex-test', 'Globex Ltd', 50, 50, v_admin_row) returning id into v_ws_b;

  insert into public.workspace_owners (workspace_id, user_id, is_primary)
  values (v_ws_a, v_owner_a, true), (v_ws_b, v_owner_b, true);

  -- A Manager and a Member inside Acme.
  insert into public.workspace_members (workspace_id, user_id, position_id, status)
  values (
    v_ws_a, v_manager_a,
    (select id from public.positions where workspace_id = v_ws_a and slug = 'manager'),
    'active'
  ), (
    v_ws_a, v_member_a,
    (select id from public.positions where workspace_id = v_ws_a and slug = 'member'),
    'active'
  );

  -- Projects. Note the manager is added to A1 only.
  insert into public.projects (workspace_id, name, key, lead_id)
  values (v_ws_a, 'Engineering', 'ENG', v_owner_a) returning id into v_proj_a1;
  insert into public.projects (workspace_id, name, key, lead_id)
  values (v_ws_a, 'Marketing', 'MKT', v_owner_a) returning id into v_proj_a2;
  insert into public.projects (workspace_id, name, key, lead_id)
  values (v_ws_b, 'Globex Core', 'GBX', v_owner_b) returning id into v_proj_b1;

  insert into public.project_members (project_id, user_id, project_role) values
    (v_proj_a1, v_manager_a, 'manager'),
    (v_proj_a1, v_member_a,  'member')
  on conflict do nothing;

  insert into public.project_statuses (project_id, name, category, position)
  values (v_proj_a1, 'To Do', 'todo', 0) returning id into v_status;
  insert into public.issues (project_id, title, status_id, reporter_id)
  values (v_proj_a1, 'Acme issue', v_status, v_owner_a);

  insert into public.project_statuses (project_id, name, category, position)
  values (v_proj_a2, 'To Do', 'todo', 0) returning id into v_status;
  insert into public.issues (project_id, title, status_id, reporter_id)
  values (v_proj_a2, 'Acme marketing issue', v_status, v_owner_a);

  insert into public.project_statuses (project_id, name, category, position)
  values (v_proj_b1, 'To Do', 'todo', 0) returning id into v_status;
  insert into public.issues (project_id, title, status_id, reporter_id)
  values (v_proj_b1, 'Globex issue', v_status, v_owner_b);

  -- Stash ids for the assertions below.
  create temp table fixture (k text primary key, v uuid) on commit drop;
  insert into fixture values
    ('admin', v_admin_user), ('owner_a', v_owner_a), ('owner_b', v_owner_b),
    ('manager_a', v_manager_a), ('member_a', v_member_a),
    ('ws_a', v_ws_a), ('ws_b', v_ws_b),
    ('proj_a1', v_proj_a1), ('proj_a2', v_proj_a2), ('proj_b1', v_proj_b1);
end $$;

-- ---------------------------------------------------------------------------
-- 1 & 4. Cross-tenant isolation
-- ---------------------------------------------------------------------------
\echo '1/4 — cross-tenant isolation'
do $$
declare
  v_owner_a uuid := (select v from fixture where k = 'owner_a');
  v_ws_b    uuid := (select v from fixture where k = 'ws_b');
begin
  perform pg_temp.act_as(v_owner_a);

  perform pg_temp.assert(
    (select count(*) from public.workspaces where id = v_ws_b) = 0,
    'Owner A cannot see Workspace B');

  perform pg_temp.assert(
    (select count(*) from public.projects where workspace_id = v_ws_b) = 0,
    'Owner A cannot see any project in Workspace B');

  perform pg_temp.assert(
    (select count(*) from public.issues i
       join public.projects p on p.id = i.project_id
      where p.workspace_id = v_ws_b) = 0,
    'Owner A cannot see any issue in Workspace B');

  perform pg_temp.assert(
    (select count(*) from public.workspace_members where workspace_id = v_ws_b) = 0,
    'Owner A cannot see the membership of Workspace B');

  perform pg_temp.assert(
    (select count(*) from public.positions where workspace_id = v_ws_b) = 0,
    'Owner A cannot see the positions of Workspace B');

  perform pg_temp.act_as_postgres();
end $$;

-- ---------------------------------------------------------------------------
-- 2 & 3. Project scoping inside one workspace
-- ---------------------------------------------------------------------------
\echo '2/3 — project scoping'
do $$
declare
  v_manager uuid := (select v from fixture where k = 'manager_a');
  v_member  uuid := (select v from fixture where k = 'member_a');
  v_a1      uuid := (select v from fixture where k = 'proj_a1');
  v_a2      uuid := (select v from fixture where k = 'proj_a2');
begin
  perform pg_temp.act_as(v_manager);

  perform pg_temp.assert(
    (select count(*) from public.projects where id = v_a1) = 1,
    'Manager sees the project they are assigned to');

  perform pg_temp.assert(
    (select count(*) from public.projects where id = v_a2) = 0,
    'Manager cannot see an unassigned project in their own workspace');

  perform pg_temp.assert(
    (select count(*) from public.issues where project_id = v_a2) = 0,
    'Manager cannot see issues of an unassigned project');

  perform pg_temp.assert(
    public.can_admin_project(v_a1) and not public.can_admin_project(v_a2),
    'Manager can administer only the assigned project');

  perform pg_temp.act_as(v_member);

  perform pg_temp.assert(
    (select count(*) from public.projects where id = v_a2) = 0,
    'Member cannot reach another project in the same workspace');

  perform pg_temp.assert(
    not public.can_admin_project(v_a1),
    'Member cannot administer the project they belong to');

  perform pg_temp.assert(
    public.can_write_project(v_a1),
    'Member can write in their own project');

  perform pg_temp.act_as_postgres();
end $$;

-- ---------------------------------------------------------------------------
-- 5. Tenants cannot see the platform tier
-- ---------------------------------------------------------------------------
\echo '5 — platform tier is invisible to tenants'
do $$
declare
  v_owner_a uuid := (select v from fixture where k = 'owner_a');
begin
  perform pg_temp.act_as(v_owner_a);

  perform pg_temp.assert(not public.is_platform_admin(),
    'An Owner is not a System Administrator');

  perform pg_temp.assert(
    (select count(*) from public.platform_audit_log) = 0,
    'An Owner reads nothing from the platform audit log');

  perform pg_temp.assert(
    (select count(*) from public.platform_admins) = 0,
    'An Owner cannot enumerate System Administrators');

  begin
    perform public.admin_create_workspace('Sneaky', 'sneaky');
    raise exception 'ASSERTION FAILED: an Owner was able to create a workspace';
  exception
    when insufficient_privilege then
      raise notice '  ok — admin_create_workspace() rejects a non-admin caller';
  end;

  begin
    perform public.create_workspace('Sneaky 2');
    raise exception 'ASSERTION FAILED: self-service workspace creation still works';
  exception
    when insufficient_privilege then
      raise notice '  ok — create_workspace() is closed to tenants';
  end;

  perform pg_temp.act_as_postgres();
end $$;

-- ---------------------------------------------------------------------------
-- 6. System Administrator: reads across tenants, writes nothing in them
-- ---------------------------------------------------------------------------
\echo '6 — system administrator scope'
do $$
declare
  v_admin uuid := (select v from fixture where k = 'admin');
  v_a1    uuid := (select v from fixture where k = 'proj_a1');
  v_b1    uuid := (select v from fixture where k = 'proj_b1');
  v_status uuid;
  v_rows  integer;
begin
  perform pg_temp.act_as(v_admin);

  perform pg_temp.assert(public.is_platform_admin(),
    'The seeded account is a System Administrator');

  perform pg_temp.assert(
    (select count(*) from public.workspaces) >= 2,
    'A System Administrator reads every workspace');

  perform pg_temp.assert(
    public.can_read_project(v_a1) and public.can_read_project(v_b1),
    'A System Administrator reads projects in both tenants');

  -- ...but holds no capability anywhere, so tenant writes are refused.
  perform pg_temp.assert(
    not public.can_write_project(v_a1),
    'A System Administrator cannot write into a tenant project');

  select id into v_status from public.project_statuses where project_id = v_a1 limit 1;
  begin
    insert into public.issues (project_id, title, status_id)
    values (v_a1, 'Admin should not be able to write this', v_status);
    raise exception 'ASSERTION FAILED: a System Administrator inserted a tenant issue';
  exception
    when insufficient_privilege then
      raise notice '  ok — RLS refuses tenant writes from a System Administrator';
  end;

  perform pg_temp.act_as_postgres();
end $$;

-- ---------------------------------------------------------------------------
-- 7. Suspension hides a workspace from its own members
-- ---------------------------------------------------------------------------
\echo '7 — suspension'
do $$
declare
  v_owner_a uuid := (select v from fixture where k = 'owner_a');
  v_ws_a    uuid := (select v from fixture where k = 'ws_a');
  v_a1      uuid := (select v from fixture where k = 'proj_a1');
begin
  update public.workspaces set status = 'suspended' where id = v_ws_a;

  perform pg_temp.act_as(v_owner_a);

  perform pg_temp.assert(
    (select count(*) from public.workspaces where id = v_ws_a) = 0,
    'A suspended workspace is invisible to its own Owner');

  perform pg_temp.assert(
    not public.can_read_project(v_a1),
    'Projects of a suspended workspace are unreachable');

  perform pg_temp.assert(
    (select count(*) from public.current_workspace_ids(v_owner_a)) = 0,
    'current_workspace_ids() excludes a suspended workspace');

  perform pg_temp.act_as_postgres();

  -- Archived: readable, but frozen.
  update public.workspaces set status = 'archived' where id = v_ws_a;
  perform pg_temp.act_as(v_owner_a);

  perform pg_temp.assert(
    (select count(*) from public.workspaces where id = v_ws_a) = 1,
    'An archived workspace is still readable');

  perform pg_temp.assert(
    public.can_read_project(v_a1) and not public.can_write_project(v_a1),
    'An archived workspace is read-only');

  perform pg_temp.act_as_postgres();
  update public.workspaces set status = 'active' where id = v_ws_a;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Plan columns are out of reach for tenants
-- ---------------------------------------------------------------------------
\echo '8 — plan columns'
do $$
declare
  v_owner_a uuid := (select v from fixture where k = 'owner_a');
  v_ws_a    uuid := (select v from fixture where k = 'ws_a');
begin
  perform pg_temp.act_as(v_owner_a);

  perform pg_temp.assert(
    public.has_capability(v_owner_a, v_ws_a, 'workspace.settings'),
    'The Owner does hold workspace.settings');

  begin
    update public.workspaces set seat_limit = 9999 where id = v_ws_a;
    raise exception 'ASSERTION FAILED: an Owner raised their own seat limit';
  exception
    when insufficient_privilege then
      raise notice '  ok — seat_limit is not updatable by a tenant';
  end;

  begin
    update public.workspaces set status = 'active', expires_at = null where id = v_ws_a;
    raise exception 'ASSERTION FAILED: an Owner changed their own workspace status';
  exception
    when insufficient_privilege then
      raise notice '  ok — status and expiry are not updatable by a tenant';
  end;

  -- The company profile, however, is theirs to edit.
  update public.workspaces set company_name = 'Acme Incorporated' where id = v_ws_a;
  perform pg_temp.assert(
    (select company_name from public.workspaces where id = v_ws_a) = 'Acme Incorporated',
    'The Owner can edit the company profile');

  perform pg_temp.act_as_postgres();
end $$;

\echo ''
\echo 'All tenant-isolation assertions passed.'

rollback;
