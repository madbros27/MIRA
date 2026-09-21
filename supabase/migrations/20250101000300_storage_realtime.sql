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
