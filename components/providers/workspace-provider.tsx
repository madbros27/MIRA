'use client'

/**
 * Holds "who am I, where am I, and what may I do" for the whole tenant app:
 * the signed-in profile, the workspaces they belong to, the active one, and
 * the capability set their position grants there.
 *
 * The initial value is rendered on the server so the shell never flashes an
 * empty sidebar, then kept fresh by React Query.
 *
 * `caps` is the thing components should read. It mirrors `has_capability()`
 * in Postgres, and it already accounts for a read-only (archived) workspace
 * and for a System Administrator looking in through a support session.
 */

import * as React from 'react'

import { makeGrants, type Grants } from '@/lib/permissions/capabilities'
import { useProfile, useWorkspaces } from '@/lib/queries/workspaces'
import type { Profile, WorkspaceWithAccess } from '@/lib/types/app'
import type { WorkspaceRole } from '@/lib/types/database'

export type ImpersonationInfo = {
  sessionId: string
  expiresAt: string
}

export type WorkspaceContextValue = {
  userId: string
  profile: Profile | null
  workspaces: WorkspaceWithAccess[]
  workspace: WorkspaceWithAccess | null
  workspaceId: string
  /** Legacy coarse role. Use `caps` to gate anything. */
  role: WorkspaceRole | undefined
  caps: Grants
  isOwner: boolean
  /** True while a System Administrator is viewing this tenant read-only. */
  impersonation: ImpersonationInfo | null
  /** Archived or expired workspaces render normally but accept no writes. */
  readOnly: boolean
  isLoading: boolean
}

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({
  userId,
  initialProfile,
  initialWorkspaces,
  activeWorkspaceId,
  impersonation = null,
  children,
}: {
  userId: string
  initialProfile: Profile | null
  initialWorkspaces: WorkspaceWithAccess[]
  activeWorkspaceId: string
  impersonation?: ImpersonationInfo | null
  children: React.ReactNode
}) {
  const { data: profile, isLoading: profileLoading } = useProfile()
  // A support session reads one workspace that the admin is not a member of,
  // so the membership query would come back empty. Skip it entirely.
  const { data: workspaces, isLoading: workspacesLoading } = useWorkspaces(
    impersonation ? undefined : userId
  )

  const value = React.useMemo<WorkspaceContextValue>(() => {
    const list = workspaces?.length ? workspaces : initialWorkspaces
    const workspace =
      list.find((item) => item.id === activeWorkspaceId) ?? list[0] ?? null

    const writable = workspace?.status === 'active'
    const caps = makeGrants({
      isOwner: workspace?.isOwner ?? false,
      writable,
      impersonating: Boolean(impersonation),
      capabilities: workspace?.capabilities ?? [],
    })

    return {
      userId,
      profile: profile ?? initialProfile,
      workspaces: list,
      workspace,
      workspaceId: workspace?.id ?? activeWorkspaceId,
      role: workspace?.role,
      caps,
      isOwner: workspace?.isOwner ?? false,
      impersonation,
      readOnly: !writable || Boolean(impersonation),
      isLoading: profileLoading || workspacesLoading,
    }
  }, [
    activeWorkspaceId,
    impersonation,
    initialProfile,
    initialWorkspaces,
    profile,
    profileLoading,
    userId,
    workspaces,
    workspacesLoading,
  ])

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspaceContext() {
  const context = React.useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspaceContext must be used inside <WorkspaceProvider>')
  }
  return context
}

/** Convenience: the bits almost every component needs. */
export function useCurrentUser() {
  const { userId, profile, role, caps, isOwner } = useWorkspaceContext()
  return { userId, profile, role, caps, isOwner }
}

/** Just the capability set, for components that gate but do not render identity. */
export function useCapabilities() {
  return useWorkspaceContext().caps
}
