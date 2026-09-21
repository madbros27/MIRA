'use client'

import { Search, ShieldCheck, Users } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'
import { toast } from 'sonner'

import { DataTable, PageHeader, type Column } from './admin-ui'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Avatar, Badge, EmptyState, ErrorState } from '@/components/ui/primitives'
import { formatDate } from '@/lib/format'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import { adminError, useAdminUsers, useSetUserActive } from '@/lib/queries/admin'
import type { AdminUserRow } from '@/lib/types/admin'

/**
 * Every account on the platform, across every tenant.
 *
 * Read plus a global suspend switch — deliberately nothing else. Adding
 * somebody to a workspace, or changing their position, belongs to that
 * workspace's Owner or HR, not to the platform.
 */
export function UsersPage() {
  const [search, setSearch] = React.useState('')
  const debounced = useDebouncedValue(search, 250)
  const { data, isLoading, error, refetch } = useAdminUsers(debounced)
  const setActive = useSetUserActive()

  const [suspending, setSuspending] = React.useState<AdminUserRow | null>(null)

  const columns: Column<AdminUserRow>[] = [
    {
      key: 'user',
      header: 'Person',
      primary: true,
      cell: (user) => (
        <div className="flex items-center gap-3">
          <Avatar
            id={user.id}
            name={user.full_name ?? user.email}
            src={user.avatar_url}
            size="md"
          />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <span className="truncate">{user.full_name ?? user.email}</span>
              {user.is_platform_admin ? (
                <Badge variant="primary" title="System Administrator">
                  <ShieldCheck className="size-2.5" aria-hidden />
                  Admin
                </Badge>
              ) : null}
              {!user.is_active ? <Badge variant="danger">Suspended</Badge> : null}
            </p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'tenants',
      header: 'Workspaces & positions',
      cell: (user) =>
        user.workspaces.length ? (
          <ul className="flex flex-wrap justify-end gap-1.5 md:justify-start">
            {user.workspaces.map((membership) => (
              <li key={membership.workspace_id}>
                <Link
                  href={`/miraadmin/workspaces/${membership.workspace_id}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-muted"
                >
                  <span className="font-medium">{membership.workspace_name}</span>
                  <span className="text-muted-foreground">
                    {membership.is_owner ? 'Owner' : (membership.position ?? 'No position')}
                  </span>
                  {membership.status !== 'active' ? (
                    <Badge variant={membership.status === 'invited' ? 'info' : 'danger'}>
                      {membership.status}
                    </Badge>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-xs text-muted-foreground">
            {user.is_platform_admin ? 'Platform tier — no tenant' : 'No workspace yet'}
          </span>
        ),
    },
    {
      key: 'joined',
      header: 'Joined',
      align: 'right',
      cell: (user) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDate(user.created_at)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      className: 'w-28',
      cell: (user) =>
        user.is_platform_admin ? (
          <span className="text-2xs text-muted-foreground">—</span>
        ) : user.is_active ? (
          <Button
            variant="ghost"
            size="xs"
            className="text-destructive hover:bg-destructive-subtle"
            onClick={() => setSuspending(user)}
          >
            Suspend
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            onClick={async () => {
              try {
                await setActive.mutateAsync({ userId: user.id, active: true })
                toast.success('Account reactivated')
              } catch (caught) {
                toast.error('Could not reactivate', { description: adminError(caught) })
              }
            }}
          >
            Reactivate
          </Button>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone with a MIRA account, in every tenant. Suspending here locks a person out of the whole platform at once."
      />

      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search across all tenants by name or email…"
          className="pl-9"
          aria-label="Search users"
        />
      </div>

      {error ? (
        <ErrorState
          title="Could not load users"
          description={adminError(error)}
          onRetry={() => void refetch()}
        />
      ) : (
        <DataTable
          rows={data?.rows}
          columns={columns}
          getRowKey={(user) => user.id}
          isLoading={isLoading}
          emptyState={
            <EmptyState
              icon={<Users />}
              title={debounced ? 'Nobody matches that search' : 'No accounts yet'}
              description={
                debounced
                  ? 'Try part of a name or an email address.'
                  : 'Accounts appear here once owners start inviting their teams.'
              }
            />
          }
        />
      )}

      {data ? (
        <p className="mt-4 text-center text-2xs text-muted-foreground">
          Showing {data.rows.length} of {data.total} account{data.total === 1 ? '' : 's'}
          {data.rows.length < data.total ? ' — narrow the search to see the rest' : ''}
        </p>
      ) : null}

      <ConfirmDialog
        open={Boolean(suspending)}
        onOpenChange={(open) => !open && setSuspending(null)}
        title={`Suspend ${suspending?.full_name ?? suspending?.email}?`}
        description={
          <>
            They lose access to{' '}
            {suspending?.workspaces.length === 1
              ? 'their workspace'
              : `all ${suspending?.workspaces.length ?? 0} of their workspaces`}{' '}
            immediately. Nothing they created is deleted, and you can reverse
            this at any time.
          </>
        }
        confirmLabel="Suspend account"
        destructive
        onConfirm={async () => {
          if (!suspending) return
          try {
            await setActive.mutateAsync({ userId: suspending.id, active: false })
            toast.success('Account suspended')
            setSuspending(null)
          } catch (caught) {
            toast.error('Could not suspend', { description: adminError(caught) })
          }
        }}
      />
    </>
  )
}
