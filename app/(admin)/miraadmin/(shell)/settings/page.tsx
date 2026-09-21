import type { Metadata } from 'next'

import { AdminSettingsPage } from '@/components/admin/settings-page'
import { requirePlatformAdmin } from '@/lib/auth/session'
import { allowPublicSignup, getAppUrl } from '@/lib/supabase/env'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Platform settings' }
export const dynamic = 'force-dynamic'

export default async function AdminSettingsRoute() {
  const { admin } = await requirePlatformAdmin()

  const supabase = await createSupabaseServerClient()
  const { count } = await supabase
    .from('platform_admins')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)

  return (
    <AdminSettingsPage
      admin={admin}
      appUrl={getAppUrl()}
      publicSignup={allowPublicSignup()}
      adminCount={count ?? 1}
    />
  )
}
