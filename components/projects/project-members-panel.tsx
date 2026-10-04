'use client'

import {
  Briefcase,
  ChevronDown,
  Info,
  Search,
  Shield,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { useProjectContext } from './project-provider'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/controls'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/controls'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/menu'
import { Avatar, Badge, Card, EmptyState, Skeleton } from '@/components/ui/primitives'
import { getAssignablePositions, getSubordinateUserIds } from '@/lib/permissions/team-access'
import {
  useAddProjectMember,
  useProjectMembers,
  useRemoveProjectMember,
} from '@/lib/queries/project-members'
import { useAssignPosition, useMembers, usePositions } from '@/lib/queries/workspaces'
import { displayName, errorMessage } from '@/lib/utils'

/**
 * Who can reach this project.
 *
 * Supports batch multi-user selection, displays available workspace positions,
 * and enforces the reporting hierarchy: non-owners can only edit positions of
 * people who report to them, while workspace owners have full control.
 */
export function ProjectMembersPanel() {
  const { projectId, project } = useProjectContext()
  const { workspaceId, userId, isOwner, caps } = useWorkspaceContext()

  const { data: projectMembers, isLoading } = useProjectMembers(projectId)
  const { data: workspaceMembers } = useMembers(workspaceId)
  const { data: positions } = usePositions(workspaceId)

  const addMember = useAddProjectMember(projectId ?? '')
  const removeMember = useRemoveProjectMember(projectId ?? '')
  const assignPosition = useAssignPosition(workspaceId)

  // Multi-user candidate selection state
  const [selectedUserIds, setSelectedUserIds] = React.useState<string[]>([])
  const [selectedPositionId, setSelectedPositionId] = React.useState<string>('default')
  const [candidateSearch, setCandidateSearch] = React.useState('')
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [isAdding, setIsAdding] = React.useState(false)

  const candidates = React.useMemo(() => {
    const alreadyIn = new Set((projectMembers ?? []).map((member) => member.user_id))
    return (workspaceMembers ?? []).filter(
      (member) => member.status === 'active' && !alreadyIn.has(member.user_id)
    )
  }, [workspaceMembers, projectMembers])

  const filteredCandidates = React.useMemo(() => {
    const term = candidateSearch.trim().toLowerCase()
    if (!term) return candidates
    return candidates.filter((member) => {
      const name = displayName(member.profile).toLowerCase()
      const email = (member.profile?.email ?? '').toLowerCase()
      const pos = (member.position?.name ?? '').toLowerCase()
      return name.includes(term) || email.includes(term) || pos.includes(term)
    })
  }, [candidates, candidateSearch])

  // Subordinates reporting directly or indirectly to current user
  const subordinates = React.useMemo(
    () => getSubordinateUserIds(workspaceMembers ?? [], userId),
    [workspaceMembers, userId]
  )

  // Positions allowed to be assigned by this viewer
  const assignablePositions = React.useMemo(
    () => getAssignablePositions(caps, positions ?? [], isOwner),
    [caps, positions, isOwner]
  )

  const toggleCandidate = (candidateUserId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(candidateUserId)
        ? prev.filter((id) => id !== candidateUserId)
        : [...prev, candidateUserId]
    )
  }

  const selectAllCandidates = () => {
    setSelectedUserIds(filteredCandidates.map((c) => c.user_id))
  }

  const clearSelectedCandidates = () => {
    setSelectedUserIds([])
  }

  async function handleAddSelected() {
    if (!selectedUserIds.length) return
    setIsAdding(true)

    try {
      await Promise.all(
        selectedUserIds.map(async (uid) => {
          await addMember.mutateAsync({ userId: uid, projectRole: 'member' })
          if (selectedPositionId !== 'default') {
            await assignPosition.mutateAsync({
              userId: uid,
              positionId: selectedPositionId,
            })
          }
        })
      )

      toast.success(
        `Added ${selectedUserIds.length} member${selectedUserIds.length === 1 ? '' : 's'} to ${project?.name ?? 'the project'}`
      )
      setSelectedUserIds([])
      setSelectedPositionId('default')
      setPickerOpen(false)
    } catch (caught) {
      toast.error('Could not add members', { description: errorMessage(caught) })
    } finally {
      setIsAdding(false)
    }
  }

  async function handlePositionChange(targetUserId: string, newPositionId: string) {
    try {
      await assignPosition.mutateAsync({
        userId: targetUserId,
        positionId: newPositionId === '__none__' ? null : newPositionId,
      })
      const posName = positions?.find((p) => p.id === newPositionId)?.name ?? 'No position'
      toast.success(`Position updated to ${posName}`)
    } catch (caught) {
      toast.error('Could not change position', { description: errorMessage(caught) })
    }
  }

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action()
      toast.success(success)
    } catch (caught) {
      toast.error('That did not work', { description: errorMessage(caught) })
    }
  }

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-start gap-2.5 rounded-lg border border-info/30 bg-info-subtle px-3.5 py-3">
        <Info className="mt-px size-4 shrink-0 text-info" aria-hidden />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Only the people listed here can open{' '}
          <strong className="font-medium text-foreground">{project?.name}</strong>.
          Workspace membership on its own is not enough — owners and workspace admins are the
          exception because their position grants <em>View all projects</em>.
        </p>
      </div>

      {!isOwner ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary-subtle/30 px-3.5 py-2.5 text-xs text-muted-foreground">
          <Shield className="size-4 shrink-0 text-primary" aria-hidden />
          <span>
            <strong>Reporting hierarchy active:</strong> You can only edit positions or remove
            team members who report directly or indirectly to you. Higher-level management and
            peers are protected.
          </span>
        </div>
      ) : null}

      {/* Multi-candidate Add Section ------------------------------------ */}
      <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        {/* Multi-select candidate popover picker */}
        <div className="flex-1">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between border border-input bg-surface font-normal text-left h-9 hover:bg-muted/50"
                aria-label="Add members from your workspace"
              >
                <span className="flex items-center gap-2 truncate text-sm">
                  <Users className="size-4 shrink-0 text-muted-foreground" />
                  {selectedUserIds.length === 0 ? (
                    <span className="text-muted-foreground">
                      {candidates.length
                        ? 'Select workspace members to add…'
                        : 'Everyone is already on this project'}
                    </span>
                  ) : (
                    <span className="font-medium text-foreground">
                      {selectedUserIds.length} member{selectedUserIds.length === 1 ? '' : 's'}{' '}
                      selected
                    </span>
                  )}
                </span>
                <ChevronDown className="size-4 shrink-0 opacity-60" />
              </Button>
            </PopoverTrigger>

            <PopoverContent className="w-80 sm:w-96 p-2" align="start">
              <div className="space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search candidates…"
                    value={candidateSearch}
                    onChange={(e) => setCandidateSearch(e.target.value)}
                    className="h-8 pl-8 text-xs"
                    autoFocus
                  />
                </div>

                <div className="flex items-center justify-between px-1 text-2xs text-muted-foreground">
                  <span>
                    {selectedUserIds.length} of {candidates.length} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllCandidates}
                      className="text-primary hover:underline font-medium"
                    >
                      Select all
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={clearSelectedCandidates}
                      className="text-muted-foreground hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto divide-y divide-border rounded-md border border-border">
                  {!filteredCandidates.length ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      No matching candidates found
                    </div>
                  ) : (
                    filteredCandidates.map((candidate) => {
                      const isChecked = selectedUserIds.includes(candidate.user_id)
                      return (
                        <div
                          key={candidate.user_id}
                          onClick={() => toggleCandidate(candidate.user_id)}
                          className="flex cursor-pointer items-center gap-2.5 p-2 transition-colors hover:bg-muted/60"
                        >
                          <Checkbox checked={isChecked} onCheckedChange={() => {}} />
                          <Avatar
                            id={candidate.user_id}
                            name={displayName(candidate.profile)}
                            src={candidate.profile?.avatar_url}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-foreground">
                              {displayName(candidate.profile)}
                            </p>
                            <p className="truncate text-2xs text-muted-foreground">
                              {candidate.profile?.email}
                            </p>
                          </div>
                          {candidate.position?.name ? (
                            <Badge variant="outline" size="sm" className="shrink-0 text-2xs">
                              {candidate.position.name}
                            </Badge>
                          ) : null}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Position to assign */}
        <Select value={selectedPositionId} onValueChange={setSelectedPositionId}>
          <SelectTrigger className="sm:w-48" aria-label="Position for added members">
            <SelectValue placeholder="Position" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Keep current position</SelectItem>
            {(assignablePositions ?? []).map((pos) => (
              <SelectItem key={pos.id} value={pos.id}>
                {pos.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Add button */}
        <Button
          variant="primary"
          disabled={selectedUserIds.length === 0 || isAdding}
          loading={isAdding}
          onClick={handleAddSelected}
          className="shrink-0 gap-1.5"
        >
          <UserPlus className="size-4" aria-hidden />
          Add {selectedUserIds.length > 0 ? `(${selectedUserIds.length})` : ''}
        </Button>
      </Card>

      {/* Selected members chips indicator */}
      {selectedUserIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-2xs text-muted-foreground mr-1">Selected to add:</span>
          {selectedUserIds.map((uid) => {
            const mem = workspaceMembers?.find((m) => m.user_id === uid)
            return (
              <Badge key={uid} variant="neutral" className="gap-1 text-xs">
                <span>{displayName(mem?.profile)}</span>
                <button
                  type="button"
                  onClick={() => toggleCandidate(uid)}
                  className="rounded-full hover:bg-muted-foreground/20 p-0.5"
                  aria-label={`Remove ${displayName(mem?.profile)} from selection`}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            )
          })}
        </div>
      ) : null}

      {/* Project Roster -------------------------------------------------- */}
      {isLoading ? (
        <Card className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 p-3.5">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-8 w-28 rounded-lg" />
            </div>
          ))}
        </Card>
      ) : !projectMembers?.length ? (
        <EmptyState
          icon={<UserPlus />}
          title="Nobody is on this project yet"
          description="Add the people who should be able to see and work on it."
        />
      ) : (
        <Card className="divide-y divide-border">
          {projectMembers.map((member) => {
            const isLead = member.user_id === project?.lead_id
            const isSelf = member.user_id === userId
            const workspaceMember = workspaceMembers?.find((wm) => wm.user_id === member.user_id)
            const isSubordinate = subordinates.has(member.user_id)

            // Hierarchy Rule:
            // Workspace owner can change anyone's position/removal.
            // Non-owners can ONLY change positions or remove people who report to them!
            const canEditPosition = isOwner || isSubordinate
            const canRemoveMember = (isOwner || isSubordinate) && !isLead && !isSelf

            return (
              <div key={member.id} className="flex flex-wrap items-center gap-3 p-3.5">
                <Avatar
                  id={member.user_id}
                  name={displayName(member.profile)}
                  src={member.profile?.avatar_url}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {displayName(member.profile)}
                    {isLead ? <Badge variant="primary">Lead</Badge> : null}
                    {workspaceMember?.is_owner ? (
                      <Badge variant="primary" title="Workspace Owner">
                        Owner
                      </Badge>
                    ) : null}
                    {isSelf ? <Badge variant="outline">You</Badge> : null}
                    {!isOwner && isSubordinate ? (
                      <Badge variant="neutral" size="sm">
                        Reports to you
                      </Badge>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.profile?.email}
                  </p>
                </div>

                {/* Available Positions Dropdown (Hierarchical) */}
                <div className="flex shrink-0 items-center gap-2">
                  {canEditPosition ? (
                    <Select
                      value={workspaceMember?.position_id ?? '__none__'}
                      onValueChange={(value) => handlePositionChange(member.user_id, value)}
                    >
                      <SelectTrigger
                        className="w-44"
                        aria-label={`Position for ${displayName(member.profile)}`}
                      >
                        <SelectValue placeholder="No position" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No position</SelectItem>
                        {(assignablePositions ?? []).map((position) => (
                          <SelectItem key={position.id} value={position.id}>
                            {position.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" size="md">
                      {workspaceMember?.is_owner
                        ? 'Full control'
                        : (workspaceMember?.position?.name ?? 'No position')}
                    </Badge>
                  )}

                  {canRemoveMember ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${displayName(member.profile)} from the project`}
                      className="text-destructive hover:bg-destructive-subtle"
                      onClick={() =>
                        void run(
                          () => removeMember.mutateAsync(member.user_id),
                          `${displayName(member.profile)} removed from the project`
                        )
                      }
                    >
                      <X className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </Card>
      )}

      {/* Available positions reference */}
      <div className="rounded-lg bg-muted p-3.5 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground flex items-center gap-1.5">
          <Briefcase className="size-3.5 text-primary" />
          Workspace Positions &amp; Capabilities
        </p>
        <p>
          Positions define permissions across all projects and issues. Workspace owners have full
          authority to update any member&apos;s position. Team leads and managers can control positions
          for members in their reporting line.
        </p>
      </div>
    </div>
  )
}
