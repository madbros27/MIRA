'use client'

import { Crown, MoreHorizontal, Search, UserMinus, Users } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/controls'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { Avatar, Badge, Card, EmptyState, Skeleton } from '@/components/ui/primitives'
import { formatDate } from '@/lib/format'
import { can, type Grants } from '@/lib/permissions'
import {
  useAssignPosition,
  useMembers,
  usePositions,
  useRemoveMember,
  useSetMemberStatus,
  useSetReportsTo,
} from '@/lib/queries/workspaces'
import type { Member } from '@/lib/types/app'
import { displayName, errorMessage } from '@/lib/utils'

const NO_MANAGER = '__none__'

/**
 * The team directory: who is here, what position they hold, who they report
 * to, and whether their seat is active.
 *
 * Changing a position needs `member.assign_position`; removing somebody needs
 * `member.remove`. Both are re-checked by RLS, so a viewer without them sees
 * a plain read-only list rather than controls that would fail.
 */
export function MembersDirectory({
  workspaceId,
  caps,
  currentUserId,
}: {
  workspaceId: string
  caps: Grants
  currentUserId: string
}) {
  const { data: members, isLoading } = useMembers(workspaceId)
  const { data: positions } = usePositions(workspaceId)

  const assignPosition = useAssignPosition(workspaceId)
  const setReportsTo = useSetReportsTo(workspaceId)
  const setStatus = useSetMemberStatus(workspaceId)
  const removeMember = useRemoveMember(workspaceId)

  const [search, setSearch] = React.useState('')
  const [positionFilter, setPositionFilter] = React.useState('all')
  const [removing, setRemoving] = React.useState<Member | null>(null)

  const mayAssign = can.assignPositions(caps)
  const mayRemove = can.removeMembers(caps)

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    return (members ?? []).filter((member) => {
      if (positionFilter !== 'all' && member.position_id !== positionFilter) return false
      if (!term) return true
      const name = displayName(member.profile).toLowerCase()
      return name.includes(term) || (member.profile?.email ?? '').toLowerCase().includes(term)
    })
  }, [members, positionFilter, search])

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action()
      toast.success(success)
    } catch (caught) {
      toast.error('That did not work', { description: errorMessage(caught) })
    }
  }

  if (isLoading) {
    return (
      <Card className="divide-y divide-border">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 p-4">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-8 w-32 rounded-lg" />
          </div>
        ))}
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search your team…"
            className="pl-9"
            aria-label="Search team members"
          />
        </div>
        <Select value={positionFilter} onValueChange={setPositionFilter}>
          <SelectTrigger className="sm:w-52" aria-label="Filter by position">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All positions</SelectItem>
            {(positions ?? []).map((position) => (
              <SelectItem key={position.id} value={position.id}>
                {position.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!filtered.length ? (
        <EmptyState
          icon={<Users />}
          title={search || positionFilter !== 'all' ? 'Nobody matches' : 'Nobody here yet'}
          description={
            search || positionFilter !== 'all'
              ? 'Try a different name, or clear the position filter.'
              : 'Invite your first colleague to get started.'
          }
        />
      ) : (
        <Card className="divide-y divide-border">
          {filtered.map((member) => {
            const isSelf = member.user_id === currentUserId
            const canEditThisMember = mayAssign && !member.is_owner
            const manager = members?.find(
              (candidate) => candidate.user_id === member.reports_to_user_id
            )

            return (
              <div
                key={member.user_id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar
                    id={member.user_id}
                    name={displayName(member.profile)}
                    src={member.profile?.avatar_url}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{displayName(member.profile)}</span>
                      {member.is_owner ? (
                        <Badge variant="primary" title="Owner of this workspace">
                          <Crown className="size-2.5" aria-hidden />
                          Owner
                        </Badge>
                      ) : null}
                      {isSelf ? <Badge variant="outline">You</Badge> : null}
                      {member.status === 'invited' ? (
                        <Badge variant="info">Invited</Badge>
                      ) : member.status === 'suspended' ? (
                        <Badge variant="danger">Suspended</Badge>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {member.profile?.email}
                      {manager ? ` · reports to ${displayName(manager.profile)}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {canEditThisMember ? (
                    <Select
                      value={member.position_id ?? ''}
                      onValueChange={(value) =>
                        void run(
                          () =>
                            assignPosition.mutateAsync({
                              userId: member.user_id,
                              positionId: value,
                            }),
                          `${displayName(member.profile)} is now ${
                            positions?.find((position) => position.id === value)?.name ??
                            'reassigned'
                          }`
                        )
                      }
                    >
                      <SelectTrigger
                        className="w-40"
                        aria-label={`Position for ${displayName(member.profile)}`}
                      >
                        <SelectValue placeholder="No position" />
                      </SelectTrigger>
                      <SelectContent>
                        {(positions ?? []).map((position) => (
                          <SelectItem key={position.id} value={position.id}>
                            {position.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" size="md">
                      {member.is_owner ? 'Full control' : (member.position?.name ?? 'No position')}
                    </Badge>
                  )}

                  {(canEditThisMember || mayRemove) && !isSelf ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`More actions for ${displayName(member.profile)}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        {canEditThisMember ? (
                          <>
                            <DropdownMenuLabel>Reports to</DropdownMenuLabel>
                            <div className="px-2 pb-2">
                              <select
                                value={member.reports_to_user_id ?? NO_MANAGER}
                                onChange={(event) =>
                                  void run(
                                    () =>
                                      setReportsTo.mutateAsync({
                                        userId: member.user_id,
                                        reportsTo:
                                          event.target.value === NO_MANAGER
                                            ? null
                                            : event.target.value,
                                      }),
                                    'Reporting line updated'
                                  )
                                }
                                className="h-8 w-full rounded-md border border-input bg-surface px-2 text-xs"
                              >
                                <option value={NO_MANAGER}>Nobody</option>
                                {(members ?? [])
                                  .filter((candidate) => candidate.user_id !== member.user_id)
                                  .map((candidate) => (
                                    <option key={candidate.user_id} value={candidate.user_id}>
                                      {displayName(candidate.profile)}
                                    </option>
                                  ))}
                              </select>
                            </div>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() =>
                                void run(
                                  () =>
                                    setStatus.mutateAsync({
                                      userId: member.user_id,
                                      status:
                                        member.status === 'suspended' ? 'active' : 'suspended',
                                    }),
                                  member.status === 'suspended'
                                    ? 'Seat reactivated'
                                    : 'Seat suspended'
                                )
                              }
                            >
                              {member.status === 'suspended'
                                ? 'Reactivate seat'
                                : 'Suspend seat'}
                            </DropdownMenuItem>
                          </>
                        ) : null}

                        {mayRemove && !member.is_owner ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onSelect={(event) => {
                                event.preventDefault()
                                setRemoving(member)
                              }}
                            >
                              <UserMinus className="size-4" aria-hidden />
                              Remove from workspace
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </div>
            )
          })}
        </Card>
      )}

      {members?.length ? (
        <p className="text-center text-2xs text-muted-foreground">
          {members.filter((member) => member.status === 'active').length} active ·{' '}
          {members.filter((member) => member.status === 'invited').length} invited
          {filtered.length !== members.length ? ` · showing ${filtered.length}` : ''}
        </p>
      ) : null}

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${displayName(removing?.profile)}?`}
        description={
          <>
            They lose access to this workspace immediately and their seat is
            freed. Issues they created and comments they wrote stay exactly
            where they are
            {removing?.joined_at ? ` (joined ${formatDate(removing.joined_at)})` : ''}.
          </>
        }
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (!removing) return
          await run(
            () => removeMember.mutateAsync(removing.user_id),
            `${displayName(removing.profile)} removed`
          )
          setRemoving(null)
        }}
      />
    </div>
  )
}
