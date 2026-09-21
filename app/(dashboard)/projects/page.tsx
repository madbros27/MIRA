'use client'

import { Archive, ArchiveRestore, MoreHorizontal, Plus, Settings, Trash2 } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/app-shell'
import { ProjectIcon } from '@/components/layout/project-icon'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Switch } from '@/components/ui/controls'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  Skeleton,
} from '@/components/ui/primitives'
import { formatRelative } from '@/lib/format'
import { can } from '@/lib/permissions'
import { useDeleteProject, useProjects, useUpdateProject } from '@/lib/queries/projects'
import { useWorkspaceIssues } from '@/lib/queries/issues'
import { useUiStore } from '@/lib/store/ui-store'
import type { ProjectWithMeta } from '@/lib/types/app'
import { displayName, errorMessage, percent } from '@/lib/utils'

export default function ProjectsPage() {
  const { workspaceId, caps } = useWorkspaceContext()
  const [showArchived, setShowArchived] = React.useState(false)
  const { data: projects, isLoading } = useProjects(workspaceId, showArchived)
  const { data: issues } = useWorkspaceIssues(workspaceId)
  const setCreateProjectOpen = useUiStore((state) => state.setCreateProjectOpen)
  const update = useUpdateProject(workspaceId)
  const remove = useDeleteProject(workspaceId)
  const [deleting, setDeleting] = React.useState<ProjectWithMeta | null>(null)

  const countsByProject = React.useMemo(() => {
    const map = new Map<string, { open: number; done: number }>()
    for (const issue of issues ?? []) {
      const entry = map.get(issue.project_id) ?? { open: 0, done: 0 }
      if (issue.status?.category === 'done') entry.done += 1
      else entry.open += 1
      map.set(issue.project_id, entry)
    }
    return map
  }, [issues])

  return (
    <>
      <PageHeader
        title="Projects"
        description="Every project in this workspace, with its own board, backlog and workflow."
        actions={
          <>
            <label className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              <Switch
                checked={showArchived}
                onCheckedChange={setShowArchived}
                aria-label="Show archived projects"
              />
              Show archived
            </label>
            {can.createProject(caps) ? (
              <Button variant="primary" size="sm" onClick={() => setCreateProjectOpen(true)}>
                <Plus />
                New project
              </Button>
            ) : null}
          </>
        }
      />

      <div className="p-3 sm:p-4">
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : projects?.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => {
              const counts = countsByProject.get(project.id) ?? { open: 0, done: 0 }
              const total = counts.open + counts.done

              return (
                <Card
                  key={project.id}
                  className={project.is_archived ? 'opacity-70' : undefined}
                >
                  <div className="flex items-start gap-3 p-4 pb-3">
                    <ProjectIcon icon={project.icon} color={project.color} size="lg" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/projects/${project.key}`}
                        className="block truncate text-sm font-semibold hover:underline"
                      >
                        {project.name}
                      </Link>
                      <p className="font-mono text-2xs text-muted-foreground">{project.key}</p>
                    </div>

                    {project.is_archived ? <Badge variant="warning">Archived</Badge> : null}

                    {can.manageProject(caps) ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`${project.name} actions`}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/projects/${project.key}/settings`}>
                              <Settings />
                              Project settings
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={async () => {
                              try {
                                await update.mutateAsync({
                                  id: project.id,
                                  is_archived: !project.is_archived,
                                })
                                toast.success(
                                  project.is_archived
                                    ? `${project.name} restored`
                                    : `${project.name} archived`
                                )
                              } catch (error) {
                                toast.error(errorMessage(error, 'Could not update the project'))
                              }
                            }}
                          >
                            {project.is_archived ? <ArchiveRestore /> : <Archive />}
                            {project.is_archived ? 'Restore project' : 'Archive project'}
                          </DropdownMenuItem>
                          {can.deleteProject(caps) ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                destructive
                                onSelect={() => setDeleting(project)}
                              >
                                <Trash2 />
                                Delete project
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>

                  <p className="line-clamp-2 min-h-8 px-4 text-xs text-muted-foreground">
                    {project.description || 'No description yet.'}
                  </p>

                  <div className="mt-3 flex items-center gap-2 px-4 pb-4 text-2xs text-muted-foreground">
                    {project.lead ? (
                      <span className="flex items-center gap-1.5">
                        <Avatar
                          id={project.lead.id}
                          name={project.lead.full_name}
                          src={project.lead.avatar_url}
                          size="xs"
                        />
                        {displayName(project.lead)}
                      </span>
                    ) : (
                      <span>No lead</span>
                    )}
                    <span className="ml-auto tabular-nums">
                      {counts.open} open · {total ? `${percent(counts.done, total)}% done` : '—'}
                    </span>
                  </div>

                  <div className="flex divide-x divide-border border-t border-border text-center text-2xs font-medium">
                    <Link
                      href={`/projects/${project.key}/board`}
                      className="flex-1 py-2 transition-colors hover:bg-muted"
                    >
                      Board
                    </Link>
                    <Link
                      href={`/projects/${project.key}/backlog`}
                      className="flex-1 py-2 transition-colors hover:bg-muted"
                    >
                      Backlog
                    </Link>
                    <Link
                      href={`/projects/${project.key}/reports`}
                      className="flex-1 py-2 transition-colors hover:bg-muted"
                    >
                      Reports
                    </Link>
                  </div>

                  <p className="border-t border-border px-4 py-1.5 text-[0.625rem] text-muted-foreground">
                    Updated {formatRelative(project.updated_at)}
                  </p>
                </Card>
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon={<ProjectIcon icon="Rocket" color="#5B5BD6" size="md" />}
            title={showArchived ? 'No projects at all' : 'No active projects'}
            description={
              can.createProject(caps)
                ? 'Create a project to get a Kanban board, a backlog, sprints and issue keys.'
                : 'Ask an admin or a project lead to create one and add you to it.'
            }
            action={
              can.createProject(caps) ? (
                <Button variant="primary" size="sm" onClick={() => setCreateProjectOpen(true)}>
                  <Plus />
                  Create project
                </Button>
              ) : null
            }
          />
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => (open ? null : setDeleting(null))}
        title={`Delete ${deleting?.name}?`}
        description="Every issue, comment, attachment and sprint in this project is deleted permanently. Archive it instead if you only want it out of the way."
        confirmLabel="Delete project"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try {
            await remove.mutateAsync(deleting.id)
            toast.success(`${deleting.name} deleted`)
            setDeleting(null)
          } catch (error) {
            toast.error(errorMessage(error, 'Could not delete the project'))
          }
        }}
      />
    </>
  )
}
