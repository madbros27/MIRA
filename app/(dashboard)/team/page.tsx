'use client'

import { Lock } from 'lucide-react'
import * as React from 'react'

import { InvitationsPanel } from '@/components/team/invitations-panel'
import { MembersDirectory } from '@/components/team/members-directory'
import { OrgChart } from '@/components/team/org-chart'
import { PositionsEditor } from '@/components/team/positions-editor'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls'
import { EmptyState } from '@/components/ui/primitives'
import { can } from '@/lib/permissions'
import { useMembers } from '@/lib/queries/workspaces'

/**
 * Team — people, positions and invitations for one workspace.
 *
 * Reachable by anyone in the workspace (a directory is not secret); the
 * controls inside appear according to the viewer's capabilities, and RLS
 * refuses the write regardless if the UI ever gets it wrong.
 */
export default function TeamPage() {
  const { workspaceId, workspace, caps, userId, isOwner } = useWorkspaceContext()
  const { data: members } = useMembers(workspaceId)

  const seatsUsed = (members ?? []).filter((member) => member.status === 'active').length
  const seatLimit = workspace?.seat_limit ?? 0

  const mayManagePositions = can.managePositions(caps)
  const mayInvite = can.inviteMembers(caps)

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Team</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Who works here, what each position is allowed to do, and who is still
          waiting on an invitation.
          {seatLimit ? (
            <>
              {' '}
              Your plan covers{' '}
              <strong className="font-medium text-foreground">
                {seatsUsed} of {seatLimit}
              </strong>{' '}
              seats.
            </>
          ) : null}
        </p>
      </header>

      <Tabs defaultValue="directory">
        <TabsList className="w-full overflow-x-auto sm:w-auto">
          <TabsTrigger value="directory">Directory</TabsTrigger>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="invitations">Invitations</TabsTrigger>
          <TabsTrigger value="org">Org chart</TabsTrigger>
        </TabsList>

        <TabsContent value="directory" className="mt-5">
          <MembersDirectory
            workspaceId={workspaceId}
            caps={caps}
            currentUserId={userId}
          />
        </TabsContent>

        <TabsContent value="positions" className="mt-5">
          {mayManagePositions || isOwner ? (
            <PositionsEditor workspaceId={workspaceId} caps={caps} />
          ) : (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                You can see how each position is configured, but only someone
                with <strong className="font-medium">Manage positions</strong>{' '}
                can change it.
              </p>
              <PositionsEditor workspaceId={workspaceId} caps={caps} />
            </>
          )}
        </TabsContent>

        <TabsContent value="invitations" className="mt-5">
          {mayInvite ? (
            <InvitationsPanel
              workspaceId={workspaceId}
              caps={caps}
              seatsUsed={seatsUsed}
              seatLimit={seatLimit}
            />
          ) : (
            <EmptyState
              icon={<Lock />}
              title="Invitations are managed by HR"
              description="Your position does not include inviting people. Ask an owner, a workspace admin or HR to send one."
            />
          )}
        </TabsContent>

        <TabsContent value="org" className="mt-5">
          <OrgChart workspaceId={workspaceId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
