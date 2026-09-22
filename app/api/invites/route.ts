import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes } from 'node:crypto'

import { absoluteUrl } from '@/lib/supabase/env'
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Create a workspace invitation.
 *
 * The row is inserted as the signed-in user, so RLS decides whether they are
 * allowed to invite at all (`member.invite`). Only the email delivery uses
 * the service-role key, which is why this lives in a route handler instead of
 * the browser.
 *
 * The invitation carries a *position*, not a role: what the person will be
 * able to do is resolved from that position's capability checklist when they
 * accept.
 */
export async function POST(request: NextRequest) {
  let body: {
    workspaceId?: string
    email?: string
    positionId?: string
    fullName?: string
    createTemporaryPassword?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 })
  }

  const workspaceId = body.workspaceId?.trim()
  const email = body.email?.trim().toLowerCase()
  const positionId = body.positionId?.trim() || null

  if (!workspaceId || !email) {
    return NextResponse.json(
      { error: 'workspaceId and email are both required' },
      { status: 400 }
    )
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'That does not look like an email address' }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient('tenant')
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'You need to be signed in' }, { status: 401 })
  }

  // Refuse early when the workspace is out of seats. The database enforces
  // this too, but failing here means we do not leave a dangling invitation
  // that can never be accepted.
  const [{ data: workspace }, { count: seatsUsed }, { count: pending }] = await Promise.all([
    supabase.from('workspaces').select('name, seat_limit, status').eq('id', workspaceId).maybeSingle(),
    supabase
      .from('workspace_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'active'),
    supabase
      .from('workspace_invites')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending'),
  ])

  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }
  if (workspace.status !== 'active') {
    return NextResponse.json(
      { error: 'This workspace is not currently accepting new members' },
      { status: 409 }
    )
  }
  if ((seatsUsed ?? 0) + (pending ?? 0) >= workspace.seat_limit) {
    return NextResponse.json(
      {
        error: `All ${workspace.seat_limit} seats are taken or reserved by pending invitations. Ask your MIRA administrator to raise the limit.`,
      },
      { status: 409 }
    )
  }

  // Already a member? Nothing to do.
  const { data: existingMember } = await supabase
    .from('workspace_members')
    .select('user_id, profile:profiles!workspace_members_user_id_fkey(email)')
    .eq('workspace_id', workspaceId)
    .limit(1000)

  const alreadyMember = (existingMember ?? []).some(
    (row) =>
      (row as unknown as { profile: { email: string } | null }).profile?.email?.toLowerCase() ===
      email
  )
  if (alreadyMember) {
    return NextResponse.json(
      { error: 'That person is already a member of this workspace' },
      { status: 409 }
    )
  }

  // RLS enforces that only a position holding `member.invite` can insert here.
  const { data: invite, error } = await supabase
    .from('workspace_invites')
    .insert({
      workspace_id: workspaceId,
      email,
      position_id: positionId,
      full_name: body.fullName?.trim() || null,
      invited_by: user.id,
    })
    .select('id, token, email, position_id')
    .single()

  if (error) {
    const isDuplicate = /duplicate key|workspace_invites_pending_unique/i.test(error.message)
    const isDenied = /row-level security/i.test(error.message)
    return NextResponse.json(
      {
        error: isDuplicate
          ? 'There is already a pending invitation for that email address'
          : isDenied
            ? 'Your position does not allow inviting people to this workspace'
            : error.message,
      },
      { status: isDuplicate ? 409 : isDenied ? 403 : 400 }
    )
  }

  const inviteUrl = absoluteUrl(`/invite/${invite.token}`)
  const createTemporaryPassword = body.createTemporaryPassword === true
  const admin = createSupabaseAdminClient()
  let temporaryPassword: string | null = null
  let temporaryAccountCreated = false
  let existingAccountInTemporaryMode = false

  if (createTemporaryPassword) {
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    let existingUserId = existingProfile?.id ?? null
    if (!existingUserId) {
      const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      existingUserId =
        users.users.find((candidate) => candidate.email?.toLowerCase() === email)?.id ?? null
    }

    if (!existingUserId) {
      temporaryPassword = `Mira-${randomBytes(18).toString('base64url')}`
      const { error: createError } = await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: body.fullName?.trim() ? { full_name: body.fullName.trim() } : undefined,
        app_metadata: { mira_must_change_password: true },
      })
      if (createError) {
        await supabase.from('workspace_invites').update({ status: 'revoked' }).eq('id', invite.id)
        return NextResponse.json({ error: createError.message }, { status: 400 })
      }
      temporaryAccountCreated = true
    } else {
      existingAccountInTemporaryMode = true
    }
  }

  const authRedirectUrl = absoluteUrl(
    `/auth/callback?next=${encodeURIComponent(`/invite/${invite.token}`)}`
  )

  // Try to email the invitation. This needs the service-role key and only
  // works for addresses that do not have an account yet — everyone else simply
  // signs in and the invite is claimed automatically.
  let emailed = false
  let emailError: string | null = null

  try {
    if (createTemporaryPassword && temporaryAccountCreated && temporaryPassword) {
      const loginUrl = absoluteUrl(`/login?next=${encodeURIComponent(`/invite/${invite.token}`)}`)
      const bodyText = [
        'Welcome to MIRA',
        '',
        `Workspace: ${workspace.name}`,
        `MIRA login URL: ${loginUrl}`,
        `Login email: ${email}`,
        `Temporary password: ${temporaryPassword}`,
        '',
        'Please change your password after your first login.',
      ].join('\n')

      return NextResponse.json({
        ok: true,
        inviteId: invite.id,
        inviteUrl,
        temporaryPasswordCreated: true,
        mailtoUrl: `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('MIRA Workspace Invitation')}&body=${encodeURIComponent(bodyText)}`,
      })
    }

    if (existingAccountInTemporaryMode) {
      const loginUrl = absoluteUrl(`/login?next=${encodeURIComponent(`/invite/${invite.token}`)}`)
      const bodyText = [
        'Welcome to MIRA',
        '',
        `Workspace: ${workspace.name}`,
        `MIRA login URL: ${loginUrl}`,
        `Login email: ${email}`,
        '',
        'Please sign in with your existing MIRA password to join this workspace.',
      ].join('\n')

      return NextResponse.json({
        ok: true,
        inviteId: invite.id,
        inviteUrl,
        temporaryPasswordCreated: false,
        mailtoUrl: `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('MIRA Workspace Invitation')}&body=${encodeURIComponent(bodyText)}`,
      })
    }

    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: authRedirectUrl,
    })
    if (inviteError) throw inviteError

    emailed = true
  } catch (caught) {
    emailError =
      caught instanceof Error ? caught.message : 'Email delivery is not configured'
  }

  return NextResponse.json({
    ok: true,
    inviteId: invite.id,
    inviteUrl,
    emailed,
    temporaryPasswordCreated: false,
    // Not an error for the caller: the link can always be shared manually.
    emailNotice: emailed ? null : emailError,
  })
}
