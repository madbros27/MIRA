import 'server-only'

/**
 * Server-side resolution of "who is this and what may they do".
 *
 * Two portals, two entry points:
 *
 *   requirePlatformAdmin()  — the /miraadmin shell. Redirects to the admin
 *                             login for anyone who is not a System
 *                             Administrator.
 *   getTenantContext()      — the tenant shell. Resolves the workspaces the
 *                             caller belongs to, the active one, and the
 *                             capability set their position grants there.
 *
 * Neither of these is the security boundary. They shape the UI and fail fast
 * with a readable message; Postgres enforces the same rules again on every
 * row (`supabase/migrations/20250201000300_platform_rls.sql`).
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

import { ACTIVE_WORKSPACE_COOKIE, IMPERSONATION_COOKIE, adminLoginUrl, tenantLoginUrl } from './constants'
import { makeGrants, type Grants } from '@/lib/permissions/capabilities'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types/app'
import type { PlatformAdminRow, WorkspaceRow } from '@/lib/types/database'

/* -------------------------------------------------------------------------- */
/* Platform tier                                                              */
/* -------------------------------------------------------------------------- */

export type PlatformAdminSession = {
  user: User
  admin: PlatformAdminRow
}

/** The signed-in System Administrator, or null for everyone else. */
export async function getPlatformAdmin(): Promise<PlatformAdminSession | null> {
  const supabase = await createSupabaseServerClient('admin')

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('platform_admins')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!data) return null
  return { user, admin: data as PlatformAdminRow }
}

/**
 * Gate for every page under /miraadmin. A tenant user who reaches an admin
 * URL is sent to the admin login with an explicit reason — never silently
 * redirected into the tenant app, which would hide the mistake.
 */
export async function requirePlatformAdmin(
  next?: string
): Promise<PlatformAdminSession> {
  const session = await getPlatformAdmin()
  if (!session) {
    const supabase = await createSupabaseServerClient('admin')
    const {
      data: { user },
    } = await supabase.auth.getUser()
    redirect(adminLoginUrl(user ? 'notAdmin' : undefined, next))
  }
  return session
}

/* -------------------------------------------------------------------------- */
/* Tenant tier                                                                */
/* -------------------------------------------------------------------------- */

export type PositionSummary = {
  id: string
  name: string
  slug: string | null
  capabilities: string[]
}

export type WorkspaceAccess = {
  workspace: WorkspaceRow
  isOwner: boolean
  isPrimaryOwner: boolean
  position: PositionSummary | null
  capabilities: string[]
  memberStatus: 'invited' | 'active' | 'suspended' | null
}

export type TenantContext = {
  user: User
  profile: Profile
  /** Every workspace this person may enter, sorted by name. */
  access: WorkspaceAccess[]
  active: WorkspaceAccess
  grants: Grants
  /** Set when a System Administrator is viewing this tenant read-only. */
  impersonation: { sessionId: string; expiresAt: string } | null
}

type MembershipRow = {
  workspace_id: string
  status: 'invited' | 'active' | 'suspended'
  workspace: WorkspaceRow | null
  position:
    | {
        id: string
        name: string
        slug: string | null
        permissions: { capability: string; allowed: boolean }[] | null
      }
    | null
}

const MEMBERSHIP_SELECT = `
  workspace_id,
  status,
  workspace:workspaces!workspace_members_workspace_id_fkey(*),
  position:positions(
    id, name, slug,
    permissions:position_permissions(capability, allowed)
  )
`

/**
 * Load every workspace the caller can enter, with the capabilities their
 * position grants in each. Ownership is fetched separately because an Owner's
 * authority does not come from a position.
 */
export async function loadWorkspaceAccess(
  userId: string
): Promise<WorkspaceAccess[]> {
  const supabase = await createSupabaseServerClient('tenant')

  const [membershipResult, ownerResult] = await Promise.all([
    supabase.from('workspace_members').select(MEMBERSHIP_SELECT).eq('user_id', userId),
    supabase
      .from('workspace_owners')
      .select('workspace_id, is_primary, workspace:workspaces(*)')
      .eq('user_id', userId),
  ])

  const owned = new Map<string, { isPrimary: boolean; workspace: WorkspaceRow | null }>()
  for (const row of (ownerResult.data ?? []) as unknown as {
    workspace_id: string
    is_primary: boolean
    workspace: WorkspaceRow | null
  }[]) {
    owned.set(row.workspace_id, { isPrimary: row.is_primary, workspace: row.workspace })
  }

  const byWorkspace = new Map<string, WorkspaceAccess>()

  for (const row of (membershipResult.data ?? []) as unknown as MembershipRow[]) {
    // RLS already hides suspended and deleted tenants; this guards against a
    // membership row whose workspace could not be read.
    if (!row.workspace) continue
    // Only an active seat gets you in. An `invited` row exists before the
    // person accepts, and RLS would refuse them every row anyway — better to
    // show the "no workspace yet" screen than an empty shell.
    if (row.status !== 'active') continue

    const ownership = owned.get(row.workspace_id)

    byWorkspace.set(row.workspace_id, {
      workspace: row.workspace,
      isOwner: Boolean(ownership),
      isPrimaryOwner: Boolean(ownership?.isPrimary),
      position: row.position
        ? {
            id: row.position.id,
            name: row.position.name,
            slug: row.position.slug,
            capabilities: (row.position.permissions ?? [])
              .filter((permission) => permission.allowed)
              .map((permission) => permission.capability),
          }
        : null,
      capabilities: (row.position?.permissions ?? [])
        .filter((permission) => permission.allowed)
        .map((permission) => permission.capability),
      memberStatus: row.status,
    })
  }

  // An Owner without a membership row still owns the workspace.
  for (const [workspaceId, ownership] of owned) {
    if (byWorkspace.has(workspaceId) || !ownership.workspace) continue
    byWorkspace.set(workspaceId, {
      workspace: ownership.workspace,
      isOwner: true,
      isPrimaryOwner: ownership.isPrimary,
      position: null,
      capabilities: [],
      memberStatus: null,
    })
  }

  return [...byWorkspace.values()].sort((a, b) =>
    a.workspace.name.localeCompare(b.workspace.name)
  )
}

