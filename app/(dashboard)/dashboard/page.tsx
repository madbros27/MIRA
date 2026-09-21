'use client'

import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Plus,
  UserRound,
} from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'

import { PageHeader } from '@/components/layout/app-shell'
import { ProjectIcon } from '@/components/layout/project-icon'
import { IssueRow } from '@/components/issues/issue-card'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import {
  CreatedVsResolvedChart,
  DistributionBars,
  DistributionPie,
} from '@/components/reports/charts'
import { StatTile, WorkloadTable } from '@/components/reports/stat-tiles'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, EmptyState, Skeleton } from '@/components/ui/primitives'
import { isOverdue } from '@/lib/format'
import { can } from '@/lib/permissions'
import { useProjects } from '@/lib/queries/projects'
import { useWorkspaceIssues } from '@/lib/queries/issues'
import {
  createdVsResolved,
  distributionByPriority,
  distributionByType,
  workloadByAssignee,
} from '@/lib/reports'
import { useUiStore } from '@/lib/store/ui-store'
import { displayName, sum } from '@/lib/utils'

export default function WorkspaceHomePage() {
  const { workspace, workspaceId, profile, userId, caps } = useWorkspaceContext()
  const { data: projects, isLoading: projectsLoading } = useProjects(workspaceId)
  const { data: issues, isLoading: issuesLoading } = useWorkspaceIssues(workspaceId)
  const openCreateIssue = useUiStore((state) => state.openCreateIssue)
  const openIssueDialog = useUiStore((state) => state.openIssueDialog)
  const setCreateProjectOpen = useUiStore((state) => state.setCreateProjectOpen)

  const stats = React.useMemo(() => {
    const all = issues ?? []
    const open = all.filter((issue) => issue.status?.category !== 'done')
    const done = all.filter((issue) => issue.status?.category === 'done')
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    return {
      open: open.length,
      openPoints: sum(open.map((issue) => issue.story_points)),
      doneThisWeek: done.filter((issue) => (issue.resolved_at ?? '') >= weekAgo).length,
      overdue: open.filter((issue) => isOverdue(issue.due_date)).length,
      unassigned: open.filter((issue) => !issue.assignee_id).length,
      mine: open.filter((issue) => issue.assignee_id === userId),
    }
  }, [issues, userId])

  const recentlyUpdated = React.useMemo(
    () =>
      (issues ?? [])
        .slice()
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 6),
    [issues]
  )

  const firstName = displayName(profile).split(' ')[0]

  return (
    <>
      <PageHeader
        title={`Good to see you, ${firstName}`}
        description={
          workspace
            ? `${workspace.name} · ${projects?.length ?? 0} ${
                (projects?.length ?? 0) === 1 ? 'project' : 'projects'
              }`
            : undefined
        }
        actions={
          can.writeIssues(caps) ? (
            <Button variant="primary" size="sm" onClick={() => openCreateIssue()}>
              <Plus />
              Create issue
            </Button>
          ) : null
        }
      />

      <div className="space-y-4 p-3 sm:p-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Open issues"
            value={stats.open}
            hint={stats.openPoints ? `${stats.openPoints} story points` : 'No estimates yet'}
            isLoading={issuesLoading}
          />
          <StatTile
            label="Done this week"
            value={stats.doneThisWeek}
            tone="success"
            hint="Resolved in the last 7 days"
            isLoading={issuesLoading}
          />
          <StatTile
            label="Overdue"
            value={stats.overdue}
            tone={stats.overdue ? 'danger' : 'neutral'}
            hint="Past their due date"
            isLoading={issuesLoading}
          />
          <StatTile
            label="Unassigned"
            value={stats.unassigned}
            tone={stats.unassigned ? 'warning' : 'neutral'}
            hint="Nobody has picked these up"
            isLoading={issuesLoading}
          />
        </div>

        {/* Projects */}
        <section aria-labelledby="projects-heading" className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 id="projects-heading" className="text-sm font-semibold">
              Projects
            </h2>
            <Link
              href="/projects"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              View all
              <ArrowUpRight className="size-3" />
            </Link>
          </div>

          {projectsLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : projects?.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.slice(0, 6).map((project) => {
                const projectIssues = (issues ?? []).filter(
                  (issue) => issue.project_id === project.id
                )
                const openCount = projectIssues.filter(
                  (issue) => issue.status?.category !== 'done'
                ).length
                const doneCount = projectIssues.length - openCount

                return (
                  <Link key={project.id} href={`/projects/${project.key}/board`}>
                    <Card className="h-full p-3.5 transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-sm">
                      <div className="flex items-start gap-3">
                        <ProjectIcon icon={project.icon} color={project.color} size="lg" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{project.name}</p>
                          <p className="font-mono text-2xs text-muted-foreground">
                            {project.key}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-3 text-2xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CircleDot className="size-3" />
                          {openCount} open
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle2 className="size-3" />
                          {doneCount} done
                        </span>
                        {project.lead ? (
                          <span className="ml-auto inline-flex items-center gap-1 truncate">
                            <UserRound className="size-3" />
                            {displayName(project.lead)}
                          </span>
                        ) : null}
                      </div>
                    </Card>
                  </Link>
                )
              })}
            </div>
          ) : (
            <EmptyState
              icon={<ProjectIcon icon="Rocket" color="#5B5BD6" size="md" />}
              title="No projects yet"
              description={
                can.createProject(caps)
                  ? 'Create a project to get a board, a backlog and issue keys like MIRA-1.'
                  : 'Ask an admin or project lead to add you to a project.'
              }
              action={
                can.createProject(caps) ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setCreateProjectOpen(true)}
                  >
                    <Plus />
                    Create project
                  </Button>
                ) : null
              }
            />
          )}
        </section>

        {/* Work + workload */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <CardHeader className="flex-row items-center justify-between pb-3">
              <CardTitle>Assigned to you</CardTitle>
              <Link
                href="/my-work"
                className="text-xs font-medium text-primary hover:underline"
              >
                My work
              </Link>
            </CardHeader>
            {issuesLoading ? (
              <div className="space-y-1 p-3 pt-0">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-8 w-full rounded" />
                ))}
              </div>
            ) : stats.mine.length ? (
              <div className="border-t border-border">
                {stats.mine.slice(0, 6).map((issue) => (
                  <IssueRow
                    key={issue.id}
                    issue={issue}
                    onOpen={openIssueDialog}
                    showProject
                  />
                ))}
              </div>
            ) : (
              <div className="px-4 pb-4">
                <EmptyState
                  icon={<CheckCircle2 />}
                  title="Nothing assigned to you"
                  description="Pick something up from a board, or wait for work to come your way."
                  compact
                  className="border-0 bg-transparent"
                />
              </div>
            )}
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Workload by assignee</CardTitle>
            </CardHeader>
            <div className="px-4 pb-4 sm:px-5">
              <WorkloadTable
                rows={workloadByAssignee(
                  (issues ?? []).filter((issue) => issue.status?.category !== 'done')
                ).slice(0, 6)}
                isLoading={issuesLoading}
              />
            </div>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-3 lg:grid-cols-3">
          <CreatedVsResolvedChart
            data={createdVsResolved(issues ?? [])}
            isLoading={issuesLoading}
          />
          <DistributionPie
            title="Issues by type"
            description="Across every active project"
            data={distributionByType(issues ?? [])}
            isLoading={issuesLoading}
          />
          <DistributionBars
            title="Issues by priority"
            description="Open and closed"
            data={distributionByPriority(issues ?? [])}
            isLoading={issuesLoading}
          />
        </div>

        {/* Recently updated */}
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle>Recently updated</CardTitle>
            <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
              <CalendarClock className="size-3" />
              Live
            </span>
          </CardHeader>
          {issuesLoading ? (
            <div className="space-y-1 p-3 pt-0">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-8 w-full rounded" />
              ))}
            </div>
          ) : recentlyUpdated.length ? (
            <div className="border-t border-border">
              {recentlyUpdated.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  onOpen={openIssueDialog}
                  showProject
                />
              ))}
            </div>
          ) : (
            <div className="px-4 pb-4">
              <EmptyState
                title="No issues yet"
                description="Once work starts flowing, the latest changes land here."
                compact
                className="border-0 bg-transparent"
              />
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
