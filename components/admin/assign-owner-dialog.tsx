'use client'

import { Copy, Search, UserPlus } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls'
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
import { Avatar, Badge, EmptyState } from '@/components/ui/primitives'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import {
  adminError,
  useAdminOwners,
  useAssignOwner,
  useCreateOwner,
  type CreateOwnerResult,
} from '@/lib/queries/admin'

/**
 * Two ways to give a workspace an Owner:
 *
 *   "New owner"      mint an account (service-role, via /api/admin/owners) and
 *                    attach it in one step.
 *   "Existing owner" attach somebody who already owns another workspace —
 *                    useful for a customer buying a second tenant.
 */
export function AssignOwnerDialog({
  workspaceId,
  workspaceName,
  hasPrimary,
  open,
  onOpenChange,
}: {
  workspaceId: string
  workspaceName: string
  hasPrimary: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [result, setResult] = React.useState<CreateOwnerResult | null>(null)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setResult(null)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign an Owner</DialogTitle>
          <DialogDescription>
            The Owner runs {workspaceName}: projects, positions, invitations and
            settings.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <CredentialsHandoff result={result} onClose={() => onOpenChange(false)} />
        ) : (
          <Tabs defaultValue="new">
            <div className="px-4 sm:px-5">
              <TabsList className="w-full">
                <TabsTrigger value="new" className="flex-1">
                  New owner
                </TabsTrigger>
                <TabsTrigger value="existing" className="flex-1">
                  Existing owner
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="new">
              <NewOwnerForm
                workspaceId={workspaceId}
                makePrimaryDefault={!hasPrimary}
                onDone={setResult}
                onCancel={() => onOpenChange(false)}
              />
            </TabsContent>

            <TabsContent value="existing">
              <ExistingOwnerPicker
                workspaceId={workspaceId}
                makePrimaryDefault={!hasPrimary}
                onDone={() => onOpenChange(false)}
                onCancel={() => onOpenChange(false)}
              />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/* Create a new owner                                                         */
/* -------------------------------------------------------------------------- */

function NewOwnerForm({
  workspaceId,
  makePrimaryDefault,
  onDone,
  onCancel,
}: {
  workspaceId: string
  makePrimaryDefault: boolean
  onDone: (result: CreateOwnerResult) => void
  onCancel: () => void
}) {
  const createOwner = useCreateOwner()

  const [fullName, setFullName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [mode, setMode] = React.useState<'invite' | 'password'>('invite')
  const [password, setPassword] = React.useState('')
  const [makePrimary, setMakePrimary] = React.useState(makePrimaryDefault)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()

    try {
      const result = await createOwner.mutateAsync({
        email: email.trim(),
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        password: mode === 'password' ? password : undefined,
        workspaceId,
        makePrimary,
      })
      toast.success(`${fullName.trim() || email.trim()} is now an Owner`)
      onDone(result)
    } catch (caught) {
      toast.error('Could not create the owner', { description: adminError(caught) })
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <DialogBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="owner-name" required>
            <Input
              id="owner-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Jane Okafor"
              required
              autoFocus
            />
          </Field>
          <Field label="Phone" htmlFor="owner-phone">
            <Input
              id="owner-phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+1 555 0100"
            />
          </Field>
        </div>

        <Field label="Email" htmlFor="owner-email" required>
          <Input
            id="owner-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="jane@acme.com"
            required
          />
        </Field>

        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-xs font-medium text-muted-foreground">
            How should they get in?
          </legend>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 transition-colors hover:bg-muted/40 has-[:checked]:border-primary has-[:checked]:bg-primary-subtle/40">
            <input
              type="radio"
              name="owner-mode"
              checked={mode === 'invite'}
              onChange={() => setMode('invite')}
              className="mt-0.5 accent-[hsl(var(--primary))]"
            />
            <span className="text-xs">
              <span className="block font-medium text-foreground">
                Email an invitation link
              </span>
              <span className="text-muted-foreground">
                They choose their own password. Nothing secret to hand over.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 transition-colors hover:bg-muted/40 has-[:checked]:border-primary has-[:checked]:bg-primary-subtle/40">
            <input
              type="radio"
              name="owner-mode"
              checked={mode === 'password'}
              onChange={() => setMode('password')}
              className="mt-0.5 accent-[hsl(var(--primary))]"
            />
            <span className="text-xs">
              <span className="block font-medium text-foreground">
                Set a temporary password
              </span>
              <span className="text-muted-foreground">
                For onboarding over a call. Ask them to change it immediately.
              </span>
            </span>
          </label>
        </fieldset>

        {mode === 'password' ? (
          <Field
            label="Temporary password"
            htmlFor="owner-password"
            required
            hint="At least 10 characters."
          >
            <Input
              id="owner-password"
              type="text"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={10}
              required
              autoComplete="off"
            />
          </Field>
        ) : null}

        <label className="flex items-center gap-2.5 text-xs">
          <Checkbox checked={makePrimary} onCheckedChange={(value) => setMakePrimary(Boolean(value))} />
          <span>
            Make them the <strong className="font-medium">primary</strong> owner
            {!makePrimaryDefault ? ' (replaces the current primary)' : ''}
          </span>
        </label>
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={createOwner.isPending}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={createOwner.isPending}
          disabled={!email.trim() || !fullName.trim() || (mode === 'password' && password.length < 10)}
        >
          <UserPlus aria-hidden />
          Create &amp; assign
        </Button>
      </DialogFooter>
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/* Attach an existing owner                                                   */
/* -------------------------------------------------------------------------- */

function ExistingOwnerPicker({
  workspaceId,
  makePrimaryDefault,
  onDone,
  onCancel,
}: {
  workspaceId: string
  makePrimaryDefault: boolean
  onDone: () => void
  onCancel: () => void
}) {
  const [search, setSearch] = React.useState('')
  const debounced = useDebouncedValue(search, 250)
  const { data, isLoading } = useAdminOwners(debounced)
  const assignOwner = useAssignOwner()

  const [selected, setSelected] = React.useState<string | null>(null)
  const [makePrimary, setMakePrimary] = React.useState(makePrimaryDefault)

  // Somebody who already owns this workspace is not a candidate.
  const candidates = (data ?? []).filter(
    (owner) => !owner.workspaces.some((entry) => entry.workspace_id === workspaceId)
  )

  async function assign() {
    if (!selected) return
    try {
      await assignOwner.mutateAsync({ workspaceId, userId: selected, isPrimary: makePrimary })
      toast.success('Owner assigned')
      onDone()
    } catch (caught) {
      toast.error('Could not assign the owner', { description: adminError(caught) })
    }
  }

  return (
    <>
      <DialogBody className="space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search owners by name or email…"
            className="pl-9"
            aria-label="Search existing owners"
          />
        </div>

        <div className="max-h-64 space-y-1 overflow-y-auto">
          {isLoading ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Searching…</p>
          ) : !candidates.length ? (
            <EmptyState
              compact
              title="No other owners found"
              description="Use the “New owner” tab to create one."
            />
          ) : (
            candidates.map((owner) => (
              <button
                key={owner.user_id}
                type="button"
                onClick={() => setSelected(owner.user_id)}
                aria-pressed={selected === owner.user_id}
                className={`flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors ${
                  selected === owner.user_id
                    ? 'border-primary bg-primary-subtle/50'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                <Avatar
                  id={owner.user_id}
                  name={owner.full_name ?? owner.email}
                  src={owner.avatar_url}
                  size="sm"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">
                    {owner.full_name ?? owner.email}
                  </span>
                  <span className="block truncate text-2xs text-muted-foreground">
                    {owner.email}
                  </span>
                </span>
                <Badge variant="outline">
                  {owner.workspaces.length} workspace{owner.workspaces.length === 1 ? '' : 's'}
                </Badge>
              </button>
            ))
          )}
        </div>

        <label className="flex items-center gap-2.5 text-xs">
          <Checkbox checked={makePrimary} onCheckedChange={(value) => setMakePrimary(Boolean(value))} />
          <span>Make them the primary owner</span>
        </label>
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={assignOwner.isPending}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => void assign()}
          loading={assignOwner.isPending}
          disabled={!selected}
        >
          Assign owner
        </Button>
      </DialogFooter>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Post-create handoff                                                        */
/* -------------------------------------------------------------------------- */

function CredentialsHandoff({
  result,
  onClose,
}: {
  result: CreateOwnerResult
  onClose: () => void
}) {
  const secret = result.inviteUrl ?? result.temporaryPassword ?? ''

  return (
    <>
      <DialogBody className="space-y-4">
        <div className="rounded-lg border border-success/30 bg-success-subtle px-3.5 py-3">
          <p className="text-sm font-medium text-success">Owner account created</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{result.email}</p>
        </div>

        {result.emailed ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            An invitation email is on its way. If it does not arrive, the link
            below works just as well — it is the same one.
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Email delivery is not configured on this Supabase project, so pass
            this to the customer through a channel you trust.
          </p>
        )}

        {secret ? (
          <Field
            label={result.inviteUrl ? 'Invitation link' : 'Temporary password'}
            htmlFor="handoff-secret"
          >
            <div className="flex gap-2">
              <Input
                id="handoff-secret"
                readOnly
                value={secret}
                className="font-mono text-xs"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="Copy to clipboard"
                onClick={async () => {
                  await navigator.clipboard.writeText(secret)
                  toast.success('Copied')
                }}
              >
                <Copy />
              </Button>
            </div>
          </Field>
        ) : null}

        <p className="rounded-lg bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          This is shown once. Closing this dialog discards it — you can always
          send a fresh password reset from the Owners page.
        </p>
      </DialogBody>

      <DialogFooter>
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  )
}
