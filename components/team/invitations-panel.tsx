'use client'

import { Check, Copy, Mail, Plus, Trash2, X } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/controls'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/primitives'
import { formatRelative } from '@/lib/format'
import { can, type Grants } from '@/lib/permissions'
import {
  useBulkInviteMembers,
  type BulkInviteEntry,
  type BulkInviteResult,
  useInvites,
  usePositions,
  useRevokeInvite,
} from '@/lib/queries/workspaces'
import { errorMessage } from '@/lib/utils'

type InviteRow = BulkInviteEntry & { rowId: string }
type InviteStage = 'form' | 'review' | 'prepared'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const statusLabel: Record<BulkInviteResult['status'], string> = {
  ready: 'Ready',
  invited: 'Invitation ready',
  already_member: 'Already a member',
  already_invited: 'Invitation already pending',
  invalid: 'Invalid row',
  duplicate: 'Duplicate email',
  no_seats: 'No seats available',
  failed: 'Invitation failed',
}

export function InvitationsPanel({
  workspaceId,
  caps,
  isOwner,
  seatsUsed,
  seatLimit,
}: {
  workspaceId: string
  caps: Grants
  isOwner: boolean
  seatsUsed: number
  seatLimit: number
}) {
  const { data: invites, isLoading } = useInvites(workspaceId)
  const { data: positions } = usePositions(workspaceId)
  const revoke = useRevokeInvite(workspaceId)
  const [inviteOpen, setInviteOpen] = React.useState(false)

  const mayInvite = isOwner && can.inviteMembers(caps)
  const pending = (invites ?? []).filter((invite) => invite.status === 'pending')
  const seatsLeft = seatLimit - seatsUsed - pending.length

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {seatsLeft > 0 ? (
            <>
              <strong className="font-medium text-foreground">{seatsLeft}</strong> of{' '}
              {seatLimit} seats still free
              {pending.length ? ` (${pending.length} reserved by pending invitations)` : ''}.
            </>
          ) : (
            <span className="text-warning">
              Every seat is taken or reserved. Ask your MIRA administrator to
              raise the limit.
            </span>
          )}
        </p>
        {mayInvite ? (
          <Button
            variant="primary"
            onClick={() => setInviteOpen(true)}
          >
            <Plus aria-hidden />
            Invite Multiple
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <Card className="divide-y divide-border">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 p-4">
              <Skeleton className="size-8 rounded-lg" />
              <Skeleton className="h-3.5 flex-1" />
            </div>
          ))}
        </Card>
      ) : !invites?.length ? (
        <EmptyState
          icon={<Mail />}
          title="No invitations"
          description={
            mayInvite
              ? 'Prepare invitations for one or more colleagues. Each person can have an individual position and email draft.'
              : 'Nobody has been invited yet.'
          }
        />
      ) : (
        <Card className="divide-y divide-border">
          {invites.map((invite) => (
            <div key={invite.id} className="flex flex-wrap items-center gap-3 p-4">
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
              >
                <Mail className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{invite.email}</p>
                <p className="text-xs text-muted-foreground">
                  Invited {formatRelative(invite.created_at)}
                  {invite.status === 'pending'
                    ? ` · expires ${formatRelative(invite.expires_at)}`
                    : ''}
                </p>
              </div>

              <Badge
                variant={
                  invite.status === 'pending'
                    ? 'info'
                    : invite.status === 'accepted'
                      ? 'success'
                      : 'neutral'
                }
                size="md"
              >
                {invite.status}
              </Badge>

              {invite.status === 'pending' && mayInvite ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Copy invitation link"
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        `${window.location.origin}/invite/${invite.token}`
                      )
                      toast.success('Invitation link copied')
                    }}
                  >
                    <Copy />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Revoke invitation"
                    className="text-destructive hover:bg-destructive-subtle"
                    onClick={async () => {
                      try {
                        await revoke.mutateAsync(invite.id)
                        toast.success('Invitation revoked')
                      } catch (caught) {
                        toast.error('Could not revoke', {
                          description: errorMessage(caught),
                        })
                      }
                    }}
                  >
                    <X />
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </Card>
      )}

      {mayInvite ? (
        <InviteMultipleDialog
          workspaceId={workspaceId}
          positions={positions ?? []}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
        />
      ) : null}
    </div>
  )
}

