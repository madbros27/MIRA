import { NextResponse, type NextRequest } from 'next/server'

import { clientIp, errorResponse, requireAdminApi, userAgent } from '@/lib/auth/api'
import { absoluteUrl } from '@/lib/supabase/env'

/**
 * POST /api/admin/owners — create an Owner account.
 *
 * This is one of only two places in MIRA that uses the service-role key:
 * minting an `auth.users` row requires it. Everything after that (attaching
 * the owner to a workspace, writing the audit row) goes through the
 * `admin_assign_owner` RPC as the calling administrator, so the guard and the
 * log stay on the same code path as every other admin action.
 */
export async function POST(request: NextRequest) {
  const guard = await requireAdminApi()
  if (!guard.ok) return guard.response

  const { supabase, service } = guard.context

  let body: {
    email?: string
    fullName?: string
    phone?: string
    password?: string
    workspaceId?: string
    makePrimary?: boolean
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  const fullName = body.fullName?.trim()

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 })
  }
  if (!fullName) {
    return NextResponse.json({ error: 'A full name is required' }, { status: 400 })
  }
  if (body.password && body.password.length < 10) {
    return NextResponse.json(
      { error: 'A temporary password must be at least 10 characters' },
      { status: 400 }
    )
  }

  // An Owner is a tenant account. Refuse to overload a platform admin with a
  // second identity — the RPC refuses too, but failing here is clearer.
  const { data: existingAdmin } = await supabase
    .from('platform_admins')
    .select('id')
    .ilike('email', email)
    .maybeSingle()

  if (existingAdmin) {
    return NextResponse.json(
      { error: 'That email belongs to a system administrator and cannot own a workspace' },
      { status: 409 }
    )
  }

  try {
    let userId: string | null = null
    let inviteUrl: string | undefined
    let emailed = false

    // Reuse the account if this person already exists — a customer buying a
    // second workspace should not end up with two logins.
    const { data: existingProfile } = await service
      .from('profiles')
      .select('id')
      .ilike('email', email)
      .maybeSingle()

    if (existingProfile) {
      userId = existingProfile.id
      await service
        .from('profiles')
        .update({ full_name: fullName, phone: body.phone ?? null })
        .eq('id', userId)
    } else if (body.password) {
      const { data, error } = await service.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
        user_metadata: { full_name: fullName, phone: body.phone ?? null },
      })
      if (error) throw error
      userId = data.user?.id ?? null
    } else {
      const { data, error } = await service.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          data: { full_name: fullName, phone: body.phone ?? null },
          redirectTo: absoluteUrl('/auth/callback?next=/dashboard'),
        },
      })
      if (error) throw error
      userId = data.user?.id ?? null
      inviteUrl = data.properties?.action_link

      // generateLink does not send mail. Ask Supabase Auth to deliver the
      // invite as well; if SMTP is not configured this fails harmlessly and
      // the admin hands over `inviteUrl` instead.
      const { error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
        redirectTo: absoluteUrl('/auth/callback?next=/dashboard'),
        data: { full_name: fullName },
      })
      emailed = !inviteError
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'The account was not created. Check the Supabase Auth logs.' },
        { status: 502 }
      )
    }

    // The profile row normally arrives via the auth trigger; upsert covers the
    // case where the trigger has not been applied yet.
    await service.from('profiles').upsert(
      { id: userId, email, full_name: fullName, phone: body.phone ?? null, is_active: true },
      { onConflict: 'id' }
    )

    if (body.workspaceId) {
      const { error: assignError } = await supabase.rpc('admin_assign_owner', {
        p_workspace: body.workspaceId,
        p_user: userId,
        p_is_primary: body.makePrimary ?? true,
      })
      if (assignError) throw assignError
    }

    await supabase.rpc('log_platform_action', {
      p_action: 'owner.created',
      p_target_type: 'user',
      p_target_id: userId,
      p_metadata: {
        email,
        full_name: fullName,
        workspace_id: body.workspaceId ?? null,
        delivery: body.password ? 'temporary_password' : 'invite_link',
        reused_existing_account: Boolean(existingProfile),
      },
      p_ip: clientIp(request),
      p_user_agent: userAgent(request),
    })

    return NextResponse.json({
      userId,
      email,
      inviteUrl,
      emailed,
      // Echoed back once so the admin can read it out; never stored anywhere.
      temporaryPassword: body.password,
    })
  } catch (error) {
    return errorResponse(error, 'Could not create the owner account')
  }
}
