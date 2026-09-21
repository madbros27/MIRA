'use client'

import { Plus } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import * as React from 'react'

import { BacklogView } from '@/components/backlog/backlog-view'
import { FilterBar } from '@/components/filters/filter-bar'
import { ProjectPage } from '@/components/projects/project-page'
import { useProjectContext } from '@/components/projects/project-provider'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Button } from '@/components/ui/button'
import { downloadCsv, issuesToCsv } from '@/lib/csv'
import { filterFromSearchParams, matchesFilter } from '@/lib/filters'
import { can } from '@/lib/permissions'
import { useProjectIssues } from '@/lib/queries/issues'
import { useLabels, useStatuses } from '@/lib/queries/projects'
import { useRealtimeProject } from '@/lib/queries/realtime'
import { useSprints } from '@/lib/queries/sprints'
import { useMembers } from '@/lib/queries/workspaces'
import { useUiStore } from '@/lib/store/ui-store'
import type { IssueFilter } from '@/lib/types/app'

export default function BacklogPage() {
  const searchParams = useSearchParams()
  const { project, projectId } = useProjectContext()
  const { workspaceId, caps } = useWorkspaceContext()

  const { data: issues, isLoading } = useProjectIssues(projectId)
  const { data: sprints } = useSprints(projectId)
  const { data: statuses } = useStatuses(projectId)
  const { data: labels } = useLabels(projectId)
  const { data: members } = useMembers(workspaceId)

  const openCreateIssue = useUiStore((state) => state.openCreateIssue)
  const openIssueDialog = useUiStore((state) => state.openIssueDialog)

  useRealtimeProject(projectId)

  const [filter, setFilter] = React.useState<IssueFilter>(() =>
    filterFromSearchParams(searchParams)
  )

  const visible = React.useMemo(
    () => (issues ?? []).filter((issue) => matchesFilter(issue, filter)),
    [filter, issues]
  )

  const canWrite = can.writeIssues(caps)

  return (
    <ProjectPage
      description="Order the backlog by dragging, then pull work into a sprint."
      actions={
        canWrite ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => openCreateIssue({ projectId, sprintId: null })}
          >
            <Plus />
            Create
          </Button>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2 sm:px-4">
        <FilterBar
          filter={filter}
          onChange={setFilter}
          projectId={projectId}
          sources={{ statuses, labels, sprints, members }}
          onExport={() =>
            downloadCsv(`${project?.key ?? 'issues'}-backlog.csv`, issuesToCsv(visible))
          }
          className="flex-1"
        />
      </div>

      <BacklogView
        projectId={projectId ?? ''}
        issues={visible}
        sprints={sprints ?? []}
        statuses={statuses ?? []}
        members={members ?? []}
        isLoading={isLoading}
        canWrite={canWrite}
        canManageSprints={can.manageSprints(caps)}
        onOpenIssue={openIssueDialog}
        onCreateIssue={(seed) => openCreateIssue({ projectId, ...seed })}
      />
    </ProjectPage>
  )
}
