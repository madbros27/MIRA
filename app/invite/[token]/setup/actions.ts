'use server'

import { cookies } from 'next/headers'

import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function finishInvitePasswordSetup() {
  const supabase = await createSupabaseServerClient('tenant')
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Your invitation session has expired. Start again from the invitation email.' }
  }

  const cookieStore = await cookies()
  cookieStore.delete({ name: 'mira-invite-setup', path: '/invite' })
  return { error: null }
}