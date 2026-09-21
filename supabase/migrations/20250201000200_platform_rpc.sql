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
