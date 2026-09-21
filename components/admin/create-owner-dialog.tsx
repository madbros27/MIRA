'use client'

import { Copy, UserPlus } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/controls'
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
import {
  adminError,
  useAdminWorkspaces,
  useCreateOwner,
  type CreateOwnerResult,
} from '@/lib/queries/admin'

const UNASSIGNED = '__none__'

/**
 * Create an Owner from the Owners page, optionally attaching them to a
 * workspace in the same step. The workspace-detail page has its own variant
 * (`AssignOwnerDialog`) where the workspace is already known.
 */
export function CreateOwnerDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const createOwner = useCreateOwner()
  const { data: workspaces } = useAdminWorkspaces('', 'active')

  const [fullName, setFullName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [workspaceId, setWorkspaceId] = React.useState(UNASSIGNED)
  const [mode, setMode] = React.useState<'invite' | 'password'>('invite')
  const [password, setPassword] = React.useState('')
  const [makePrimary, setMakePrimary] = React.useState(true)
  const [result, setResult] = React.useState<CreateOwnerResult | null>(null)

  function reset() {
    setFullName('')
    setEmail('')
    setPhone('')
    setWorkspaceId(UNASSIGNED)
    setMode('invite')
    setPassword('')
    setMakePrimary(true)
    setResult(null)
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    try {
      const created = await createOwner.mutateAsync({
        email: email.trim(),
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        password: mode === 'password' ? password : undefined,
        workspaceId: workspaceId === UNASSIGNED ? undefined : workspaceId,
        makePrimary,
      })
      toast.success('Owner account created')
      setResult(created)
    } catch (caught) {
      toast.error('Could not create the owner', { description: adminError(caught) })
    }
  }

  const secret = result?.inviteUrl ?? result?.temporaryPassword ?? ''

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>Owner created</DialogTitle>
              <DialogDescription>{result.email}</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {result.emailed
                  ? 'An invitation email has been sent. The link below is the same one, in case it does not arrive.'
                  : 'Email delivery is not configured on this Supabase project — pass this to the customer yourself.'}
              </p>
              {secret ? (
                <Field
                  label={result.inviteUrl ? 'Invitation link' : 'Temporary password'}
                  htmlFor="new-owner-secret"
                >
                  <div className="flex gap-2">
                    <Input
                      id="new-owner-secret"
                      readOnly
                      value={secret}
                      className="font-mono text-xs"
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      aria-label="Copy"
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
              {workspaceId === UNASSIGNED ? (
                <p className="rounded-lg bg-warning-subtle px-3 py-2.5 text-xs leading-relaxed text-warning">
                  This owner is not attached to a workspace yet. Open a workspace
                  and use “Assign an Owner” to finish onboarding.
                </p>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={reset}>
                Create another
              </Button>
              <Button variant="primary" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>New owner</DialogTitle>
              <DialogDescription>
                An Owner signs in at the tenant portal and runs one company&apos;s
                workspace.
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" htmlFor="new-owner-name" required>
                  <Input
                    id="new-owner-name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Jane Okafor"
                    required
                    autoFocus
                  />
                </Field>
                <Field label="Phone" htmlFor="new-owner-phone">
                  <Input
                    id="new-owner-phone"
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+1 555 0100"
                  />
                </Field>
              </div>

              <Field label="Email" htmlFor="new-owner-email" required>
                <Input
                  id="new-owner-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="jane@acme.com"
                  required
                />
              </Field>

              <Field
                label="Workspace"
                htmlFor="new-owner-workspace"
                hint="Optional — you can assign one later."
              >
                <Select value={workspaceId} onValueChange={setWorkspaceId}>
                  <SelectTrigger id="new-owner-workspace">
                    <SelectValue placeholder="Assign later" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Assign later</SelectItem>
                    {(workspaces ?? []).map((workspace) => (
                      <SelectItem key={workspace.id} value={workspace.id}>
                        {workspace.name}
                        {workspace.owners.length ? ' (has an owner)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Credentials" htmlFor="new-owner-mode">
                <Select
                  value={mode}
                  onValueChange={(value) => setMode(value as 'invite' | 'password')}
                >
                  <SelectTrigger id="new-owner-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invite">Email an invitation link</SelectItem>
                    <SelectItem value="password">Set a temporary password</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {mode === 'password' ? (
                <Field
                  label="Temporary password"
                  htmlFor="new-owner-password"
                  required
                  hint="At least 10 characters. Ask them to change it at first login."
                >
                  <Input
                    id="new-owner-password"
                    type="text"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={10}
                    required
                    autoComplete="off"
                  />
                </Field>
              ) : null}

              {workspaceId !== UNASSIGNED ? (
                <label className="flex items-center gap-2.5 text-xs">
                  <Checkbox
                    checked={makePrimary}
                    onCheckedChange={(value) => setMakePrimary(Boolean(value))}
                  />
                  <span>Make them the primary owner of that workspace</span>
                </label>
              ) : null}
            </DialogBody>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={createOwner.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={createOwner.isPending}
                disabled={
                  !email.trim() ||
                  !fullName.trim() ||
                  (mode === 'password' && password.length < 10)
                }
              >
                <UserPlus aria-hidden />
                Create owner
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
