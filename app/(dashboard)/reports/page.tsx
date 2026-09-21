'use client'

import { BarChart3, Download, Lock } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'
import { toast } from 'sonner'

import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import {
  CreatedVsResolvedChart,
  DistributionBars,
  DistributionPie,
} from '@/components/reports/charts'
import { StatTile, WorkloadTable } from '@/components/reports/stat-tiles'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/controls'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ProgressBar,
} from '@/components/ui/primitives'
import { downloadCsv, issuesToCsv } from '@/lib/csv'
import { can } from '@/lib/permissions'
import { useWorkspaceIssues } from '@/lib/queries/issues'
import { useProjects } from '@/lib/queries/projects'
import {
  createdVsResolved,
  distributionByPriority,
  distributionByStatus,
  distributionByType,
  workloadByAssignee,
} from '@/lib/reports'
import { percent } from '@/lib/utils'

const ALL_PROJECTS = '__all__'

/**
 * Workspace-wide reporting.
 *
 * The numbers are only ever computed from issues the viewer can actually
 * read, because `useWorkspaceIssues` goes through the same RLS as everything
 * else. A Manager therefore sees a report over their own projects and nobody
 * else's — without any filtering logic living here.
 */
export default function WorkspaceReportsPage() {
  const { workspaceId, caps, workspace } = useWorkspaceContext()
  const { data: projects } = useProjects(workspaceId)
  const { data: issues, isLoading } = useWorkspaceIssues(workspaceId)

  const [projectFilter, setProjectFilter] = React.useState(ALL_PROJECTS)

  if (!can.viewReports(caps)) {
    return (
      <div className="mx-auto max-w-2xl pt-10">
        <EmptyState
          icon={<Lock />}
          title="Reports are not part of your position"
          description="Ask an owner or workspace admin to add “View reports” to your position if you need them."
        />
      </div>
    )
  }

  const all = (issues ?? []).filter((issue) =>
    projectFilter === ALL_PROJECTS ? true : issue.project?.id === projectFilter
  )
  const open = all.filter((issue) => issue.status?.category !== 'done')
  const done = all.filter((issue) => issue.status?.category === 'done')
  const overdue = open.filter(
    (issue) => issue.due_date && new Date(issue.due_date) < new Date()
  )

  const byProject = (projects ?? [])
    .map((project) => {
      const scoped = (issues ?? []).filter((issue) => issue.project?.id === project.id)
      const closed = scoped.filter((issue) => issue.status?.category === 'done')
      return { project, total: scoped.length, done: closed.length }
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total)

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Across every project you can see in {workspace?.name}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-44" aria-label="Filter by project">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PROJECTS}>All projects</SelectItem>
              {(projects ?? []).map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {can.exportReports(caps) ? (
            <Button
              variant="secondary"
              disabled={!all.length}
              onClick={() => {
                downloadCsv(
                  `mira-report-${new Date().toISOString().slice(0, 10)}.csv`,
                  issuesToCsv(all)
                )
                toast.success(`Exported ${all.length} issues`)
              }}
            >
              <Download aria-hidden />
              Export CSV
            </Button>
          ) : null}
        </div>
      </header>

      {!isLoading && !all.length ? (
        <EmptyState
          icon={<BarChart3 />}
          title="Nothing to report on yet"
          description="Once issues exist in the projects you belong to, this page fills in."
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Open" value={open.length} isLoading={isLoading} />
            <StatTile
              label="Resolved"
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
              label="Projects"
              value={byProject.length}
              hint={`${projects?.length ?? 0} accessible`}
              isLoading={isLoading}
            />
          </section>

          <section className="mt-4 grid gap-4 lg:grid-cols-3">
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
            <DistributionBars
              title="By priority"
              data={distributionByPriority(all)}
              isLoading={isLoading}
            />
          </section>

          <section className="mt-4">
            <CreatedVsResolvedChart data={createdVsResolved(all)} isLoading={isLoading} />
          </section>

          <section className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Workload by assignee</CardTitle>
                <CardDescription>Open issues only, across the selection.</CardDescription>
              </CardHeader>
              <CardContent>
                <WorkloadTable rows={workloadByAssignee(open)} isLoading={isLoading} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Progress by project</CardTitle>
                <CardDescription>Resolved as a share of all issues raised.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {!byProject.length ? (
                  <p className="text-xs text-muted-foreground">No issues yet.</p>
                ) : (
                  byProject.map(({ project, total, done: closed }) => (
                    <Link
                      key={project.id}
                      href={`/projects/${project.key}`}
                      className="block space-y-1.5 rounded-lg px-1 py-1 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="truncate font-medium">{project.name}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {closed} / {total}
                        </span>
                      </div>
                      <ProgressBar
                        value={closed}
                        max={total}
                        barClassName="bg-success"
                        label={`${project.name} progress`}
                      />
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  )
}
