'use client'

import { ArrowRight, Flag, Play, Plus, Zap } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'

import { IssueRow } from '@/components/issues/issue-card'
import { ProjectPage } from '@/components/projects/project-page'
import { useProjectContext } from '@/components/projects/project-provider'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { DistributionBars, DistributionPie } from '@/components/reports/charts'
import { StatTile, WorkloadTable } from '@/components/reports/stat-tiles'
import { Button } from '@/components/ui/button'
import {
  Avatar,
  Badge,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ProgressBar,
  Skeleton,
} from '@/components/ui/primitives'
import { Markdown } from '@/components/ui/markdown'
import { daysRemaining, formatSprintWindow, isOverdue } from '@/lib/format'
import { can } from '@/lib/permissions'
import { useProjectIssues } from '@/lib/queries/issues'
import { useSprints } from '@/lib/queries/sprints'
import { distributionByStatus, distributionByType, workloadByAssignee } from '@/lib/reports'
import { useUiStore } from '@/lib/store/ui-store'
import { displayName, percent, sum } from '@/lib/utils'

export default function ProjectOverviewPage() {
  const { project, projectId } = useProjectContext()
  const { caps } = useWorkspaceContext()
  const { data: issues, isLoading } = useProjectIssues(projectId)
  const { data: sprints } = useSprints(projectId)
  const openCreateIssue = useUiStore((state) => state.openCreateIssue)
  const openIssueDialog = useUiStore((state) => state.openIssueDialog)

  const all = issues ?? []
  const open = all.filter((issue) => issue.status?.category !== 'done')
  const done = all.filter((issue) => issue.status?.category === 'done')
  const overdue = open.filter((issue) => isOverdue(issue.due_date))
  const epics = all.filter((issue) => issue.type === 'epic')

  const activeSprint = sprints?.find((sprint) => sprint.status === 'active') ?? null
  const sprintIssues = activeSprint
    ? all.filter((issue) => issue.sprint_id === activeSprint.id)
    : []
  const sprintDone = sprintIssues.filter((issue) => issue.status?.category === 'done')

  return (
    <ProjectPage
      actions={
        can.writeIssues(caps) ? (
          <Button variant="primary" size="sm" onClick={() => openCreateIssue({ projectId })}>
            <Plus />
            Create
          </Button>
        ) : null
      }
    >
      <div className="space-y-4 p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Open issues" value={open.length} isLoading={isLoading} />
          <StatTile
            label="Completed"
            value={done.length}
            tone="success"
            hint={all.length ? `${percent(done.length, all.length)}% of all issues` : undefined}
            isLoading={isLoading}
          />
          <StatTile
            label="Overdue"
            value={overdue.length}
            tone={overdue.length ? 'danger' : 'neutral'}
            isLoading={isLoading}
          />
          <StatTile
            label="Unestimated"
            value={open.filter((issue) => issue.story_points == null).length}
            tone="warning"
            hint="Open issues with no story points"
            isLoading={isLoading}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          {/* Active sprint */}
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
              <div>
                <CardTitle>
                  {activeSprint ? activeSprint.name : 'No active sprint'}
                </CardTitle>
                <CardDescription>
                  {activeSprint
                    ? formatSprintWindow(activeSprint.start_date, activeSprint.end_date)
                    : 'Start a sprint from the backlog to track a time-boxed goal.'}
                </CardDescription>
              </div>
              {activeSprint ? (
                <Badge variant="success">
                  {daysRemaining(activeSprint.end_date) != null
                    ? `${Math.max(daysRemaining(activeSprint.end_date)!, 0)} days left`
                    : 'Active'}
                </Badge>
              ) : null}
            </CardHeader>

            <div className="space-y-3 px-4 pb-4 sm:px-5">
              {activeSprint ? (
                <>
                  {activeSprint.goal ? (
                    <div className="rounded-lg border border-border bg-surface-raised px-3 py-2">
                      <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Sprint goal
                      </p>
                      <p className="mt-0.5 text-sm">{activeSprint.goal}</p>
                    </div>
                  ) : null}

                  <div>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="font-medium">
                        {sprintDone.length} of {sprintIssues.length} issues done
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {sum(sprintDone.map((i) => i.story_points))}/
                        {sum(sprintIssues.map((i) => i.story_points))} pts
                      </span>
                    </div>
                    <ProgressBar
                      value={sprintDone.length}
                      max={Math.max(sprintIssues.length, 1)}
                      className="mt-2 h-2"
                      label="Sprint progress"
                    />
                  </div>

                  <Button asChild variant="secondary" size="sm" className="w-full">
                    <Link href={`/projects/${project?.key}/board`}>
                      Open the board
                      <ArrowRight />
                    </Link>
                  </Button>
                </>
              ) : (
                <EmptyState
                  icon={<Play />}
                  title="Nothing running"
                  description={
                    can.manageSprints(caps)
                      ? 'Create a sprint in the backlog, add issues, then start it.'
                      : 'A project lead can start the next sprint.'
                  }
                  compact
                  className="border-0 bg-transparent"
                  action={
                    can.manageSprints(caps) ? (
                      <Button asChild variant="secondary" size="sm">
                        <Link href={`/projects/${project?.key}/backlog`}>
                          Go to backlog
                        </Link>
                      </Button>
                    ) : null
                  }
                />
              )}
            </div>
          </Card>

          {/* About */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>About this project</CardTitle>
            </CardHeader>
            <div className="space-y-3 px-4 pb-4 text-sm sm:px-5">
              {project?.description ? (
                <Markdown>{project.description}</Markdown>
              ) : (
                <p className="text-xs text-muted-foreground">No description yet.</p>
              )}
              <dl className="space-y-2 border-t border-border pt-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Project lead</dt>
                  <dd className="flex items-center gap-1.5 font-medium">
                    {project?.lead ? (
                      <>
                        <Avatar
                          id={project.lead.id}
                          name={project.lead.full_name}
                          src={project.lead.avatar_url}
                          size="xs"
                        />
                        {displayName(project.lead)}
                      </>
                    ) : (
                      <span className="text-muted-foreground">Not set</span>
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Issue key prefix</dt>
                  <dd className="font-mono font-medium">{project?.key}-1</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Issues created</dt>
                  <dd className="font-medium tabular-nums">{project?.issue_counter ?? 0}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Sprints</dt>
                  <dd className="font-medium tabular-nums">{sprints?.length ?? 0}</dd>
                </div>
              </dl>
            </div>
          </Card>
        </div>

        {/* Epics */}
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between pb-3">
            <div>
              <CardTitle>Epics</CardTitle>
              <CardDescription>Larger bodies of work and their progress</CardDescription>
            </div>
            {can.writeIssues(caps) ? (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => openCreateIssue({ projectId, type: 'epic' })}
              >
                <Plus />
                New epic
              </Button>
            ) : null}
          </CardHeader>

          {isLoading ? (
            <div className="space-y-2 p-4 pt-0">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : epics.length ? (
            <ul className="divide-y divide-border border-t border-border">
              {epics.map((epic) => {
                const children = all.filter((issue) => issue.epic_id === epic.id)
                const childrenDone = children.filter(
                  (issue) => issue.status?.category === 'done'
                )
                return (
                  <li key={epic.id} className="px-3 py-2.5 sm:px-4">
                    <div className="flex items-center gap-2">
                      <Zap className="size-3.5 shrink-0 text-[#7C3AED]" />
                      <button
                        type="button"
                        onClick={() => openIssueDialog(epic.id)}
                        className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
                      >
                        {epic.title}
                      </button>
                      <Badge variant="outline" className="shrink-0 tabular-nums">
                        {childrenDone.length}/{children.length}
                      </Badge>
                    </div>
                    <ProgressBar
                      value={childrenDone.length}
                      max={Math.max(children.length, 1)}
                      className="mt-2"
                      label={`${epic.title} progress`}
                    />
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="px-4 pb-4">
              <EmptyState
                icon={<Flag />}
                title="No epics yet"
                description="Group related stories under an epic to track a theme over several sprints."
                compact
                className="border-0 bg-transparent"
              />
            </div>
          )}
        </Card>

        <div className="grid gap-3 lg:grid-cols-3">
          <DistributionPie
            title="By type"
            data={distributionByType(all)}
            isLoading={isLoading}
          />
          <DistributionBars
            title="By status"
            data={distributionByStatus(all)}
            isLoading={isLoading}
          />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Workload</CardTitle>
              <CardDescription>Open issues per assignee</CardDescription>
            </CardHeader>
            <div className="px-4 pb-4 sm:px-5">
              <WorkloadTable rows={workloadByAssignee(open).slice(0, 6)} isLoading={isLoading} />
            </div>
          </Card>
        </div>

        {/* Recently updated */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle>Recently updated</CardTitle>
          </CardHeader>
          {all.length ? (
            <div className="border-t border-border">
              {all
                .slice()
                .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
                .slice(0, 8)
                .map((issue) => (
                  <IssueRow key={issue.id} issue={issue} onOpen={openIssueDialog} />
                ))}
            </div>
          ) : (
            <div className="px-4 pb-4">
              <EmptyState
                title="No issues yet"
                description="Create the first issue to get this project moving."
                compact
                className="border-0 bg-transparent"
                action={
                  can.writeIssues(caps) ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => openCreateIssue({ projectId })}
                    >
                      <Plus />
                      Create issue
                    </Button>
                  ) : null
                }
              />
            </div>
          )}
        </Card>
      </div>
    </ProjectPage>
  )
}
