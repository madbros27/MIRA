'use client'

import { Building2, Plus, Search, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'

import { CreateWorkspaceDialog } from './create-workspace-dialog'
import { DataTable, PageHeader, UsageMeter, WorkspaceStatusPill, type Column } from './admin-ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/controls'
import { Avatar, Badge, EmptyState, ErrorState } from '@/components/ui/primitives'
import { formatDate } from '@/lib/format'
import { adminError, useAdminWorkspaces } from '@/lib/queries/admin'
import type { AdminWorkspaceRow } from '@/lib/types/admin'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'archived', label: 'Archived' },
  { value: 'deleted', label: 'Deleted (retained)' },
]

export function WorkspacesPage() {
  const router = useRouter()
  const params = useSearchParams()

  const [search, setSearch] = React.useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [status, setStatus] = React.useState(params.get('status') ?? 'all')
  const [createOpen, setCreateOpen] = React.useState(params.get('new') === '1')

  const { data, isLoading, error, refetch } = useAdminWorkspaces(
    debouncedSearch,
    status === 'all' ? '' : status
  )

  const columns: Column<AdminWorkspaceRow>[] = [
    {
      key: 'name',
      header: 'Workspace',
      primary: true,
      cell: (row) => (
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-subtle-foreground"
          >
            <Building2 className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.company_name && row.company_name !== row.name
                ? `${row.company_name} · /${row.slug}`
                : `/${row.slug}`}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'owner',
      header: 'Owner',
      cell: (row) => {
        const primary = row.owners.find((owner) => owner.is_primary) ?? row.owners[0]
        if (!primary) {
          return (
            <Badge variant="warning" title="This workspace cannot be used until an Owner is assigned">
              No owner yet
            </Badge>
          )
        }
        return (
          <div className="flex items-center justify-end gap-2 md:justify-start">
            <Avatar
              id={primary.user_id}
              name={primary.full_name ?? primary.email}
              src={primary.avatar_url}
              size="sm"
            />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">
                {primary.full_name ?? primary.email}
              </p>
              {row.owners.length > 1 ? (
                <p className="text-2xs text-muted-foreground">
                  +{row.owners.length - 1} co-owner{row.owners.length > 2 ? 's' : ''}
                </p>
              ) : null}
            </div>
          </div>
        )
      },
    },
    {
      key: 'plan',
      header: 'Plan',
      cell: (row) => (
        <div className="space-y-0.5">
          <Badge variant="outline" className="capitalize">
            {row.plan}
          </Badge>
          {row.expires_at ? (
            <p className="text-2xs text-muted-foreground">
              Renews {formatDate(row.expires_at)}
            </p>
          ) : (
            <p className="text-2xs text-muted-foreground">No expiry</p>
          )}
        </div>
      ),
    },
    {
      key: 'usage',
      header: 'Usage',
      className: 'w-48',
      cell: (row) => (
        <div className="space-y-1.5 md:w-40">
          <UsageMeter label="Seats" used={row.seats_used} limit={row.seat_limit} />
          <UsageMeter label="Projects" used={row.projects_used} limit={row.project_limit} />
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      cell: (row) => <WorkspaceStatusPill status={row.status} />,
    },
  ]

  return (
    <>
      <PageHeader
        title="Workspaces"
        description="One workspace per customer. Creating one here is the first step of onboarding a new client."
        action={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden />
            New workspace
          </Button>
        }
      />

      {/* Filters --------------------------------------------------------- */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by workspace, company or slug…"
            className="pl-9 pr-9"
            aria-label="Search workspaces"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-52" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table ----------------------------------------------------------- */}
      {error ? (
        <ErrorState
          title="Could not load workspaces"
          description={adminError(error)}
          onRetry={() => void refetch()}
        />
      ) : (
        <DataTable
          rows={data}
          columns={columns}
          getRowKey={(row) => row.id}
          isLoading={isLoading}
          onRowClick={(row) => router.push(`/miraadmin/workspaces/${row.id}`)}
          emptyState={
            <EmptyState
              icon={<Building2 />}
              title={
                debouncedSearch || status !== 'all'
                  ? 'No workspaces match those filters'
                  : 'No workspaces yet'
              }
              description={
                debouncedSearch || status !== 'all'
                  ? 'Try a different search term, or clear the status filter.'
                  : 'Create a workspace for your first customer, then create an Owner account and assign it.'
              }
              action={
                debouncedSearch || status !== 'all' ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearch('')
                      setStatus('all')
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => setCreateOpen(true)}>
                    <Plus aria-hidden />
                    New workspace
                  </Button>
                )
              }
            />
          }
        />
      )}

      {data?.length ? (
        <p className="mt-4 text-center text-2xs text-muted-foreground">
          {data.length} workspace{data.length === 1 ? '' : 's'}
          {status !== 'all' ? ` with status “${status}”` : ''} ·{' '}
          <Link href="/miraadmin/owners" className="underline underline-offset-2">
            manage owners
          </Link>
        </p>
      ) : null}

      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}
