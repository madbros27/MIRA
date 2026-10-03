'use client'

import { Copy, Mail, MailPlus, Users, X } from 'lucide-react'
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
import { Field, Input } from '@/components/ui/input'
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/primitives'
import { formatRelative } from '@/lib/format'
import { can, type Grants } from '@/lib/permissions'
import {
  useInviteMember,
  useBulkInviteMembers,
  type BulkInviteResult,
  useInvites,
  usePositions,
  useRevokeInvite,
} from '@/lib/queries/workspaces'
import { errorMessage } from '@/lib/utils'

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
  const revoke = useRevokeInvite(workspaceId)
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [bulkInviteOpen, setBulkInviteOpen] = React.useState(false)

  const mayInvite = can.inviteMembers(caps)
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
          <div className="flex gap-2">
            {isOwner ? (
              <Button
                variant="secondary"
                onClick={() => setBulkInviteOpen(true)}
                disabled={seatsLeft <= 0}
              >
                <Users aria-hidden />
                Add Members
              </Button>
            ) : null}
            <Button variant="primary" onClick={() => setInviteOpen(true)} disabled={seatsLeft <= 0}>
              <MailPlus aria-hidden />
              Invite someone
            </Button>
          </div>
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
              ? 'Invite a colleague by email. They pick a position when you send it, and land straight in the workspace once they accept.'
              : 'Nobody has been invited yet.'
          }
          action={
            mayInvite ? (
              <Button variant="primary" onClick={() => setInviteOpen(true)} disabled={seatsLeft <= 0}>
                <MailPlus aria-hidden />
                Invite someone
              </Button>
            ) : undefined
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

      <InviteDialog
        workspaceId={workspaceId}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />
      {isOwner ? (
        <BulkInviteDialog
          workspaceId={workspaceId}
          open={bulkInviteOpen}
          onOpenChange={setBulkInviteOpen}
        />
      ) : null}
    </div>
  )
}

type ParsedRecipient = {
  email: string
  status: 'ready' | 'invalid' | 'duplicate'
}

function parseRecipients(input: string): ParsedRecipient[] {
  const seen = new Set<string>()
  return input
    .split(/[\r\n,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .map((email) => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { email, status: 'invalid' as const }
      }
      if (seen.has(email)) return { email, status: 'duplicate' as const }
      seen.add(email)
      return { email, status: 'ready' as const }
    })
}

const inviteResultLabel: Record<BulkInviteResult['status'], string> = {
  invited: 'Invited',
  already_member: 'Already a member',
  already_invited: 'Invitation pending',
  invalid: 'Invalid email',
  duplicate: 'Duplicate',
  failed: 'Invitation failed',
}

function BulkInviteDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const bulkInvite = useBulkInviteMembers(workspaceId)
  const { data: positions } = usePositions(workspaceId)
  const [input, setInput] = React.useState('')
  const [positionId, setPositionId] = React.useState('')
  const [results, setResults] = React.useState<BulkInviteResult[] | null>(null)
  const parsed = React.useMemo(() => parseRecipients(input), [input])
  const ready = parsed.filter((recipient) => recipient.status === 'ready')
  const invalidCount = parsed.filter((recipient) => recipient.status === 'invalid').length
  const duplicateCount = parsed.filter((recipient) => recipient.status === 'duplicate').length

  React.useEffect(() => {
    if (positionId || !positions?.length) return
    const fallback =
      positions.find((position) => position.slug === 'member') ?? positions[0]
    setPositionId(fallback.id)
  }, [positions, positionId])

  function close(nextOpen: boolean) {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setInput('')
      setResults(null)
      setPositionId('')
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const sentResults = await bulkInvite.mutateAsync({
        emails: ready.map((recipient) => recipient.email),
        positionId,
      })
      const byEmail = new Map(sentResults.map((result) => [result.email, result]))
      const allResults = parsed.map((recipient): BulkInviteResult => {
        if (recipient.status === 'invalid') {
          return { email: recipient.email, status: 'invalid' }
        }
        if (recipient.status === 'duplicate') {
          return { email: recipient.email, status: 'duplicate' }
        }
        return byEmail.get(recipient.email) ?? {
          email: recipient.email,
          status: 'failed',
          message: 'No result was returned for this invitation',
        }
      })
      setResults(allResults)
      const invitedCount = allResults.filter((result) => result.status === 'invited').length
      toast.success('Invitation processing complete', {
        description: `${invitedCount} invitation${invitedCount === 1 ? '' : 's'} created`,
      })
    } catch (caught) {
      toast.error('Could not process invitations', {
        description: errorMessage(caught),
      })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && bulkInvite.isPending) return
        close(nextOpen)
      }}
    >
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add Members</DialogTitle>
            <DialogDescription>
              Enter one email per line, or separate addresses with commas or semicolons.
              Each invitation uses the selected position.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {!results ? (
              <>
                <Field label="Email addresses" htmlFor="bulk-invite-emails" required>
                  <textarea
                    id="bulk-invite-emails"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder={'member1@example.com\nmember2@example.com'}
                    rows={5}
                    className="w-full resize-y rounded-lg border border-input bg-surface px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </Field>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="success">{ready.length} valid recipients</Badge>
                  <Badge variant={invalidCount ? 'danger' : 'neutral'}>
                    {invalidCount} invalid
                  </Badge>
                  <Badge variant={duplicateCount ? 'warning' : 'neutral'}>
                    {duplicateCount} duplicates
                  </Badge>
                </div>
                {parsed.length ? (
                  <div
                    className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2"
                    aria-label="Review recipients"
                  >
                    {parsed.map((recipient, index) => (
                      <div
                        key={`${recipient.email}-${index}`}
                        className="flex items-center justify-between gap-3 px-1 py-1 text-sm"
                      >
                        <span className="min-w-0 truncate">{recipient.email}</span>
                        <Badge
                          variant={
                            recipient.status === 'ready'
                              ? 'success'
                              : recipient.status === 'invalid'
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {recipient.status === 'ready'
                            ? 'Ready'
                            : recipient.status === 'invalid'
                              ? 'Invalid email'
                              : 'Duplicate'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : null}
                <Field label="Position" htmlFor="bulk-invite-position" required>
                  <Select value={positionId} onValueChange={setPositionId}>
                    <SelectTrigger id="bulk-invite-position">
                      <SelectValue placeholder="Choose a position" />
                    </SelectTrigger>
                    <SelectContent>
                      {(positions ?? []).map((position) => (
                        <SelectItem key={position.id} value={position.id}>
                          {position.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </>
            ) : (
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                {results.map((result, index) => (
                  <div
                    key={`${result.email}-${index}`}
                    className="flex items-start justify-between gap-3 px-1 py-1.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate">{result.email}</p>
                      {result.message ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{result.message}</p>
                      ) : null}
                    </div>
                    <Badge
                      variant={
                        result.status === 'invited' || result.status === 'already_member'
                          ? 'success'
                          : result.status === 'failed' || result.status === 'invalid'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {inviteResultLabel[result.status]}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => close(false)}
              disabled={bulkInvite.isPending}
            >
              {results ? 'Done' : 'Cancel'}
            </Button>
            {results ? null : (
              <Button
                type="submit"
                variant="primary"
                loading={bulkInvite.isPending}
                disabled={!ready.length || !positionId}
              >
                Invite {ready.length || ''} member{ready.length === 1 ? '' : 's'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function InviteDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const invite = useInviteMember(workspaceId)
  const { data: positions } = usePositions(workspaceId)

  const [email, setEmail] = React.useState('')
  const [fullName, setFullName] = React.useState('')
  const [positionId, setPositionId] = React.useState('')
  const [createTemporaryPassword, setCreateTemporaryPassword] = React.useState(false)
  const [link, setLink] = React.useState<string | null>(null)
  const [mailtoUrl, setMailtoUrl] = React.useState<string | null>(null)

  // Default to the "member" position once the list arrives.
  React.useEffect(() => {
    if (positionId || !positions?.length) return
    const fallback =
      positions.find((position) => position.slug === 'member') ?? positions[0]
    setPositionId(fallback.id)
  }, [positions, positionId])

  const selected = positions?.find((position) => position.id === positionId)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setEmail('')
          setFullName('')
          setLink(null)
          setMailtoUrl(null)
          setCreateTemporaryPassword(false)
        }
      }}
    >
      <DialogContent>
        {link ? (
          <>
            <DialogHeader>
              <DialogTitle>{mailtoUrl ? 'Invitation prepared' : 'Invitation sent'}</DialogTitle>
              <DialogDescription>{email}</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-3">
              {mailtoUrl ? (
                <Button asChild variant="primary" className="w-full">
                  <a href={mailtoUrl}>
                    <Mail />
                    Open email draft
                  </a>
                </Button>
              ) : null}
              <Field label="Invitation link" htmlFor="invite-link">
                <div className="flex gap-2">
                  <Input
                    id="invite-link"
                    readOnly
                    value={link}
                    className="font-mono text-xs"
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label="Copy"
                    onClick={async () => {
                      await navigator.clipboard.writeText(link)
                      toast.success('Copied')
                    }}
                  >
                    <Copy />
                  </Button>
                </div>
              </Field>
              <p className="text-xs leading-relaxed text-muted-foreground">
                The link expires in 14 days.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button variant="primary" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={async (event) => {
              event.preventDefault()
              try {
                const result = await invite.mutateAsync({
                  email: email.trim(),
                  positionId,
                  fullName: fullName.trim() || undefined,
                  createTemporaryPassword,
                })
                toast.success(result.mailtoUrl ? 'Invitation prepared' : result.emailed ? `Invitation emailed to ${email.trim()}` : 'Invitation created')
                setLink(result.inviteUrl ?? null)
                setMailtoUrl(result.mailtoUrl ?? null)
              } catch (caught) {
                toast.error('Could not send the invitation', {
                  description: errorMessage(caught),
                })
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>Invite someone</DialogTitle>
              <DialogDescription>
                They join with the position you pick here. You can change it
                later from the directory.
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-4">
              <Field label="Email" htmlFor="invite-email" required>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="colleague@yourcompany.com"
                  required
                  autoFocus
                />
              </Field>

              <Field label="Name" htmlFor="invite-name" hint="Optional — helps them feel expected.">
                <Input
                  id="invite-name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Sam Rivera"
                />
              </Field>

              <Field label="Position" htmlFor="invite-position" required>
                <Select value={positionId} onValueChange={setPositionId}>
                  <SelectTrigger id="invite-position">
                    <SelectValue placeholder="Choose a position" />
                  </SelectTrigger>
                  <SelectContent>
                    {(positions ?? []).map((position) => (
                      <SelectItem key={position.id} value={position.id}>
                        {position.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {selected ? (
                <div className="rounded-lg bg-muted px-3 py-2.5">
                  <p className="text-xs font-medium">
                    {selected.name} grants {selected.capabilities.length} capabilit
                    {selected.capabilities.length === 1 ? 'y' : 'ies'}
                  </p>
                  {selected.description ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {selected.description}
                    </p>
                  ) : null}
                  <p className="mt-1.5 text-2xs text-muted-foreground">
                    Project access is separate — add them to projects after they
                    accept.
                  </p>
                </div>
              ) : null}

              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3">
                <input
                  type="checkbox"
                  checked={createTemporaryPassword}
                  onChange={(event) => setCreateTemporaryPassword(event.target.checked)}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span>
                  <span className="block text-sm font-medium">Create temporary password</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Prepare an email draft with secure login details for a new MIRA account.
                  </span>
                </span>
              </label>
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={invite.isPending}
                disabled={!email.trim() || !positionId}
              >
                Send invitation
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
