import { NextResponse, type NextRequest } from 'next/server'

import { clientIp, errorResponse, requireAdminApi, userAgent } from '@/lib/auth/api'
import { absoluteUrl } from '@/lib/supabase/env'

/**
 * POST /api/admin/password-reset — send an Owner a reset link.
 *
 * The administrator never sees or sets the new password; Supabase Auth mails
 * a one-time link. The link is also returned so it can be read out over the
 * phone when the project has no SMTP configured.
 */
export async function POST(request: NextRequest) {
  const guard = await requireAdminApi()
  if (!guard.ok) return guard.response

  const { supabase, service } = guard.context

  let body: { email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  if (!email) {
    return NextResponse.json({ error: 'An email address is required' }, { status: 400 })
  }

  try {
    const { data, error } = await service.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: absoluteUrl('/auth/callback?next=/reset-password') },
    })
    if (error) throw error

    const { error: mailError } = await service.auth.resetPasswordForEmail(email, {
      redirectTo: absoluteUrl('/auth/callback?next=/reset-password'),
    })

    await supabase.rpc('log_platform_action', {
      p_action: 'owner.password_reset',
      p_target_type: 'user',
      p_target_id: data.user?.id ?? null,
      p_metadata: { email, emailed: !mailError },
      p_ip: clientIp(request),
      p_user_agent: userAgent(request),
    })

    return NextResponse.json({
      ok: true,
      emailed: !mailError,
      resetUrl: data.properties?.action_link,
    })
  } catch (error) {
    return errorResponse(error, 'Could not generate a reset link')
  }
}
