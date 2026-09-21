'use client'

import {
  Archive,
  Eye,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/primitives'
import { formatDate } from '@/lib/format'
import {
  adminError,
  useHardDeleteWorkspace,
  useRestoreWorkspace,
  useSetWorkspaceStatus,
  useSoftDeleteWorkspace,
  useStartImpersonation,
} from '@/lib/queries/admin'
import { WORKSPACE_STATUS_META } from '@/lib/types/admin'
import type { WorkspaceRow } from '@/lib/types/database'

const RETENTION_DAYS = 30

export function WorkspaceLifecycle({ workspace }: { workspace: WorkspaceRow }) {
  const setStatus = useSetWorkspaceStatus()
  const restore = useRestoreWorkspace()

  const [suspendOpen, setSuspendOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [purgeOpen, setPurgeOpen] = React.useState(false)
  const [supportOpen, setSupportOpen] = React.useState(false)

  const isDeleted = Boolean(workspace.deleted_at)

  async function changeStatus(status: 'active' | 'archived', label: string) {
    try {
      await setStatus.mutateAsync({ id: workspace.id, status })
      toast.success(label)
    } catch (caught) {
      toast.error('Could not change the status', { description: adminError(caught) })
    }
  }

  return (
    <div className="space-y-4">
      {/* What each state means ------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Current state</CardTitle>
          <CardDescription>{WORKSPACE_STATUS_META[workspace.status].help}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {workspace.status === 'suspended' ? (
            <Button
              variant="primary"
              onClick={() => void changeStatus('active', 'Workspace reactivated')}
              loading={setStatus.isPending}
            >
              <PlayCircle aria-hidden />
              Reactivate
            </Button>
          ) : workspace.status === 'active' ? (
            <Button variant="secondary" onClick={() => setSuspendOpen(true)}>
              <PauseCircle aria-hidden />
              Suspend
            </Button>
          ) : null}

          {workspace.status === 'archived' ? (
            <Button
              variant="secondary"
              onClick={() => void changeStatus('active', 'Workspace reactivated')}
              loading={setStatus.isPending}
            >
              <PlayCircle aria-hidden />
              Unarchive
            </Button>
          ) : workspace.status === 'active' ? (
            <Button
              variant="secondary"
              onClick={() => void changeStatus('archived', 'Workspace archived — it is now read-only')}
              loading={setStatus.isPending}
            >
              <Archive aria-hidden />
              Archive
            </Button>
          ) : null}

          {isDeleted ? (
            <Button
              variant="secondary"
              loading={restore.isPending}
              onClick={async () => {
                try {
                  await restore.mutateAsync(workspace.id)
                  toast.success('Workspace restored')
                } catch (caught) {
                  toast.error('Could not restore', { description: adminError(caught) })
                }
              }}
            >
              <RotateCcw aria-hidden />
              Restore
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {/* Support session -------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Support session</CardTitle>
          <CardDescription>
            Open this customer&apos;s workspace read-only to reproduce a problem.
            The session is time-boxed and every minute of it is in the audit log.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="secondary"
            onClick={() => setSupportOpen(true)}
            disabled={workspace.status !== 'active'}
          >
            <Eye aria-hidden />
            View as Owner
          </Button>
          {workspace.status !== 'active' ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Only available while the workspace is active.
            </p>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              You will see their projects and reports. You will not be able to
              change anything: a system administrator holds no capabilities
              inside a tenant, so every write is refused by the database.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Danger zone ------------------------------------------------------ */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <TriangleAlert className="size-4" aria-hidden />
            Danger zone
          </CardTitle>
          <CardDescription>
            {isDeleted
              ? `Soft-deleted ${formatDate(workspace.deleted_at)}. Data is retained for ${RETENTION_DAYS} days, then may be purged.`
              : `Deleting hides the workspace from its members immediately. Data is kept for ${RETENTION_DAYS} days so it can be restored.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {!isDeleted ? (
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 aria-hidden />
              Delete workspace
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => setPurgeOpen(true)}>
              <Trash2 aria-hidden />
              Permanently delete
            </Button>
          )}
        </CardContent>
      </Card>

      <SuspendDialog
        workspace={workspace}
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
      />
      <DeleteDialog
        workspace={workspace}
        mode="soft"
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
      <DeleteDialog
        workspace={workspace}
        mode="hard"
        open={purgeOpen}
        onOpenChange={setPurgeOpen}
      />
      <SupportSessionDialog
        workspace={workspace}
        open={supportOpen}
        onOpenChange={setSupportOpen}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Suspend                                                                    */
/* -------------------------------------------------------------------------- */

function SuspendDialog({
  workspace,
  open,
  onOpenChange,
}: {
  workspace: WorkspaceRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const setStatus = useSetWorkspaceStatus()
  const [reason, setReason] = React.useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suspend {workspace.name}?</DialogTitle>
          <DialogDescription>
            Everyone in this workspace is locked out until you reactivate it.
            Nothing is deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field
            label="Reason"
            htmlFor="suspend-reason"
            hint="Recorded in the audit log. Not shown to the customer."
          >
            <Textarea
              id="suspend-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Invoice 90 days overdue"
              rows={3}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={setStatus.isPending}
            onClick={async () => {
              try {
                await setStatus.mutateAsync({
                  id: workspace.id,
                  status: 'suspended',
                  reason: reason.trim() || undefined,
                })
                toast.success('Workspace suspended')
                onOpenChange(false)
                setReason('')
              } catch (caught) {
                toast.error('Could not suspend', { description: adminError(caught) })
              }
            }}
          >
            Suspend workspace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/* Delete — typing the name is required, and checked again in Postgres        */
/* -------------------------------------------------------------------------- */

function DeleteDialog({
  workspace,
  mode,
  open,
  onOpenChange,
}: {
  workspace: WorkspaceRow
  mode: 'soft' | 'hard'
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const softDelete = useSoftDeleteWorkspace()
  const hardDelete = useHardDeleteWorkspace()
  const [confirm, setConfirm] = React.useState('')

  const pending = mode === 'soft' ? softDelete.isPending : hardDelete.isPending
  const matches = confirm.trim() === workspace.name

  async function run() {
    try {
      if (mode === 'soft') {
        await softDelete.mutateAsync({ id: workspace.id, confirmName: confirm.trim() })
        toast.success('Workspace deleted', {
          description: `Retained for ${RETENTION_DAYS} days — you can still restore it.`,
        })
        onOpenChange(false)
      } else {
        await hardDelete.mutateAsync({ id: workspace.id, confirmName: confirm.trim() })
        toast.success('Workspace permanently deleted')
        router.push('/miraadmin/workspaces')
      }
      setConfirm('')
    } catch (caught) {
      toast.error('Could not delete the workspace', { description: adminError(caught) })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setConfirm('')
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-destructive">
            {mode === 'soft' ? 'Delete' : 'Permanently delete'} {workspace.name}?
          </DialogTitle>
          <DialogDescription>
            {mode === 'soft' ? (
              <>
                The workspace disappears for its {workspace.seat_limit}-seat team
                immediately. Its data is kept for {RETENTION_DAYS} days and can
                be restored from this page.
              </>
            ) : (
              <>
                This erases every project, issue, comment and attachment in this
                workspace. It cannot be undone and there is no backup on this
                side.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          {mode === 'hard' ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive-subtle px-3.5 py-3 text-xs text-destructive">
              <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden />
              <p className="leading-relaxed">
                Make sure the customer has exported anything they need. Once this
                completes, only the audit-log entry remains.
              </p>
            </div>
          ) : null}

          <Field
            label={
              <>
                Type <strong className="font-semibold text-foreground">{workspace.name}</strong> to
                confirm
              </>
            }
            htmlFor="delete-confirm"
          >
            <Input
              id="delete-confirm"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder={workspace.name}
              autoComplete="off"
              aria-invalid={confirm.length > 0 && !matches}
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!matches}
            loading={pending}
            onClick={() => void run()}
          >
            {mode === 'soft' ? 'Delete workspace' : 'Permanently delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/* Support session                                                            */
/* -------------------------------------------------------------------------- */

function SupportSessionDialog({
  workspace,
  open,
  onOpenChange,
}: {
  workspace: WorkspaceRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const start = useStartImpersonation()
  const [reason, setReason] = React.useState('')
  const [minutes, setMinutes] = React.useState(30)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>View {workspace.name} as its Owner</DialogTitle>
          <DialogDescription>
            A read-only support session. You will be taken to the tenant app with
            a banner showing whose workspace you are in.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <Field
            label="Why are you opening this session?"
            htmlFor="support-reason"
            required
            hint="Recorded permanently in the audit log."
          >
            <Textarea
              id="support-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ticket #4821 — customer reports the board is empty after a sprint completes"
              rows={3}
              required
            />
          </Field>

          <Field label="Session length" htmlFor="support-minutes">
            <Input
              id="support-minutes"
              type="number"
              min={5}
              max={240}
              step={5}
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={start.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={start.isPending}
            disabled={reason.trim().length < 5}
            onClick={async () => {
              try {
                await start.mutateAsync({
                  workspaceId: workspace.id,
                  reason: reason.trim(),
                  minutes,
                })
                router.push('/dashboard')
              } catch (caught) {
                toast.error('Could not start the session', {
                  description: adminError(caught),
                })
              }
            }}
          >
            <Eye aria-hidden />
            Start session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
