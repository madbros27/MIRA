'use client'

import { Download, SearchIcon, SlidersHorizontal } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'

import { FilterBar } from '@/components/filters/filter-bar'
import { PageHeader } from '@/components/layout/app-shell'
import { IssueRow } from '@/components/issues/issue-card'
import { ProjectIcon } from '@/components/layout/project-icon'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/controls'
import { Card, EmptyState, Skeleton } from '@/components/ui/primitives'
import { downloadCsv, issuesToCsv } from '@/lib/csv'
import {
  filterFromSearchParams,
  filterToSearchParams,
  matchesFilter,
  sortIssues,
} from '@/lib/filters'
import { useWorkspaceIssues } from '@/lib/queries/issues'
import { useProjects } from '@/lib/queries/projects'
import { useMembers } from '@/lib/queries/workspaces'
import { useUiStore } from '@/lib/store/ui-store'
import type { IssueFilter, IssueSort } from '@/lib/types/app'
import { countActiveFilters } from '@/lib/types/app'

const ALL_PROJECTS = '__all__'

const SORTS: { value: IssueSort; label: string }[] = [
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'created_desc', label: 'Newest first' },
  { value: 'created_asc', label: 'Oldest first' },
  { value: 'priority', label: 'Priority' },
  { value: 'due_date', label: 'Due date' },
  { value: 'story_points', label: 'Story points' },
  { value: 'rank', label: 'Backlog order' },
]

export default function SearchPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { workspaceId } = useWorkspaceContext()

  const { data: projects } = useProjects(workspaceId)
  const { data: members } = useMembers(workspaceId)
  const { data: issues, isLoading } = useWorkspaceIssues(workspaceId)
  const openIssueDialog = useUiStore((state) => state.openIssueDialog)

  const [filter, setFilter] = React.useState<IssueFilter>(() => {
    const parsed = filterFromSearchParams(searchParams)
    return { sort: 'updated_desc', ...parsed }
  })
  const [projectScope, setProjectScope] = React.useState<string>(ALL_PROJECTS)

  // Keep the address bar in step so a result set can be shared verbatim.
  React.useEffect(() => {
    const params = filterToSearchParams(filter)
    const query = params.toString()
    router.replace(query ? `/search?${query}` : '/search', { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  const results = React.useMemo(() => {
    let list = issues ?? []
    if (projectScope !== ALL_PROJECTS) {
      list = list.filter((issue) => issue.project_id === projectScope)
    }
    list = list.filter((issue) => matchesFilter(issue, filter))
    return sortIssues(list, filter.sort ?? 'updated_desc')
  }, [filter, issues, projectScope])

  const activeCount = countActiveFilters(filter)

  return (
    <>
      <PageHeader
        title="Search"
        description="Filter every issue in the workspace, then save the query for next time."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadCsv('mira-search.csv', issuesToCsv(results))}
            disabled={!results.length}
          >
            <Download />
            Export CSV
          </Button>
        }
      />

      <div className="space-y-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={projectScope} onValueChange={setProjectScope}>
            <SelectTrigger size="sm" className="w-auto min-w-40" aria-label="Project">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PROJECTS}>All projects</SelectItem>
              {projects?.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  <span className="flex items-center gap-2">
                    <ProjectIcon icon={project.icon} color={project.color} size="sm" />
                    {project.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filter.sort ?? 'updated_desc'}
            onValueChange={(sort) => setFilter((prev) => ({ ...prev, sort: sort as IssueSort }))}
          >
            <SelectTrigger size="sm" className="w-auto min-w-40" aria-label="Sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <FilterBar
          filter={filter}
          onChange={setFilter}
          sources={{
            members,
            labels: undefined,
            sprints: undefined,
            statuses: undefined,
          }}
          onExport={() => downloadCsv('mira-search.csv', issuesToCsv(results))}
        />

        {isLoading ? (
          <div className="space-y-1.5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        ) : results.length ? (
          <>
            <p className="text-xs text-muted-foreground">
              {results.length} {results.length === 1 ? 'issue' : 'issues'}
              {activeCount
                ? ` matching ${activeCount} ${activeCount === 1 ? 'condition' : 'conditions'}`
                : ''}
            </p>
            <Card className="overflow-hidden">
              {results.slice(0, 300).map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  onOpen={openIssueDialog}
                  showProject={projectScope === ALL_PROJECTS}
                />
              ))}
            </Card>
            {results.length > 300 ? (
              <p className="text-center text-2xs text-muted-foreground">
                Showing the first 300 of {results.length}. Narrow the filter to see the rest.
              </p>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon={activeCount ? <SlidersHorizontal /> : <SearchIcon />}
            title={activeCount ? 'Nothing matches those conditions' : 'Start with a filter'}
            description={
              activeCount
                ? 'Loosen a condition, or clear the filter and start again.'
                : 'Use the quick filters, or open Filters to build something more specific. Press / anywhere for the command palette.'
            }
            action={
              activeCount ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setFilter({ sort: filter.sort })}
                >
                  Clear filters
                </Button>
              ) : null
            }
          />
        )}
      </div>
    </>
  )
}