function InviteMultipleDialog({
  workspaceId,
  positions,
  open,
  onOpenChange,
}: {
  workspaceId: string
  positions: { id: string; name: string; slug: string | null }[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const mutation = useBulkInviteMembers(workspaceId)
  const [rows, setRows] = React.useState<InviteRow[]>([])
  const [stage, setStage] = React.useState<InviteStage>('form')
  const [results, setResults] = React.useState<BulkInviteResult[]>([])
  const [temporaryPassword, setTemporaryPassword] = React.useState(true)
  const [openedRows, setOpenedRows] = React.useState<Set<string>>(() => new Set())
  const sequence = React.useRef(0)
  const validPositionIds = React.useMemo(
    () => new Set(positions.map((position) => position.id)),
    [positions]
  )

  function newRow(): InviteRow {
    sequence.current += 1
    return {
      rowId: `invite-${sequence.current}`,
      email: '',
      fullName: '',
      positionId: '',
    }
  }

  React.useEffect(() => {
    if (!open || !positions.length) return
    setRows((current) => (current.length ? current : [newRow()]))
  }, [open, positions.length])

  function reset(nextOpen: boolean) {
    if (mutation.isPending && !nextOpen) return
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setRows([])
      setStage('form')
      setResults([])
      setTemporaryPassword(true)
      setOpenedRows(new Set())
      sequence.current = 0
    }
  }

  function updateRow(rowId: string, patch: Partial<InviteRow>) {
    setRows((current) =>
      current.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row))
    )
    setStage('form')
    setResults([])
  }

  function rowStatus(row: InviteRow, index: number): string | null {
    if (!row.email.trim() || !row.positionId) {
      return 'Email and position are required.'
    }
    if (!emailPattern.test(row.email.trim())) return 'Enter a valid email address.'
    if (!validPositionIds.has(row.positionId)) return 'Choose a current workspace position.'
    if (
      rows
        .slice(0, index)
        .some((other) => other.email.trim().toLowerCase() === row.email.trim().toLowerCase())
    ) {
      return 'This email is duplicated in another row.'
    }
    return null
  }

  const readyRows = results.filter((result) => result.status === 'ready')
  const preparedRows = results.filter(
    (result) => result.status === 'invited' && result.mailtoUrl
  )
  const remainingRows = preparedRows.filter((result) => !openedRows.has(result.rowId))
  const firstRemaining = remainingRows[0]

  async function review() {
    try {
      const preview = await mutation.mutateAsync({
        entries: rows.map(({ rowId, ...entry }) => ({ ...entry, rowId })),
        preview: true,
        createTemporaryPassword: false,
      })
      setResults(preview)
      setStage('review')
    } catch (caught) {
      toast.error('Could not review invitations', {
        description: errorMessage(caught),
      })
    }
  }

  async function createInvitations() {
    try {
      const created = await mutation.mutateAsync({
        entries: rows.map(({ rowId, ...entry }) => ({ ...entry, rowId })),
        preview: false,
        createTemporaryPassword: temporaryPassword,
      })
      setResults(created)
      setStage('prepared')
      setOpenedRows(new Set())
      const readyCount = created.filter(
        (result) => result.status === 'invited' && result.mailtoUrl
      ).length
      toast.success(`${readyCount} invitation${readyCount === 1 ? '' : 's'} ready`)
    } catch (caught) {
      toast.error('Could not prepare invitations', {
        description: errorMessage(caught),
      })
    }
  }

  function markOpened(rowId: string) {
    setOpenedRows((current) => new Set(current).add(rowId))
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Invite Multiple Members</DialogTitle>
          <DialogDescription>
            Add one person per row, choose each person’s existing workspace position,
            review the invitations, then prepare individual email drafts.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {stage === 'form' ? (
            <>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="bg-muted/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">Email</th>
                      <th className="px-3 py-2.5 font-medium">Name (optional)</th>
                      <th className="px-3 py-2.5 font-medium">Position</th>
                      <th className="w-12 px-2 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((row, index) => {
                      const error = rowStatus(row, index)
                      return (
                        <tr key={row.rowId} className={error && (row.email || row.fullName || row.positionId) ? 'bg-destructive-subtle/30' : undefined}>
                          <td className="min-w-56 px-2 py-2 align-top">
                            <Input
                              type="email"
                              value={row.email}
                              onChange={(event) => updateRow(row.rowId, { email: event.target.value })}
                              placeholder="alice@example.com"
                              aria-label={`Email for member ${index + 1}`}
                              aria-invalid={Boolean(row.email && !emailPattern.test(row.email.trim()))}
                            />
                            {error ? (
                              <p className="mt-1 px-1 text-xs text-destructive">{error}</p>
                            ) : null}
                          </td>
                          <td className="min-w-40 px-2 py-2 align-top">
                            <Input
                              value={row.fullName}
                              onChange={(event) => updateRow(row.rowId, { fullName: event.target.value })}
                              placeholder="Full name"
                              aria-label={`Name for member ${index + 1}`}
                            />
                          </td>
                          <td className="min-w-48 px-2 py-2 align-top">
                            <Select
                              value={row.positionId}
                              onValueChange={(positionId) => updateRow(row.rowId, { positionId })}
                            >
                              <SelectTrigger aria-label={`Position for member ${index + 1}`}>
                                <SelectValue placeholder="Choose a position" />
                              </SelectTrigger>
                              <SelectContent>
                                {positions.map((position) => (
                                  <SelectItem key={position.id} value={position.id}>
                                    {position.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-2 py-2 align-top">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remove member row ${index + 1}`}
                              disabled={rows.length === 1}
                              onClick={() => setRows((current) => current.filter((item) => item.rowId !== row.rowId))}
                            >
                              <Trash2 />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <Button type="button" variant="secondary" onClick={() => setRows((current) => [...current, newRow()])}>
                <Plus aria-hidden />
                Add another member
              </Button>

              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3">
                <input
                  type="checkbox"
                  checked={temporaryPassword}
                  onChange={(event) => setTemporaryPassword(event.target.checked)}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span>
                  <span className="block text-sm font-medium">
                    Create temporary password for each member
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    A unique password is generated securely on the server for each new account.
                    Existing accounts are never changed.
                  </span>
                </span>
              </label>
            </>
          ) : stage === 'review' ? (
            <>
              <p className="text-sm text-muted-foreground">
                Check each row before creating any invitations. Rows with errors will be skipped.
              </p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[650px] text-left text-sm">
                  <thead className="bg-muted/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">Email</th>
                      <th className="px-3 py-2.5 font-medium">Name</th>
                      <th className="px-3 py-2.5 font-medium">Position</th>
                      <th className="px-3 py-2.5 font-medium">Review</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {results.map((result) => (
                      <tr key={result.rowId}>
                        <td className="px-3 py-2.5">{result.email || '—'}</td>
                        <td className="px-3 py-2.5">{result.fullName || '—'}</td>
                        <td className="px-3 py-2.5">{result.positionName || '—'}</td>
                        <td className="px-3 py-2.5">
                          <Badge variant={result.status === 'ready' ? 'success' : 'danger'}>
                            {statusLabel[result.status]}
                          </Badge>
                          {result.message ? (
                            <p className="mt-1 text-xs text-destructive">{result.message}</p>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm font-medium">
                {readyRows.length} ready · {results.length - readyRows.length} need attention
              </p>
            </>
          ) : (
            <>
              <div className="rounded-lg border border-info/30 bg-info-subtle p-3 text-sm text-info">
                Email drafts are ready. Send each message from your email client.
                MIRA has not sent any email.
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  {preparedRows.length} invitation{preparedRows.length === 1 ? '' : 's'} ready
                </p>
                <p className="text-xs text-muted-foreground">
                  {remainingRows.length} {remainingRows.length === 1 ? 'email' : 'emails'} remaining
                </p>
              </div>
              {firstRemaining ? (
                <Button asChild variant="primary" className="w-full">
                  <a
                    href={firstRemaining.mailtoUrl}
                    onClick={() => markOpened(firstRemaining.rowId)}
                  >
                    <Mail />
                    Open Next Email
                  </a>
                </Button>
              ) : null}
              <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {results.map((result) => (
                  <div key={result.rowId} className="flex flex-wrap items-center gap-3 p-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success">
                      {result.status === 'invited' ? <Check className="size-4" /> : <X className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {result.fullName || result.email}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {result.positionName || result.positionId || 'Position not available'}
                        {' · '}
                        {result.email}
                      </p>
                      {result.status !== 'invited' && result.message ? (
                        <p className="mt-1 text-xs text-destructive">{result.message}</p>
                      ) : null}
                    </div>
                    {result.mailtoUrl ? (
                      <Button asChild variant="secondary" size="sm">
                        <a
                          href={result.mailtoUrl}
                          onClick={() => markOpened(result.rowId)}
                        >
                          <Mail />
                          {openedRows.has(result.rowId) ? 'Open Again' : 'Open Email'}
                        </a>
                      </Button>
                    ) : (
                      <Badge variant={result.status === 'already_member' ? 'neutral' : 'danger'}>
                        {statusLabel[result.status]}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => stage === 'review' ? setStage('form') : reset(false)}
            disabled={mutation.isPending}
          >
            {stage === 'review' ? 'Back' : 'Cancel'}
          </Button>
          {stage === 'form' ? (
            <Button
              type="button"
              variant="primary"
              loading={mutation.isPending}
              disabled={!rows.length || !positions.length}
              onClick={() => void review()}
            >
              Review invitations
            </Button>
          ) : stage === 'review' ? (
            <Button
              type="button"
              variant="primary"
              loading={mutation.isPending}
              disabled={!readyRows.length}
              onClick={() => void createInvitations()}
            >
              Create {readyRows.length} invitation{readyRows.length === 1 ? '' : 's'}
            </Button>
          ) : (
            <Button type="button" variant="primary" onClick={() => reset(false)}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