export function grantsFor(
  access: WorkspaceAccess | null,
  options: { impersonating?: boolean } = {}
): Grants {
  if (!access) return makeGrants({ writable: false })
  return makeGrants({
    isOwner: access.isOwner,
    writable: access.workspace.status === 'active',
    impersonating: options.impersonating ?? false,
    capabilities: access.capabilities,
  })
}

/**
 * A live "View as Owner" session, if one is open and has not expired.
 * The cookie only carries an id; the workspace and the window come from the
 * database, so tampering with the cookie buys nothing.
 */
async function resolveImpersonation(): Promise<{
  sessionId: string
  workspaceId: string
  expiresAt: string
} | null> {
  const store = await cookies()
  const sessionId = store.get(IMPERSONATION_COOKIE)?.value
  if (!sessionId) return null

  const supabase = await createSupabaseServerClient('tenant')
  const { data } = await supabase
    .from('admin_impersonations')
    .select('id, workspace_id, expires_at, ended_at')
    .eq('id', sessionId)
    .maybeSingle()

  if (!data) return null
  if (data.ended_at) return null
  if (new Date(data.expires_at).getTime() <= Date.now()) return null

  return {
    sessionId: data.id,
    workspaceId: data.workspace_id,
    expiresAt: data.expires_at,
  }
}

/**
 * Resolve the tenant shell. Returns null rather than redirecting when the
 * account is valid but belongs to no workspace, so the caller can render the
 * "you have no workspace yet" screen instead of a redirect loop.
 */
export async function getTenantContext(): Promise<
  | { status: 'ok'; context: TenantContext }
  | { status: 'no-workspace'; user: User; profile: Profile }
  | { status: 'unauthenticated' }
  | { status: 'platform-admin'; user: User }
> {
  const supabase = await createSupabaseServerClient('tenant')

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { status: 'unauthenticated' }

  const impersonation = await resolveImpersonation()

  // A System Administrator has no tenant of their own. The only way they see
  // the tenant shell is through an open impersonation session.
  const { data: adminRow } = await supabase
    .from('platform_admins')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (adminRow && !impersonation) {
    return { status: 'platform-admin', user }
  }

  const profile = await ensureProfile(user)

  if (adminRow && impersonation) {
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', impersonation.workspaceId)
      .maybeSingle()

    if (!workspace) return { status: 'platform-admin', user }

    const access: WorkspaceAccess = {
      workspace: workspace as WorkspaceRow,
      isOwner: false,
      isPrimaryOwner: false,
      position: null,
      // Read-only support view: every screen renders, nothing is writable.
      capabilities: ['project.view_all', 'report.view', 'billing.view'],
      memberStatus: null,
    }

    return {
      status: 'ok',
      context: {
        user,
        profile,
        access: [access],
        active: access,
        grants: grantsFor(access, { impersonating: true }),
        impersonation: {
          sessionId: impersonation.sessionId,
          expiresAt: impersonation.expiresAt,
        },
      },
    }
  }

  const access = await loadWorkspaceAccess(user.id)
  if (!access.length) {
    return { status: 'no-workspace', user, profile }
  }

  const store = await cookies()
  const preferred = store.get(ACTIVE_WORKSPACE_COOKIE)?.value
  const active =
    access.find((item) => item.workspace.id === preferred) ?? access[0]

  return {
    status: 'ok',
    context: {
      user,
      profile,
      access,
      active,
      grants: grantsFor(active),
      impersonation: null,
    },
  }
}

/** Redirecting variant, for pages that cannot render without a workspace. */
export async function requireTenantContext(next?: string): Promise<TenantContext> {
  const result = await getTenantContext()

  switch (result.status) {
    case 'ok':
      return result.context
    case 'unauthenticated':
      redirect(tenantLoginUrl(undefined, next))
    case 'platform-admin':
      redirect('/miraadmin/dashboard')
    case 'no-workspace':
      // The tenant layout renders the "you have no workspace" screen, so
      // bouncing to the dashboard shows it rather than looping.
      redirect('/dashboard')
  }
}

/**
 * Mirror an auth user into `public.profiles` if the signup trigger has not
 * run — for instance when the account predates the migrations.
 */
async function ensureProfile(user: User): Promise<Profile> {
  const supabase = await createSupabaseServerClient('tenant')

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (data) return data as Profile

  const { data: created } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        email: user.email ?? '',
        full_name:
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          user.email?.split('@')[0] ??
          null,
        avatar_url:
          (user.user_metadata?.avatar_url as string | undefined) ??
          (user.user_metadata?.picture as string | undefined) ??
          null,
      },
      { onConflict: 'id' }
    )
    .select('*')
    .maybeSingle()

  return (created ?? {
    id: user.id,
    email: user.email ?? '',
    full_name: null,
    avatar_url: null,
    job_title: null,
    timezone: null,
    phone: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }) as Profile
}
