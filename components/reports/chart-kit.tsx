'use client'

/**
 * Shared chart chrome: a consistent card, tooltip and palette so every report
 * reads as one system rather than four different chart libraries.
 *
 * The palette is fixed hex rather than CSS variables because Recharts needs
 * resolved colours; each value was picked to hold contrast on both the light
 * and the dark surface.
 */

import * as React from 'react'

import { Card, CardDescription, CardHeader, CardTitle, Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

export const CHART_COLORS = {
  primary: '#5B5BD6',
  primarySoft: '#A5A5F2',
  ideal: '#94A3B8',
  success: '#0E9F6E',
  warning: '#D97706',
  danger: '#E02424',
  info: '#2563EB',
  accent: '#DB2777',
  grid: 'hsl(var(--border))',
  axis: 'hsl(var(--muted-foreground))',
}

export const CATEGORICAL = [
  '#5B5BD6',
  '#0E9F6E',
  '#2563EB',
  '#D97706',
  '#DB2777',
  '#0891B2',
  '#7C3AED',
  '#64748B',
]

export function ChartCard({
  title,
  description,
  action,
  children,
  className,
  height = 260,
  isLoading,
  isEmpty,
  emptyMessage = 'Not enough data yet.',
}: {
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  height?: number
  isLoading?: boolean
  isEmpty?: boolean
  emptyMessage?: string
}) {
  return (
    <Card className={cn('flex flex-col overflow-hidden', className)}>
      <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      <div className="px-2 pb-4 sm:px-3" style={{ minHeight: height }}>
        {isLoading ? (
          <div className="flex h-full items-end gap-2 px-2 pb-2" style={{ height }}>
            {[40, 70, 55, 85, 60, 95, 45].map((h, i) => (
              <Skeleton key={i} className="flex-1 rounded-t" style={{ height: `${h}%` }} />
            ))}
          </div>
        ) : isEmpty ? (
          <div
            className="flex items-center justify-center rounded-lg border border-dashed border-border"
            style={{ height }}
          >
            <p className="px-6 text-center text-xs text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : (
          <div style={{ height }}>{children}</div>
        )}
      </div>
    </Card>
  )
}

type TooltipPayload = {
  name?: string | number
  value?: number | string
  color?: string
  dataKey?: string | number
  payload?: Record<string, unknown>
}

/** Recharts tooltip rendered with MIRA's surface tokens. */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  unit,
}: {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string | number
  formatter?: (entry: TooltipPayload) => React.ReactNode
  unit?: string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border border-border bg-popover px-2.5 py-2 text-xs shadow-lg">
      {label != null ? <p className="mb-1 font-semibold">{label}</p> : null}
      <ul className="space-y-0.5">
        {payload
          .filter((entry) => entry.value != null)
          .map((entry, index) => (
            <li key={index} className="flex items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-sm"
                style={{ backgroundColor: entry.color }}
                aria-hidden
              />
              <span className="text-muted-foreground">{entry.name}</span>
              <span className="ml-auto font-semibold tabular-nums">
                {formatter ? formatter(entry) : `${entry.value}${unit ?? ''}`}
              </span>
            </li>
          ))}
      </ul>
    </div>
  )
}

/** Small legend that matches the tooltip. */
export function ChartLegend({
  items,
}: {
  items: { label: string; color: string; dashed?: boolean }[]
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 pt-1">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-2xs text-muted-foreground">
          {item.dashed ? (
            <span
              className="h-0 w-4 border-t-2 border-dashed"
              style={{ borderColor: item.color }}
              aria-hidden
            />
          ) : (
            <span
              className="size-2 rounded-sm"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
          )}
          {item.label}
        </li>
      ))}
    </ul>
  )
}

export const AXIS_PROPS = {
  stroke: 'hsl(var(--muted-foreground))',
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const
