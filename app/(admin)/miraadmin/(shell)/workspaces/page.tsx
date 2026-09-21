import type { Metadata } from 'next'
import * as React from 'react'

import { WorkspacesPage } from '@/components/admin/workspaces-page'

export const metadata: Metadata = { title: 'Workspaces' }

export default function AdminWorkspacesPage() {
  return (
    <React.Suspense>
      <WorkspacesPage />
    </React.Suspense>
  )
}
