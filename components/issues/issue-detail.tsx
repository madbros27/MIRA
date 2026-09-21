'use client'

import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

import { IssueActivity } from './issue-activity'
import { IssueAttachments } from './issue-attachments'
import { IssueKeyBadge, IssueTypeIcon, StatusPill } from './issue-atoms'
import { IssueComments } from './issue-comments'
import { IssueRow } from './issue-card'
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
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
} from '@/components/ui/controls'
import { Textarea } from '@/components/ui/input'
import { Markdown } from '@/components/ui/markdown'
import { MarkdownEditor } from '@/components/ui/markdown-editor'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { Avatar, AvatarStack, EmptyState, Separator, Skeleton } from '@/components/ui/primitives'
import { formatDateTime, formatRelative, toDateInputValue } from '@/lib/format'
import { can, canDeleteIssue } from '@/lib/permissions'
import { useToggleWatch, useWatchers } from '@/lib/queries/issue-detail'
import {
  useCloneIssue,
  useDeleteIssue,
  useIssue,
  useProjectIssues,
  useSetIssueLabels,
  useSubtasks,
  useUpdateIssue,
} from '@/lib/queries/issues'
import { useCreateLabel, useLabels, useStatuses, useTransitions } from '@/lib/queries/projects'
import { useRealtimeIssue } from '@/lib/queries/realtime'
import { useSprints } from '@/lib/queries/sprints'
import { useMembers } from '@/lib/queries/workspaces'
import { useUiStore } from '@/lib/store/ui-store'
import { cn, displayName, errorMessage, issueKey } from '@/lib/utils'

