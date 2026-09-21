'use client'

/** The small, repeated visual pieces of an issue: type, priority, status, labels. */

import {
  BookOpen,
  Bug,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Equal,
  GitBranch,
  SquareCheck,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import * as React from 'react'

import { Tooltip } from '@/components/ui/controls'
import { Badge } from '@/components/ui/primitives'
import { ISSUE_TYPE_META, PRIORITY_META } from '@/lib/constants'
import type { IssuePriority, IssueType, StatusCategory } from '@/lib/types/database'
import type { Label as LabelType, ProjectStatus } from '@/lib/types/app'
import { cn } from '@/lib/utils'

const TYPE_ICONS: Record<IssueType, LucideIcon> = {
  epic: Zap,
  story: BookOpen,
  task: SquareCheck,
  bug: Bug,
  subtask: GitBranch,
}

const PRIORITY_ICONS: Record<IssuePriority, LucideIcon> = {
  highest: ChevronsUp,
  high: ChevronUp,
  medium: Equal,
  low: ChevronDown,
  lowest: ChevronsDown,
}

export function IssueTypeIcon({
  type,
  className,
  withTooltip = true,
}: {
  type: IssueType
  className?: string
  withTooltip?: boolean
}) {
  const Icon = TYPE_ICONS[type]
  const meta = ISSUE_TYPE_META[type]

  const icon = (
    <span
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center rounded',
        meta.className,
        className
      )}
      aria-label={meta.label}
    >
      <Icon className="size-3" strokeWidth={2.5} />
    </span>
  )

  return withTooltip ? <Tooltip content={meta.label}>{icon}</Tooltip> : icon
}

export function PriorityIcon({
  priority,
  className,
  withTooltip = true,
}: {
  priority: IssuePriority
  className?: string
  withTooltip?: boolean
}) {
  const Icon = PRIORITY_ICONS[priority]
  const meta = PRIORITY_META[priority]

  const icon = (
    <Icon
      className={cn('size-4 shrink-0', meta.className, className)}
      strokeWidth={2.5}
      aria-label={`${meta.label} priority`}
    />
  )

  return withTooltip ? <Tooltip content={`${meta.label} priority`}>{icon}</Tooltip> : icon
}

export function StatusPill({
  status,
  className,
}: {
  status?: Pick<ProjectStatus, 'name' | 'category' | 'color'> | null
  className?: string
}) {
  if (!status) return null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide',
        className
      )}
      style={{
        backgroundColor: `${status.color}1f`,
        color: status.color,
      }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: status.color }}
        aria-hidden
      />
      {status.name}
    </span>
  )
}

export function CategoryDot({ category }: { category: StatusCategory }) {
  const colors: Record<StatusCategory, string> = {
    todo: 'bg-muted-foreground',
    in_progress: 'bg-info',
    done: 'bg-success',
  }
  return <span className={cn('size-2 shrink-0 rounded-full', colors[category])} aria-hidden />
}

export function LabelChip({
  label,
  className,
  onRemove,
}: {
  label: Pick<LabelType, 'name' | 'color'>
  className?: string
  onRemove?: () => void
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-2xs font-medium',
        className
      )}
      style={{ backgroundColor: `${label.color}24`, color: label.color }}
    >
      <span className="truncate">{label.name}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="-mr-0.5 shrink-0 opacity-60 transition-opacity hover:opacity-100"
          aria-label={`Remove ${label.name}`}
        >
          ×
        </button>
      ) : null}
    </span>
  )
}

/** MIRA-101, rendered monospaced so keys line up in a list. */
export function IssueKeyBadge({
  issueKey,
  className,
}: {
  issueKey: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'shrink-0 font-mono text-2xs font-medium uppercase tracking-wide text-muted-foreground',
        className
      )}
    >
      {issueKey}
    </span>
  )
}

export function StoryPoints({ points }: { points: number | null | undefined }) {
  if (points == null) return null
  return (
    <Tooltip content={`${points} story ${points === 1 ? 'point' : 'points'}`}>
      <Badge variant="outline" className="min-w-5 justify-center tabular-nums">
        {Number.isInteger(points) ? points : points.toFixed(1)}
      </Badge>
    </Tooltip>
  )
}
