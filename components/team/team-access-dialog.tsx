'use client'

import { Briefcase, Check, Search, ShieldCheck, Users } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Avatar, Badge, EmptyState } from '@/components/ui/primitives'
import type { TeamAccessConfig } from '@/lib/permissions/team-access'
import { useUpdateTeamAccessConfig } from '@/lib/queries/team-access'
import type { Member, Position } from '@/lib/types/app'
import { displayName } from '@/lib/utils'

export function TeamAccessDialog({
  workspaceId,
  ownerUserId,
  open,
  onOpenChange,
  members,
  positions,
  currentConfig,
}: {
  workspaceId: string
  ownerUserId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  members: Member[]
  positions: Position[]
  currentConfig?: TeamAccessConfig
}) {
  const updateConfig = useUpdateTeamAccessConfig(workspaceId, ownerUserId)

  const [search, setSearch] = React.useState('')
  const [config, setConfig] = React.useState<TeamAccessConfig>({
    directoryMemberIds: [],
    positionsMemberIds: [],
    directoryPositionIds: [],
    positionsPositionIds: [],
  })

  // Synchronize state when dialog opens or config updates
  React.useEffect(() => {
    if (open && currentConfig) {
      setConfig({
        directoryMemberIds: [...(currentConfig.directoryMemberIds ?? [])],
        positionsMemberIds: [...(currentConfig.positionsMemberIds ?? [])],
        directoryPositionIds: [...(currentConfig.directoryPositionIds ?? [])],
        positionsPositionIds: [...(currentConfig.positionsPositionIds ?? [])],
      })
      setSearch('')
    }
  }, [open, currentConfig])

  // Filter members by search
  const filteredMembers = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    return (members ?? []).filter((member) => {
      // Exclude owners from access restrictions (owners always have full access)
      if (member.is_owner) return false
      if (!term) return true
      const name = displayName(member.profile).toLowerCase()
      const email = (member.profile?.email ?? '').toLowerCase()
      return name.includes(term) || email.includes(term)
    })
  }, [members, search])

  // Toggle position access
  const togglePositionDirectory = (positionId: string) => {
    setConfig((prev) => {
      const exists = prev.directoryPositionIds.includes(positionId)
      return {
        ...prev,
        directoryPositionIds: exists
          ? prev.directoryPositionIds.filter((id) => id !== positionId)
          : [...prev.directoryPositionIds, positionId],
      }
    })
  }

  const togglePositionPositions = (positionId: string) => {
    setConfig((prev) => {
      const exists = prev.positionsPositionIds.includes(positionId)
      return {
        ...prev,
        positionsPositionIds: exists
          ? prev.positionsPositionIds.filter((id) => id !== positionId)
          : [...prev.positionsPositionIds, positionId],
      }
    })
  }

  // Toggle member access
  const toggleMemberDirectory = (userId: string) => {
    setConfig((prev) => {
      const exists = prev.directoryMemberIds.includes(userId)
      return {
        ...prev,
        directoryMemberIds: exists
          ? prev.directoryMemberIds.filter((id) => id !== userId)
          : [...prev.directoryMemberIds, userId],
      }
    })
  }

  const toggleMemberPositions = (userId: string) => {
    setConfig((prev) => {
      const exists = prev.positionsMemberIds.includes(userId)
      return {
        ...prev,
        positionsMemberIds: exists
          ? prev.positionsMemberIds.filter((id) => id !== userId)
          : [...prev.positionsMemberIds, userId],
      }
    })
  }

  const handleSave = async () => {
    try {
      await updateConfig.mutateAsync(config)
      toast.success('Team access settings updated successfully')
      onOpenChange(false)
    } catch {
      toast.error('Failed to update team access settings')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" aria-hidden />
            Manage Team Access &amp; Visibility
          </DialogTitle>
          <DialogDescription>
            Control who can view the <strong>Directory</strong> and <strong>Positions</strong> tabs
            under Team. Non-owners with access can only manage positions and permissions of people
            who report directly or indirectly to them.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4 py-2">
          <Tabs defaultValue="positions">
            <TabsList className="w-full">
              <TabsTrigger value="positions" className="flex-1 gap-2">
                <Briefcase className="size-3.5" />
                By Position
              </TabsTrigger>
              <TabsTrigger value="members" className="flex-1 gap-2">
                <Users className="size-3.5" />
                By Individual Member
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: BY POSITION */}
            <TabsContent value="positions" className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Grant Directory and Positions visibility to anyone holding these positions:
              </p>

              {!positions?.length ? (
                <EmptyState
                  icon={<Briefcase />}
                  title="No positions available"
                  description="Create positions first in the Positions tab."
                />
              ) : (
                <div className="max-h-80 overflow-y-auto divide-y divide-border rounded-lg border border-border bg-surface">
                  {positions.map((pos) => {
                    const hasDir = config.directoryPositionIds.includes(pos.id)
                    const hasPos = config.positionsPositionIds.includes(pos.id)
                    const memberCount =
                      members?.filter((m) => m.position_id === pos.id).length ?? 0

                    return (
                      <div
                        key={pos.id}
                        className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{pos.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {memberCount} member{memberCount === 1 ? '' : 's'} assigned
                            {pos.description ? ` · ${pos.description}` : ''}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-4 text-xs">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <span className="text-muted-foreground">Directory</span>
                            <Switch
                              checked={hasDir}
                              onCheckedChange={() => togglePositionDirectory(pos.id)}
                            />
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <span className="text-muted-foreground">Positions</span>
                            <Switch
                              checked={hasPos}
                              onCheckedChange={() => togglePositionPositions(pos.id)}
                            />
                          </label>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </TabsContent>

            {/* TAB 2: BY MEMBER */}
            <TabsContent value="members" className="mt-4 space-y-3">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search team members by name or email…"
                  className="pl-9"
                  aria-label="Search members"
                />
              </div>

              {!filteredMembers.length ? (
                <EmptyState
                  icon={<Users />}
                  title="No matching members"
                  description={
                    search ? 'Try a different search term.' : 'No non-owner members found.'
                  }
                />
              ) : (
                <div className="max-h-80 overflow-y-auto divide-y divide-border rounded-lg border border-border bg-surface">
                  {filteredMembers.map((member) => {
                    const posId = member.position_id
                    const viaPositionDir = Boolean(
                      posId && config.directoryPositionIds.includes(posId)
                    )
                    const viaPositionPos = Boolean(
                      posId && config.positionsPositionIds.includes(posId)
                    )

                    const hasDir =
                      config.directoryMemberIds.includes(member.user_id) || viaPositionDir
                    const hasPos =
                      config.positionsMemberIds.includes(member.user_id) || viaPositionPos

                    return (
                      <div
                        key={member.user_id}
                        className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          <Avatar
                            id={member.user_id}
                            name={displayName(member.profile)}
                            src={member.profile?.avatar_url}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 text-sm font-medium">
                              <span className="truncate">{displayName(member.profile)}</span>
                              {member.position?.name ? (
                                <Badge variant="outline" size="sm">
                                  {member.position.name}
                                </Badge>
                              ) : null}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {member.profile?.email}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-4 text-xs">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <span className="text-muted-foreground">Directory</span>
                            <Switch
                              checked={hasDir}
                              disabled={viaPositionDir}
                              onCheckedChange={() => toggleMemberDirectory(member.user_id)}
                            />
                            {viaPositionDir ? (
                              <span className="text-2xs text-muted-foreground">(via role)</span>
                            ) : null}
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <span className="text-muted-foreground">Positions</span>
                            <Switch
                              checked={hasPos}
                              disabled={viaPositionPos}
                              onCheckedChange={() => toggleMemberPositions(member.user_id)}
                            />
                            {viaPositionPos ? (
                              <span className="text-2xs text-muted-foreground">(via role)</span>
                            ) : null}
                          </label>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogBody>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            loading={updateConfig.isPending}
            className="gap-1.5"
          >
            <Check className="size-4" />
            Save Access Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
