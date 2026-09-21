import type { Metadata } from 'next'

import { OwnersPage } from '@/components/admin/owners-page'

export const metadata: Metadata = { title: 'Owners' }

export default function AdminOwnersPage() {
  return <OwnersPage />
}
