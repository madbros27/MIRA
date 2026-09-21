import { NextResponse, type NextRequest } from 'next/server'

import { clientIp, errorResponse, requireAdminApi, userAgent } from '@/lib/auth/api'
import { IMPERSONATION_COOKIE } from '@/lib/auth/constants'

/**
 * "View as Owner" — a read-only support session into one tenant.
 *
 * The cookie holds only the session id. Which workspace it grants, and for
 * how long, is read back from `admin_impersonations` on every request (see
 * `resolveImpersonation()` in lib/auth/session.ts), so editing the cookie
 * gains nothing.
 *
 * Read-only is not a UI decision either: a system administrator holds no
 * capability in any workspace, so `has_capability()` returns false and every
 * RLS write check fails regardless of what the client sends.
 */
export async function POST(request: NextRequest) {
  const guard = await requireAdminApi()
  if (!guard.ok) return guard.response

  const { supabase } = guard.context

  let body: { workspaceId?: string; reason?: string; minutes?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 })
  }

  if (!body.workspaceId) {
    return NextResponse.json({ error: 'A workspace is required' }, { status: 400 })
  }
  if (!body.reason || body.reason.trim().length < 5) {
    return NextResponse.json(
      { error: 'Give a reason — it is written to the audit log' },
      { status: 400 }
    )
  }

  const minutes = Math.min(240, Math.max(5, body.minutes ?? 30))

  try {
    const { data, error } = await supabase.rpc('admin_start_impersonation', {
      p_workspace: body.workspaceId,
      p_reason: body.reason.trim(),
      p_minutes: minutes,
    })
    if (error) throw error

    const session = data as unknown as { id: string; expires_at: string }

    await supabase.rpc('log_platform_action', {
      p_action: 'impersonation.started',
      p_target_type: 'workspace',
      p_target_id: body.workspaceId,
      p_metadata: {
        session_id: session.id,
        reason: body.reason.trim(),
        minutes,
        source: 'admin_portal',
      },
      p_ip: clientIp(request),
      p_user_agent: userAgent(request),
    })

    const response = NextResponse.json({ ok: true, session })
    response.cookies.set(IMPERSONATION_COOKIE, session.id, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: minutes * 60,
    })
    return response
  } catch (error) {
    return errorResponse(error, 'Could not start the support session')
  }
}

/** DELETE /api/admin/impersonate — end the session and drop the cookie. */
export async function DELETE(request: NextRequest) {
  const guard = await requireAdminApi()
  if (!guard.ok) return guard.response

  const sessionId = request.cookies.get(IMPERSONATION_COOKIE)?.value ?? null

  try {
    await guard.context.supabase.rpc('admin_end_impersonation', {
      p_session: sessionId,
    })
  } catch {
    // Ending a session that already expired is not an error worth surfacing —
    // the cookie still has to go.
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(IMPERSONATION_COOKIE, '', { path: '/', maxAge: 0 })
  return response
}
