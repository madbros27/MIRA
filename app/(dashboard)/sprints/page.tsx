'use client'

import { CalendarRange, ChevronRight, Timer } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'

import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls'
import {
  Badge,
  Card,
  EmptyState,
  ProgressBar,
  Skeleton,
} from '@/components/ui/primitives'
import { daysRemaining, formatSprintWindow } from '@/lib/format'
import { useProjects } from '@/lib/queries/projects'
import { useSupabase } from '@/lib/queries/shared'
import { useQuery } from '@tanstack/react-query'
import type { ProjectWithMeta } from '@/lib/types/app'
import type { SprintRow, SprintStatus } from '@/lib/types/database'
import { cn } from '@/lib/utils'

type SprintWithStats = SprintRow & {
  project: Pick<ProjectWithMeta, 'id' | 'key' | 'name' | 'color'>
  total: number
  done: number
  points: number
  donePoints: number
}

/**
 * Every sprint across every project the viewer can reach, in one place.
 *
 * Project scoping does the filtering for us: `useProjects` only returns
 * projects this person is a member of (or all of them, for an Owner), so
 * querying sprints by those project ids cannot leak another team's work.
 */
export default function SprintsPage() {
  const { workspaceId } = useWorkspaceContext()
  const { data: projects, isLoading: projectsLoading } = useProjects(workspaceId)
  const supabase = useSupabase()

  const projectIds = React.useMemo(
    () => (projects ?? []).map((project) => project.id),
    [projects]
  )

  const { data: sprints, isLoading } = useQuery({
    queryKey: ['workspace-sprints', workspaceId, projectIds],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const [sprintResult, issueResult] = await Promise.all([
        supabase
          .from('sprints')
          .select('*')
          .in('project_id', projectIds)
          .order('start_date', { ascending: false, nullsFirst: false }),
        supabase
          .from('issues')
          .select('sprint_id, story_points, status:project_statuses!issues_status_id_fkey(category)')
          .in('project_id', projectIds)
          .not('sprint_id', 'is', null),
      ])

      if (sprintResult.error) throw sprintResult.error

      const issues = (issueResult.data ?? []) as unknown as {
        sprint_id: string
        story_points: number | null
        status: { category: string } | null
      }[]

      const byProject = new Map((projects ?? []).map((project) => [project.id, project]))

      return (sprintResult.data as SprintRow[]).map((sprint) => {
        const own = issues.filter((issue) => issue.sprint_id === sprint.id)
        const done = own.filter((issue) => issue.status?.category === 'done')
        const project = byProject.get(sprint.project_id)

        return {
          ...sprint,
          project: {
            id: sprint.project_id,
            key: project?.key ?? '—',
            name: project?.name ?? 'Unknown project',
            color: project?.color ?? '#64748B',
          },
          total: own.length,
          done: done.length,
          points: own.reduce((sum, issue) => sum + (issue.story_points ?? 0), 0),
          donePoints: done.reduce((sum, issue) => sum + (issue.story_points ?? 0), 0),
        } satisfies SprintWithStats
      })
    },
    staleTime: 30_000,
  })

  const busy = projectsLoading || isLoading

  const groups: Record<SprintStatus, SprintWithStats[]> = {
    active: (sprints ?? []).filter((sprint) => sprint.status === 'active'),
    planned: (sprints ?? []).filter((sprint) => sprint.status === 'planned'),
    completed: (sprints ?? []).filter((sprint) => sprint.status === 'completed'),
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Sprints</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every sprint in the projects you belong to.
        </p>
      </header>

      {busy ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : !projects?.length ? (
        <EmptyState
          icon={<CalendarRange />}
          title="No projects yet"
          description="Sprints live inside projects. Once you are a member of one, its sprints appear here."
        />
      ) : !sprints?.length ? (
        <EmptyState
          icon={<CalendarRange />}
          title="No sprints yet"
          description="Open a project's backlog to plan the first one."
        />
      ) : (
        <Tabs defaultValue={groups.active.length ? 'active' : 'planned'}>
          <TabsList>
            <TabsTrigger value="active">Active ({groups.active.length})</TabsTrigger>
            <TabsTrigger value="planned">Planned ({groups.planned.length})</TabsTrigger>
            <TabsTrigger value="completed">Done ({groups.completed.length})</TabsTrigger>
          </TabsList>

          {(['active', 'planned', 'completed'] as const).map((status) => (
            <TabsContent key={status} value={status} className="mt-4 space-y-3">
              {!groups[status].length ? (
                <EmptyState
                  compact
                  title={`No ${status} sprints`}
                  description={
                    status === 'active'
                      ? 'Start a planned sprint from a project backlog.'
                      : status === 'planned'
                        ? 'Plan one from a project backlog.'
                        : 'Completed sprints will collect here.'
                  }
                />
              ) : (
                groups[status].map((sprint) => (
                  <SprintCard key={sprint.id} sprint={sprint} />
                ))
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}

function SprintCard({ sprint }: { sprint: SprintWithStats }) {
  const remaining = sprint.end_date ? daysRemaining(sprint.end_date) : null
  const overdue = sprint.status === 'active' && remaining !== null && remaining < 0

  return (
    <Link href={`/projects/${sprint.project.key}/backlog`} className="block">
      <Card className="p-4 transition-colors hover:bg-muted/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: sprint.project.color }}
              />
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-2xs font-semibold">
                {sprint.project.key}
              </code>
              <p className="truncate text-sm font-medium">{sprint.name}</p>
              <Badge
                variant={
                  sprint.status === 'active'
                    ? 'success'
                    : sprint.status === 'planned'
                      ? 'info'
                      : 'neutral'
                }
              >
                {sprint.status}
              </Badge>
            </div>

            {sprint.goal ? (
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {sprint.goal}
              </p>
            ) : null}

            <p
              className={cn(
                'mt-1.5 flex items-center gap-1.5 text-xs',
                overdue ? 'text-destructive' : 'text-muted-foreground'
              )}
            >
              <Timer className="size-3.5" aria-hidden />
              {formatSprintWindow(sprint.start_date, sprint.end_date)}
              {sprint.status === 'active' && remaining !== null
                ? overdue
                  ? ` · ${Math.abs(remaining)} days over`
                  : ` · ${remaining} days left`
                : ''}
            </p>
          </div>

          <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
        </div>

        <div className="mt-3 space-y-1.5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">
              {sprint.done} of {sprint.total} issues done
            </span>
            <span className="tabular-nums text-muted-foreground">
              {sprint.donePoints} / {sprint.points} pts
            </span>
          </div>
          <ProgressBar
            value={sprint.done}
            max={sprint.total || 1}
            barClassName={sprint.status === 'completed' ? 'bg-success' : undefined}
            label={`${sprint.name} progress`}
          />
        </div>
      </Card>
    </Link>
  )
}
