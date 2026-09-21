/**
 * Shared constants for the two authentication surfaces.
 *
 * Kept in their own module (no `server-only`, no `"use server"`) so that
 * middleware, Server Components and Client Components can all import them.
 */

/** Everything below this prefix belongs to the System Administrator portal. */
export const ADMIN_PREFIX = '/miraadmin'

/** Tenant paths reachable without a session. */
export const TENANT_PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/auth/confirm',
  '/auth/signout',
  '/invite',
  '/setup',
] as const

/** Admin paths reachable without a session. */
export const ADMIN_PUBLIC_PATHS = [`${ADMIN_PREFIX}/login`] as const

/** Remembers which workspace a tenant user is looking at. */
export const ACTIVE_WORKSPACE_COOKIE = 'mira_workspace'

/**
 * Set while a System Administrator is viewing a tenant through
 * "View as Owner". Holds the impersonation session id; the workspace and the
 * expiry are read back from `admin_impersonations`, never trusted from the
 * cookie itself.
 */
export const IMPERSONATION_COOKIE = 'mira_impersonation'

/** Reason codes surfaced on the login screens. */
export const LOGIN_ERRORS = {
  notAdmin: 'This account is not a system administrator.',
  adminOnly:
    'System Administrator accounts sign in at the admin portal, not here.',
  suspended:
    'This account has been suspended. Contact your workspace owner or MIRA support.',
  noWorkspace:
    'This account does not belong to any workspace yet. Ask your workspace owner for an invitation.',
} as const

export type LoginErrorCode = keyof typeof LOGIN_ERRORS

export function adminLoginUrl(reason?: LoginErrorCode, next?: string) {
  const params = new URLSearchParams()
  if (reason) params.set('reason', reason)
  if (next) params.set('next', next)
  const query = params.toString()
  return `${ADMIN_PREFIX}/login${query ? `?${query}` : ''}`
}

export function tenantLoginUrl(reason?: LoginErrorCode, next?: string) {
  const params = new URLSearchParams()
  if (reason) params.set('reason', reason)
  if (next) params.set('next', next)
  const query = params.toString()
  return `/login${query ? `?${query}` : ''}`
}

export function isAdminPath(pathname: string) {
  return pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`)
}

export function isPublicPath(pathname: string) {
  const all: readonly string[] = [...TENANT_PUBLIC_PATHS, ...ADMIN_PUBLIC_PATHS]
  return all.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}
