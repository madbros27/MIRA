'use client'

import { Plus, RotateCcw, Shield, Trash2, Users } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/controls'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
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
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from '@/components/ui/primitives'
import {
  CAPABILITY_GROUPS,
  CAPABILITY_META,
  DEFAULT_POSITION_CAPABILITIES,
  can,
  type Capability,
  type DefaultPositionSlug,
  type Grants,
} from '@/lib/permissions'
import {
  useCreatePosition,
  useDeletePosition,
  usePositions,
  useSetPositionCapabilities,
} from '@/lib/queries/workspaces'
import type { Position } from '@/lib/types/app'
import { cn, errorMessage } from '@/lib/utils'

/**
 * The Owner's position editor.
 *
 * A position is a job title plus a checklist. Ticking a box writes a row in
 * `position_permissions`, which is exactly what `has_capability()` reads when
 * Postgres decides whether a request is allowed — so what you see here is
 * what the database will enforce, not a parallel UI-only model.
 */
export function PositionsEditor({
  workspaceId,
  caps,
}: {
  workspaceId: string
  caps: Grants
}) {
  const { data: positions, isLoading } = usePositions(workspaceId)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState<Position | null>(null)

  const editable = can.managePositions(caps)
  const deletePosition = useDeletePosition(workspaceId)

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-40 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Positions are how your company describes itself — Scrum Master,
          Product Analyst, whatever you actually call people. Each one carries a
          checklist of capabilities, and the database enforces exactly that
          list.
        </p>
        {editable ? (
          <Button variant="primary" onClick={() => setCreateOpen(true)} className="shrink-0">
            <Plus aria-hidden />
            New position
          </Button>
        ) : null}
      </div>

      {!positions?.length ? (
        <EmptyState
          icon={<Shield />}
          title="No positions yet"
          description="Every workspace is seeded with a default set. If they were all removed, create one to start assigning people."
          action={
            editable ? (
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden />
                New position
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {positions.map((position) => (
            <PositionCard
              key={position.id}
              position={position}
              workspaceId={workspaceId}
              editable={editable}
              onDelete={() => setDeleting(position)}
            />
          ))}
        </div>
      )}

      <CreatePositionDialog
        workspaceId={workspaceId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete the “${deleting?.name}” position?`}
        description={
          deleting?.member_count
            ? `${deleting.member_count} ${deleting.member_count === 1 ? 'person holds' : 'people hold'} this position. They will keep their seat but lose every capability until you give them another one.`
            : 'Nobody holds this position, so nothing else changes.'
        }
        confirmLabel="Delete position"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try {
            await deletePosition.mutateAsync(deleting.id)
            toast.success(`Deleted “${deleting.name}”`)
            setDeleting(null)
          } catch (caught) {
            toast.error('Could not delete the position', {
              description: errorMessage(caught),
            })
          }
        }}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* One position                                                               */
/* -------------------------------------------------------------------------- */

function PositionCard({
  position,
  workspaceId,
  editable,
  onDelete,
}: {
  position: Position
  workspaceId: string
  editable: boolean
  onDelete: () => void
}) {
  const setCapabilities = useSetPositionCapabilities(workspaceId)

  const [draft, setDraft] = React.useState<Set<Capability>>(
    () => new Set(position.capabilities)
  )

  // Re-sync when the query refetches (someone else edited it, for instance).
  React.useEffect(() => {
    setDraft(new Set(position.capabilities))
  }, [position.capabilities])

  const saved = React.useMemo(() => new Set(position.capabilities), [position.capabilities])
  const dirty =
    draft.size !== saved.size || [...draft].some((capability) => !saved.has(capability))

  function toggle(capability: Capability, on: boolean) {
    setDraft((current) => {
      const next = new Set(current)
      if (on) next.add(capability)
      else next.delete(capability)
      return next
    })
  }

  const defaults =
    position.slug && position.slug in DEFAULT_POSITION_CAPABILITIES
      ? DEFAULT_POSITION_CAPABILITIES[position.slug as DefaultPositionSlug]
      : null

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            {position.name}
            {position.is_system_default ? (
              <Badge variant="outline">Default</Badge>
            ) : (
              <Badge variant="primary">Custom</Badge>
            )}
            <Badge variant="neutral">
              <Users className="size-2.5" aria-hidden />
              {position.member_count ?? 0}
            </Badge>
          </CardTitle>
          {position.description ? (
            <CardDescription className="mt-1">{position.description}</CardDescription>
          ) : null}
        </div>

        {editable ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {defaults ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDraft(new Set(defaults))}
                title="Restore the capabilities this position ships with"
              >
                <RotateCcw aria-hidden />
                Reset
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              aria-label={`Delete ${position.name}`}
              className="text-destructive hover:bg-destructive-subtle"
            >
              <Trash2 />
            </Button>
          </div>
        ) : null}
      </CardHeader>

      <CardContent>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITY_GROUPS.map((group) => {
            const entries = CAPABILITY_META.filter((meta) => meta.group === group)
            return (
              <fieldset key={group} className="min-w-0">
                <legend className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group}
                </legend>
                <div className="space-y-1.5">
                  {entries.map((meta) => {
                    const checked = draft.has(meta.key)
                    return (
                      <label
                        key={meta.key}
                        title={meta.description}
                        className={cn(
                          'flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-xs transition-colors',
                          editable ? 'hover:bg-muted/60' : 'cursor-default'
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={!editable}
                          onCheckedChange={(value) => toggle(meta.key, Boolean(value))}
                          className="mt-px"
                        />
                        <span
                          className={cn(
                            'min-w-0 leading-snug',
                            checked ? 'text-foreground' : 'text-muted-foreground'
                          )}
                        >
                          {meta.label}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            )
          })}
        </div>

        {editable && dirty ? (
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
            <p className="mr-auto text-xs text-muted-foreground">
              {draft.size} capabilit{draft.size === 1 ? 'y' : 'ies'} selected
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft(new Set(position.capabilities))}
            >
              Discard
            </Button>
            <Button
              size="sm"
              variant="primary"
              loading={setCapabilities.isPending}
              onClick={async () => {
                try {
                  await setCapabilities.mutateAsync({
                    positionId: position.id,
                    capabilities: [...draft],
                  })
                  toast.success(`Updated “${position.name}”`)
                } catch (caught) {
                  toast.error('Could not save', { description: errorMessage(caught) })
                }
              }}
            >
              Save changes
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Create                                                                     */
/* -------------------------------------------------------------------------- */

function CreatePositionDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const createPosition = useCreatePosition(workspaceId)

  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [template, setTemplate] = React.useState<DefaultPositionSlug>('member')
  const [selected, setSelected] = React.useState<Set<Capability>>(
    () => new Set(DEFAULT_POSITION_CAPABILITIES.member)
  )

  function applyTemplate(slug: DefaultPositionSlug) {
    setTemplate(slug)
    setSelected(new Set(DEFAULT_POSITION_CAPABILITIES[slug]))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setName('')
          setDescription('')
          applyTemplate('member')
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            try {
              await createPosition.mutateAsync({
                name: name.trim(),
                description: description.trim() || undefined,
                capabilities: [...selected],
              })
              toast.success(`Created the “${name.trim()}” position`)
              onOpenChange(false)
            } catch (caught) {
              toast.error('Could not create the position', {
                description: errorMessage(caught),
              })
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>New position</DialogTitle>
            <DialogDescription>
              Start from a template, then tick exactly what this role should be
              able to do.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="position-name" required>
                <Input
                  id="position-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Scrum Master"
                  required
                  autoFocus
                  maxLength={60}
                />
              </Field>
              <Field label="Start from" htmlFor="position-template">
                <select
                  id="position-template"
                  value={template}
                  onChange={(event) =>
                    applyTemplate(event.target.value as DefaultPositionSlug)
                  }
                  className="h-9 w-full rounded-lg border border-input bg-surface px-3 text-sm shadow-xs"
                >
                  {(Object.keys(DEFAULT_POSITION_CAPABILITIES) as DefaultPositionSlug[]).map(
                    (slug) => (
                      <option key={slug} value={slug}>
                        {slug.replace('_', ' ')}
                      </option>
                    )
                  )}
                </select>
              </Field>
            </div>

            <Field label="Description" htmlFor="position-description">
              <Textarea
                id="position-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Facilitates ceremonies and removes blockers. No workspace settings."
                rows={2}
              />
            </Field>

            <div className="grid gap-x-6 gap-y-4 rounded-lg border border-border p-3 sm:grid-cols-2">
              {CAPABILITY_GROUPS.map((group) => (
                <fieldset key={group}>
                  <legend className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group}
                  </legend>
                  <div className="space-y-1.5">
                    {CAPABILITY_META.filter((meta) => meta.group === group).map((meta) => (
                      <label
                        key={meta.key}
                        title={meta.description}
                        className="flex cursor-pointer items-start gap-2 text-xs"
                      >
                        <Checkbox
                          checked={selected.has(meta.key)}
                          onCheckedChange={(value) =>
                            setSelected((current) => {
                              const next = new Set(current)
                              if (value) next.add(meta.key)
                              else next.delete(meta.key)
                              return next
                            })
                          }
                          className="mt-px"
                        />
                        <span className="leading-snug">{meta.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={createPosition.isPending}
              disabled={!name.trim()}
            >
              Create position
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
