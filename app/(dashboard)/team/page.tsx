'use client'

import { Lock, ShieldCheck } from 'lucide-react'
import * as React from 'react'

import { InvitationsPanel } from '@/components/team/invitations-panel'
import { MembersDirectory } from '@/components/team/members-directory'
import { OrgChart } from '@/components/team/org-chart'
import { PositionsEditor } from '@/components/team/positions-editor'
import { TeamAccessDialog } from '@/components/team/team-access-dialog'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls'
import { EmptyState } from '@/components/ui/primitives'
import { can } from '@/lib/permissions'
import { hasDirectoryAccess, hasPositionsAccess } from '@/lib/permissions/team-access'
import { useTeamAccessConfig } from '@/lib/queries/team-access'
import { useMembers, usePositions } from '@/lib/queries/workspaces'

/**
 * Team — people, positions and invitations for one workspace.
 *
 * Directory and Positions are restricted by default; the workspace owner can grant
 * view access to specific positions or individual members. Members with access
 * can only manage positions and permissions of people who report to them.
 */
export default function TeamPage() {
  const { workspaceId, workspace, caps, userId, isOwner } = useWorkspaceContext()
  const { data: members } = useMembers(workspaceId)
  const { data: positions } = usePositions(workspaceId)
  const { data: accessConfig } = useTeamAccessConfig(workspaceId)

  const [accessModalOpen, setAccessModalOpen] = React.useState(false)

  const currentMember = members?.find((m) => m.user_id === userId)
  const positionId = currentMember?.position_id

  const canViewDirectory = hasDirectoryAccess(userId, positionId, accessConfig, isOwner)
  const canViewPositions = hasPositionsAccess(userId, positionId, accessConfig, isOwner)

  const seatsUsed = (members ?? []).filter((member) => member.status === 'active').length
  const seatLimit = workspace?.seat_limit ?? 0

  const mayInvite = can.inviteMembers(caps)

  const availableTabs = React.useMemo(() => {
    const list: string[] = []
    if (canViewDirectory) list.push('directory')
    if (canViewPositions) list.push('positions')
    if (mayInvite || isOwner) list.push('invitations')
    list.push('org')
    return list
  }, [canViewDirectory, canViewPositions, mayInvite, isOwner])

  const defaultTab = availableTabs[0] ?? 'org'
  const [tab, setTab] = React.useState<string>(defaultTab)
  const userChangedTabRef = React.useRef(false)

  React.useEffect(() => {
    if (!userChangedTabRef.current) {
      setTab(defaultTab)
    } else if (!availableTabs.includes(tab)) {
      setTab(defaultTab)
    }
  }, [availableTabs, defaultTab, tab])

  const handleTabChange = (value: string) => {
    userChangedTabRef.current = true
    setTab(value)
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
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
        </div>

        {isOwner ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAccessModalOpen(true)}
            className="shrink-0 gap-1.5"
          >
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            Manage Team Access
          </Button>
        ) : null}
      </header>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList className="w-full overflow-x-auto sm:w-auto">
          {canViewDirectory ? <TabsTrigger value="directory">Directory</TabsTrigger> : null}
          {canViewPositions ? <TabsTrigger value="positions">Positions</TabsTrigger> : null}
          {mayInvite || isOwner ? <TabsTrigger value="invitations">Invitations</TabsTrigger> : null}
          <TabsTrigger value="org">Org chart</TabsTrigger>
        </TabsList>

        {canViewDirectory ? (
          <TabsContent value="directory" className="mt-5">
            <MembersDirectory
              workspaceId={workspaceId}
              caps={caps}
              currentUserId={userId}
              isOwner={isOwner}
              canViewDirectory={canViewDirectory}
            />
          </TabsContent>
        ) : null}

        {canViewPositions ? (
          <TabsContent value="positions" className="mt-5">
            <PositionsEditor
              workspaceId={workspaceId}
              caps={caps}
              currentUserId={userId}
              isOwner={isOwner}
              canViewPositions={canViewPositions}
            />
          </TabsContent>
        ) : null}

        <TabsContent value="invitations" className="mt-5">
          {mayInvite ? (
            <InvitationsPanel
              workspaceId={workspaceId}
              caps={caps}
              isOwner={isOwner}
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

      {isOwner ? (
        <TeamAccessDialog
          workspaceId={workspaceId}
          ownerUserId={userId}
          open={accessModalOpen}
          onOpenChange={setAccessModalOpen}
          members={members ?? []}
          positions={positions ?? []}
          currentConfig={accessConfig}
        />
      ) : null}
    </div>
  )
}
