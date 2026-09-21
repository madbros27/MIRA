import type { Metadata } from 'next'

import { ChangePasswordForm } from '@/components/admin/change-password-form'
import { requirePlatformAdmin } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Change password' }
export const dynamic = 'force-dynamic'

export default async function AdminPasswordPage() {
  const { admin } = await requirePlatformAdmin()
  return <ChangePasswordForm mustChange={admin.must_change_password} />
}
