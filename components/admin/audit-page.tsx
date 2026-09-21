'use client'

import { ClipboardList, Download, Search } from 'lucide-react'
import * as React from 'react'

import { AuditRow } from './audit-list'
import { PageHeader } from './admin-ui'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/controls'
import { Input } from '@/components/ui/input'
import { Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/primitives'
import { toCsv, downloadCsv } from '@/lib/csv'
import { formatDate } from '@/lib/format'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import { adminError, useAuditLog } from '@/lib/queries/admin'
import type { AuditEntry } from '@/lib/types/admin'

const ACTION_FILTERS = [
  { value: 'all', label: 'All actions' },
  { value: 'workspace.created', label: 'Workspace created' },
  { value: 'workspace.updated', label: 'Workspace updated' },
  { value: 'workspace.status_changed', label: 'Status changed' },
  { value: 'workspace.soft_deleted', label: 'Workspace deleted' },
  { value: 'workspace.hard_deleted', label: 'Workspace purged' },
  { value: 'workspace.transferred', label: 'Ownership transferred' },
  { value: 'owner.created', label: 'Owner created' },
  { value: 'owner.assigned', label: 'Owner assigned' },
  { value: 'owner.removed', label: 'Owner removed' },
  { value: 'user.suspended', label: 'User suspended' },
  { value: 'impersonation.started', label: 'Support session started' },
  { value: 'admin.login', label: 'Admin sign-in' },
]

/**
 * The platform audit log.
 *
 * It is append-only in the database: `authenticated` holds no INSERT, UPDATE
 * or DELETE privilege on the table, and rows are written exclusively by the
 * SECURITY DEFINER function `log_platform_action()`. There is deliberately no
 * delete button on this page, because there is no way to honour one.
 */
export function AuditPage() {
  const [search, setSearch] = React.useState('')
  const debounced = useDebouncedValue(search, 250)
  const [action, setAction] = React.useState('all')

  const { data, isLoading, error, refetch } = useAuditLog({
    action: action === 'all' ? undefined : action,
    search: debounced || undefined,
  })

  const grouped = React.useMemo(() => groupByDay(data ?? []), [data])

  function exportCsv() {
    const csv = toCsv(
      (data ?? []).map((entry) => ({
        timestamp: entry.created_at,
        actor: entry.actor_email ?? '',
        action: entry.action,
        target_type: entry.target_type ?? '',
        target_id: entry.target_id ?? '',
        ip: entry.ip ?? '',
        metadata: JSON.stringify(entry.metadata ?? {}),
      }))
    )
    downloadCsv(`mira-audit-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every administrative action, with who did it and when. Append-only — the database grants nobody the right to change or remove a row."
        action={
          <Button variant="secondary" onClick={exportCsv} disabled={!data?.length}>
            <Download aria-hidden />
            Export CSV
          </Button>
        }
      />

      <div className="mb-5 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by administrator email or action…"
            className="pl-9"
            aria-label="Search the audit log"
          />
        </div>
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="sm:w-60" aria-label="Filter by action">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTION_FILTERS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <ErrorState
          title="Could not load the audit log"
          description={adminError(error)}
          onRetry={() => void refetch()}
        />
      ) : isLoading ? (
        <Card className="space-y-4 p-5">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex gap-3">
              <Skeleton className="size-7 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-2.5 w-24" />
              </div>
            </div>
          ))}
        </Card>
      ) : !data?.length ? (
        <EmptyState
          icon={<ClipboardList />}
          title={
            debounced || action !== 'all'
              ? 'No entries match those filters'
              : 'The log is empty'
          }
          description={
            debounced || action !== 'all'
              ? 'Try a broader filter, or clear the search.'
              : 'Actions appear here the moment you create a workspace or an owner.'
          }
          action={
            debounced || action !== 'all' ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('')
                  setAction('all')
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-5">
          {grouped.map(([day, entries]) => (
            <section key={day}>
              <h2 className="mb-2 px-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                {day}
              </h2>
              <Card className="p-4 sm:p-5">
                <ol className="space-y-4">
                  {entries.map((entry) => (
                    <AuditRow key={entry.id} entry={entry} />
                  ))}
                </ol>
              </Card>
            </section>
          ))}

          <p className="text-center text-2xs text-muted-foreground">
            Showing the {data.length} most recent entries
            {data.length >= 250 ? ' — narrow the filters to reach older ones' : ''}.
          </p>
        </div>
      )}
    </>
  )
}

/** Group entries under "Today" / "Yesterday" / a date, newest first. */
function groupByDay(entries: AuditEntry[]): [string, AuditEntry[]][] {
  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86_400_000).toDateString()
  const buckets = new Map<string, AuditEntry[]>()

  for (const entry of entries) {
    const stamp = new Date(entry.created_at).toDateString()
    const label =
      stamp === today ? 'Today' : stamp === yesterday ? 'Yesterday' : formatDate(entry.created_at)
    const bucket = buckets.get(label)
    if (bucket) bucket.push(entry)
    else buckets.set(label, [entry])
  }

  return [...buckets.entries()]
}
