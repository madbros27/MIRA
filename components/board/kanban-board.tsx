'use client'

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { restrictToWindowEdges } from '@dnd-kit/modifiers'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertTriangle, Plus } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { IssueCard, IssueCardSkeleton } from '@/components/issues/issue-card'
import { CategoryDot } from '@/components/issues/issue-atoms'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/primitives'
import { useMoveIssue } from '@/lib/queries/issues'
import type { IssueSummary, ProjectStatus } from '@/lib/types/app'
import { arrayMove, cn, errorMessage, sum } from '@/lib/utils'

type BoardProps = {
  projectId: string
  statuses: ProjectStatus[]
  issues: IssueSummary[]
  isLoading?: boolean
  canWrite: boolean
  onOpenIssue: (issueId: string) => void
  onCreateInStatus?: (statusId: string) => void
  /** Rendered when a column has no cards and no filters are active. */
  emptyHint?: React.ReactNode
}

export function KanbanBoard({
  projectId,
  statuses,
  issues,
  isLoading,
  canWrite,
  onOpenIssue,
  onCreateInStatus,
  emptyHint,
}: BoardProps) {
  const { move } = useMoveIssue(projectId)
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [overColumn, setOverColumn] = React.useState<string | null>(null)

  const sensors = useSensors(
    // A small distance threshold keeps a tap on a card a click, not a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    // Space drives keyboard dragging; Enter is left free to open the card.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    })
  )

  const grouped = React.useMemo(() => {
    const map = new Map<string, IssueSummary[]>()
    for (const status of statuses) map.set(status.id, [])
    for (const issue of issues) {
      const bucket = map.get(issue.status_id)
      if (bucket) bucket.push(issue)
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.board_position - b.board_position)
    }
    return map
  }, [issues, statuses])

  const activeIssue = activeId ? issues.find((issue) => issue.id === activeId) ?? null : null

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragOver(event: DragOverEvent) {
    const data = event.over?.data.current as
      | { type: 'column'; statusId: string }
      | { type: 'card'; issue: IssueSummary }
      | undefined
    if (!data) return setOverColumn(null)
    setOverColumn(data.type === 'column' ? data.statusId : data.issue.status_id)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    setOverColumn(null)
    if (!over) return

    const issueId = String(active.id)
    const issue = issues.find((item) => item.id === issueId)
    if (!issue) return

    const overData = over.data.current as
      | { type: 'column'; statusId: string }
      | { type: 'card'; issue: IssueSummary }
      | undefined
    if (!overData) return

    const targetStatusId =
      overData.type === 'column' ? overData.statusId : overData.issue.status_id
    const column = grouped.get(targetStatusId) ?? []

    let before: number | undefined
    let after: number | undefined

    if (targetStatusId === issue.status_id) {
      const oldIndex = column.findIndex((item) => item.id === issueId)
      const newIndex =
        overData.type === 'card'
          ? column.findIndex((item) => item.id === overData.issue.id)
          : column.length - 1

      if (oldIndex === newIndex || newIndex < 0) return

      const reordered = arrayMove(column, oldIndex, newIndex)
      before = reordered[newIndex - 1]?.board_position
      after = reordered[newIndex + 1]?.board_position
    } else {
      const insertAt =
        overData.type === 'card'
          ? Math.max(column.findIndex((item) => item.id === overData.issue.id), 0)
          : column.length
      before = column[insertAt - 1]?.board_position
      after = column[insertAt]?.board_position
    }

    try {
      await move({ issueId, statusId: targetStatusId, before, after })
    } catch (error) {
      toast.error(errorMessage(error, 'Could not move the issue'))
    }
  }

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto px-3 pb-4 sm:px-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="w-[85vw] shrink-0 space-y-2 xs:w-72 md:w-[17.5rem]">
            <div className="shimmer h-8 rounded-lg" />
            <IssueCardSkeleton />
            <IssueCardSkeleton lines={1} />
            <IssueCardSkeleton />
          </div>
        ))}
      </div>
    )
  }

  if (!statuses.length) {
    return (
      <div className="p-4">
        <EmptyState
          title="This project has no workflow columns"
          description="Add statuses in project settings to start using the board."
        />
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      modifiers={[restrictToWindowEdges]}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null)
        setOverColumn(null)
      }}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => `Picked up issue ${active.id}.`,
          onDragOver: ({ over }) =>
            over ? `Hovering over ${over.id}.` : 'No drop target.',
          onDragEnd: ({ over }) =>
            over ? `Dropped onto ${over.id}.` : 'Drag cancelled.',
          onDragCancel: () => 'Drag cancelled, the issue was returned.',
        },
      }}
    >
      {/*
        Mobile: one column fills the viewport and the rail snaps between them.
        Desktop: fixed-width columns side by side.
      */}
      <div className="snap-rail flex h-full items-start gap-3 overflow-x-auto px-3 pb-4 sm:px-4">
        {statuses.map((status) => (
          <BoardColumn
            key={status.id}
            status={status}
            issues={grouped.get(status.id) ?? []}
            activeId={activeId}
            isOver={overColumn === status.id}
            canWrite={canWrite}
            onOpenIssue={onOpenIssue}
            onCreate={onCreateInStatus}
            emptyHint={emptyHint}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.22,1,0.36,1)' }}>
        {activeIssue ? (
          <div className="w-[85vw] xs:w-72 md:w-[17.5rem]">
            <IssueCard issue={activeIssue} overlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function BoardColumn({
  status,
  issues,
  activeId,
  isOver,
  canWrite,
  onOpenIssue,
  onCreate,
  emptyHint,
}: {
  status: ProjectStatus
  issues: IssueSummary[]
  activeId: string | null
  isOver: boolean
  canWrite: boolean
  onOpenIssue: (issueId: string) => void
  onCreate?: (statusId: string) => void
  emptyHint?: React.ReactNode
}) {
  const { setNodeRef } = useDroppable({
    id: `column:${status.id}`,
    data: { type: 'column', statusId: status.id },
  })

  const points = sum(issues.map((issue) => issue.story_points))
  const overLimit = status.wip_limit != null && issues.length > status.wip_limit

  return (
    <section
      className="flex h-full w-[85vw] shrink-0 flex-col xs:w-72 md:w-[17.5rem]"
      aria-label={`${status.name}, ${issues.length} issues`}
    >
      <header
        className={cn(
          'sticky top-0 z-10 flex items-center gap-2 rounded-lg bg-surface-sunken px-2.5 py-2',
          overLimit && 'bg-warning-subtle'
        )}
      >
        <CategoryDot category={status.category} />
        <h3 className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide">
          {status.name}
        </h3>
        <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-muted-foreground">
          {issues.length}
          {status.wip_limit != null ? `/${status.wip_limit}` : ''}
        </span>
        {points > 0 ? (
          <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
            {points}p
          </span>
        ) : null}
      </header>

      {overLimit ? (
        <p className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-warning-subtle px-2 py-1 text-2xs font-medium text-warning">
          <AlertTriangle className="size-3" />
          Over the WIP limit of {status.wip_limit}
        </p>
      ) : null}

      <div
        ref={setNodeRef}
        className={cn(
          'mt-1.5 min-h-24 flex-1 space-y-2 rounded-xl p-1 transition-colors',
          isOver ? 'bg-primary-subtle/60 ring-1 ring-primary/30' : 'bg-transparent'
        )}
      >
        <SortableContext
          items={issues.map((issue) => issue.id)}
          strategy={verticalListSortingStrategy}
        >
          {issues.map((issue) => (
            <SortableIssueCard
              key={issue.id}
              issue={issue}
              disabled={!canWrite}
              dragging={activeId === issue.id}
              onOpen={onOpenIssue}
            />
          ))}
        </SortableContext>

        {!issues.length ? (
          <div className="rounded-xl border border-dashed border-border px-3 py-6 text-center">
            <p className="text-2xs text-muted-foreground">
              {emptyHint ?? 'Nothing here yet.'}
            </p>
          </div>
        ) : null}
      </div>

      {canWrite && onCreate ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 w-full justify-start"
          onClick={() => onCreate(status.id)}
        >
          <Plus />
          Add issue
        </Button>
      ) : null}
    </section>
  )
}

function SortableIssueCard({
  issue,
  disabled,
  dragging,
  onOpen,
}: {
  issue: IssueSummary
  disabled: boolean
  dragging: boolean
  onOpen: (issueId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
    disabled,
    data: { type: 'card', issue },
  })

  return (
    <IssueCard
      ref={setNodeRef}
      issue={issue}
      onOpen={onOpen}
      dragging={dragging || isDragging}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onKeyDown={(event) => {
        // Enter opens the issue, Space hands over to the keyboard sensor.
        if (event.key === 'Enter') {
          event.preventDefault()
          onOpen(issue.id)
          return
        }
        listeners?.onKeyDown?.(event)
      }}
    />
  )
}
