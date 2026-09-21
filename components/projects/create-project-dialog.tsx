'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

import { ProjectIcon } from '@/components/layout/project-icon'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
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
import { AssigneePicker } from '@/components/issues/pickers'
import { PROJECT_COLORS, PROJECT_ICONS } from '@/lib/constants'
import { useCreateProject } from '@/lib/queries/projects'
import { useMembers } from '@/lib/queries/workspaces'
import { useUiStore } from '@/lib/store/ui-store'
import { cn, errorMessage } from '@/lib/utils'

/** Derive "MIRA" from "MIRA Platform", "ENG" from "Engineering". */
function suggestKey(name: string) {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return ''
  if (words.length === 1) return words[0].slice(0, 6)
  return words
    .map((word) => word[0])
    .join('')
    .slice(0, 6)
}

export function CreateProjectDialog() {
  const router = useRouter()
  const open = useUiStore((state) => state.createProjectOpen)
  const setOpen = useUiStore((state) => state.setCreateProjectOpen)
  const { workspaceId, userId } = useWorkspaceContext()
  const { data: members } = useMembers(workspaceId)
  const create = useCreateProject(workspaceId)

  const [form, setForm] = React.useState({
    name: '',
    key: '',
    keyEdited: false,
    description: '',
    leadId: null as string | null,
    icon: 'Rocket' as string,
    color: PROJECT_COLORS[0] as string,
  })
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setForm({
      name: '',
      key: '',
      keyEdited: false,
      description: '',
      leadId: userId,
      icon: 'Rocket',
      color: PROJECT_COLORS[0],
    })
    setError(null)
  }, [open, userId])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    const key = form.key.trim().toUpperCase()
    if (!form.name.trim()) return setError('Give the project a name.')
    if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key)) {
      return setError('The key must be 2–10 characters: a letter first, then letters or digits.')
    }

    try {
      const project = await create.mutateAsync({
        name: form.name.trim(),
        key,
        description: form.description.trim() || null,
        leadId: form.leadId,
        icon: form.icon,
        color: form.color,
      })
      toast.success(`${project.name} created`)
      setOpen(false)
      router.push(`/projects/${project.key}/board`)
    } catch (caught) {
      const message = errorMessage(caught, 'Could not create the project')
      setError(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription>
              A project gets its own board, backlog, workflow and issue keys.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-raised p-3">
              <ProjectIcon icon={form.icon} color={form.color} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {form.name.trim() || 'Untitled project'}
                </p>
                <p className="font-mono text-2xs text-muted-foreground">
                  {(form.key || suggestKey(form.name) || 'KEY').toUpperCase()}-1
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
              <Field label="Name" htmlFor="project-name" required>
                <Input
                  id="project-name"
                  value={form.name}
                  onChange={(event) => {
                    const name = event.target.value
                    setForm((prev) => ({
                      ...prev,
                      name,
                      key: prev.keyEdited ? prev.key : suggestKey(name),
                    }))
                  }}
                  placeholder="MIRA Platform"
                  maxLength={80}
                  autoFocus
                  required
                />
              </Field>

              <Field
                label="Key"
                htmlFor="project-key"
                hint="Used in issue IDs"
                required
              >
                <Input
                  id="project-key"
                  value={form.key}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      key: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                      keyEdited: true,
                    }))
                  }
                  placeholder="MIRA"
                  maxLength={10}
                  className="font-mono uppercase"
                  required
                />
              </Field>
            </div>

            <Field label="Description" htmlFor="project-description">
              <Textarea
                id="project-description"
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="What does this project cover?"
                rows={2}
              />
            </Field>

            <Field label="Project lead">
              <AssigneePicker
                value={form.leadId}
                onChange={(leadId) => setForm((prev) => ({ ...prev, leadId }))}
                members={members ?? []}
                currentUserId={userId}
              />
            </Field>

            <Field label="Icon">
              <div className="flex flex-wrap gap-1.5">
                {PROJECT_ICONS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, icon }))}
                    aria-label={icon}
                    aria-pressed={form.icon === icon}
                    className={cn(
                      'rounded-lg p-0.5 transition-all',
                      form.icon === icon
                        ? 'ring-2 ring-primary'
                        : 'opacity-70 hover:opacity-100'
                    )}
                  >
                    <ProjectIcon icon={icon} color={form.color} size="md" />
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Colour">
              <div className="flex flex-wrap gap-1.5">
                {PROJECT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, color }))}
                    aria-label={`Colour ${color}`}
                    aria-pressed={form.color === color}
                    className={cn(
                      'size-7 rounded-lg transition-transform',
                      form.color === color
                        ? 'ring-2 ring-offset-2 ring-offset-surface'
                        : 'hover:scale-105'
                    )}
                    style={{
                      backgroundColor: color,
                      boxShadow: form.color === color ? `0 0 0 2px ${color}` : undefined,
                    }}
                  />
                ))}
              </div>
            </Field>

            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive-subtle px-3 py-2 text-xs font-medium text-destructive"
              >
                {error}
              </p>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
