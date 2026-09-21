'use client'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/controls'
import { Field, Input } from '@/components/ui/input'
import { adminError, useCreateWorkspace } from '@/lib/queries/admin'
import { PLANS, type PlanId } from '@/lib/types/admin'

/** `Acme Corp.` -> `acme-corp`; the database de-duplicates if it collides. */
function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function addDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const createWorkspace = useCreateWorkspace()

  const [name, setName] = React.useState('')
  const [slug, setSlug] = React.useState('')
  const [slugTouched, setSlugTouched] = React.useState(false)
  const [companyName, setCompanyName] = React.useState('')
  const [plan, setPlan] = React.useState<PlanId>('trial')
  const [seatLimit, setSeatLimit] = React.useState(10)
  const [projectLimit, setProjectLimit] = React.useState(3)
  const [startsAt, setStartsAt] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [expiresAt, setExpiresAt] = React.useState(() => addDays(14))

  // Picking a plan pre-fills its limits and term; both stay editable, because
  // a negotiated contract rarely matches the list price exactly.
  function applyPlan(next: PlanId) {
    setPlan(next)
    const preset = PLANS.find((entry) => entry.id === next)
    if (!preset) return
    setSeatLimit(preset.seats)
    setProjectLimit(preset.projects)
    setExpiresAt(addDays(preset.days))
  }

  function reset() {
    setName('')
    setSlug('')
    setSlugTouched(false)
    setCompanyName('')
    applyPlan('trial')
    setStartsAt(new Date().toISOString().slice(0, 10))
  }

  const effectiveSlug = slugTouched ? slug : slugify(name)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return

    try {
      const workspace = await createWorkspace.mutateAsync({
        name: name.trim(),
        slug: effectiveSlug || undefined,
        companyName: companyName.trim() || name.trim(),
        plan,
        seatLimit,
        projectLimit,
        startsAt: startsAt || null,
        expiresAt: expiresAt || null,
      })

      toast.success(`Workspace “${name.trim()}” created`, {
        description: 'Next: create an Owner account and assign it to this workspace.',
      })
      onOpenChange(false)
      reset()
      router.push(`/miraadmin/workspaces/${(workspace as { id: string }).id}`)
    } catch (caught) {
      toast.error('Could not create the workspace', {
        description: adminError(caught),
      })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
            <DialogDescription>
              Provision a tenant for a customer. You will assign its Owner in the
              next step.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <Field label="Workspace name" htmlFor="ws-name" required>
              <Input
                id="ws-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Acme Corp"
                required
                autoFocus
                maxLength={80}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="URL slug"
                htmlFor="ws-slug"
                hint="Must be unique across the platform."
              >
                <Input
                  id="ws-slug"
                  value={effectiveSlug}
                  onChange={(event) => {
                    setSlugTouched(true)
                    setSlug(slugify(event.target.value))
                  }}
                  placeholder="acme-corp"
                  maxLength={48}
                />
              </Field>

              <Field
                label="Legal company name"
                htmlFor="ws-company"
                hint="Shown on the Owner's workspace settings."
              >
                <Input
                  id="ws-company"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="Acme Corporation Ltd"
                  maxLength={120}
                />
              </Field>
            </div>

            <Field label="Plan" htmlFor="ws-plan">
              <Select value={plan} onValueChange={(value) => applyPlan(value as PlanId)}>
                <SelectTrigger id="ws-plan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANS.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.label} — {entry.seats} seats, {entry.projects} projects
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Seat limit" htmlFor="ws-seats" required>
                <Input
                  id="ws-seats"
                  type="number"
                  min={1}
                  max={10000}
                  value={seatLimit}
                  onChange={(event) => setSeatLimit(Number(event.target.value))}
                  required
                />
              </Field>
              <Field label="Project limit" htmlFor="ws-projects" required>
                <Input
                  id="ws-projects"
                  type="number"
                  min={1}
                  max={10000}
                  value={projectLimit}
                  onChange={(event) => setProjectLimit(Number(event.target.value))}
                  required
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start date" htmlFor="ws-start">
                <Input
                  id="ws-start"
                  type="date"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                />
              </Field>
              <Field
                label="Renewal / expiry"
                htmlFor="ws-expiry"
                hint="Leave blank for no expiry."
              >
                <Input
                  id="ws-expiry"
                  type="date"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
              </Field>
            </div>

            <p className="rounded-lg bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              Seat and project limits are enforced in the database, not just the
              UI — the Owner cannot raise them from inside their workspace.
            </p>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={createWorkspace.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={createWorkspace.isPending}
              disabled={!name.trim()}
            >
              Create workspace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
