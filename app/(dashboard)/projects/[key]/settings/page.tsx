'use client'

import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Check,
  Plus,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

import { AssigneePicker } from '@/components/issues/pickers'
import { ProjectIcon } from '@/components/layout/project-icon'
import { ProjectMembersPanel } from '@/components/projects/project-members-panel'
import { ProjectPage } from '@/components/projects/project-page'
import { useProjectContext } from '@/components/projects/project-provider'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/controls'
import { Field, Input, Textarea } from '@/components/ui/input'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Separator,
} from '@/components/ui/primitives'
import { LABEL_COLORS, PROJECT_COLORS, PROJECT_ICONS, STATUS_CATEGORIES, STATUS_CATEGORY_META } from '@/lib/constants'
import { can } from '@/lib/permissions'
import {
  useCreateLabel,
  useCreateStatus,
  useDeleteLabel,
  useDeleteProject,
  useDeleteStatus,
  useLabels,
  useReorderStatuses,
  useSetTransitions,
  useStatuses,
  useTransitions,
  useUpdateLabel,
  useUpdateProject,
  useUpdateStatus,
} from '@/lib/queries/projects'
import { useMembers } from '@/lib/queries/workspaces'
import type { Label as LabelType, ProjectStatus } from '@/lib/types/app'
import type { StatusCategory } from '@/lib/types/database'
import { arrayMove, cn, errorMessage } from '@/lib/utils'

export default function ProjectSettingsPage() {
  const { caps } = useWorkspaceContext()

  if (!can.manageProject(caps)) {
    return (
      <ProjectPage>
        <div className="p-4 sm:p-8">
          <EmptyState
            title="Project settings are restricted"
            description="Only workspace admins and project leads can change a project's configuration."
          />
        </div>
      </ProjectPage>
    )
  }

  return (
    <ProjectPage description="Rename the project, shape its workflow, manage labels.">
      <div className="p-3 sm:p-4">
        <Tabs defaultValue="general">
          <TabsList className="w-full overflow-x-auto sm:w-auto">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="members">People</TabsTrigger>
            <TabsTrigger value="workflow">Workflow</TabsTrigger>
            <TabsTrigger value="labels">Labels</TabsTrigger>
          </TabsList>
          <TabsContent value="general">
            <GeneralSettings />
          </TabsContent>
          <TabsContent value="members">
            <ProjectMembersPanel />
          </TabsContent>
          <TabsContent value="workflow">
            <WorkflowSettings />
          </TabsContent>
          <TabsContent value="labels">
            <LabelSettings />
          </TabsContent>
        </Tabs>
      </div>
    </ProjectPage>
  )
}

/* -------------------------------------------------------------------------- */
/* General                                                                    */
/* -------------------------------------------------------------------------- */

