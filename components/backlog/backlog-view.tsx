'use client'

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ChevronDown,
  ChevronRight,
  Flag,
  GripVertical,
  Inbox,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Play,
  Plus,
  Trash2,
} from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { IssueRow } from '@/components/issues/issue-card'
import { BulkActionsBar } from '@/components/backlog/bulk-actions-bar'
import {
  CompleteSprintDialog,
  RetrospectiveDialog,
  SprintFormDialog,
  StartSprintDialog,
} from '@/components/sprints/sprint-dialogs'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Badge, EmptyState, Skeleton } from '@/components/ui/primitives'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { daysRemaining, formatSprintWindow } from '@/lib/format'
import { useReorderBacklog } from '@/lib/queries/issues'
import { useDeleteSprint } from '@/lib/queries/sprints'
import type { IssueSummary, Member, ProjectStatus, Sprint } from '@/lib/types/app'
import { arrayMove, cn, errorMessage, positionBetween, sum } from '@/lib/utils'

const BACKLOG = '__backlog__'

export function BacklogView({
  projectId,
  issues,
  sprints,
  statuses,
  members,
  isLoading,
  canWrite,
  canManageSprints,
  onOpenIssue,
  onCreateIssue,
}: {
  projectId: string
  issues: IssueSummary[]
  sprints: Sprint[]
  statuses: ProjectStatus[]
  members: Member[]
  isLoading?: boolean
  canWrite: boolean
  canManageSprints: boolean
  onOpenIssue: (issueId: string) => void
  onCreateIssue: (seed: { sprintId?: string | null }) => void
}) {
  const reorder = useReorderBacklog(projectId)
  const deleteSprint = useDeleteSprint(projectId)

  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({})
  const [selected, setSelected] = React.useState<string[]>([])

  const [sprintForm, setSprintForm] = React.useState<{ open: boolean; sprint: Sprint | null }>({
    open: false,
    sprint: null,
  })
  const [starting, setStarting] = React.useState<Sprint | null>(null)
  const [completing, setCompleting] = React.useState<Sprint | null>(null)
  const [retro, setRetro] = React.useState<Sprint | null>(null)
  const [deleting, setDeleting] = React.useState<Sprint | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    })
  )

  // Sections: the running sprint first, then anything planned, then backlog.
  const sections = React.useMemo(() => {
    const open = sprints
      .filter((sprint) => sprint.status !== 'completed')
      .sort((a, b) => {
        if (a.status === b.status) {
          return (a.start_date ?? a.created_at).localeCompare(b.start_date ?? b.created_at)
        }
        return a.status === 'active' ? -1 : 1
      })

    const grouped = new Map<string, IssueSummary[]>()
    grouped.set(BACKLOG, [])
    for (const sprint of open) grouped.set(sprint.id, [])

    for (const issue of issues) {
      // Sub-tasks are managed on their parent, not in the backlog list.
      if (issue.type === 'subtask') continue
      const key = issue.sprint_id && grouped.has(issue.sprint_id) ? issue.sprint_id : BACKLOG
      grouped.get(key)!.push(issue)
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => a.backlog_position - b.backlog_position)
    }

    return { open, grouped }
  }, [issues, sprints])

  const activeIssue = activeId ? issues.find((issue) => issue.id === activeId) ?? null : null
  const completedSprints = sprints.filter((sprint) => sprint.status === 'completed')

  function sectionOf(id: string): string | null {
    for (const [section, list] of sections.grouped) {
      if (list.some((issue) => issue.id === id)) return section
    }
    return null
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (!over) return

    const issueId = String(active.id)
    const overId = String(over.id)

    const from = sectionOf(issueId)
    const to = overId.startsWith('section:')
      ? overId.slice('section:'.length)
      : sectionOf(overId)
    if (!from || !to) return

    const list = sections.grouped.get(to) ?? []
    let before: number | undefined
    let after: number | undefined

    if (from === to) {
      const oldIndex = list.findIndex((issue) => issue.id === issueId)
      const newIndex = overId.startsWith('section:')
        ? list.length - 1
        : list.findIndex((issue) => issue.id === overId)
      if (oldIndex === newIndex || newIndex < 0) return
      const reordered = arrayMove(list, oldIndex, newIndex)
      before = reordered[newIndex - 1]?.backlog_position
      after = reordered[newIndex + 1]?.backlog_position
    } else {
      const insertAt = overId.startsWith('section:')
        ? list.length
        : Math.max(
            list.findIndex((issue) => issue.id === overId),
            0
          )
      before = list[insertAt - 1]?.backlog_position
      after = list[insertAt]?.backlog_position
    }

    try {
      await reorder.mutateAsync({
        issueId,
        backlogPosition: positionBetween(before, after),
        sprintId: from === to ? undefined : to === BACKLOG ? null : to,
      })
    } catch (error) {
      toast.error(errorMessage(error, 'Could not move the issue'))
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-3 sm:p-4">
        {[0, 1].map((section) => (
          <div key={section} className="space-y-1.5">
            <Skeleton className="h-10 w-full rounded-xl" />
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="space-y-4 p-3 pb-24 sm:p-4">
          {sections.open.map((sprint) => (
            <BacklogSection
              key={sprint.id}
              id={sprint.id}
              title={sprint.name}
              issues={sections.grouped.get(sprint.id) ?? []}
              collapsed={collapsed[sprint.id]}
              onToggle={() =>
                setCollapsed((prev) => ({ ...prev, [sprint.id]: !prev[sprint.id] }))
              }
              canWrite={canWrite}
              selected={selected}
              onSelectedChange={setSelected}
              onOpenIssue={onOpenIssue}
              onCreateIssue={() => onCreateIssue({ sprintId: sprint.id })}
              subtitle={
                <span className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
                  <span>{formatSprintWindow(sprint.start_date, sprint.end_date)}</span>
                  {sprint.status === 'active' ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge variant="outline">Planned</Badge>
                  )}
                  {sprint.status === 'active' && daysRemaining(sprint.end_date) != null ? (
                    <span>
                      {daysRemaining(sprint.end_date)! >= 0
                        ? `${daysRemaining(sprint.end_date)} days left`
                        : `${Math.abs(daysRemaining(sprint.end_date)!)} days over`}
                    </span>
                  ) : null}
                  {sprint.goal ? (
                    <span className="hidden truncate sm:inline">· {sprint.goal}</span>
                  ) : null}
                </span>
              }
              actions={
                canManageSprints ? (
                  <>
                    {sprint.status === 'planned' ? (
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => setStarting(sprint)}
                        disabled={sprints.some((s) => s.status === 'active')}
                      >
                        <Play />
                        Start
                      </Button>
                    ) : (
                      <Button variant="secondary" size="xs" onClick={() => setCompleting(sprint)}>
                        <Flag />
                        Complete
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-xs" aria-label="Sprint actions">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => setSprintForm({ open: true, sprint })}
                        >
                          <Pencil />
                          Edit sprint
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setRetro(sprint)}>
                          <NotebookPen />
                          Retrospective notes
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onSelect={() => setDeleting(sprint)}>
                          <Trash2 />
                          Delete sprint
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                ) : null
              }
            />
          ))}

          <BacklogSection
            id={BACKLOG}
            title="Backlog"
            issues={sections.grouped.get(BACKLOG) ?? []}
            collapsed={collapsed[BACKLOG]}
            onToggle={() => setCollapsed((prev) => ({ ...prev, [BACKLOG]: !prev[BACKLOG] }))}
            canWrite={canWrite}
            selected={selected}
            onSelectedChange={setSelected}
            onOpenIssue={onOpenIssue}
            onCreateIssue={() => onCreateIssue({ sprintId: null })}
            subtitle={
              <span className="text-2xs text-muted-foreground">
                Everything not yet committed to a sprint
              </span>
            }
            actions={
              canManageSprints ? (
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => setSprintForm({ open: true, sprint: null })}
                >
                  <Plus />
                  New sprint
                </Button>
              ) : null
            }
            emptyMessage="Nothing in the backlog. Create an issue to get started."
          />

          {completedSprints.length ? (
            <section className="rounded-xl border border-border bg-surface">
              <header className="flex items-center gap-2 border-b border-border px-3 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Completed sprints
                </h3>
                <Badge variant="neutral">{completedSprints.length}</Badge>
              </header>
              <ul className="divide-y divide-border">
                {completedSprints
                  .slice()
                  .reverse()
                  .map((sprint) => (
                    <li
                      key={sprint.id}
                      className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs"
                    >
                      <span className="font-medium">{sprint.name}</span>
                      <span className="text-muted-foreground">
                        {formatSprintWindow(sprint.start_date, sprint.end_date)}
                      </span>
                      <Badge variant="outline">
                        {sprint.completed_points ?? 0}/{sprint.committed_points ?? 0} pts
                      </Badge>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="ml-auto"
                        onClick={() => setRetro(sprint)}
                      >
                        <NotebookPen />
                        {sprint.retrospective ? 'Retrospective' : 'Add notes'}
                      </Button>
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}
        </div>

        <DragOverlay>
          {activeIssue ? (
            <div className="rounded-lg border border-primary/40 bg-surface shadow-lg">
              <IssueRow issue={activeIssue} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <BulkActionsBar
        projectId={projectId}
        selectedIds={selected}
        onClear={() => setSelected([])}
        statuses={statuses}
        sprints={sprints}
        members={members}
        canWrite={canWrite}
      />

      <SprintFormDialog
        projectId={projectId}
        sprint={sprintForm.sprint}
        open={sprintForm.open}
        onOpenChange={(open) => setSprintForm((prev) => ({ ...prev, open }))}
      />
      <StartSprintDialog
        projectId={projectId}
        sprint={starting}
        issues={starting ? sections.grouped.get(starting.id) ?? [] : []}
        open={Boolean(starting)}
        onOpenChange={(open) => (open ? null : setStarting(null))}
      />
      <CompleteSprintDialog
        projectId={projectId}
        sprint={completing}
        issues={completing ? issues.filter((i) => i.sprint_id === completing.id) : []}
        sprints={sprints}
        open={Boolean(completing)}
        onOpenChange={(open) => (open ? null : setCompleting(null))}
      />
      <RetrospectiveDialog
        projectId={projectId}
        sprint={retro}
        open={Boolean(retro)}
        onOpenChange={(open) => (open ? null : setRetro(null))}
        canEdit={canManageSprints}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => (open ? null : setDeleting(null))}
        title={`Delete ${deleting?.name}?`}
        description="Issues in this sprint move back to the backlog. The sprint and its retrospective notes are removed."
        confirmLabel="Delete sprint"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try {
            await deleteSprint.mutateAsync(deleting.id)
            toast.success(`${deleting.name} deleted`)
            setDeleting(null)
          } catch (error) {
            toast.error(errorMessage(error, 'Could not delete the sprint'))
          }
        }}
      />
    </>
  )
}

function BacklogSection({
  id,
  title,
  subtitle,
  issues,
  collapsed,
  onToggle,
  actions,
  canWrite,
  selected,
  onSelectedChange,
  onOpenIssue,
  onCreateIssue,
  emptyMessage = 'Drag issues here.',
}: {
  id: string
  title: string
  subtitle?: React.ReactNode
  issues: IssueSummary[]
  collapsed?: boolean
  onToggle: () => void
  actions?: React.ReactNode
  canWrite: boolean
  selected: string[]
  onSelectedChange: (ids: string[]) => void
  onOpenIssue: (issueId: string) => void
  onCreateIssue: () => void
  emptyMessage?: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `section:${id}` })
  const points = sum(issues.map((issue) => issue.story_points))
  const done = issues.filter((issue) => issue.status?.category === 'done').length

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-raised px-2 py-2 sm:px-3">
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
        </button>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          {subtitle}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="outline" className="tabular-nums">
            {issues.length} {issues.length === 1 ? 'issue' : 'issues'}
          </Badge>
          {points > 0 ? (
            <Badge variant="neutral" className="tabular-nums">
              {points} pts
            </Badge>
          ) : null}
          {done > 0 ? (
            <Badge variant="success" className="tabular-nums">
              {done} done
            </Badge>
          ) : null}
          {actions}
        </div>
      </header>

      {collapsed ? null : (
        <div
          ref={setNodeRef}
          className={cn('min-h-12 transition-colors', isOver && 'bg-primary-subtle/50')}
        >
          <SortableContext
            items={issues.map((issue) => issue.id)}
            strategy={verticalListSortingStrategy}
          >
            {issues.map((issue) => (
              <SortableBacklogRow
                key={issue.id}
                issue={issue}
                disabled={!canWrite}
                selected={selected.includes(issue.id)}
                onSelectedChange={(isSelected) =>
                  onSelectedChange(
                    isSelected
                      ? [...selected, issue.id]
                      : selected.filter((item) => item !== issue.id)
                  )
                }
                onOpen={onOpenIssue}
              />
            ))}
          </SortableContext>

          {!issues.length ? (
            <EmptyState
              icon={<Inbox />}
              title="Nothing here"
              description={emptyMessage}
              compact
              className="m-2 border-0 bg-transparent"
            />
          ) : null}

          {canWrite ? (
            <button
              type="button"
              onClick={onCreateIssue}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Plus className="size-3.5" />
              Create issue
            </button>
          ) : null}
        </div>
      )}
    </section>
  )
}

function SortableBacklogRow({
  issue,
  disabled,
  selected,
  onSelectedChange,
  onOpen,
}: {
  issue: IssueSummary
  disabled: boolean
  selected: boolean
  onSelectedChange: (selected: boolean) => void
  onOpen: (issueId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
    disabled,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && 'opacity-40')}
    >
      <IssueRow
        issue={issue}
        onOpen={onOpen}
        selected={selected}
        onSelectedChange={disabled ? undefined : onSelectedChange}
        dragHandle={
          disabled ? null : (
            <button
              type="button"
              className="shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground active:cursor-grabbing"
              aria-label={`Reorder ${issue.title}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-3.5" />
            </button>
          )
        }
      />
    </div>
  )
}
