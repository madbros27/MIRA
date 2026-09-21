'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/workspace-cookie'

/**
 * The active workspace is a cookie rather than a URL segment: it keeps every
 * route short (`/projects/MIRA/board`) and survives a refresh, while the server
 * shell can still resolve membership before rendering.
 */
export async function setActiveWorkspace(workspaceId: string) {
  const store = await cookies()
  store.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
  })
  revalidatePath('/', 'layout')
}
