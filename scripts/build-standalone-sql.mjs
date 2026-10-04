import { readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const schemaPath = join(root, 'supabase', 'schema.sql')
const outputPath = join(root, 'database', 'setup_all_tables_and_admin.sql')

const schemaSql = await readFile(schemaPath, 'utf8')

const compatibilityHeader = `-- ===========================================================================
-- MIRA: Complete Database Setup & Default Administrator
--
-- This script creates the entire MIRA database schema from scratch:
--   1. Extensions (pgcrypto, uuid-ossp)
--   2. PostgreSQL / Supabase auth compatibility layer (auth.users, auth.uid, roles)
--   3. All 27 core tables + mchat_messages
--   4. All custom enum types, constraints, and indexes
--   5. All database triggers and SECURITY DEFINER functions
--   6. Row-Level Security (RLS) policies for complete tenant isolation
--   7. Core static system capabilities
--   8. Default System Administrator account:
--        Email:    madbrostech27@gmail.com
--        Password: admin@1234567
--
-- Supported Database Environments:
--   - PostgreSQL 14, 15, 16, 17+ (Local, Docker, AWS RDS, Neon, DigitalOcean, etc.)
--   - Supabase Cloud & Self-hosted Supabase
--
-- How to run:
--   psql "$DATABASE_URL" -f database/setup_all_tables_and_admin.sql
--   or paste directly into Supabase SQL Editor / pgAdmin / DBeaver / TablePlus
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. PostgreSQL & Supabase Compatibility Prelude
-- ---------------------------------------------------------------------------

-- Enable standard cryptographic & UUID extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Ensure extensions schema exists
create schema if not exists extensions;

-- Fallback for extensions.gen_random_uuid() on pure PostgreSQL
create or replace function extensions.gen_random_uuid()
returns uuid
language sql
as $$
  select gen_random_uuid();
$$;

-- Ensure standard Supabase roles exist on pure PostgreSQL
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;

-- Ensure auth schema exists (built-in on Supabase; created here for pure PostgreSQL)
create schema if not exists auth;

-- Create auth.users table if it does not already exist
create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key default gen_random_uuid(),
  aud character varying(255),
  role character varying(255),
  email character varying(255) unique,
  encrypted_password character varying(255),
  email_confirmed_at timestamp with time zone default now(),
  invited_at timestamp with time zone,
  confirmation_token character varying(255),
  confirmation_sent_at timestamp with time zone,
  recovery_token character varying(255),
  recovery_sent_at timestamp with time zone,
  email_change_token_new character varying(255),
  email_change character varying(255),
  email_change_sent_at timestamp with time zone,
  last_sign_in_at timestamp with time zone,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  is_super_admin boolean,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  phone text unique default null,
  phone_confirmed_at timestamp with time zone,
  phone_change text default '',
  phone_change_token character varying(255) default '',
  phone_change_sent_at timestamp with time zone,
  confirmed_at timestamp with time zone,
  email_change_token_current character varying(255) default '',
  email_change_confirm_status smallint default 0,
  banned_until timestamp with time zone,
  reauthentication_token character varying(255) default '',
  reauthentication_sent_at timestamp with time zone,
  is_sso_user boolean not null default false,
  deleted_at timestamp with time zone
);

-- Provide auth.uid(), auth.role(), and auth.jwt() functions if not present
create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role'),
    'anon'
  );
$$;

create or replace function auth.jwt()
returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

-- Grant usage on auth and public schemas to standard roles
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant select on table auth.users to authenticated, service_role;
`

const mchatSection = `
-- ---------------------------------------------------------------------------
-- mchat_messages — ephemeral 1-on-1 team direct messages (7 days retention)
-- ---------------------------------------------------------------------------
create table if not exists public.mchat_messages (
  id           uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  sender_id    uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  message      text not null check (char_length(trim(message)) between 1 and 4000),
  created_at   timestamptz not null default now()
);

create index if not exists mchat_messages_workspace_created_idx
  on public.mchat_messages (workspace_id, created_at desc);

create index if not exists mchat_messages_conversation_idx
  on public.mchat_messages (workspace_id, sender_id, recipient_id, created_at desc);

alter table public.mchat_messages enable row level security;

drop policy if exists mchat_messages_select on public.mchat_messages;
create policy mchat_messages_select on public.mchat_messages
  for select
  using (
    auth.uid() = sender_id or auth.uid() = recipient_id
  );

drop policy if exists mchat_messages_insert on public.mchat_messages;
create policy mchat_messages_insert on public.mchat_messages
  for insert
  with check (
    auth.uid() = sender_id
  );

drop policy if exists mchat_messages_delete on public.mchat_messages;
create policy mchat_messages_delete on public.mchat_messages
  for delete
  using (
    auth.uid() = sender_id or auth.uid() = recipient_id
  );

grant select, insert, delete on table public.mchat_messages to authenticated;
`

const adminSeedSection = `
-- ===========================================================================
-- Default System Administrator Account & Seed Data
-- ===========================================================================
-- Email:    madbrostech27@gmail.com
-- Password: admin@1234567
-- ===========================================================================

do $$
declare
  v_admin_id uuid := 'a0000000-0000-0000-0000-000000000001'::uuid;
  v_email text := 'madbrostech27@gmail.com';
  v_password text := 'admin@1234567';
  v_name text := 'System Administrator';
  v_existing_id uuid;
begin
  -- 1. Ensure auth.users has the admin user with bcrypt password
  select id into v_existing_id
  from auth.users
  where lower(email) = lower(v_email);

  if v_existing_id is not null then
    v_admin_id := v_existing_id;
    update auth.users
       set encrypted_password = crypt(v_password, gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"provider":"email","providers":["email"],"mira_role":"system_admin"}'::jsonb,
           raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', v_name),
           updated_at = now()
     where id = v_admin_id;
  else
    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) values (
      v_admin_id,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated',
      'authenticated',
      lower(v_email),
      crypt(v_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"],"mira_role":"system_admin"}'::jsonb,
      jsonb_build_object('full_name', v_name),
      now(),
      now()
    );
  end if;

  -- 2. Ensure profile exists in public.profiles
  insert into public.profiles (id, email, full_name, is_active)
  values (v_admin_id, lower(v_email), v_name, true)
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        is_active = true;

  -- 3. Ensure platform_admins row exists
  insert into public.platform_admins (
    user_id,
    email,
    name,
    must_change_password,
    is_active
  ) values (
    v_admin_id,
    lower(v_email),
    v_name,
    false,
    true
  )
  on conflict (email) do update
    set user_id = excluded.user_id,
        name = excluded.name,
        must_change_password = false,
        is_active = true;

  raise notice '=======================================================';
  raise notice 'MIRA: Complete database schema created successfully!';
  raise notice 'System Administrator provisioned:';
  raise notice '  Email:    %', v_email;
  raise notice '  Password: %', v_password;
  raise notice '  Portal:   <app_url>/miraadmin/login';
  raise notice '=======================================================';
end $$;
`

const finalSql = `${compatibilityHeader}

-- ---------------------------------------------------------------------------
-- 2. Core MIRA Schema, Functions, Views, and RLS Policies
-- ---------------------------------------------------------------------------

${schemaSql}

${mchatSection}

${adminSeedSection}
`

await writeFile(outputPath, finalSql, 'utf8')
console.log(`Successfully generated ${outputPath}`)
