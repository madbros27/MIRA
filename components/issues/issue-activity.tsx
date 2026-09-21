'use client'

import { History } from 'lucide-react'
import * as React from 'react'

import { Avatar, EmptyState, Skeleton } from '@/components/ui/primitives'
import { formatDateTime, formatRelative } from '@/lib/format'
import { useActivity } from '@/lib/queries/issue-detail'
import type { Activity } from '@/lib/types/app'
import { displayName } from '@/lib/utils'

const FIELD_LABELS: Record<string, string> = {
  title: 'the title',
  description: 'the description',
  status: 'the status',
  assignee: 'the assignee',
  priority: 'the priority',
  type: 'the issue type',
  story_points: 'the estimate',
  due_date: 'the due date',
  sprint: 'the sprint',
  epic: 'the epic',
  comment: 'a comment',
}

function describe(entry: Activity): React.ReactNode {
  const who = entry.actor ? displayName(entry.actor) : 'Someone'

  if (entry.action === 'created') return <>{who} created this issue</>
  if (entry.action === 'commented') return <>{who} commented</>

  const field = FIELD_LABELS[entry.field_changed ?? ''] ?? entry.field_changed ?? 'a field'

  if (entry.field_changed === 'description') {
    return <>{who} updated the description</>
  }

  if (entry.old_value && entry.new_value) {
    return (
      <>
        {who} changed {field} from <Value>{entry.old_value}</Value> to{' '}
        <Value>{entry.new_value}</Value>
      </>
    )
  }
  if (entry.new_value) {
    return (
      <>
        {who} set {field} to <Value>{entry.new_value}</Value>
      </>
    )
  }
  if (entry.old_value) {
    return (
      <>
        {who} cleared {field} (was <Value>{entry.old_value}</Value>)
      </>
    )
  }
  return (
    <>
      {who} updated {field}
    </>
  )
}

function Value({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-muted px-1 py-0.5 font-medium text-foreground">{children}</span>
  )
}

export function IssueActivity({ issueId }: { issueId: string }) {
  const { data: entries, isLoading } = useActivity(issueId)

  if (isLoading) {
    return (
      <ul className="space-y-3">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex gap-3">
            <Skeleton className="size-6 shrink-0 rounded-full" />
            <Skeleton className="h-3 flex-1" />
          </li>
        ))}
      </ul>
    )
  }

  if (!entries?.length) {
    return (
      <EmptyState
        icon={<History />}
        title="No activity recorded"
        description="Field changes and comments are logged here automatically."
        compact
      />
    )
  }

  return (
    <ol className="relative space-y-3 pl-1">
      <span
        className="absolute left-[0.8125rem] top-2 bottom-2 w-px bg-border"
        aria-hidden
      />
      {entries.map((entry) => (
        <li key={entry.id} className="relative flex gap-3">
          <Avatar
            id={entry.actor?.id ?? 'system'}
            name={entry.actor?.full_name}
            src={entry.actor?.avatar_url}
            size="sm"
            ring
            className="z-10"
          />
          <p className="pt-0.5 text-xs leading-relaxed text-muted-foreground">
            {describe(entry)}{' '}
            <time
              dateTime={entry.created_at}
              title={formatDateTime(entry.created_at)}
              className="whitespace-nowrap"
            >
              · {formatRelative(entry.created_at)}
            </time>
          </p>
        </li>
      ))}
    </ol>
  )
}
