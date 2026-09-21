import { redirect } from 'next/navigation'

import { AppShell } from '@/components/layout/app-shell'
import { ImpersonationBanner } from '@/components/layout/impersonation-banner'
import { WorkspaceProvider } from '@/components/providers/workspace-provider'
import { getTenantContext } from '@/lib/auth/session'
import type { WorkspaceWithAccess } from '@/lib/types/app'
import type { Capability } from '@/lib/permissions/capabilities'

import { NoWorkspace } from './no-workspace'

// Every tenant route depends on the session cookie and the active-workspace
// cookie, so there is nothing worth prerendering.
export const dynamic = 'force-dynamic'

/**
 * Server-rendered tenant shell.
 *
 * Resolving the session, the profile, the workspace list *and the capability
 * set* here means the sidebar is correct on first paint and the client never
 * has to guess what the viewer may do. This is also the second of the three
 * places the portals are kept apart: a System Administrator who lands here
 * without an open support session is sent back to their own portal.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const result = await getTenantContext()

  if (result.status === 'unauthenticated') redirect('/login')
  if (result.status === 'platform-admin') redirect('/miraadmin/dashboard')
  if (result.status === 'no-workspace') {
    return <NoWorkspace email={result.user.email ?? ''} />
  }

  const { user, profile, access, active, impersonation } = result.context

  const workspaces: WorkspaceWithAccess[] = access.map((entry) => ({
    ...entry.workspace,
    // The legacy coarse role is only ever a label now.
    role: entry.isOwner ? 'admin' : (entry.position?.slug === 'admin' ? 'admin' : 'member'),
    isOwner: entry.isOwner,
    position: entry.position
      ? { id: entry.position.id, name: entry.position.name, slug: entry.position.slug }
      : null,
    capabilities: entry.capabilities as Capability[],
  }))

  return (
    <WorkspaceProvider
      userId={user.id}
      initialProfile={profile}
      initialWorkspaces={workspaces}
      activeWorkspaceId={active.workspace.id}
      impersonation={impersonation}
    >
      {impersonation ? (
        <ImpersonationBanner
          workspaceName={active.workspace.name}
          expiresAt={impersonation.expiresAt}
        />
      ) : null}
      <AppShell>{children}</AppShell>
    </WorkspaceProvider>
  )
}
