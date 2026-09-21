import type { Metadata } from 'next'

import { UsersPage } from '@/components/admin/users-page'

export const metadata: Metadata = { title: 'Users' }

export default function AdminUsersPage() {
  return <UsersPage />
}
