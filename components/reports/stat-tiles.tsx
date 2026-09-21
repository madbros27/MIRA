'use client'

import * as React from 'react'

import { Avatar, Card, ProgressBar, Skeleton } from '@/components/ui/primitives'
import type { WorkloadRow } from '@/lib/reports'
import { cn } from '@/lib/utils'

export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
  isLoading,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger'
  isLoading?: boolean
}) {
  const tones = {
    neutral: 'text-foreground',
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-destructive',
  }

  return (
    <Card className="p-3.5 sm:p-4">
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {isLoading ? (
        <Skeleton className="mt-2 h-7 w-16" />
      ) : (
        <p className={cn('mt-1 text-2xl font-semibold tabular-nums', tones[tone])}>{value}</p>
      )}
      {hint ? <p className="mt-0.5 text-2xs text-muted-foreground">{hint}</p> : null}
    </Card>
  )
}

export function WorkloadTable({
  rows,
  isLoading,
}: {
  rows: WorkloadRow[]
  isLoading?: boolean
}) {
  const busiest = Math.max(1, ...rows.map((row) => row.open + row.done))

  if (isLoading) {
    return (
      <ul className="space-y-2.5">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex items-center gap-3">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-1.5 w-full" />
            </div>
          </li>
        ))}
      </ul>
    )
  }

  if (!rows.length) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        No issues to distribute yet.
      </p>
    )
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.userId} className="flex items-center gap-3">
          <Avatar
            id={row.userId}
            name={row.name}
            src={row.avatarUrl}
            size="md"
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-xs font-medium">{row.name}</p>
              <p className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                {row.open} open
                {row.points ? ` · ${row.points} pts` : ''}
                {row.done ? ` · ${row.done} done` : ''}
              </p>
            </div>
            <ProgressBar
              value={row.open + row.done}
              max={busiest}
              className="mt-1.5"
              label={`${row.name} workload`}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
