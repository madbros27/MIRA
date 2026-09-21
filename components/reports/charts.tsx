'use client'

import * as React from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'

import {
  AXIS_PROPS,
  CHART_COLORS,
  ChartCard,
  ChartLegend,
  ChartTooltip,
} from './chart-kit'
import type { BurndownPoint, VelocityPoint } from '@/lib/types/app'
import type { Distribution } from '@/lib/reports'

/* -------------------------------------------------------------------------- */
/* Burndown                                                                   */
/* -------------------------------------------------------------------------- */

export function BurndownChart({
  data,
  isLoading,
  sprintName,
}: {
  data: BurndownPoint[]
  isLoading?: boolean
  sprintName?: string
}) {
  const hasWork = data.some((point) => point.ideal > 0)

  return (
    <ChartCard
      title="Burndown"
      description={
        sprintName
          ? `Remaining work in ${sprintName} against the ideal line`
          : 'Remaining work against the ideal line'
      }
      isLoading={isLoading}
      isEmpty={!data.length || !hasWork}
      emptyMessage="Start a sprint with estimated issues to see the burndown."
      height={280}
    >
      <>
        <ResponsiveContainer width="100%" height="88%">
          <AreaChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="burndown-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.28} />
                <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={16} />
            <YAxis {...AXIS_PROPS} width={44} allowDecimals={false} />
            <RechartsTooltip
              content={<ChartTooltip unit=" pts" />}
              cursor={{ stroke: 'hsl(var(--border-strong))' }}
            />
            <Area
              type="monotone"
              dataKey="ideal"
              name="Ideal"
              stroke={CHART_COLORS.ideal}
              strokeDasharray="5 4"
              strokeWidth={1.5}
              fill="none"
              dot={false}
              activeDot={false}
            />
            <Area
              type="monotone"
              dataKey="remaining"
              name="Remaining"
              stroke={CHART_COLORS.primary}
              strokeWidth={2.5}
              fill="url(#burndown-fill)"
              connectNulls={false}
              dot={{ r: 2.5, strokeWidth: 0, fill: CHART_COLORS.primary }}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
        <ChartLegend
          items={[
            { label: 'Remaining', color: CHART_COLORS.primary },
            { label: 'Ideal', color: CHART_COLORS.ideal, dashed: true },
          ]}
        />
      </>
    </ChartCard>
  )
}

/* -------------------------------------------------------------------------- */
/* Velocity                                                                   */
/* -------------------------------------------------------------------------- */

export function VelocityChart({
  data,
  isLoading,
}: {
  data: VelocityPoint[]
  isLoading?: boolean
}) {
  const average =
    data.length > 0
      ? Math.round((data.reduce((total, d) => total + d.completed, 0) / data.length) * 10) / 10
      : 0

  return (
    <ChartCard
      title="Velocity"
      description={
        data.length
          ? `Average ${average} points completed per sprint`
          : 'Committed against completed points per sprint'
      }
      isLoading={isLoading}
      isEmpty={!data.length}
      emptyMessage="Complete a sprint to start tracking velocity."
      height={280}
    >
      <>
        <ResponsiveContainer width="100%" height="88%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="sprint" {...AXIS_PROPS} interval={0} minTickGap={4} />
            <YAxis {...AXIS_PROPS} width={44} allowDecimals={false} />
            <RechartsTooltip
              content={<ChartTooltip unit=" pts" />}
              cursor={{ fill: 'hsl(var(--muted))' }}
            />
            <Bar
              dataKey="committed"
              name="Committed"
              fill={CHART_COLORS.primarySoft}
              radius={[4, 4, 0, 0]}
              maxBarSize={38}
            />
            <Bar
              dataKey="completed"
              name="Completed"
              fill={CHART_COLORS.primary}
              radius={[4, 4, 0, 0]}
              maxBarSize={38}
            />
          </BarChart>
        </ResponsiveContainer>
        <ChartLegend
          items={[
            { label: 'Committed', color: CHART_COLORS.primarySoft },
            { label: 'Completed', color: CHART_COLORS.primary },
          ]}
        />
      </>
    </ChartCard>
  )
}

/* -------------------------------------------------------------------------- */
/* Distributions                                                              */
/* -------------------------------------------------------------------------- */

export function DistributionPie({
  title,
  description,
  data,
  isLoading,
}: {
  title: string
  description?: string
  data: Distribution[]
  isLoading?: boolean
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0)

  return (
    <ChartCard
      title={title}
      description={description}
      isLoading={isLoading}
      isEmpty={!total}
      height={240}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="82%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <RechartsTooltip
            content={
              <ChartTooltip
                formatter={(entry) =>
                  `${entry.value} (${Math.round(((entry.value as number) / total) * 100)}%)`
                }
              />
            }
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            iconSize={8}
            formatter={(value) => (
              <span className="text-2xs text-muted-foreground">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

export function DistributionBars({
  title,
  description,
  data,
  isLoading,
}: {
  title: string
  description?: string
  data: Distribution[]
  isLoading?: boolean
}) {
  return (
    <ChartCard
      title={title}
      description={description}
      isLoading={isLoading}
      isEmpty={!data.length}
      height={240}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis type="number" {...AXIS_PROPS} allowDecimals={false} />
          <YAxis type="category" dataKey="name" {...AXIS_PROPS} width={92} />
          <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
          <Bar dataKey="value" name="Issues" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

/* -------------------------------------------------------------------------- */
/* Created vs resolved                                                        */
/* -------------------------------------------------------------------------- */

export function CreatedVsResolvedChart({
  data,
  isLoading,
}: {
  data: { label: string; created: number; resolved: number }[]
  isLoading?: boolean
}) {
  const hasActivity = data.some((point) => point.created || point.resolved)

  return (
    <ChartCard
      title="Created vs resolved"
      description="Last 30 days"
      isLoading={isLoading}
      isEmpty={!hasActivity}
      emptyMessage="No issues were created or resolved in the last 30 days."
      height={240}
    >
      <>
        <ResponsiveContainer width="100%" height="86%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={24} />
            <YAxis {...AXIS_PROPS} width={40} allowDecimals={false} />
            <RechartsTooltip content={<ChartTooltip />} />
            <Line
              type="monotone"
              dataKey="created"
              name="Created"
              stroke={CHART_COLORS.info}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="resolved"
              name="Resolved"
              stroke={CHART_COLORS.success}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
        <ChartLegend
          items={[
            { label: 'Created', color: CHART_COLORS.info },
            { label: 'Resolved', color: CHART_COLORS.success },
          ]}
        />
      </>
    </ChartCard>
  )
}
