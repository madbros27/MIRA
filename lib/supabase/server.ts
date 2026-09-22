import 'server-only'

/**
 * Server-side Supabase clients.
 *
 *   createSupabaseServerClient(portal) — acts as the signed-in user for the
 *                                      selected portal; RLS applies.
 *                                   Use in Server Components, Route Handlers
 *                                   and Server Actions.
 *   createSupabaseAdminClient()   — service role, RLS bypassed. Only for
 *                                   deliberate admin work (invites), never for
 *                                   rendering user data.
 */

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

import {
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from './env'
import type { Database } from '@/lib/types/database'

export type Portal = 'admin' | 'tenant'

const PORTAL_COOKIES = {
  admin: {
    name: 'mira-admin-session',
    path: '/miraadmin',
  },
  tenant: {
    name: 'mira-tenant-session',
    path: '/',
  },
} as const

export async function createSupabaseServerClient(portal: Portal) {
  const cookieStore = await cookies()
  const cookie = PORTAL_COOKIES[portal]

  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookieOptions: {
      name: cookie.name,
      path: cookie.path,
      sameSite: 'lax',
      secure: true,
    },
    cookies: {
      getAll() {
        return cookieStore.getAll().filter(({ name }) =>
          name === cookie.name || name.startsWith(`${cookie.name}-`)
        )
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component render, where cookies are
          // read-only. `middleware.ts` refreshes the session instead, so this
          // is safe to ignore.
        }
      },
    },
  })
}

export function createSupabaseAdminClient() {
  return createClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** The current user's session user, or null. */
export async function getSessionUser(portal: Portal) {
  const supabase = await createSupabaseServerClient(portal)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}
