'use client'

/**
 * Presentational furniture shared by the admin pages: page headers, the
 * status pill, usage meters and the responsive table wrapper that reflows
 * into cards on a phone.
 */

import * as React from 'react'

import { Badge, Card, ProgressBar, Skeleton } from '@/components/ui/primitives'
import { WORKSPACE_STATUS_META } from '@/lib/types/admin'
import type { WorkspaceStatus } from '@/lib/types/database'
import { cn } from '@/lib/utils'

/* -------------------------------------------------------------------------- */
/* Page header                                                                */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  description,
  action,
  breadcrumb,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  breadcrumb?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-6 space-y-3', className)}>
      {breadcrumb}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Status pill                                                                */
/* -------------------------------------------------------------------------- */

const TONE_TO_VARIANT = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  neutral: 'neutral',
} as const

export function WorkspaceStatusPill({
  status,
  size = 'sm',
}: {
  status: WorkspaceStatus
  size?: 'sm' | 'md'
}) {
  const meta = WORKSPACE_STATUS_META[status]
  return (
    <Badge variant={TONE_TO_VARIANT[meta.tone]} size={size} title={meta.help}>
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          meta.tone === 'success' && 'bg-success',
          meta.tone === 'warning' && 'bg-warning',
          meta.tone === 'danger' && 'bg-destructive',
          meta.tone === 'neutral' && 'bg-muted-foreground'
        )}
      />
      {meta.label}
    </Badge>
  )
}

/* -------------------------------------------------------------------------- */
/* Usage meter                                                                */
/* -------------------------------------------------------------------------- */

/**
 * "17 / 25 seats" with a bar that turns amber at 80% and red at 100%, so a
 * tenant about to hit a limit is visible without reading the numbers.
 */
export function UsageMeter({
  label,
  used,
  limit,
  className,
}: {
  label: string
  used: number
  limit: number
  className?: string
}) {
  const ratio = limit > 0 ? used / limit : 0
  const tone =
    ratio >= 1 ? 'bg-destructive' : ratio >= 0.8 ? 'bg-warning' : 'bg-primary'

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span
          className={cn(
            'font-medium tabular-nums',
            ratio >= 1 && 'text-destructive',
            ratio >= 0.8 && ratio < 1 && 'text-warning'
          )}
        >
          {used} / {limit}
        </span>
      </div>
      <ProgressBar
        value={Math.min(used, limit)}
        max={limit || 1}
        barClassName={tone}
        label={`${label}: ${used} of ${limit}`}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Stat card                                                                  */
/* -------------------------------------------------------------------------- */

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
  isLoading,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ReactNode
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
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {icon ? (
          <span className="text-muted-foreground [&_svg]:size-4" aria-hidden>
            {icon}
          </span>
        ) : null}
      </div>
      {isLoading ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : (
        <p className={cn('mt-1 text-2xl font-semibold tabular-nums', tones[tone])}>
          {value}
        </p>
      )}
      {hint ? <p className="mt-1 text-2xs text-muted-foreground">{hint}</p> : null}
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Responsive table                                                           */
/*                                                                            */
/* On a phone the <table> is hidden and the same rows render as cards. Both   */
/* are produced from one `columns` definition so they cannot drift apart.     */
/* -------------------------------------------------------------------------- */

export type Column<T> = {
  key: string
  header: React.ReactNode
  /** Rendered in both the table cell and the card row. */
  cell: (row: T) => React.ReactNode
  /** Hide this column on the phone card. */
  hideOnCard?: boolean
  /** Used as the card's headline instead of a labelled row. */
  primary?: boolean
  className?: string
  align?: 'left' | 'right'
}

export function DataTable<T>({
  rows,
  columns,
  getRowKey,
  isLoading,
  emptyState,
  onRowClick,
  skeletonRows = 5,
}: {
  rows: T[] | undefined
  columns: Column<T>[]
  getRowKey: (row: T) => string
  isLoading?: boolean
  emptyState?: React.ReactNode
  onRowClick?: (row: T) => void
  skeletonRows?: number
}) {
  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <div className="divide-y divide-border">
          {Array.from({ length: skeletonRows }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 p-4">
              <Skeleton className="size-9 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-6 w-16 rounded-md" />
            </div>
          ))}
        </div>
      </Card>
    )
  }

  if (!rows?.length) return <>{emptyState}</>

  const primary = columns.find((column) => column.primary) ?? columns[0]
  const rest = columns.filter((column) => column !== primary && !column.hideOnCard)

  return (
    <>
      {/* Table — md and up */}
      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-sunken/60">
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={cn(
                      'whitespace-nowrap px-4 py-2.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground',
                      column.align === 'right' ? 'text-right' : 'text-left',
                      column.className
                    )}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr
                  key={getRowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-muted/50'
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        'px-4 py-3 align-middle',
                        column.align === 'right' && 'text-right',
                        column.className
                      )}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Cards — below md */}
      <div className="space-y-2.5 md:hidden">
        {rows.map((row) => (
          <Card
            key={getRowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn('p-4', onRowClick && 'cursor-pointer active:bg-muted/50')}
          >
            <div className="mb-3">{primary.cell(row)}</div>
            <dl className="space-y-2 border-t border-border pt-3 text-xs">
              {rest.map((column) => (
                <div key={column.key} className="flex items-start justify-between gap-3">
                  <dt className="shrink-0 font-medium text-muted-foreground">
                    {column.header}
                  </dt>
                  <dd className="min-w-0 text-right">{column.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </div>
    </>
  )
}
