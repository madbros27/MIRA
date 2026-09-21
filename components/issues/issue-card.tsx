'use client'

import { CalendarClock, GitBranch, MessageSquare } from 'lucide-react'
import * as React from 'react'

import {
  IssueKeyBadge,
  IssueTypeIcon,
  LabelChip,
  PriorityIcon,
  StoryPoints,
} from './issue-atoms'
import { Avatar } from '@/components/ui/primitives'
import { formatDueDate, isOverdue } from '@/lib/format'
import type { IssueSummary } from '@/lib/types/app'
import { cn, issueKey } from '@/lib/utils'

export const IssueCard = React.forwardRef<
  HTMLDivElement,
  {
    issue: IssueSummary
    onOpen?: (issueId: string) => void
    dragging?: boolean
    overlay?: boolean
    selected?: boolean
    className?: string
  } & React.ComponentProps<'div'>
>(function IssueCard(
  { issue, onOpen, dragging, overlay, selected, className, ...props },
  ref
) {
  const key = issueKey(issue.project?.key, issue.issue_number)
  const done = issue.status?.category === 'done'
  const overdue = !done && isOverdue(issue.due_date)
  const due = formatDueDate(issue.due_date)

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={`${key}: ${issue.title}`}
      onClick={() => onOpen?.(issue.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen?.(issue.id)
        }
      }}
      className={cn(
        'group cursor-pointer select-none rounded-xl border border-border bg-surface p-2.5 text-left shadow-xs transition-[box-shadow,border-color,opacity] hover:border-border-strong hover:shadow-sm',
        dragging && 'opacity-40',
        overlay && 'rotate-1 cursor-grabbing border-primary/40 shadow-lg',
        selected && 'border-primary ring-1 ring-primary',
        className
      )}
      {...props}
    >
      <div className="flex items-start gap-2">
        <IssueTypeIcon type={issue.type} className="mt-0.5" />
        <p
          className={cn(
            'min-w-0 flex-1 text-[0.8125rem] font-medium leading-snug',
            done && 'text-muted-foreground line-through decoration-muted-foreground/40'
          )}
        >
          {issue.title}
        </p>
      </div>

      {issue.labels.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {issue.labels.slice(0, 3).map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
          {issue.labels.length > 3 ? (
            <span className="text-2xs text-muted-foreground">
              +{issue.labels.length - 3}
            </span>
          ) : null}
        </div>
      ) : null}

      {overdue && due ? (
        <p className="mt-2 inline-flex items-center gap-1 rounded bg-destructive-subtle px-1.5 py-0.5 text-2xs font-medium text-destructive">
          <CalendarClock className="size-3" />
          {due}
        </p>
      ) : null}

      <div className="mt-2.5 flex items-center gap-2">
        <IssueKeyBadge issueKey={key} />
        <PriorityIcon priority={issue.priority} className="size-3.5" />

        {issue.subtask_count > 0 ? (
          <span className="inline-flex items-center gap-0.5 text-2xs text-muted-foreground">
            <GitBranch className="size-3" />
            {issue.subtask_count}
          </span>
        ) : null}

        {issue.comment_count > 0 ? (
          <span className="inline-flex items-center gap-0.5 text-2xs text-muted-foreground">
            <MessageSquare className="size-3" />
            {issue.comment_count}
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-1.5">
          <StoryPoints points={issue.story_points} />
          <Avatar
            id={issue.assignee?.id ?? 'unassigned'}
            name={issue.assignee?.full_name ?? issue.assignee?.email ?? null}
            src={issue.assignee?.avatar_url}
            size="sm"
          />
        </div>
      </div>
    </div>
  )
})

export function IssueCardSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-2.5">
      <div className="flex items-start gap-2">
        <div className="shimmer mt-0.5 size-4 shrink-0 rounded" />
        <div className="flex-1 space-y-1.5">
          {Array.from({ length: lines }).map((_, i) => (
            <div
              key={i}
              className="shimmer h-3 rounded"
              style={{ width: i === lines - 1 ? '60%' : '100%' }}
            />
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="shimmer h-2.5 w-14 rounded" />
        <div className="shimmer ml-auto size-6 rounded-full" />
      </div>
    </div>
  )
}

/** Compact row used by the backlog, search results and sprint planning. */
export function IssueRow({
  issue,
  onOpen,
  selected,
  onSelectedChange,
  trailing,
  dragHandle,
  className,
  showProject = false,
}: {
  issue: IssueSummary
  onOpen?: (issueId: string) => void
  selected?: boolean
  onSelectedChange?: (selected: boolean) => void
  trailing?: React.ReactNode
  dragHandle?: React.ReactNode
  className?: string
  showProject?: boolean
}) {
  const key = issueKey(issue.project?.key, issue.issue_number)
  const done = issue.status?.category === 'done'
  const overdue = !done && isOverdue(issue.due_date)

  return (
    <div
      className={cn(
        'group flex items-center gap-2 border-b border-border bg-surface px-2 py-1.5 last:border-b-0 hover:bg-muted/50',
        selected && 'bg-primary-subtle/40',
        className
      )}
    >
      {onSelectedChange ? (
        <input
          type="checkbox"
          checked={Boolean(selected)}
          onChange={(event) => onSelectedChange(event.target.checked)}
          className="size-3.5 shrink-0 accent-[hsl(var(--primary))]"
          aria-label={`Select ${key}`}
        />
      ) : null}

      {dragHandle}

      <IssueTypeIcon type={issue.type} />
      <IssueKeyBadge issueKey={key} className="w-16 shrink-0 sm:w-20" />

      <button
        type="button"
        onClick={() => onOpen?.(issue.id)}
        className="min-w-0 flex-1 truncate text-left text-[0.8125rem] font-medium hover:underline"
      >
        {showProject && issue.project ? (
          <span className="mr-1.5 text-muted-foreground">{issue.project.name} ·</span>
        ) : null}
        <span className={cn(done && 'text-muted-foreground line-through')}>{issue.title}</span>
      </button>

      <div className="flex shrink-0 items-center gap-1.5">
        {issue.labels.slice(0, 2).map((label) => (
          <LabelChip key={label.id} label={label} className="hidden md:inline-flex" />
        ))}
        {issue.comment_count > 0 ? (
          <span className="hidden items-center gap-0.5 text-2xs text-muted-foreground sm:inline-flex">
            <MessageSquare className="size-3" />
            {issue.comment_count}
          </span>
        ) : null}
        {overdue ? (
          <CalendarClock className="size-3.5 text-destructive" aria-label="Overdue" />
        ) : null}
        <StoryPoints points={issue.story_points} />
        <PriorityIcon priority={issue.priority} className="hidden sm:block" />
        <Avatar
          id={issue.assignee?.id ?? 'unassigned'}
          name={issue.assignee?.full_name ?? issue.assignee?.email ?? null}
          src={issue.assignee?.avatar_url}
          size="sm"
        />
        {trailing}
      </div>
    </div>
  )
}
