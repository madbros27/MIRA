import { NextResponse, type NextRequest } from 'next/server'

import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient('tenant')
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'You need to be signed in' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { password?: string }
  if (!body.password) return NextResponse.json({ error: 'Password is required' }, { status: 400 })

  if (
    body.password.length < 8 ||
    !/[a-zA-Z]/.test(body.password) ||
    !/[\d\W]/.test(body.password)
  ) {
    return NextResponse.json(
      { error: 'Pick a password that satisfies all three rules.' },
      { status: 400 }
    )
  }

  const admin = createSupabaseAdminClient()
  const { error: passwordError } = await supabase.auth.updateUser({ password: body.password })
  if (passwordError) return NextResponse.json({ error: passwordError.message }, { status: 400 })

  const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, mira_must_change_password: false },
  })
  if (metadataError) return NextResponse.json({ error: metadataError.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}