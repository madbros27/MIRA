import 'server-only'

/**
 * Guards for the admin API routes.
 *
 * The pattern in every handler is the same, and the order matters:
 *
 *   1. Authenticate as the *caller* with the anon key, so RLS applies.
 *   2. Confirm they are in `platform_admins`.
 *   3. Only then reach for the service-role client.
 *
 * Doing it the other way round — service role first, check later — is how
 * privilege-escalation bugs happen, so the helper below makes the safe order
 * the easy one.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'

import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server'
import type { Database, PlatformAdminRow } from '@/lib/types/database'

export type AdminApiContext = {
  user: User
  admin: PlatformAdminRow
  /** Acts as the caller. RLS applies. Use for anything a policy already covers. */
  supabase: SupabaseClient<Database>
  /** Bypasses RLS. Only for auth-user creation and password resets. */
  service: SupabaseClient<Database>
}

export async function requireAdminApi(): Promise<
  { ok: true; context: AdminApiContext } | { ok: false; response: NextResponse }
> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }),
    }
  }

  const { data: admin } = await supabase
    .from('platform_admins')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'This account is not a system administrator' },
        { status: 403 }
      ),
    }
  }

  return {
    ok: true,
    context: {
      user,
      admin: admin as PlatformAdminRow,
      supabase,
      service: createSupabaseAdminClient(),
    },
  }
}

/**
 * Best-effort client IP for the audit log. Behind Vercel the first entry of
 * `x-forwarded-for` is the real client; everything else is a proxy hop.
 */
export function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null
  return request.headers.get('x-real-ip')
}

export function userAgent(request: NextRequest): string | null {
  return request.headers.get('user-agent')?.slice(0, 500) ?? null
}

/** Turn a thrown Postgres/PostgREST error into a JSON response. */
export function errorResponse(error: unknown, fallback: string, status = 400) {
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String((error as { message: unknown }).message)
      : fallback

  // A privilege error from a definer function means the session is not what
  // it claimed to be — report that as 403, not a generic 400.
  const isPrivilege = /insufficient_privilege|Forbidden|permission denied/i.test(message)
  return NextResponse.json({ error: message }, { status: isPrivilege ? 403 : status })
}
