'use client'

import { Download, NotebookPen } from 'lucide-react'
import * as React from 'react'

import { ProjectPage } from '@/components/projects/project-page'
import { useProjectContext } from '@/components/projects/project-provider'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { RetrospectiveDialog } from '@/components/sprints/sprint-dialogs'
import {
  BurndownChart,
  CreatedVsResolvedChart,
  DistributionBars,
  DistributionPie,
  VelocityChart,
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
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/primitives'
import { downloadCsv, issuesToCsv } from '@/lib/csv'
import { daysRemaining, formatSprintWindow } from '@/lib/format'
import { can } from '@/lib/permissions'
import { useProjectIssues } from '@/lib/queries/issues'
import { useSprints } from '@/lib/queries/sprints'
import {
  computeBurndown,
  computeVelocity,
  createdVsResolved,
  distributionByPriority,
  distributionByStatus,
  distributionByType,
  workloadByAssignee,
} from '@/lib/reports'
import type { Sprint } from '@/lib/types/app'
import { percent, sum } from '@/lib/utils'

export default function ReportsPage() {
  const { project, projectId } = useProjectContext()
  const { caps } = useWorkspaceContext()
  const { data: issues, isLoading } = useProjectIssues(projectId)
  const { data: sprints, isLoading: sprintsLoading } = useSprints(projectId)

  const [sprintId, setSprintId] = React.useState<string>('')
  const [retro, setRetro] = React.useState<Sprint | null>(null)

  // Default to the running sprint, else the most recently completed one.
  React.useEffect(() => {
    if (sprintId || !sprints?.length) return
    const active = sprints.find((sprint) => sprint.status === 'active')
    const lastCompleted = sprints
      .filter((sprint) => sprint.status === 'completed')
      .sort((a, b) => (a.completed_at ?? '').localeCompare(b.completed_at ?? ''))
      .at(-1)
    setSprintId(active?.id ?? lastCompleted?.id ?? sprints[0].id)
  }, [sprintId, sprints])

  const selectedSprint = sprints?.find((sprint) => sprint.id === sprintId) ?? null
  const sprintIssues = React.useMemo(
    () => (issues ?? []).filter((issue) => issue.sprint_id === sprintId),
    [issues, sprintId]
  )

  const burndown = React.useMemo(
    () => (selectedSprint ? computeBurndown(selectedSprint, sprintIssues) : []),
    [selectedSprint, sprintIssues]
  )

  const issuesBySprint = React.useMemo(() => {
    const map = new Map<string, typeof sprintIssues>()
    for (const issue of issues ?? []) {
      if (!issue.sprint_id) continue
      const list = map.get(issue.sprint_id) ?? []
      list.push(issue)
      map.set(issue.sprint_id, list)
    }
    return map
  }, [issues])

  const velocity = React.useMemo(
    () => computeVelocity(sprints ?? [], issuesBySprint),
    [issuesBySprint, sprints]
  )

  const all = issues ?? []
  const open = all.filter((issue) => issue.status?.category !== 'done')
  const done = all.filter((issue) => issue.status?.category === 'done')
  const sprintDone = sprintIssues.filter((issue) => issue.status?.category === 'done')

  return (
    <ProjectPage
      description="Burndown, velocity and the shape of the work."
      actions={
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            downloadCsv(`${project?.key ?? 'project'}-issues.csv`, issuesToCsv(all))
          }
        >
          <Download />
          Export CSV
        </Button>
      }
    >
      <div className="space-y-4 p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Open"
            value={open.length}
            hint={`${sum(open.map((i) => i.story_points))} points remaining`}
            isLoading={isLoading}
          />
          <StatTile
            label="Closed"
            value={done.length}
            tone="success"
            hint={all.length ? `${percent(done.length, all.length)}% of all issues` : undefined}
            isLoading={isLoading}
          />
          <StatTile
            label="Sprint progress"
            value={
              sprintIssues.length ? `${percent(sprintDone.length, sprintIssues.length)}%` : '—'
            }
            tone="primary"
            hint={
              selectedSprint
                ? `${sprintDone.length}/${sprintIssues.length} issues done`
                : 'No sprint selected'
            }
            isLoading={isLoading || sprintsLoading}
          />
          <StatTile
            label="Days left"
            value={
              selectedSprint?.status === 'active' && daysRemaining(selectedSprint.end_date) != null
                ? Math.max(daysRemaining(selectedSprint.end_date)!, 0)
                : '—'
            }
            hint={
              selectedSprint
                ? formatSprintWindow(selectedSprint.start_date, selectedSprint.end_date)
                : undefined
            }
            isLoading={sprintsLoading}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sprint
          </label>
          <Select value={sprintId} onValueChange={setSprintId}>
            <SelectTrigger size="sm" className="w-auto min-w-44" aria-label="Sprint">
              <SelectValue placeholder="Select a sprint" />
            </SelectTrigger>
            <SelectContent>
              {sprints?.length ? (
                sprints.map((sprint) => (
                  <SelectItem key={sprint.id} value={sprint.id}>
                    {sprint.name}
                    {sprint.status === 'active'
                      ? ' · active'
                      : sprint.status === 'completed'
                        ? ' · completed'
                        : ''}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="none" disabled>
                  No sprints yet
                </SelectItem>
              )}
            </SelectContent>
          </Select>

          {selectedSprint ? (
            <Button variant="secondary" size="sm" onClick={() => setRetro(selectedSprint)}>
              <NotebookPen />
              {selectedSprint.retrospective ? 'Retrospective' : 'Add retrospective'}
            </Button>
          ) : null}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <BurndownChart
            data={burndown}
            isLoading={isLoading || sprintsLoading}
            sprintName={selectedSprint?.name}
          />
          <VelocityChart data={velocity} isLoading={sprintsLoading} />
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <DistributionPie
            title="By type"
            description="Every issue in the project"
            data={distributionByType(all)}
            isLoading={isLoading}
          />
          <DistributionBars
            title="By status"
            description="Current workflow position"
            data={distributionByStatus(all)}
            isLoading={isLoading}
          />
          <DistributionBars
            title="By priority"
            description="Where the urgency sits"
            data={distributionByPriority(all)}
            isLoading={isLoading}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <CreatedVsResolvedChart data={createdVsResolved(all)} isLoading={isLoading} />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Workload by assignee</CardTitle>
              <CardDescription>Open issues only</CardDescription>
            </CardHeader>
            <div className="px-4 pb-4 sm:px-5">
              <WorkloadTable rows={workloadByAssignee(open)} isLoading={isLoading} />
            </div>
          </Card>
        </div>
      </div>

      <RetrospectiveDialog
        projectId={projectId ?? ''}
        sprint={retro}
        open={Boolean(retro)}
        onOpenChange={(open) => (open ? null : setRetro(null))}
        canEdit={can.manageSprints(caps)}
      />
    </ProjectPage>
  )
}
