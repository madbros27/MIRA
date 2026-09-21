'use client'

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
import { adminError, useUpdateWorkspace } from '@/lib/queries/admin'
import { PLANS } from '@/lib/types/admin'
import type { WorkspaceRow } from '@/lib/types/database'

/**
 * Plan, limits and term. These are the fields a tenant physically cannot
 * change — `authenticated` holds no UPDATE privilege on those columns, so
 * this dialog (through a SECURITY DEFINER RPC) is the only route to them.
 */
export function EditWorkspaceDialog({
  workspace,
  open,
  onOpenChange,
}: {
  workspace: WorkspaceRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const updateWorkspace = useUpdateWorkspace()

  const [name, setName] = React.useState(workspace.name)
  const [companyName, setCompanyName] = React.useState(workspace.company_name ?? '')
  const [plan, setPlan] = React.useState(workspace.plan)
  const [seatLimit, setSeatLimit] = React.useState(workspace.seat_limit)
  const [projectLimit, setProjectLimit] = React.useState(workspace.project_limit)
  const [expiresAt, setExpiresAt] = React.useState(
    workspace.expires_at ? workspace.expires_at.slice(0, 10) : ''
  )

  // Re-sync when the dialog reopens against fresher data.
  React.useEffect(() => {
    if (!open) return
    setName(workspace.name)
    setCompanyName(workspace.company_name ?? '')
    setPlan(workspace.plan)
    setSeatLimit(workspace.seat_limit)
    setProjectLimit(workspace.project_limit)
    setExpiresAt(workspace.expires_at ? workspace.expires_at.slice(0, 10) : '')
  }, [open, workspace])

  const hadExpiry = Boolean(workspace.expires_at)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()

    try {
      await updateWorkspace.mutateAsync({
        id: workspace.id,
        name: name.trim(),
        companyName: companyName.trim(),
        plan,
        seatLimit,
        projectLimit,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        // Distinguish "leave as is" from "remove the expiry entirely".
        clearExpiry: hadExpiry && !expiresAt,
      })
      toast.success('Workspace updated')
      onOpenChange(false)
    } catch (caught) {
      toast.error('Could not update the workspace', { description: adminError(caught) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Edit {workspace.name}</DialogTitle>
            <DialogDescription>
              Plan and limits. The Owner can see these but cannot change them.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Workspace name" htmlFor="edit-name" required>
                <Input
                  id="edit-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={80}
                />
              </Field>
              <Field label="Legal company name" htmlFor="edit-company">
                <Input
                  id="edit-company"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  maxLength={120}
                />
              </Field>
            </div>

            <Field label="Plan" htmlFor="edit-plan">
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger id="edit-plan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANS.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Seat limit" htmlFor="edit-seats" required>
                <Input
                  id="edit-seats"
                  type="number"
                  min={1}
                  max={10000}
                  value={seatLimit}
                  onChange={(event) => setSeatLimit(Number(event.target.value))}
                  required
                />
              </Field>
              <Field label="Project limit" htmlFor="edit-projects" required>
                <Input
                  id="edit-projects"
                  type="number"
                  min={1}
                  max={10000}
                  value={projectLimit}
                  onChange={(event) => setProjectLimit(Number(event.target.value))}
                  required
                />
              </Field>
            </div>

            <Field
              label="Renewal / expiry"
              htmlFor="edit-expiry"
              hint={
                hadExpiry && !expiresAt
                  ? 'Clearing this removes the expiry date entirely.'
                  : 'After this date the workspace stops accepting writes.'
              }
            >
              <Input
                id="edit-expiry"
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            </Field>

            <p className="rounded-lg bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              Lowering a limit below current usage does not remove anything — it
              blocks further additions until the tenant is back under the cap.
            </p>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={updateWorkspace.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={updateWorkspace.isPending}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
