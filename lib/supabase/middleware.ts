/**
 * Session refresh + portal separation, run by `middleware.ts` on every
 * document request.
 *
 * MIRA serves two authentication surfaces from one deployment:
 *
 *   <base>/login            tenant portal — Owners and Users
 *   <base>/miraadmin/login  platform portal — System Administrators
 *
 * They must never bleed into one another. This file is the first of three
 * places that enforce it; the other two are the route-group layouts
 * (`requirePlatformAdmin()` / `requireTenantContext()`) and the RLS policies
 * in Postgres. A UI-only check would not be acceptable, so none of these is
 * load-bearing on its own.
 *
 * The cookie dance matters: Supabase may rotate the access token during
 * `getUser()`, and those refreshed cookies have to be written onto the
 * response that is actually returned — including redirect responses.
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'

import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from './env'
import { ADMIN_COOKIE, TENANT_COOKIE } from './portal'
import {
  ADMIN_PREFIX,
  IMPERSONATION_COOKIE,
  adminLoginUrl,
  isAdminPath,
  isPublicPath,
  tenantLoginUrl,
} from '@/lib/auth/constants'
import type { Database } from '@/lib/types/database'

const ADMIN_LOGIN = `${ADMIN_PREFIX}/login`

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }
  // Without credentials there is nothing to protect — send everyone to the
  // setup page, which explains what to configure.
  if (!isSupabaseConfigured()) {
    if (pathname === '/setup') return NextResponse.next({ request })
    return NextResponse.redirect(new URL('/setup', request.url))
  }

  // Server Components cannot read the current URL. Forwarding it as a request
  // header lets the two shell layouts make path-aware decisions (the admin
  // must-change-password gate, the tenant `next=` round trip).
  // Rebuilt on each call rather than captured once: `request.cookies.set()`
  // writes through to the request headers, and those refreshed auth cookies
  // have to reach the Server Components too.
  const forward = () => {
    const headers = new Headers(request.headers)
    headers.set('x-pathname', pathname)
    headers.set('x-url', request.nextUrl.toString())
    return NextResponse.next({ request: { headers } })
  }

  let response = forward()

  const adminPortal = isAdminPath(pathname)
  const cookie = adminPortal
    ? { name: ADMIN_COOKIE, path: '/miraadmin' }
    : { name: TENANT_COOKIE, path: '/' }

  const supabase = createServerClient<Database>(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookieOptions: {
        name: cookie.name,
        path: cookie.path,
        sameSite: 'lax',
        secure: true,
      },
      cookies: {
        getAll() {
          return request.cookies.getAll().filter(({ name }) =>
            name === cookie.name || name.startsWith(`${cookie.name}-`)
          )
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = forward()
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const redirectTo = (path: string) =>
    copyCookies(response, NextResponse.redirect(new URL(path, request.url)))

  /* ---------------------------------------------------------------------- */
  /* Admin portal                                                           */
  /* ---------------------------------------------------------------------- */
  if (isAdminPath(pathname)) {
    if (pathname === ADMIN_PREFIX || pathname === `${ADMIN_PREFIX}/`) {
      return redirectTo(user ? `${ADMIN_PREFIX}/dashboard` : ADMIN_LOGIN)
    }

    if (pathname === ADMIN_LOGIN) {
      // A signed-in administrator skips the form. A signed-in tenant user is
      // deliberately *not* redirected away: the login page tells them, in
      // plain words, that their account is not a system administrator.
      if (user && (await isPlatformAdmin(supabase, user))) {
        return redirectTo(`${ADMIN_PREFIX}/dashboard`)
      }
      return response
    }

    if (!user) {
      return redirectTo(adminLoginUrl(undefined, pathname + request.nextUrl.search))
    }

    if (!(await isPlatformAdmin(supabase, user))) {
      return redirectTo(adminLoginUrl('notAdmin'))
    }

    return response
  }

  /* ---------------------------------------------------------------------- */
  /* Tenant portal                                                          */
  /* ---------------------------------------------------------------------- */

  if (!user) {
    if (isPublicPath(pathname)) return response
    const next = pathname === '/' ? undefined : pathname + request.nextUrl.search
    return redirectTo(tenantLoginUrl(undefined, next))
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (profile && !profile.is_active) {
    await supabase.auth.signOut()
    return redirectTo(tenantLoginUrl('suspended'))
  }

  // A System Administrator has no tenant of their own. The single exception
  // is an open "View as Owner" session, which carries its own cookie and is
  // validated against `admin_impersonations` by the tenant layout.
  const impersonating = Boolean(request.cookies.get(IMPERSONATION_COOKIE)?.value)

  if (!impersonating && looksLikePlatformAdmin(user)) {
    if (pathname === '/login' || pathname === '/signup') {
      return redirectTo(adminLoginUrl())
    }
    return redirectTo(`${ADMIN_PREFIX}/dashboard`)
  }

  if (pathname === '/login' || pathname === '/signup') {
    return redirectTo('/dashboard')
  }

  return response
}

/**
 * Fast path: the seed script and the owner-provisioning route both stamp
 * `app_metadata.mira_role` on the auth user, so the common case is decided
 * from the JWT with no extra round trip. The table is still consulted when
 * the claim is absent — the claim is a hint, `platform_admins` is the truth.
 */
function looksLikePlatformAdmin(user: User): boolean {
  return (user.app_metadata as { mira_role?: string } | null)?.mira_role === 'system_admin'
}

async function isPlatformAdmin(
  supabase: ReturnType<typeof createServerClient<Database>>,
  user: User
): Promise<boolean> {
  if (looksLikePlatformAdmin(user)) return true

  const { data } = await supabase
    .from('platform_admins')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  return Boolean(data)
}

/** Carry any refreshed auth cookies onto a different response object. */
function copyCookies(from: NextResponse, to: NextResponse) {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie)
  }
  return to
}
