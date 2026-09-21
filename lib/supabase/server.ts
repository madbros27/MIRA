import 'server-only'

/**
 * Server-side Supabase clients.
 *
 *   createSupabaseServerClient()  — acts as the signed-in user, RLS applies.
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

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
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
export async function getSessionUser() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}
