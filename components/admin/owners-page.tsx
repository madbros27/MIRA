'use client'

import { KeyRound, Search, UserCog, UserPlus } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'
import { toast } from 'sonner'

import { CreateOwnerDialog } from './create-owner-dialog'
import { DataTable, PageHeader, WorkspaceStatusPill, type Column } from './admin-ui'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { Avatar, Badge, EmptyState, ErrorState } from '@/components/ui/primitives'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import {
  adminError,
  useAdminOwners,
  useSendPasswordReset,
  useSetUserActive,
} from '@/lib/queries/admin'
import type { AdminOwner } from '@/lib/types/admin'

export function OwnersPage() {
  const [search, setSearch] = React.useState('')
  const debounced = useDebouncedValue(search, 250)
  const { data, isLoading, error, refetch } = useAdminOwners(debounced)

  const [createOpen, setCreateOpen] = React.useState(false)
  const [deactivating, setDeactivating] = React.useState<AdminOwner | null>(null)

  const sendReset = useSendPasswordReset()
  const setActive = useSetUserActive()

  async function resetPassword(owner: AdminOwner) {
    try {
      const result = await sendReset.mutateAsync(owner.email)
      if (result.emailed) {
        toast.success(`Reset link emailed to ${owner.email}`)
      } else if (result.resetUrl) {
        await navigator.clipboard.writeText(result.resetUrl)
        toast.success('Reset link copied to your clipboard', {
          description: 'Email is not configured on this project — send it yourself.',
        })
      }
    } catch (caught) {
      toast.error('Could not send the reset link', { description: adminError(caught) })
    }
  }

  const columns: Column<AdminOwner>[] = [
    {
      key: 'owner',
      header: 'Owner',
      primary: true,
      cell: (owner) => (
        <div className="flex items-center gap-3">
          <Avatar
            id={owner.user_id}
            name={owner.full_name ?? owner.email}
            src={owner.avatar_url}
            size="md"
          />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <span className="truncate">{owner.full_name ?? owner.email}</span>
              {!owner.is_active ? <Badge variant="danger">Deactivated</Badge> : null}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {owner.email}
              {owner.phone ? ` · ${owner.phone}` : ''}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'workspaces',
      header: 'Workspaces',
      cell: (owner) =>
        owner.workspaces.length ? (
          <ul className="flex flex-wrap justify-end gap-1.5 md:justify-start">
            {owner.workspaces.map((workspace) => (
              <li key={workspace.workspace_id}>
                <Link
                  href={`/miraadmin/workspaces/${workspace.workspace_id}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-muted"
                >
                  {workspace.name}
                  {workspace.is_primary ? (
                    <span
                      className="text-2xs text-primary"
                      title="Primary owner of this workspace"
                    >
                      ★
                    </span>
                  ) : null}
                  <WorkspaceStatusPill status={workspace.status} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Badge variant="warning">Unassigned</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      className: 'w-12',
      cell: (owner) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${owner.email}`}>
              <span aria-hidden>⋯</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => void resetPassword(owner)}>
              <KeyRound className="size-4" aria-hidden />
              Send password reset
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {owner.is_active ? (
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault()
                  setDeactivating(owner)
                }}
                className="text-destructive"
              >
                Deactivate account
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onSelect={async () => {
                  try {
                    await setActive.mutateAsync({ userId: owner.user_id, active: true })
                    toast.success('Account reactivated')
                  } catch (caught) {
                    toast.error('Could not reactivate', { description: adminError(caught) })
                  }
                }}
              >
                Reactivate account
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Owners"
        description="The customers who bought MIRA. Each one runs their own workspace; an owner may hold more than one."
        action={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <UserPlus aria-hidden />
            New owner
          </Button>
        }
      />

      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search owners by name or email…"
          className="pl-9"
          aria-label="Search owners"
        />
      </div>

      {error ? (
        <ErrorState
          title="Could not load owners"
          description={adminError(error)}
          onRetry={() => void refetch()}
        />
      ) : (
        <DataTable
          rows={data}
          columns={columns}
          getRowKey={(owner) => owner.user_id}
          isLoading={isLoading}
          emptyState={
            <EmptyState
              icon={<UserCog />}
              title={debounced ? 'No owners match that search' : 'No owners yet'}
              description={
                debounced
                  ? 'Try a different name or email address.'
                  : 'Create an owner account, then assign it to a workspace to finish onboarding a customer.'
              }
              action={
                <Button variant="primary" onClick={() => setCreateOpen(true)}>
                  <UserPlus aria-hidden />
                  New owner
                </Button>
              }
            />
          }
        />
      )}

      <CreateOwnerDialog open={createOpen} onOpenChange={setCreateOpen} />

      <ConfirmDialog
        open={Boolean(deactivating)}
        onOpenChange={(open) => !open && setDeactivating(null)}
        title={`Deactivate ${deactivating?.full_name ?? deactivating?.email}?`}
        description="They will be signed out and blocked from every workspace they belong to. Their data is untouched and you can reactivate them at any time."
        confirmLabel="Deactivate"
        destructive
        onConfirm={async () => {
          if (!deactivating) return
          try {
            await setActive.mutateAsync({ userId: deactivating.user_id, active: false })
            toast.success('Account deactivated')
            setDeactivating(null)
          } catch (caught) {
            toast.error('Could not deactivate', { description: adminError(caught) })
          }
        }}
      />
    </>
  )
}