function GeneralSettings() {
  const router = useRouter()
  const { project } = useProjectContext()
  const { workspaceId, userId, caps } = useWorkspaceContext()
  const { data: members } = useMembers(workspaceId)
  const update = useUpdateProject(workspaceId)
  const remove = useDeleteProject(workspaceId)

  const [form, setForm] = React.useState({
    name: '',
    key: '',
    description: '',
    leadId: null as string | null,
    icon: 'Rocket',
    color: PROJECT_COLORS[0] as string,
  })
  const [deleting, setDeleting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!project) return
    setForm({
      name: project.name,
      key: project.key,
      description: project.description ?? '',
      leadId: project.lead_id,
      icon: project.icon,
      color: project.color,
    })
  }, [project])

  const dirty =
    project &&
    (form.name !== project.name ||
      form.key !== project.key ||
      form.description !== (project.description ?? '') ||
      form.leadId !== project.lead_id ||
      form.icon !== project.icon ||
      form.color !== project.color)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!project) return
    setError(null)

    const key = form.key.trim().toUpperCase()
    if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key)) {
      setError('The key must be 2–10 characters: a letter first, then letters or digits.')
      return
    }

    try {
      const updated = await update.mutateAsync({
        id: project.id,
        name: form.name.trim(),
        key,
        description: form.description.trim() || null,
        lead_id: form.leadId,
        icon: form.icon,
        color: form.color,
      })
      toast.success('Project updated')
      if (updated.key !== project.key) {
        router.replace(`/projects/${updated.key}/settings`)
      }
    } catch (caught) {
      setError(errorMessage(caught, 'Could not save the project'))
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <form onSubmit={save}>
          <CardHeader>
            <CardTitle>Project details</CardTitle>
            <CardDescription>
              Changing the key does not rewrite existing issue IDs already shared elsewhere.
            </CardDescription>
          </CardHeader>

          <div className="space-y-4 px-4 pb-4 sm:px-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
              <Field label="Name" htmlFor="settings-name" required>
                <Input
                  id="settings-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  maxLength={80}
                  required
                />
              </Field>
              <Field label="Key" htmlFor="settings-key" required>
                <Input
                  id="settings-key"
                  value={form.key}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      key: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                    }))
                  }
                  maxLength={10}
                  className="font-mono uppercase"
                  required
                />
              </Field>
            </div>

            <Field label="Description" htmlFor="settings-description" hint="Markdown supported.">
              <Textarea
                id="settings-description"
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
                rows={3}
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

            <Field label="Icon and colour">
              <div className="space-y-2">
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
                        form.icon === icon ? 'ring-2 ring-primary' : 'opacity-70 hover:opacity-100'
                      )}
                    >
                      <ProjectIcon icon={icon} color={form.color} size="md" />
                    </button>
                  ))}
                </div>
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

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={!dirty}
                onClick={() => {
                  if (!project) return
                  setForm({
                    name: project.name,
                    key: project.key,
                    description: project.description ?? '',
                    leadId: project.lead_id,
                    icon: project.icon,
                    color: project.color,
                  })
                  setError(null)
                }}
              >
                Reset
              </Button>
              <Button type="submit" variant="primary" disabled={!dirty} loading={update.isPending}>
                Save changes
              </Button>
            </div>
          </div>
        </form>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Archiving hides the project from navigation but keeps every issue. Deleting removes
            everything.
          </CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-2 px-4 pb-4 sm:flex-row sm:px-5">
          <Button
            variant="secondary"
            onClick={async () => {
              if (!project) return
              try {
                await update.mutateAsync({
                  id: project.id,
                  is_archived: !project.is_archived,
                })
                toast.success(project.is_archived ? 'Project restored' : 'Project archived')
              } catch (caught) {
                toast.error(errorMessage(caught, 'Could not update the project'))
              }
            }}
          >
            {project?.is_archived ? <ArchiveRestore /> : <Archive />}
            {project?.is_archived ? 'Restore project' : 'Archive project'}
          </Button>
          {can.deleteProject(caps) ? (
            <Button variant="destructive" onClick={() => setDeleting(true)}>
              <Trash2 />
              Delete project
            </Button>
          ) : null}
        </div>
      </Card>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${project?.name}?`}
        description={`All ${project?.issue_counter ?? 0} issues, their comments, attachments and every sprint in this project are deleted permanently.`}
        confirmLabel="Delete project"
        destructive
        onConfirm={async () => {
          if (!project) return
          try {
            await remove.mutateAsync(project.id)
            toast.success(`${project.name} deleted`)
            router.push('/projects')
          } catch (caught) {
            toast.error(errorMessage(caught, 'Could not delete the project'))
          }
        }}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Workflow                                                                   */
/* -------------------------------------------------------------------------- */

function WorkflowSettings() {
  const { projectId } = useProjectContext()
  const { data: statuses } = useStatuses(projectId)
  const { data: transitions } = useTransitions(projectId)
  const createStatus = useCreateStatus(projectId ?? '')
  const updateStatus = useUpdateStatus(projectId ?? '')
  const deleteStatus = useDeleteStatus(projectId ?? '')
  const reorder = useReorderStatuses(projectId ?? '')
  const setTransitions = useSetTransitions(projectId ?? '')

  const [newStatus, setNewStatus] = React.useState<{
    name: string
    category: StatusCategory
  }>({ name: '', category: 'todo' })
  const [deleting, setDeleting] = React.useState<ProjectStatus | null>(null)

  const list = statuses ?? []

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= list.length) return
    await reorder.mutateAsync(arrayMove(list, index, target))
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Board columns</CardTitle>
          <CardDescription>
            Each column is a status. The category decides what counts as done, which drives
            burndown, velocity and the “resolved” timestamp.
          </CardDescription>
        </CardHeader>

        <ul className="divide-y divide-border border-t border-border">
          {list.map((status, index) => (
            <li key={status.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                  aria-label={`Move ${status.name} earlier`}
                >
                  <ArrowUp className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === list.length - 1}
                  className="inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                  aria-label={`Move ${status.name} later`}
                >
                  <ArrowDown className="size-3" />
                </button>
              </div>

              <Input
                defaultValue={status.name}
                onBlur={(event) => {
                  const name = event.target.value.trim()
                  if (name && name !== status.name) {
                    updateStatus.mutate({ id: status.id, name })
                  }
                }}
                className="h-8 w-36 text-xs"
                aria-label={`${status.name} name`}
              />

              <Select
                value={status.category}
                onValueChange={(category) =>
                  updateStatus.mutate({ id: status.id, category: category as StatusCategory })
                }
              >
                <SelectTrigger size="sm" className="w-auto min-w-32" aria-label="Category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {STATUS_CATEGORY_META[category].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="number"
                min={1}
                defaultValue={status.wip_limit ?? ''}
                placeholder="WIP"
                onBlur={(event) => {
                  const raw = event.target.value.trim()
                  const wip = raw ? Number(raw) : null
                  if (wip !== status.wip_limit) {
                    updateStatus.mutate({ id: status.id, wip_limit: wip })
                  }
                }}
                className="h-8 w-20 text-xs"
                aria-label={`${status.name} WIP limit`}
              />

              <input
                type="color"
                value={status.color}
                onChange={(event) =>
                  updateStatus.mutate({ id: status.id, color: event.target.value })
                }
                className="size-8 shrink-0 cursor-pointer rounded border border-border bg-surface"
                aria-label={`${status.name} colour`}
              />

              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto"
                onClick={() => setDeleting(status)}
                disabled={list.length <= 1}
                aria-label={`Delete ${status.name}`}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-end gap-2 border-t border-border p-3 sm:p-4">
          <Field label="New column" htmlFor="new-status" className="min-w-40 flex-1">
            <Input
              id="new-status"
              value={newStatus.name}
              onChange={(event) =>
                setNewStatus((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Blocked"
              maxLength={40}
            />
          </Field>
          <Select
            value={newStatus.category}
            onValueChange={(category) =>
              setNewStatus((prev) => ({ ...prev, category: category as StatusCategory }))
            }
          >
            <SelectTrigger className="w-auto min-w-32" aria-label="New column category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {STATUS_CATEGORY_META[category].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="primary"
            disabled={!newStatus.name.trim()}
            loading={createStatus.isPending}
            onClick={async () => {
              try {
                await createStatus.mutateAsync({
                  name: newStatus.name.trim(),
                  category: newStatus.category,
                  position: list.length,
                  color: STATUS_CATEGORY_META[newStatus.category].color,
                })
                setNewStatus({ name: '', category: 'todo' })
              } catch (error) {
                toast.error(errorMessage(error, 'Could not add the column'))
              }
            }}
          >
            <Plus />
            Add column
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Allowed transitions</CardTitle>
          <CardDescription>
            Leave a row untouched to allow any move out of that column. Tick targets to restrict
            it — the database enforces this, not just the UI.
          </CardDescription>
        </CardHeader>

        <ul className="divide-y divide-border border-t border-border">
          {list.map((status) => {
            const allowed = (transitions ?? [])
              .filter((transition) => transition.from_status_id === status.id)
              .map((transition) => transition.to_status_id)
            const restricted = allowed.length > 0

            return (
              <li key={status.id} className="px-3 py-3 sm:px-4">
                <div className="flex items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: status.color }}
                    aria-hidden
                  />
                  <p className="text-sm font-medium">From {status.name}</p>
                  {restricted ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="ml-auto"
                      onClick={() =>
                        setTransitions.mutate({ fromStatusId: status.id, toStatusIds: [] })
                      }
                    >
                      <X />
                      Allow all
                    </Button>
                  ) : (
                    <span className="ml-auto text-2xs text-muted-foreground">
                      Any column
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {list
                    .filter((target) => target.id !== status.id)
                    .map((target) => {
                      const checked = allowed.includes(target.id)
                      return (
                        <label
                          key={target.id}
                          className={cn(
                            'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors',
                            checked
                              ? 'border-primary bg-primary-subtle text-primary-subtle-foreground'
                              : 'border-border bg-surface text-muted-foreground hover:bg-muted'
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() =>
                              setTransitions.mutate({
                                fromStatusId: status.id,
                                toStatusIds: checked
                                  ? allowed.filter((id) => id !== target.id)
                                  : [...allowed, target.id],
                              })
                            }
                            className="size-3.5"
                          />
                          {target.name}
                        </label>
                      )
                    })}
                </div>
              </li>
            )
          })}
        </ul>
      </Card>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => (open ? null : setDeleting(null))}
        title={`Delete the ${deleting?.name} column?`}
        description="Move every issue out of this column first — the database refuses to delete a status that is still in use."
        confirmLabel="Delete column"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try {
            await deleteStatus.mutateAsync(deleting.id)
            toast.success(`${deleting.name} removed`)
            setDeleting(null)
          } catch (error) {
            toast.error(
              errorMessage(
                error,
                'Could not delete the column — it probably still has issues in it.'
              )
            )
          }
        }}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                     */
/* -------------------------------------------------------------------------- */

function LabelSettings() {
  const { projectId } = useProjectContext()
  const { data: labels } = useLabels(projectId)
  const create = useCreateLabel(projectId ?? '')
  const update = useUpdateLabel(projectId ?? '')
  const remove = useDeleteLabel(projectId ?? '')

  const [draft, setDraft] = React.useState({ name: '', color: LABEL_COLORS[0] as string })
  const [deleting, setDeleting] = React.useState<LabelType | null>(null)

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Labels</CardTitle>
          <CardDescription>
            Cross-cutting tags — a label can be applied to any issue in this project.
          </CardDescription>
        </CardHeader>

        {labels?.length ? (
          <ul className="divide-y divide-border border-t border-border">
            {labels.map((label) => (
              <li key={label.id} className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
                <input
                  type="color"
                  value={label.color}
                  onChange={(event) =>
                    update.mutate({ id: label.id, color: event.target.value })
                  }
                  className="size-7 shrink-0 cursor-pointer rounded border border-border bg-surface"
                  aria-label={`${label.name} colour`}
                />
                <Input
                  defaultValue={label.name}
                  onBlur={(event) => {
                    const name = event.target.value.trim()
                    if (name && name !== label.name) update.mutate({ id: label.id, name })
                  }}
                  className="h-8 max-w-56 text-xs"
                  aria-label={`${label.name} name`}
                />
                <span
                  className="rounded px-1.5 py-0.5 text-2xs font-medium"
                  style={{ backgroundColor: `${label.color}24`, color: label.color }}
                >
                  preview
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto"
                  onClick={() => setDeleting(label)}
                  aria-label={`Delete ${label.name}`}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="border-t border-border px-4 py-6">
            <EmptyState
              icon={<Tag />}
              title="No labels yet"
              description="Add a few labels such as frontend, backend or tech-debt."
              compact
              className="border-0 bg-transparent"
            />
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2 border-t border-border p-3 sm:p-4">
          <Field label="New label" htmlFor="new-label" className="min-w-40 flex-1">
            <Input
              id="new-label"
              value={draft.name}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="accessibility"
              maxLength={40}
            />
          </Field>
          <div className="flex items-center gap-1.5 pb-1">
            {LABEL_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, color }))}
                aria-label={`Colour ${color}`}
                aria-pressed={draft.color === color}
                className={cn(
                  'flex size-6 items-center justify-center rounded-md transition-transform hover:scale-110'
                )}
                style={{ backgroundColor: color }}
              >
                {draft.color === color ? (
                  <Check className="size-3 text-white" strokeWidth={3} />
                ) : null}
              </button>
            ))}
          </div>
          <Button
            variant="primary"
            disabled={!draft.name.trim()}
            loading={create.isPending}
            onClick={async () => {
              try {
                await create.mutateAsync({ name: draft.name.trim(), color: draft.color })
                setDraft({ name: '', color: LABEL_COLORS[0] })
              } catch (error) {
                toast.error(errorMessage(error, 'Could not add the label'))
              }
            }}
          >
            <Plus />
            Add label
          </Button>
        </div>
      </Card>

      <Separator />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => (open ? null : setDeleting(null))}
        title={`Delete the ${deleting?.name} label?`}
        description="It is removed from every issue that currently has it. The issues themselves are untouched."
        confirmLabel="Delete label"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try {
            await remove.mutateAsync(deleting.id)
            toast.success(`${deleting.name} deleted`)
            setDeleting(null)
          } catch (error) {
            toast.error(errorMessage(error, 'Could not delete the label'))
          }
        }}
      />
    </div>
  )
}
