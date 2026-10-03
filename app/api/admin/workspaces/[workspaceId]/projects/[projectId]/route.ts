import { NextResponse } from 'next/server'

import { errorResponse, requireAdminApi } from '@/lib/auth/api'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; projectId: string }> }
) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { workspaceId, projectId } = await params
  const { data: storagePaths, error } = await auth.context.supabase.rpc('admin_delete_project', {
    p_workspace: workspaceId,
    p_project: projectId,
  })
  if (error) return errorResponse(error, 'Failed to delete project')

  let storageCleanupFailed = false
  for (let offset = 0; offset < storagePaths.length; offset += 100) {
    try {
      const { error: storageError } = await auth.context.service.storage
        .from('attachments')
        .remove(storagePaths.slice(offset, offset + 100))
      if (storageError) storageCleanupFailed = true
    } catch {
      storageCleanupFailed = true
    }
  }

  return NextResponse.json({
    success: true,
    warning: storageCleanupFailed
      ? 'The project was deleted, but some attachment files could not be removed from storage.'
      : null,
  })
}
