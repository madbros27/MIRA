import type { Metadata } from 'next'

import { WorkspaceDetail } from '@/components/admin/workspace-detail'

export const metadata: Metadata = { title: 'Workspace' }

export default async function AdminWorkspaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <WorkspaceDetail workspaceId={id} />
}
