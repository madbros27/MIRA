'use client'

import { Trash2, X } from 'lucide-react'
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
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { ISSUE_PRIORITIES, PRIORITY_META } from '@/lib/constants'
import { can } from '@/lib/permissions'
import { useBulkUpdateIssues, useDeleteIssue } from '@/lib/queries/issues'
import type { Member, ProjectStatus, Sprint } from '@/lib/types/app'
import type { IssuePriority } from '@/lib/types/database'
import { displayName, errorMessage } from '@/lib/utils'

const NONE = '__none__'

/**
 * Floating bar for bulk edits. It appears only once something is selected, and
 * sits above the mobile bottom navigation.
 */
export function BulkActionsBar({
  projectId,
  selectedIds,
  onClear,
  statuses,
  sprints,
  members,
  canWrite,
}: {
  projectId: string
  selectedIds: string[]
  onClear: () => void
  statuses: ProjectStatus[]
  sprints: Sprint[]
  members: Member[]
  canWrite: boolean
}) {
  const { caps } = useWorkspaceContext()
  const bulk = useBulkUpdateIssues(projectId)
  const remove = useDeleteIssue(projectId)
  const [confirming, setConfirming] = React.useState(false)

  if (!selectedIds.length || !canWrite) return null

  async function apply(patch: Parameters<typeof bulk.mutateAsync>[0]['patch'], label: string) {
    try {
      await bulk.mutateAsync({ ids: selectedIds, patch })
      toast.success(`${selectedIds.length} issues: ${label}`)
      onClear()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not apply the change'))
    }
  }

  return (
    <>
      <div
        role="region"
        aria-label="Bulk actions"
        className="fixed inset-x-0 bottom-bottom-nav z-30 px-3 pb-3 md:bottom-0 md:px-4 md:pb-4"
      >
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2 shadow-lg animate-slide-up">
          <span className="ml-1 text-xs font-semibold tabular-nums">
            {selectedIds.length} selected
          </span>

          <Select onValueChange={(value) => apply({ status_id: value }, 'status updated')}>
            <SelectTrigger size="sm" className="w-auto min-w-28" aria-label="Set status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((status) => (
                <SelectItem key={status.id} value={status.id}>
                  {status.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            onValueChange={(value) =>
              apply({ assignee_id: value === NONE ? null : value }, 'assignee updated')
            }
          >
            <SelectTrigger size="sm" className="w-auto min-w-28" aria-label="Set assignee">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Unassigned</SelectItem>
              {members.map((member) => (
                <SelectItem key={member.user_id} value={member.user_id}>
                  {displayName(member.profile)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            onValueChange={(value) =>
              apply({ sprint_id: value === NONE ? null : value }, 'sprint updated')
            }
          >
            <SelectTrigger size="sm" className="w-auto min-w-28" aria-label="Set sprint">
              <SelectValue placeholder="Sprint" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Backlog</SelectItem>
              {sprints
                .filter((sprint) => sprint.status !== 'completed')
                .map((sprint) => (
                  <SelectItem key={sprint.id} value={sprint.id}>
                    {sprint.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          <Select
            onValueChange={(value) =>
              apply({ priority: value as IssuePriority }, 'priority updated')
            }
          >
            <SelectTrigger size="sm" className="w-auto min-w-24" aria-label="Set priority">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              {ISSUE_PRIORITIES.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {PRIORITY_META[priority].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-1">
            {can.deleteAnyIssue(caps) ? (
              <Button
                variant="destructive-ghost"
                size="sm"
                onClick={() => setConfirming(true)}
              >
                <Trash2 />
                Delete
              </Button>
            ) : null}
            <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Clear selection">
              <X />
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${selectedIds.length} issues?`}
        description="Their comments, attachments and sub-tasks are removed too. This cannot be undone."
        confirmLabel={`Delete ${selectedIds.length} issues`}
        destructive
        onConfirm={async () => {
          try {
            for (const id of selectedIds) await remove.mutateAsync(id)
            toast.success(`${selectedIds.length} issues deleted`)
            onClear()
            setConfirming(false)
          } catch (error) {
            toast.error(errorMessage(error, 'Could not delete every issue'))
          }
        }}
      />
    </>
  )
}
