'use client'

import {
  AlertTriangle,
  Building2,
  CalendarClock,
  FolderKanban,
  HardDrive,
  ListChecks,
  UserCog,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { PageHeader, StatCard, UsageMeter, WorkspaceStatusPill } from './admin-ui'
import { AuditRowList } from './audit-list'
import { AXIS_PROPS, CHART_COLORS, ChartCard, ChartTooltip } from '@/components/reports/chart-kit'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
} from '@/components/ui/primitives'
import { formatDate, formatRelative } from '@/lib/format'
import { adminError, usePlatformStats } from '@/lib/queries/admin'
import { formatBytes } from '@/lib/utils'

export function AdminDashboard() {
  const { data, isLoading, error, refetch } = usePlatformStats()

  if (error) {
    return (
      <>
        <PageHeader title="Platform overview" />
        <ErrorState
          title="Could not load platform statistics"
          description={adminError(error)}
          onRetry={() => void refetch()}
        />
      </>
    )
  }

  const signups = (data?.signups ?? []).map((point) => ({
    ...point,
    label: formatDate(point.date),
  }))
  const totalSignups = signups.reduce((sum, point) => sum + point.count, 0)

  return (
    <>
      <PageHeader
        title="Platform overview"
        description="Every tenant, owner and user on this MIRA deployment."
        action={
          <Button asChild variant="primary">
            <Link href="/miraadmin/workspaces?new=1">
              <Building2 aria-hidden />
              New workspace
            </Link>
          </Button>
        }
      />

      {/* Headline numbers ------------------------------------------------ */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Workspaces"
          value={data?.workspaces.total ?? 0}
          hint={
            data
              ? `${data.workspaces.active} active · ${data.workspaces.suspended} suspended · ${data.workspaces.archived} archived`
              : undefined
          }
          icon={<Building2 />}
          isLoading={isLoading}
        />
        <StatCard
          label="Owners"
          value={data?.owners ?? 0}
          hint="Customers with at least one workspace"
          icon={<UserCog />}
          tone="primary"
          isLoading={isLoading}
        />
        <StatCard
          label="Users"
          value={data?.users ?? 0}
          hint={`${totalSignups} joined in the last 30 days`}
          icon={<Users />}
          isLoading={isLoading}
        />
        <StatCard
          label="Projects"
          value={data?.projects ?? 0}
          hint={`${(data?.issues ?? 0).toLocaleString()} issues tracked`}
          icon={<FolderKanban />}
          isLoading={isLoading}
        />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Active sprints"
          value={data?.sprints ?? 0}
          icon={<ListChecks />}
          isLoading={isLoading}
        />
        <StatCard
          label="Attachment storage"
          value={formatBytes(data?.storage_bytes ?? 0)}
          hint="Across every tenant bucket"
          icon={<HardDrive />}
          isLoading={isLoading}
        />
        <StatCard
          label="Expiring in 30 days"
          value={data?.expiring_soon.length ?? 0}
          tone={data?.expiring_soon.length ? 'warning' : 'neutral'}
          icon={<CalendarClock />}
          isLoading={isLoading}
        />
        <StatCard
          label="Near plan limits"
          value={data?.near_limits.length ?? 0}
          tone={data?.near_limits.length ? 'warning' : 'neutral'}
          icon={<AlertTriangle />}
          isLoading={isLoading}
        />
      </section>

      {/* Signups --------------------------------------------------------- */}
      <section className="mt-4">
        <ChartCard
          title="Signups"
          description="New accounts per day over the last 30 days"
          isLoading={isLoading}
          isEmpty={!isLoading && totalSignups === 0}
          emptyMessage="No accounts have been created in the last 30 days."
          height={220}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={signups} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="signupFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={28} />
              <YAxis {...AXIS_PROPS} allowDecimals={false} width={32} />
              <Tooltip content={<ChartTooltip unit=" signups" />} />
              <Area
                type="monotone"
                dataKey="count"
                name="Signups"
                stroke={CHART_COLORS.primary}
                strokeWidth={2}
                fill="url(#signupFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      {/* Attention + activity -------------------------------------------- */}
      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>
              Tenants close to a plan limit or approaching renewal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : !data?.near_limits.length && !data?.expiring_soon.length ? (
              <EmptyState
                compact
                title="Nothing needs attention"
                description="No tenant is near a seat or project limit, and none renews in the next 30 days."
              />
            ) : (
              <>
                {data?.near_limits.map((workspace) => (
                  <Link
                    key={workspace.id}
                    href={`/miraadmin/workspaces/${workspace.id}`}
                    className="block rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                  >
                    <p className="mb-2 text-sm font-medium">{workspace.name}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <UsageMeter
                        label="Seats"
                        used={workspace.seats_used}
                        limit={workspace.seat_limit}
                      />
                      <UsageMeter
                        label="Projects"
                        used={workspace.projects_used}
                        limit={workspace.project_limit}
                      />
                    </div>
                  </Link>
                ))}

                {data?.expiring_soon.map((workspace) => (
                  <Link
                    key={`exp-${workspace.id}`}
                    href={`/miraadmin/workspaces/${workspace.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning-subtle p-3 transition-opacity hover:opacity-90"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{workspace.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Renews {formatDate(workspace.expires_at)}
                      </p>
                    </div>
                    <CalendarClock className="size-4 shrink-0 text-warning" aria-hidden />
                  </Link>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Recent platform activity</CardTitle>
              <CardDescription>The last dozen administrative actions.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/miraadmin/audit">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : !data?.recent_activity.length ? (
              <EmptyState
                compact
                title="No activity yet"
                description="Administrative actions appear here as soon as you make one."
              />
            ) : (
              <AuditRowList entries={data.recent_activity} />
            )}
          </CardContent>
        </Card>
      </section>

      {/* Workspace mix --------------------------------------------------- */}
      {data && data.workspaces.total > 0 ? (
        <section className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Tenant status mix</CardTitle>
              <CardDescription>
                {data.workspaces.deleted > 0
                  ? `${data.workspaces.deleted} soft-deleted workspace${data.workspaces.deleted === 1 ? '' : 's'} are retained and still restorable.`
                  : 'No workspaces are pending deletion.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {(['active', 'suspended', 'archived', 'deleted'] as const).map((status) => (
                <Link
                  key={status}
                  href={`/miraadmin/workspaces?status=${status}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-muted/50"
                >
                  <WorkspaceStatusPill status={status} />
                  <span className="text-sm font-semibold tabular-nums">
                    {data.workspaces[status]}
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </section>
      ) : null}

      {data?.recent_activity.length ? (
        <p className="mt-6 text-center text-2xs text-muted-foreground">
          Last action {formatRelative(data.recent_activity[0].created_at)}
        </p>
      ) : null}
    </>
  )
}
