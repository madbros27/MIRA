'use client'

import { Calendar, Plus } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'

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
import { useCreateSprint } from '@/lib/queries/sprints'
import type { Project } from '@/lib/types/app'
import { errorMessage } from '@/lib/utils'

export function GlobalCreateSprintDialog({
  workspaceId,
  projects,
  open,
  onOpenChange,
  defaultProjectId,
}: {
  workspaceId: string
  projects: Pick<Project, 'id' | 'key' | 'name' | 'color'>[]
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultProjectId?: string
}) {
  const client = useQueryClient()
  const [projectId, setProjectId] = React.useState<string>('')
  const [name, setName] = React.useState('')
  const [goal, setGoal] = React.useState('')
  const [start, setStart] = React.useState('')
  const [end, setEnd] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  // Initialize selected project
  React.useEffect(() => {
    if (open) {
      const initialId =
        defaultProjectId && projects.some((p) => p.id === defaultProjectId)
          ? defaultProjectId
          : projects[0]?.id ?? ''
      setProjectId(initialId)
      setName('Sprint 1')
      setGoal('')
      setStart('')
      setEnd('')
    }
  }, [open, defaultProjectId, projects])

  const create = useCreateSprint(projectId)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim() || !projectId) return

    setIsSubmitting(true)
    const payload = {
      name: name.trim(),
      goal: goal.trim() || null,
      start_date: start ? new Date(start).toISOString() : null,
      end_date: end ? new Date(`${end}T23:59:59`).toISOString() : null,
    }

    try {
      await create.mutateAsync(payload)
      const proj = projects.find((p) => p.id === projectId)
      toast.success(`${payload.name} created for ${proj?.name ?? 'project'}`)

      // Invalidate workspace sprints query so SprintsPage updates immediately
      await client.invalidateQueries({
        predicate: (query) =>
          (query.queryKey[0] === 'workspace-sprints' && query.queryKey[1] === workspaceId) ||
          query.queryKey[0] === 'sprints',
      })

      onOpenChange(false)
    } catch (error) {
      toast.error(errorMessage(error, 'Could not create the sprint'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedProject = projects.find((p) => p.id === projectId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="size-4 text-primary" aria-hidden />
              Create Sprint
            </DialogTitle>
            <DialogDescription>
              Plan a new sprint for any of your projects. Dates can be adjusted before starting.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <Field label="Project" htmlFor="sprint-project" required>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger id="sprint-project" className="w-full">
                  <SelectValue placeholder="Choose a project…" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((proj) => (
                    <SelectItem key={proj.id} value={proj.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2 rounded-full shrink-0"
                          style={{ backgroundColor: proj.color ?? '#64748B' }}
                        />
                        <span className="font-medium">{proj.name}</span>
                        <span className="text-2xs text-muted-foreground">({proj.key})</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Sprint Name" htmlFor="sprint-name" required>
              <Input
                id="sprint-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={`${selectedProject?.key ?? 'PROJ'} Sprint 1`}
                required
                maxLength={60}
              />
            </Field>

            <Field
              label="Sprint Goal"
              htmlFor="sprint-goal"
              hint="What will this sprint accomplish?"
            >
              <Textarea
                id="sprint-goal"
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                placeholder="Ship onboarding flow, migrate auth…"
                rows={2}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Start Date"
                htmlFor="sprint-start"
                hint="Defaults to start on activation."
              >
                <Input
                  id="sprint-start"
                  type="date"
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                />
              </Field>
              <Field
                label="End Date"
                htmlFor="sprint-end"
                hint="Recommended 1 to 4 weeks."
              >
                <Input
                  id="sprint-end"
                  type="date"
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                />
              </Field>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={isSubmitting}
              disabled={!name.trim() || !projectId || isSubmitting}
              className="gap-1.5"
            >
              <Plus className="size-4" />
              Create Sprint
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
