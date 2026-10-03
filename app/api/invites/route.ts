import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'

import { absoluteUrl } from '@/lib/supabase/env'
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server'

type InvitationEntry = {
  email: string
  fullName: string
  positionId: string
}

async function postSingleInvite(
  request: NextRequest,
  usedTemporaryPasswords = new Set<string>()
) {
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

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 })
  }

  const workspaceId = body.workspaceId?.trim()
  const email = body.email?.trim().toLowerCase()
  const positionId = body.positionId?.trim()

  if (!workspaceId || !email || !positionId || !body.fullName?.trim()) {
    return NextResponse.json(
      { error: 'Workspace, email, name, and position are required' },
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
  const [
    { data: workspace, error: workspaceError },
    { count: seatsUsed, error: seatsError },
    { count: pending, error: pendingError },
  ] = await Promise.all([
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

  if (workspaceError || seatsError || pendingError) {
    return NextResponse.json(
      { error: 'Could not validate workspace or seat availability' },
      { status: 500 }
    )
  }
  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }
  if (workspace.status !== 'active') {
    return NextResponse.json(
      { error: 'This workspace is not currently accepting new members' },
      { status: 409 }
    )
  }
  const { data: position, error: positionError } = await supabase
    .from('positions')
    .select('id, name')
    .eq('workspace_id', workspaceId)
    .eq('id', positionId)
    .maybeSingle()
  if (positionError) {
    return NextResponse.json({ error: 'Could not validate position' }, { status: 500 })
  }
  if (!position) {
    return NextResponse.json(
      { error: 'Select a valid position in this workspace' },
      { status: 400 }
    )
  }
  // Already a member? Nothing to do.
  const { data: existingMember, error: memberError } = await supabase
    .from('workspace_members')
    .select('user_id, profile:profiles!workspace_members_user_id_fkey(email)')
    .eq('workspace_id', workspaceId)
    .limit(1000)

  if (memberError) {
    return NextResponse.json({ error: 'Could not check workspace membership' }, { status: 500 })
  }
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

  const { data: pendingInvite, error: pendingInviteError } = await supabase
    .from('workspace_invites')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('email', email)
    .eq('status', 'pending')
    .maybeSingle()

  if (pendingInviteError) {
    return NextResponse.json(
      { error: 'Could not check for an existing invitation' },
      { status: 500 }
    )
  }
  if (pendingInvite) {
    return NextResponse.json(
      { error: 'There is already a pending invitation for that email address' },
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

  // RLS enforces that only a position holding `member.invite` can insert here.
  const { data: invite, error } = await supabase
    .from('workspace_invites')
    .insert({
      workspace_id: workspaceId,
      email,
      position_id: positionId,
      full_name: body.fullName.trim(),
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
      do {
        temporaryPassword = `Mira-${randomBytes(18).toString('base64url')}`
      } while (usedTemporaryPasswords.has(temporaryPassword))
      usedTemporaryPasswords.add(temporaryPassword)
      const { error: createError } = await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: body.fullName.trim() },
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

  const loginUrl = absoluteUrl('/')
  const bodyText = [
    `Hello ${body.fullName.trim()},`,
    '',
    `You have been invited to MIRA as a ${position.name}.`,
    '',
    'Login:',
    loginUrl,
    '',
    'Email:',
    email,
    temporaryPassword
      ? `\nTemporary password:\n${temporaryPassword}\n\nPlease change your password after logging in.`
      : existingAccountInTemporaryMode
        ? '\nSign in using your existing MIRA password.'
        : '',
    '',
    'Join workspace:',
    inviteUrl,
  ]
    .filter(Boolean)
    .join('\n')
  return NextResponse.json({
    ok: true,
    inviteId: invite.id,
    inviteUrl,
    fullName: body.fullName.trim(),
    positionName: position.name,
    temporaryPasswordCreated: temporaryAccountCreated,
    mailtoUrl: `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Your MIRA Account')}&body=${encodeURIComponent(bodyText)}`,
  })
}

export async function POST(request: NextRequest) {
  let body: {
    workspaceId?: unknown
    entries?: unknown
    preview?: unknown
    createTemporaryPassword?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 })
  }

  const workspaceId =
    typeof body.workspaceId === 'string' ? body.workspaceId.trim() : ''
  if (!workspaceId || !Array.isArray(body.entries)) {
    return NextResponse.json(
      { error: 'workspaceId and invitation entries are required' },
      { status: 400 }
    )
  }
  if (body.entries.length > 100) {
    return NextResponse.json(
      { error: 'Invite up to 100 people in one batch' },
      { status: 400 }
    )
  }

  const supabase = await createSupabaseServerClient('tenant')
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'You need to be signed in' }, { status: 401 })
  }

  const { data: owner, error: ownerError } = await supabase
    .from('workspace_owners')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (ownerError) {
    return NextResponse.json(
      { error: 'Could not verify workspace ownership' },
      { status: 500 }
    )
  }
  if (!owner) {
    return NextResponse.json(
      { error: 'Only this workspace’s Owner can invite multiple members' },
      { status: 403 }
    )
  }

  const seen = new Set<string>()
  const entries: (InvitationEntry & {
    rowId: string
    status: string
    message?: string
    positionName?: string
    mailtoUrl?: string
    temporaryPasswordCreated?: boolean
  })[] = []
  const rawEntries = body.entries as unknown[]
  const parsed = rawEntries.map((raw) => {
    const entry =
      raw && typeof raw === 'object'
        ? (raw as Record<string, unknown>)
        : {}
    return {
      rowId: typeof entry.rowId === 'string' ? entry.rowId : '',
      email: typeof entry.email === 'string' ? entry.email.trim().toLowerCase() : '',
      fullName: typeof entry.fullName === 'string' ? entry.fullName.trim() : '',
      positionId: typeof entry.positionId === 'string' ? entry.positionId.trim() : '',
    }
  })
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  const positionIds = [...new Set(parsed.map((entry) => entry.positionId).filter(Boolean))]
  const { data: validPositions, error: positionsError } = positionIds.length
    ? await supabase
        .from('positions')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .in('id', positionIds)
    : { data: [], error: null }
  if (positionsError) {
    return NextResponse.json({ error: 'Could not validate workspace positions' }, { status: 500 })
  }
  const positionNames = new Map((validPositions ?? []).map((position) => [position.id, position.name]))
  const validPositionIds = new Set(positionNames.keys())

  for (const entry of parsed) {
    if (!entry.email || !emailPattern.test(entry.email) || !entry.fullName || !entry.positionId) {
      entries.push({
        ...entry,
        status: 'invalid',
        positionName: positionNames.get(entry.positionId),
        message: 'Complete all fields with a valid email.',
      })
    } else if (seen.has(entry.email)) {
      entries.push({
        ...entry,
        status: 'duplicate',
        positionName: positionNames.get(entry.positionId),
        message: 'Duplicate email address.',
      })
    } else if (!validPositionIds.has(entry.positionId)) {
      entries.push({ ...entry, status: 'invalid', message: 'Select a valid workspace position.' })
      seen.add(entry.email)
    } else {
      entries.push({
        ...entry,
        status: 'ready',
        positionName: positionNames.get(entry.positionId),
      })
      seen.add(entry.email)
    }
  }

  const emails = [...new Set(entries.filter((entry) => entry.status === 'ready').map((entry) => entry.email))]
  const [{ data: members, error: membersError }, { data: pendingInvites, error: invitesError }] =
    emails.length
      ? await Promise.all([
          supabase
            .from('workspace_members')
            .select('profile:profiles!workspace_members_user_id_fkey(email)')
            .eq('workspace_id', workspaceId),
          supabase
            .from('workspace_invites')
            .select('email')
            .eq('workspace_id', workspaceId)
            .eq('status', 'pending')
            .in('email', emails),
        ])
      : [{ data: [], error: null }, { data: [], error: null }]
  if (membersError || invitesError) {
    return NextResponse.json({ error: 'Could not check existing workspace invitations' }, { status: 500 })
  }
  const memberEmails = new Set(
    (members ?? []).map(
      (member) =>
        (member as unknown as { profile: { email: string } | null }).profile?.email?.toLowerCase()
    )
  )
  const pendingEmails = new Set((pendingInvites ?? []).map((invite) => invite.email.toLowerCase()))
  for (const entry of entries) {
    if (entry.status !== 'ready') continue
    if (memberEmails.has(entry.email)) {
      entry.status = 'already_member'
      entry.message = 'Already a member'
    } else if (pendingEmails.has(entry.email)) {
      entry.status = 'already_invited'
      entry.message = 'Invitation already pending'
    }
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .select('seat_limit, status')
    .eq('id', workspaceId)
    .single()
  if (workspaceError || !workspace) {
    return NextResponse.json({ error: 'Could not validate workspace seat availability' }, { status: 500 })
  }
  if (workspace.status !== 'active') {
    return NextResponse.json(
      { error: 'This workspace is not currently accepting new members' },
      { status: 409 }
    )
  }
  const [
    { count: seatsUsed, error: seatsError },
    { count: pendingCount, error: pendingCountError },
  ] = await Promise.all([
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
  if (seatsError || pendingCountError) {
    return NextResponse.json({ error: 'Could not validate workspace seat availability' }, { status: 500 })
  }
  let availableSeats = Math.max(
    0,
    (workspace?.seat_limit ?? 0) - (seatsUsed ?? 0) - (pendingCount ?? 0)
  )
  for (const entry of entries) {
    if (entry.status !== 'ready') continue
    if (availableSeats <= 0) {
      entry.status = 'no_seats'
      entry.message = 'No workspace seats are available.'
    } else {
      availableSeats -= 1
    }
  }

  if (body.preview === true) {
    return NextResponse.json({ results: entries })
  }

  const headers = new Headers(request.headers)
  headers.set('content-type', 'application/json')
  headers.delete('content-length')
  const usedTemporaryPasswords = new Set<string>()

  for (const entry of entries) {
    if (entry.status !== 'ready') continue
    try {
      const singleRequest = new NextRequest(request.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          workspaceId,
          email: entry.email,
          fullName: entry.fullName,
          positionId: entry.positionId,
          createTemporaryPassword: body.createTemporaryPassword === true,
          rowId: entry.rowId,
        }),
      })
      const response = await postSingleInvite(singleRequest, usedTemporaryPasswords)
      const payload = (await response.json()) as {
        error?: string
        mailtoUrl?: string
        positionName?: string
        temporaryPasswordCreated?: boolean
      }
      if (response.ok) {
        entry.status = 'invited'
        entry.mailtoUrl = payload.mailtoUrl
        entry.positionName = payload.positionName
        entry.temporaryPasswordCreated = payload.temporaryPasswordCreated
      } else if (/already a member/i.test(payload.error ?? '')) {
        entry.status = 'already_member'
        entry.message = payload.error
      } else if (/pending invitation/i.test(payload.error ?? '')) {
        entry.status = 'already_invited'
        entry.message = 'Invitation already pending'
      } else {
        entry.status = 'failed'
        entry.message = payload.error ?? 'Invitation failed'
      }
    } catch {
      entry.status = 'failed'
      entry.message = 'Invitation failed'
    }
  }

  return NextResponse.json({ results: entries })
}