export function IssueDetail({
  issueId,
  mode = 'page',
  onClose,
}: {
  issueId: string
  mode?: 'page' | 'dialog'
  onClose?: () => void
}) {
  const router = useRouter()
  const { userId, workspaceId, caps } = useWorkspaceContext()
  const { data: issue, isLoading, error } = useIssue(issueId)

  useRealtimeIssue(issueId)

  const projectId = issue?.project_id
  const { data: statuses } = useStatuses(projectId)
  const { data: transitions } = useTransitions(projectId)
  const { data: labels } = useLabels(projectId)
  const { data: sprints } = useSprints(projectId)
  const { data: members } = useMembers(workspaceId)
  const { data: projectIssues } = useProjectIssues(projectId)
  const { data: subtasks } = useSubtasks(issueId)
  const { data: watchers } = useWatchers(issueId)

  const update = useUpdateIssue(projectId)
  const setLabels = useSetIssueLabels(projectId ?? '')
  const createLabel = useCreateLabel(projectId ?? '')
  const clone = useCloneIssue()
  const remove = useDeleteIssue(projectId ?? '')
  const toggleWatch = useToggleWatch(issueId)
  const openCreateIssue = useUiStore((state) => state.openCreateIssue)
  const openIssueDialog = useUiStore((state) => state.openIssueDialog)

  const [editingTitle, setEditingTitle] = React.useState(false)
  const [titleDraft, setTitleDraft] = React.useState('')
  const [editingDescription, setEditingDescription] = React.useState(false)
  const [descriptionDraft, setDescriptionDraft] = React.useState('')
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  const canWrite = can.writeIssues(caps)
  const key = issue ? issueKey(issue.project?.key, issue.issue_number) : ''
  const watching = Boolean(watchers?.some((watcher) => watcher.user_id === userId))
  const epics = React.useMemo(
    () => (projectIssues ?? []).filter((item) => item.type === 'epic' && item.id !== issueId),
    [projectIssues, issueId]
  )

  const patch = React.useCallback(
    async (values: Parameters<typeof update.mutateAsync>[0]) => {
      try {
        await update.mutateAsync(values)
      } catch (caught) {
        toast.error(errorMessage(caught, 'Could not save the change'))
      }
    },
    [update]
  )

  if (isLoading) return <IssueDetailSkeleton />

  if (error || !issue) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<X />}
          title="Issue not available"
          description={
            error
              ? errorMessage(error, 'This issue could not be loaded.')
              : 'It may have been deleted, or you may not have access to its project.'
          }
          action={
            <Button variant="secondary" size="sm" onClick={() => router.push('/')}>
              Back to home
            </Button>
          }
        />
      </div>
    )
  }

  async function copyLink() {
    const url = `${window.location.origin}/issues/${key}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('Could not copy the link — copy it from the address bar instead.')
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5 sm:px-5">
        <IssueTypeIcon type={issue.type} />
        {issue.project ? (
          <Link
            href={`/projects/${issue.project.key}/board`}
            className="hidden truncate text-xs font-medium text-muted-foreground hover:text-foreground sm:block"
          >
            {issue.project.name}
          </Link>
        ) : null}
        <span className="hidden text-muted-foreground sm:block" aria-hidden>
          /
        </span>
        <Link
          href={`/issues/${key}`}
          className="font-mono text-xs font-semibold uppercase tracking-wide hover:underline"
        >
          {key}
        </Link>

        <div className="ml-auto flex items-center gap-1">
          <Tooltip content={watching ? 'Stop watching' : 'Watch this issue'}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => toggleWatch.mutate({ userId, watching })}
              aria-label={watching ? 'Stop watching' : 'Watch this issue'}
              aria-pressed={watching}
            >
              {watching ? <Eye /> : <EyeOff />}
            </Button>
          </Tooltip>

          <Tooltip content={copied ? 'Link copied' : 'Copy link'}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={copyLink}
              aria-label="Copy link to this issue"
            >
              {copied ? <Check /> : <Link2 />}
            </Button>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {mode === 'dialog' ? (
                <DropdownMenuItem onSelect={() => router.push(`/issues/${key}`)}>
                  <Link2 />
                  Open full page
                </DropdownMenuItem>
              ) : null}
              {canWrite ? (
                <>
                  <DropdownMenuItem
                    onSelect={() =>
                      openCreateIssue({
                        projectId: issue.project_id,
                        parentId: issue.id,
                        type: 'subtask',
                        sprintId: issue.sprint_id,
                      })
                    }
                  >
                    <Plus />
                    Add sub-task
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={async () => {
                      try {
                        const created = await clone.mutateAsync(issue)
                        toast.success('Issue cloned', {
                          action: {
                            label: 'Open',
                            onClick: () => openIssueDialog(created.id),
                          },
                        })
                      } catch (caught) {
                        toast.error(errorMessage(caught, 'Could not clone the issue'))
                      }
                    }}
                  >
                    <Copy />
                    Clone issue
                  </DropdownMenuItem>
                </>
              ) : null}
              {canDeleteIssue(caps, issue.reporter_id, userId) ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={() => setConfirmingDelete(true)}>
                    <Trash2 />
                    Delete issue
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          {mode === 'dialog' && onClose ? (
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
              <X />
            </Button>
          ) : null}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Body                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_19rem] lg:overflow-hidden">
        <div className="min-w-0 space-y-5 px-3 py-4 sm:px-5 lg:overflow-y-auto">
          {/* Title */}
          {editingTitle ? (
            <div className="space-y-2">
              <Textarea
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                rows={2}
                autoFocus
                className="text-lg font-semibold"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    if (titleDraft.trim()) {
                      patch({ id: issue.id, title: titleDraft.trim() })
                      setEditingTitle(false)
                    }
                  }
                  if (event.key === 'Escape') setEditingTitle(false)
                }}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditingTitle(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!titleDraft.trim()}
                  onClick={() => {
                    patch({ id: issue.id, title: titleDraft.trim() })
                    setEditingTitle(false)
                  }}
                >
                  Save title
                </Button>
              </div>
            </div>
          ) : (
            <h1
              className={cn(
                'group -mx-1.5 rounded-lg px-1.5 text-lg font-semibold leading-snug sm:text-xl',
                canWrite && 'cursor-text hover:bg-muted/60'
              )}
              onClick={() => {
                if (!canWrite) return
                setTitleDraft(issue.title)
                setEditingTitle(true)
              }}
            >
              {issue.title}
              {canWrite ? (
                <Pencil className="ml-2 inline size-3.5 align-middle text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              ) : null}
            </h1>
          )}

          {/* Description */}
          <section aria-label="Description" className="space-y-2">
            <h2 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              Description
            </h2>
            {editingDescription ? (
              <div className="space-y-2">
                <MarkdownEditor
                  value={descriptionDraft}
                  onChange={setDescriptionDraft}
                  people={(members ?? []).flatMap((m) => (m.profile ? [m.profile] : []))}
                  rows={8}
                  autoFocus
                  onSubmitShortcut={() => {
                    patch({ id: issue.id, description: descriptionDraft.trim() || null })
                    setEditingDescription(false)
                  }}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingDescription(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      patch({ id: issue.id, description: descriptionDraft.trim() || null })
                      setEditingDescription(false)
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : issue.description ? (
              <div
                className={cn(
                  '-mx-1.5 rounded-lg px-1.5 py-1',
                  canWrite && 'cursor-text hover:bg-muted/50'
                )}
                onClick={() => {
                  if (!canWrite) return
                  setDescriptionDraft(issue.description ?? '')
                  setEditingDescription(true)
                }}
              >
                <Markdown>{issue.description}</Markdown>
              </div>
            ) : canWrite ? (
              <button
                type="button"
                onClick={() => {
                  setDescriptionDraft('')
                  setEditingDescription(true)
                }}
                className="w-full rounded-lg border border-dashed border-border px-3 py-3 text-left text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
              >
                Add a description — context, acceptance criteria, links.
              </button>
            ) : (
              <p className="text-xs text-muted-foreground">No description.</p>
            )}
          </section>

          {/* Parent / sub-tasks */}
          {issue.parent_id ? (
            <ParentLink parentId={issue.parent_id} onOpen={openIssueDialog} />
          ) : null}

          {issue.type !== 'subtask' ? (
            <section aria-label="Sub-tasks" className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Sub-tasks {subtasks?.length ? `(${subtasks.length})` : ''}
                </h2>
                {canWrite ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      openCreateIssue({
                        projectId: issue.project_id,
                        parentId: issue.id,
                        type: 'subtask',
                        sprintId: issue.sprint_id,
                      })
                    }
                  >
                    <Plus />
                    Add
                  </Button>
                ) : null}
              </div>
              {subtasks?.length ? (
                <div className="overflow-hidden rounded-xl border border-border">
                  {subtasks.map((subtask) => (
                    <IssueRow
                      key={subtask.id}
                      issue={subtask}
                      onOpen={openIssueDialog}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Break this down into smaller pieces when it helps.
                </p>
              )}
            </section>
          ) : null}

          {/* Discussion */}
          <Tabs defaultValue="comments">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="comments" className="flex-1 sm:flex-none">
                Comments
                {issue.comment_count ? (
                  <span className="ml-1 text-2xs text-muted-foreground">
                    {issue.comment_count}
                  </span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="attachments" className="flex-1 sm:flex-none">
                Files
              </TabsTrigger>
              <TabsTrigger value="activity" className="flex-1 sm:flex-none">
                Activity
              </TabsTrigger>
            </TabsList>

            <TabsContent value="comments">
              <IssueComments issueId={issue.id} canWrite={canWrite} />
            </TabsContent>
            <TabsContent value="attachments">
              <IssueAttachments
                issueId={issue.id}
                projectId={issue.project_id}
                canWrite={canWrite}
              />
            </TabsContent>
            <TabsContent value="activity">
              <IssueActivity issueId={issue.id} />
            </TabsContent>
          </Tabs>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Fields                                                           */}
        {/* ---------------------------------------------------------------- */}
        <aside
          className="space-y-4 border-t border-border bg-surface-raised px-3 py-4 sm:px-5 lg:overflow-y-auto lg:border-l lg:border-t-0"
          aria-label="Issue fields"
        >
          <FieldRow label="Status">
            <StatusSelect
              value={issue.status_id}
              onChange={(status_id) => patch({ id: issue.id, status_id })}
              statuses={statuses ?? []}
              transitions={transitions}
              size="sm"
              disabled={!canWrite}
            />
          </FieldRow>

          <FieldRow label="Assignee">
            <AssigneePicker
              value={issue.assignee_id}
              onChange={(assignee_id) => patch({ id: issue.id, assignee_id })}
              members={members ?? []}
              currentUserId={userId}
              disabled={!canWrite}
              align="end"
            />
          </FieldRow>

          <FieldRow label="Reporter">
            <div className="flex h-9 items-center gap-2 px-0.5 text-sm">
              <Avatar
                id={issue.reporter?.id ?? 'unknown'}
                name={issue.reporter?.full_name ?? issue.reporter?.email}
                src={issue.reporter?.avatar_url}
                size="sm"
              />
              <span className="truncate">{displayName(issue.reporter)}</span>
            </div>
          </FieldRow>

          <FieldRow label="Type">
            <TypeSelect
              value={issue.type}
              onChange={(type) => patch({ id: issue.id, type })}
              size="sm"
              disabled={!canWrite}
              allowSubtask={Boolean(issue.parent_id)}
            />
          </FieldRow>

          <FieldRow label="Priority">
            <PrioritySelect
              value={issue.priority}
              onChange={(priority) => patch({ id: issue.id, priority })}
              size="sm"
              disabled={!canWrite}
            />
          </FieldRow>

          <FieldRow label="Labels">
            <LabelPicker
              value={issue.labels.map((label) => label.id)}
              onChange={(labelIds) =>
                setLabels.mutate({ issueId: issue.id, labelIds })
              }
              labels={labels ?? []}
              disabled={!canWrite}
              onCreateLabel={
                canWrite
                  ? async (name) => createLabel.mutateAsync({ name, color: '#64748B' })
                  : undefined
              }
            />
          </FieldRow>

          <FieldRow label="Sprint">
            <SprintSelect
              value={issue.sprint_id}
              onChange={(sprint_id) => patch({ id: issue.id, sprint_id })}
              sprints={sprints ?? []}
              size="sm"
              disabled={!canWrite}
            />
          </FieldRow>

          {issue.type !== 'epic' ? (
            <FieldRow label="Epic">
              <EpicSelect
                value={issue.epic_id}
                onChange={(epic_id) => patch({ id: issue.id, epic_id })}
                epics={epics}
                size="sm"
                disabled={!canWrite}
              />
            </FieldRow>
          ) : null}

          <FieldRow label="Story points">
            <StoryPointsSelect
              value={issue.story_points}
              onChange={(story_points) => patch({ id: issue.id, story_points })}
              size="sm"
              disabled={!canWrite}
            />
          </FieldRow>

          <FieldRow label="Due date">
            <DateField
              value={toDateInputValue(issue.due_date)}
              onChange={(due_date) => patch({ id: issue.id, due_date })}
              disabled={!canWrite}
            />
          </FieldRow>

          <Separator />

          <FieldRow label={`Watchers (${watchers?.length ?? 0})`}>
            {watchers?.length ? (
              <div className="flex h-9 items-center">
                <AvatarStack
                  people={watchers.flatMap((watcher) =>
                    watcher.profile ? [watcher.profile] : []
                  )}
                  max={6}
                />
              </div>
            ) : (
              <p className="flex h-9 items-center text-xs text-muted-foreground">
                Nobody is watching yet.
              </p>
            )}
          </FieldRow>

          <dl className="space-y-1.5 border-t border-border pt-3 text-2xs text-muted-foreground">
            <div className="flex justify-between gap-2">
              <dt>Created</dt>
              <dd title={formatDateTime(issue.created_at)}>
                {formatRelative(issue.created_at)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Updated</dt>
              <dd title={formatDateTime(issue.updated_at)}>
                {formatRelative(issue.updated_at)}
              </dd>
            </div>
            {issue.resolved_at ? (
              <div className="flex justify-between gap-2">
                <dt>Resolved</dt>
                <dd title={formatDateTime(issue.resolved_at)}>
                  {formatRelative(issue.resolved_at)}
                </dd>
              </div>
            ) : null}
          </dl>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={`Delete ${key}?`}
        description="The issue, its comments, attachments and sub-tasks are removed permanently."
        confirmLabel="Delete issue"
        destructive
        onConfirm={async () => {
          try {
            await remove.mutateAsync(issue.id)
            toast.success(`${key} deleted`)
            if (mode === 'dialog') onClose?.()
            else if (issue.project) router.push(`/projects/${issue.project.key}/board`)
            else router.push('/')
          } catch (caught) {
            toast.error(errorMessage(caught, 'Could not delete the issue'))
          }
        }}
      />
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  )
}

function ParentLink({
  parentId,
  onOpen,
}: {
  parentId: string
  onOpen: (issueId: string) => void
}) {
  const { data: parent } = useIssue(parentId)
  if (!parent) return null

  return (
    <button
      type="button"
      onClick={() => onOpen(parent.id)}
      className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface-raised px-2.5 py-2 text-left text-xs transition-colors hover:border-border-strong"
    >
      <IssueTypeIcon type={parent.type} />
      <IssueKeyBadge issueKey={issueKey(parent.project?.key, parent.issue_number)} />
      <span className="min-w-0 flex-1 truncate font-medium">{parent.title}</span>
      <StatusPill status={parent.status} />
    </button>
  )
}

export function IssueDetailSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <Skeleton className="size-4 rounded" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="ml-auto h-7 w-20 rounded-lg" />
      </div>
      <div className="grid flex-1 grid-cols-1 gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-4">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-8 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
