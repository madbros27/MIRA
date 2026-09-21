'use client'

import { Plus, Radio } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import * as React from 'react'

import { KanbanBoard } from '@/components/board/kanban-board'
import { FilterBar } from '@/components/filters/filter-bar'
import { ProjectPage } from '@/components/projects/project-page'
import { useProjectContext } from '@/components/projects/project-provider'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
} from '@/components/ui/controls'
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

const ALL_SPRINTS = '__all__'
const NO_SPRINT = '__none__'

export default function BoardPage() {
  const searchParams = useSearchParams()
  const { project, projectId } = useProjectContext()
  const { workspaceId, caps } = useWorkspaceContext()

  const { data: statuses, isLoading: statusesLoading } = useStatuses(projectId)
  const { data: issues, isLoading: issuesLoading } = useProjectIssues(projectId)
  const { data: sprints } = useSprints(projectId)
  const { data: labels } = useLabels(projectId)
  const { data: members } = useMembers(workspaceId)

  const openCreateIssue = useUiStore((state) => state.openCreateIssue)
  const openIssueDialog = useUiStore((state) => state.openIssueDialog)

  useRealtimeProject(projectId)

  const [filter, setFilter] = React.useState<IssueFilter>(() =>
    filterFromSearchParams(searchParams)
  )
  const [sprintScope, setSprintScope] = React.useState<string>(ALL_SPRINTS)

  // Default the board to the running sprint, which is what a team wants to see.
  const activeSprint = sprints?.find((sprint) => sprint.status === 'active')
  const initialisedScope = React.useRef(false)
  React.useEffect(() => {
    if (initialisedScope.current || !sprints?.length) return
    initialisedScope.current = true
    if (activeSprint) setSprintScope(activeSprint.id)
  }, [activeSprint, sprints])

  const visible = React.useMemo(() => {
    let list = issues ?? []
    // Sub-tasks live on their parent, not as separate cards.
    list = list.filter((issue) => issue.type !== 'subtask' && issue.type !== 'epic')
    if (sprintScope === NO_SPRINT) list = list.filter((issue) => !issue.sprint_id)
    else if (sprintScope !== ALL_SPRINTS) {
      list = list.filter((issue) => issue.sprint_id === sprintScope)
    }
    return list.filter((issue) => matchesFilter(issue, filter))
  }, [filter, issues, sprintScope])

  const canWrite = can.writeIssues(caps)

  return (
    <ProjectPage
      description={
        activeSprint
          ? `${activeSprint.name}${activeSprint.goal ? ` · ${activeSprint.goal}` : ''}`
          : 'Drag cards between columns to move work along.'
      }
      actions={
        <>
          <Tooltip content="Board updates live for everyone viewing it">
            <span className="hidden items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 text-2xs font-medium text-muted-foreground sm:inline-flex">
              <Radio className="size-3 text-success" />
              Live
            </span>
          </Tooltip>
          {canWrite ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() =>
                openCreateIssue({
                  projectId,
                  statusId: statuses?.[0]?.id,
                  sprintId: sprintScope === ALL_SPRINTS ? activeSprint?.id : sprintScope === NO_SPRINT ? null : sprintScope,
                })
              }
            >
              <Plus />
              Create
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2 sm:px-4">
          <Select value={sprintScope} onValueChange={setSprintScope}>
            <SelectTrigger size="sm" className="w-auto min-w-36" aria-label="Sprint scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SPRINTS}>All sprints</SelectItem>
              <SelectItem value={NO_SPRINT}>No sprint</SelectItem>
              {sprints?.map((sprint) => (
                <SelectItem key={sprint.id} value={sprint.id}>
                  {sprint.name}
                  {sprint.status === 'active' ? ' · active' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <FilterBar
            filter={filter}
            onChange={setFilter}
            projectId={projectId}
            sources={{ statuses, labels, sprints, members }}
            onExport={() =>
              downloadCsv(
                `${project?.key ?? 'issues'}-board.csv`,
                issuesToCsv(visible)
              )
            }
            className="flex-1"
          />
        </div>

        <div className="min-h-0 flex-1 pt-3">
          <KanbanBoard
            projectId={projectId ?? ''}
            statuses={statuses ?? []}
            issues={visible}
            isLoading={statusesLoading || issuesLoading}
            canWrite={canWrite}
            onOpenIssue={openIssueDialog}
            onCreateInStatus={
              canWrite
                ? (statusId) =>
                    openCreateIssue({
                      projectId,
                      statusId,
                      sprintId:
                        sprintScope === ALL_SPRINTS
                          ? activeSprint?.id
                          : sprintScope === NO_SPRINT
                            ? null
                            : sprintScope,
                    })
                : undefined
            }
            emptyHint={
              canWrite ? 'Drop a card here, or use Add issue.' : 'Nothing in this column.'
            }
          />
        </div>
      </div>
    </ProjectPage>
  )
}
