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
import { Field, Input, Textarea } from '@/components/ui/input'
import { MarkdownEditor } from '@/components/ui/markdown-editor'
import { Markdown } from '@/components/ui/markdown'
import { formatDate, toDateInputValue } from '@/lib/format'
import {
  useCompleteSprint,
  useCreateSprint,
  useStartSprint,
  useUpdateSprint,
} from '@/lib/queries/sprints'
import type { IssueSummary, Sprint } from '@/lib/types/app'
import { errorMessage, sum } from '@/lib/utils'

const NONE = '__none__'

/* -------------------------------------------------------------------------- */
/* Create / edit                                                              */
/* -------------------------------------------------------------------------- */

export function SprintFormDialog({
  projectId,
  sprint,
  open,
  onOpenChange,
}: {
  projectId: string
  /** Omit to create a new sprint. */
  sprint?: Sprint | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const create = useCreateSprint(projectId)
  const update = useUpdateSprint(projectId)
  const editing = Boolean(sprint)

  const [form, setForm] = React.useState({
    name: '',
    goal: '',
    start: '',
    end: '',
  })

  React.useEffect(() => {
    if (!open) return
    setForm({
      name: sprint?.name ?? '',
      goal: sprint?.goal ?? '',
      start: toDateInputValue(sprint?.start_date),
      end: toDateInputValue(sprint?.end_date),
    })
  }, [open, sprint])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!form.name.trim()) return

    const payload = {
      name: form.name.trim(),
      goal: form.goal.trim() || null,
      start_date: form.start ? new Date(form.start).toISOString() : null,
      end_date: form.end ? new Date(`${form.end}T23:59:59`).toISOString() : null,
    }

    try {
      if (sprint) await update.mutateAsync({ id: sprint.id, ...payload })
      else await create.mutateAsync(payload)
      toast.success(editing ? 'Sprint updated' : `${payload.name} created`)
      onOpenChange(false)
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save the sprint'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit sprint' : 'New sprint'}</DialogTitle>
            <DialogDescription>
              Dates are optional until you start the sprint.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field label="Name" htmlFor="sprint-name" required>
              <Input
                id="sprint-name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Sprint 4"
                maxLength={80}
                autoFocus
                required
              />
            </Field>
            <Field label="Goal" htmlFor="sprint-goal" hint="One sentence the team can rally behind.">
              <Textarea
                id="sprint-goal"
                value={form.goal}
                onChange={(event) => setForm((prev) => ({ ...prev, goal: event.target.value }))}
                placeholder="Ship the board and backlog end to end."
                rows={2}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start date" htmlFor="sprint-start">
                <Input
                  id="sprint-start"
                  type="date"
                  value={form.start}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, start: event.target.value }))
                  }
                />
              </Field>
              <Field label="End date" htmlFor="sprint-end">
                <Input
                  id="sprint-end"
                  type="date"
                  value={form.end}
                  min={form.start || undefined}
                  onChange={(event) => setForm((prev) => ({ ...prev, end: event.target.value }))}
                />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={create.isPending || update.isPending}
            >
              {editing ? 'Save sprint' : 'Create sprint'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/* Start                                                                      */
/* -------------------------------------------------------------------------- */

export function StartSprintDialog({
  projectId,
  sprint,
  issues,
  open,
  onOpenChange,
}: {
  projectId: string
  sprint: Sprint | null
  issues: IssueSummary[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const start = useStartSprint(projectId)
  const [dates, setDates] = React.useState({ start: '', end: '' })

  React.useEffect(() => {
    if (!open || !sprint) return
    const today = new Date()
    const twoWeeks = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
    setDates({
      start: toDateInputValue(sprint.start_date ?? today),
      end: toDateInputValue(sprint.end_date ?? twoWeeks),
    })
  }, [open, sprint])

  const points = sum(issues.map((issue) => issue.story_points))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Start {sprint?.name}</DialogTitle>
          <DialogDescription>
            {issues.length} {issues.length === 1 ? 'issue' : 'issues'} · {points} points
            committed. Everyone in the workspace is notified.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date" htmlFor="start-sprint-start" required>
              <Input
                id="start-sprint-start"
                type="date"
                value={dates.start}
                onChange={(event) =>
                  setDates((prev) => ({ ...prev, start: event.target.value }))
                }
              />
            </Field>
            <Field label="End date" htmlFor="start-sprint-end" required>
              <Input
                id="start-sprint-end"
                type="date"
                value={dates.end}
                min={dates.start || undefined}
                onChange={(event) => setDates((prev) => ({ ...prev, end: event.target.value }))}
              />
            </Field>
          </div>
          {!issues.length ? (
            <p className="rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-xs text-warning">
              This sprint has no issues yet. You can still start it and pull work in later.
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={start.isPending}
            onClick={async () => {
              if (!sprint) return
              try {
                await start.mutateAsync({
                  sprintId: sprint.id,
                  startDate: dates.start
                    ? new Date(dates.start).toISOString()
                    : new Date().toISOString(),
                  endDate: dates.end ? new Date(`${dates.end}T23:59:59`).toISOString() : null,
                })
                toast.success(`${sprint.name} is running`)
                onOpenChange(false)
              } catch (error) {
                toast.error(errorMessage(error, 'Could not start the sprint'))
              }
            }}
          >
            Start sprint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/* Complete                                                                   */
/* -------------------------------------------------------------------------- */

export function CompleteSprintDialog({
  projectId,
  sprint,
  issues,
  sprints,
  open,
  onOpenChange,
}: {
  projectId: string
  sprint: Sprint | null
  issues: IssueSummary[]
  sprints: Sprint[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const complete = useCompleteSprint(projectId)
  const [target, setTarget] = React.useState<string>(NONE)

  const done = issues.filter((issue) => issue.status?.category === 'done')
  const open_ = issues.filter((issue) => issue.status?.category !== 'done')

  const candidates = sprints.filter(
    (candidate) => candidate.id !== sprint?.id && candidate.status === 'planned'
  )

  React.useEffect(() => {
    if (open) setTarget(candidates[0]?.id ?? NONE)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Complete {sprint?.name}</DialogTitle>
          <DialogDescription>
            {done.length} completed · {open_.length} still open. Completed points are recorded
            for the velocity chart.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Committed" value={sum(issues.map((i) => i.story_points))} />
            <Stat label="Completed" value={sum(done.map((i) => i.story_points))} />
            <Stat label="Carry over" value={sum(open_.map((i) => i.story_points))} />
          </dl>

          {open_.length ? (
            <Field
              label={`Move ${open_.length} unfinished ${open_.length === 1 ? 'issue' : 'issues'} to`}
            >
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger aria-label="Destination for unfinished issues">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Backlog</SelectItem>
                  {candidates.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <p className="rounded-lg border border-success/30 bg-success-subtle px-3 py-2 text-xs font-medium text-success">
              Everything in this sprint is done. Nice.
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={complete.isPending}
            onClick={async () => {
              if (!sprint) return
              try {
                await complete.mutateAsync({
                  sprintId: sprint.id,
                  targetSprintId: target === NONE ? null : target,
                })
                toast.success(`${sprint.name} completed`)
                onOpenChange(false)
              } catch (error) {
                toast.error(errorMessage(error, 'Could not complete the sprint'))
              }
            }}
          >
            Complete sprint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised px-2 py-2.5">
      <dt className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Retrospective                                                              */
/* -------------------------------------------------------------------------- */

export function RetrospectiveDialog({
  projectId,
  sprint,
  open,
  onOpenChange,
  canEdit,
}: {
  projectId: string
  sprint: Sprint | null
  open: boolean
  onOpenChange: (open: boolean) => void
  canEdit: boolean
}) {
  const update = useUpdateSprint(projectId)
  const [draft, setDraft] = React.useState('')
  const [editing, setEditing] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setDraft(sprint?.retrospective ?? '')
    setEditing(!sprint?.retrospective && canEdit)
  }, [open, sprint, canEdit])

  const TEMPLATE = `## What went well\n- \n\n## What to improve\n- \n\n## Actions\n- `

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{sprint?.name} retrospective</DialogTitle>
          <DialogDescription>
            {sprint?.start_date && sprint?.end_date
              ? `${formatDate(sprint.start_date)} – ${formatDate(sprint.end_date)}`
              : 'Notes for the team'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {editing ? (
            <div className="space-y-2">
              <MarkdownEditor
                value={draft}
                onChange={setDraft}
                rows={12}
                placeholder="What went well, what to improve, what to do differently."
              />
              {!draft.trim() ? (
                <Button variant="ghost" size="xs" onClick={() => setDraft(TEMPLATE)}>
                  Insert template
                </Button>
              ) : null}
            </div>
          ) : draft.trim() ? (
            <Markdown>{draft}</Markdown>
          ) : (
            <p className="text-sm text-muted-foreground">
              No retrospective notes have been written for this sprint.
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          {editing ? (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setDraft(sprint?.retrospective ?? '')
                  setEditing(false)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={update.isPending}
                onClick={async () => {
                  if (!sprint) return
                  try {
                    await update.mutateAsync({
                      id: sprint.id,
                      retrospective: draft.trim() || null,
                    })
                    toast.success('Retrospective saved')
                    setEditing(false)
                  } catch (error) {
                    toast.error(errorMessage(error, 'Could not save the retrospective'))
                  }
                }}
              >
                Save notes
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              {canEdit ? (
                <Button variant="primary" onClick={() => setEditing(true)}>
                  Edit notes
                </Button>
              ) : null}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
