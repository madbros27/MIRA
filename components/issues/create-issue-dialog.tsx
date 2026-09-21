'use client'

import * as React from 'react'
import { toast } from 'sonner'

import {
  AssigneePicker,
  DateField,
  EpicSelect,
  LabelPicker,
  PrioritySelect,
  SprintSelect,
  StatusSelect,
  StoryPointsSelect,
  TypeSelect,
} from './pickers'
import { ProjectIcon } from '@/components/layout/project-icon'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
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
import { MarkdownEditor } from '@/components/ui/markdown-editor'
import { useCreateIssue } from '@/lib/queries/issues'
import { useProjectIssues } from '@/lib/queries/issues'
import { useCreateLabel, useLabels, useProjects, useStatuses } from '@/lib/queries/projects'
import { useSprints } from '@/lib/queries/sprints'
import { useMembers } from '@/lib/queries/workspaces'
import { useUiStore } from '@/lib/store/ui-store'
import type { IssueType } from '@/lib/types/database'
import { errorMessage, issueKey } from '@/lib/utils'

export function CreateIssueDialog() {
  const seed = useUiStore((state) => state.createIssue)
  const close = useUiStore((state) => state.closeCreateIssue)
  const openIssueDialog = useUiStore((state) => state.openIssueDialog)
  const { workspaceId, userId } = useWorkspaceContext()

  const { data: projects } = useProjects(workspaceId)
  const [projectId, setProjectId] = React.useState<string | undefined>(seed.projectId)

  const activeProjectId = projectId ?? seed.projectId ?? projects?.[0]?.id
  const project = projects?.find((item) => item.id === activeProjectId)

  const { data: statuses } = useStatuses(activeProjectId)
  const { data: labels } = useLabels(activeProjectId)
  const { data: sprints } = useSprints(activeProjectId)
  const { data: issues } = useProjectIssues(activeProjectId)
  const { data: members } = useMembers(workspaceId)
  const createLabel = useCreateLabel(activeProjectId ?? '')
  const create = useCreateIssue()

  const epics = React.useMemo(
    () => (issues ?? []).filter((issue) => issue.type === 'epic'),
    [issues]
  )

  const [form, setForm] = React.useState({
    type: (seed.type ?? 'task') as IssueType,
    title: '',
    description: '',
    statusId: '',
    priority: 'medium' as const,
    assigneeId: null as string | null,
    labelIds: [] as string[],
    sprintId: (seed.sprintId ?? null) as string | null,
    epicId: (seed.epicId ?? null) as string | null,
    storyPoints: null as number | null,
    dueDate: null as string | null,
  })
  const [createAnother, setCreateAnother] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Re-seed whenever the dialog opens from a new context (a board column, an
  // epic, a sprint row).
  React.useEffect(() => {
    if (!seed.open) return
    setProjectId(seed.projectId)
    setForm((prev) => ({
      ...prev,
      type: seed.type ?? (seed.parentId ? 'subtask' : 'task'),
      title: '',
      description: '',
      statusId: seed.statusId ?? '',
      sprintId: seed.sprintId ?? null,
      epicId: seed.epicId ?? null,
      assigneeId: null,
      labelIds: [],
      storyPoints: null,
      dueDate: null,
    }))
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed.open, seed.projectId, seed.statusId, seed.sprintId, seed.epicId, seed.parentId, seed.type])

  // Default the status to the project's first column once statuses load.
  React.useEffect(() => {
    if (!form.statusId && statuses?.length) {
      setForm((prev) => ({ ...prev, statusId: statuses[0].id }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses, activeProjectId])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!activeProjectId) {
      setError('Create a project first — issues live inside a project.')
      return
    }
    if (!form.title.trim()) {
      setError('Give the issue a title.')
      return
    }

    try {
      const issue = await create.mutateAsync({
        project_id: activeProjectId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        type: form.type,
        status_id: form.statusId || statuses?.[0]?.id,
        priority: form.priority,
        assignee_id: form.assigneeId,
        sprint_id: form.sprintId,
        epic_id: form.type === 'epic' ? null : form.epicId,
        parent_id: seed.parentId ?? null,
        story_points: form.storyPoints,
        due_date: form.dueDate,
        labelIds: form.labelIds,
      })

      toast.success(`${issueKey(project?.key, issue.issue_number)} created`, {
        action: {
          label: 'Open',
          onClick: () => openIssueDialog(issue.id),
        },
      })

      if (createAnother) {
        setForm((prev) => ({ ...prev, title: '', description: '', storyPoints: null }))
      } else {
        close()
      }
    } catch (caught) {
      const message = errorMessage(caught, 'Could not create the issue')
      setError(message)
      toast.error(message)
    }
  }

  return (
    <Dialog open={seed.open} onOpenChange={(open) => (open ? null : close())}>
      <DialogContent size="lg">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>
              {seed.parentId ? 'New sub-task' : 'Create issue'}
            </DialogTitle>
            <DialogDescription>
              {project
                ? `In ${project.name} (${project.key})`
                : 'Choose a project to file this against.'}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Project" required>
                <Select
                  value={activeProjectId ?? ''}
                  onValueChange={(value) => {
                    setProjectId(value)
                    setForm((prev) => ({
                      ...prev,
                      statusId: '',
                      labelIds: [],
                      sprintId: null,
                      epicId: null,
                    }))
                  }}
                  disabled={Boolean(seed.projectId) || !projects?.length}
                >
                  <SelectTrigger aria-label="Project">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects?.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        <span className="flex items-center gap-2">
                          <ProjectIcon icon={item.icon} color={item.color} size="sm" />
                          {item.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Type" required>
                <TypeSelect
                  value={form.type}
                  onChange={(type) => setForm((prev) => ({ ...prev, type }))}
                  allowSubtask={Boolean(seed.parentId)}
                />
              </Field>
            </div>

            <Field label="Title" htmlFor="issue-title" required>
              <Input
                id="issue-title"
                value={form.title}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, title: event.target.value }))
                }
                placeholder="Short, specific summary of the work"
                maxLength={300}
                autoFocus
                required
              />
            </Field>

            <Field label="Description" hint="Markdown supported — ⌘/Ctrl + Enter to save.">
              <MarkdownEditor
                value={form.description}
                onChange={(description) => setForm((prev) => ({ ...prev, description }))}
                people={(members ?? []).flatMap((m) => (m.profile ? [m.profile] : []))}
                placeholder="What needs to happen, and how will we know it is done?"
                rows={5}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Status">
                <StatusSelect
                  value={form.statusId}
                  onChange={(statusId) => setForm((prev) => ({ ...prev, statusId }))}
                  statuses={statuses ?? []}
                />
              </Field>

              <Field label="Priority">
                <PrioritySelect
                  value={form.priority}
                  onChange={(priority) =>
                    setForm((prev) => ({ ...prev, priority: priority as typeof prev.priority }))
                  }
                />
              </Field>

              <Field label="Assignee">
                <AssigneePicker
                  value={form.assigneeId}
                  onChange={(assigneeId) => setForm((prev) => ({ ...prev, assigneeId }))}
                  members={members ?? []}
                  currentUserId={userId}
                />
              </Field>

              <Field label="Labels">
                <LabelPicker
                  value={form.labelIds}
                  onChange={(labelIds) => setForm((prev) => ({ ...prev, labelIds }))}
                  labels={labels ?? []}
                  onCreateLabel={
                    activeProjectId
                      ? async (name) =>
                          createLabel.mutateAsync({ name, color: '#64748B' })
                      : undefined
                  }
                />
              </Field>

              <Field label="Sprint">
                <SprintSelect
                  value={form.sprintId}
                  onChange={(sprintId) => setForm((prev) => ({ ...prev, sprintId }))}
                  sprints={sprints ?? []}
                />
              </Field>

              {form.type !== 'epic' ? (
                <Field label="Epic">
                  <EpicSelect
                    value={form.epicId}
                    onChange={(epicId) => setForm((prev) => ({ ...prev, epicId }))}
                    epics={epics}
                  />
                </Field>
              ) : null}

              <Field label="Story points">
                <StoryPointsSelect
                  value={form.storyPoints}
                  onChange={(storyPoints) => setForm((prev) => ({ ...prev, storyPoints }))}
                />
              </Field>

              <Field label="Due date" htmlFor="issue-due">
                <DateField
                  id="issue-due"
                  value={form.dueDate}
                  onChange={(dueDate) => setForm((prev) => ({ ...prev, dueDate }))}
                />
              </Field>
            </div>

            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive-subtle px-3 py-2 text-xs font-medium text-destructive"
              >
                {error}
              </p>
            ) : null}
          </DialogBody>

          <DialogFooter className="sm:justify-between">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                checked={createAnother}
                onCheckedChange={setCreateAnother}
                aria-label="Create another"
              />
              Create another
            </label>
            <div className="flex gap-2 sm:justify-end">
              <Button type="button" variant="secondary" onClick={close} className="flex-1 sm:flex-none">
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={create.isPending}
                className="flex-1 sm:flex-none"
              >
                Create issue
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
