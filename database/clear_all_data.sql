-- ===========================================================================
-- MIRA: Clear All Data (PostgreSQL & Supabase Compatible)
--
-- This script safely truncates/clears all existing data from every application
-- table in the database while preserving the database schema, tables, views,
-- functions, triggers, constraints, indexes, and RLS policies.
--
-- It also safely cleans `auth.users` to prevent orphaned auth accounts,
-- and re-seeds the core static system capabilities required for workspace
-- position and permission management.
--
-- How to run:
--   psql "$DATABASE_URL" -f database/clear_all_data.sql
--   or paste into Supabase SQL Editor / DBeaver / pgAdmin / TablePlus
-- ===========================================================================

-- 1. Begin transaction
BEGIN;

-- Try to set replica role to disable FK checks during truncation if superuser
DO $$
BEGIN
  BEGIN
    SET session_replication_role = 'replica';
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Non-superusers will proceed with standard CASCADE truncation
  END;
END $$;

-- 2. Dynamically truncate all tables in the public schema
DO $$
DECLARE
  r RECORD;
  v_tables TEXT := '';
BEGIN
  -- Collect all table names in public schema
  FOR r IN (
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY tablename
  ) LOOP
    IF v_tables <> '' THEN
      v_tables := v_tables || ', ';
    END IF;
    v_tables := v_tables || 'public.' || quote_ident(r.tablename);
  END LOOP;

  -- Execute bulk truncate with CASCADE and RESTART IDENTITY
  IF v_tables <> '' THEN
    EXECUTE 'TRUNCATE TABLE ' || v_tables || ' RESTART IDENTITY CASCADE;';
    RAISE NOTICE 'Successfully truncated all tables in public schema.';
  ELSE
    RAISE NOTICE 'No tables found in public schema.';
  END IF;
END $$;

-- 3. Clear auth.users if the auth schema exists (Supabase / GoTrue)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'auth' AND tablename = 'users'
  ) THEN
    BEGIN
      DELETE FROM auth.users;
      RAISE NOTICE 'Successfully cleared auth.users.';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Notice: Skipped auth.users deletion (permissions): %', SQLERRM;
    END IF;
  END IF;
END $$;

-- 4. Re-enable default session replication role
DO $$
BEGIN
  BEGIN
    SET session_replication_role = 'DEFAULT';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

-- 5. Re-seed default core capabilities (essential for position/permission logic)
INSERT INTO public.capabilities (key, label, description, group_name, position) VALUES
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
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description,
      group_name = EXCLUDED.group_name,
      position = EXCLUDED.position;

-- Commit transaction
COMMIT;

-- Output confirmation
SELECT 'MIRA: All data cleared successfully. System capabilities preserved.' AS status;
