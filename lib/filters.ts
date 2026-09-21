/**
 * The filter model, applied in two places:
 *
 *  - `applyIssueFilter` pushes what Postgres can do into the query itself
 *  - `sortIssues` / `matchesFilter` handle the rest in the client, so quick
 *    filters feel instant against data already in the cache
 */

import { PRIORITY_WEIGHT } from '@/lib/constants'
import type { IssueFilter, IssueSummary, IssueSort } from '@/lib/types/app'
import type { PostgrestFilterBuilder } from '@supabase/postgrest-js'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Query = PostgrestFilterBuilder<any, any, any, any, any>

export function applyIssueFilter<T extends Query>(query: T, filter: IssueFilter): T {
  let q = query

  if (filter.text?.trim()) {
    const term = filter.text.trim().replace(/[%,]/g, '')
    q = q.ilike('title', `%${term}%`) as T
  }
  if (filter.types?.length) q = q.in('type', filter.types) as T
  if (filter.priorities?.length) q = q.in('priority', filter.priorities) as T
  if (filter.statusIds?.length) q = q.in('status_id', filter.statusIds) as T
  if (filter.epicIds?.length) q = q.in('epic_id', filter.epicIds) as T
  // Labels and status categories live on embedded relations. Filtering those
  // server-side would also strip them from the returned rows, so they are
  // applied by `matchesFilter` against the fetched result instead.
  if (filter.reporterIds?.length) q = q.in('reporter_id', filter.reporterIds) as T

  if (filter.assigneeIds?.length) {
    const ids = filter.assigneeIds.filter((id) => id !== 'unassigned')
    const includeUnassigned = filter.assigneeIds.includes('unassigned')
    if (includeUnassigned && ids.length) {
      q = q.or(`assignee_id.is.null,assignee_id.in.(${ids.join(',')})`) as T
    } else if (includeUnassigned) {
      q = q.is('assignee_id', null) as T
    } else {
      q = q.in('assignee_id', ids) as T
    }
  }

  if (filter.sprintIds?.length) {
    const ids = filter.sprintIds.filter((id) => id !== 'none' && id !== 'active')
    const includeNone = filter.sprintIds.includes('none')
    if (includeNone && ids.length) {
      q = q.or(`sprint_id.is.null,sprint_id.in.(${ids.join(',')})`) as T
    } else if (includeNone) {
      q = q.is('sprint_id', null) as T
    } else if (ids.length) {
      q = q.in('sprint_id', ids) as T
    }
  }

  if (filter.dueFrom) q = q.gte('due_date', filter.dueFrom) as T
  if (filter.dueTo) q = q.lte('due_date', filter.dueTo) as T
  if (filter.createdFrom) q = q.gte('created_at', filter.createdFrom) as T
  if (filter.createdTo) q = q.lte('created_at', `${filter.createdTo}T23:59:59`) as T
  if (filter.overdue) {
    q = q.lt('due_date', new Date().toISOString().slice(0, 10)) as T
  }

  return q
}

/** Client-side equivalent, used for optimistic and cached data. */
export function matchesFilter(issue: IssueSummary, filter: IssueFilter): boolean {
  if (filter.text?.trim()) {
    const term = filter.text.trim().toLowerCase()
    const haystack = `${issue.title} ${issue.description ?? ''}`.toLowerCase()
    if (!haystack.includes(term)) return false
  }
  if (filter.types?.length && !filter.types.includes(issue.type)) return false
  if (filter.priorities?.length && !filter.priorities.includes(issue.priority)) return false
  if (filter.statusIds?.length && !filter.statusIds.includes(issue.status_id)) return false
  if (
    filter.statusCategories?.length &&
    (!issue.status || !filter.statusCategories.includes(issue.status.category))
  ) {
    return false
  }
  if (filter.assigneeIds?.length) {
    const key = issue.assignee_id ?? 'unassigned'
    if (!filter.assigneeIds.includes(key)) return false
  }
  if (filter.reporterIds?.length) {
    if (!issue.reporter_id || !filter.reporterIds.includes(issue.reporter_id)) return false
  }
  if (filter.labelIds?.length) {
    const ids = new Set(issue.labels.map((l) => l.id))
    if (!filter.labelIds.some((id) => ids.has(id))) return false
  }
  if (filter.epicIds?.length) {
    if (!issue.epic_id || !filter.epicIds.includes(issue.epic_id)) return false
  }
  if (filter.sprintIds?.length) {
    const key = issue.sprint_id ?? 'none'
    if (!filter.sprintIds.includes(key)) return false
  }
  if (filter.dueFrom && (!issue.due_date || issue.due_date < filter.dueFrom)) return false
  if (filter.dueTo && (!issue.due_date || issue.due_date > filter.dueTo)) return false
  if (filter.createdFrom && issue.created_at.slice(0, 10) < filter.createdFrom) return false
  if (filter.createdTo && issue.created_at.slice(0, 10) > filter.createdTo) return false
  if (filter.overdue) {
    const today = new Date().toISOString().slice(0, 10)
    if (!issue.due_date || issue.due_date >= today) return false
    if (issue.status?.category === 'done') return false
  }
  return true
}

export function sortIssues(issues: IssueSummary[], sort: IssueSort = 'rank'): IssueSummary[] {
  const next = issues.slice()
  switch (sort) {
    case 'created_desc':
      return next.sort((a, b) => b.created_at.localeCompare(a.created_at))
    case 'created_asc':
      return next.sort((a, b) => a.created_at.localeCompare(b.created_at))
    case 'updated_desc':
      return next.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    case 'priority':
      return next.sort(
        (a, b) =>
          PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] ||
          a.backlog_position - b.backlog_position
      )
    case 'due_date':
      return next.sort((a, b) => {
        if (!a.due_date && !b.due_date) return a.backlog_position - b.backlog_position
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return a.due_date.localeCompare(b.due_date)
      })
    case 'story_points':
      return next.sort((a, b) => (b.story_points ?? -1) - (a.story_points ?? -1))
    case 'rank':
    default:
      return next.sort((a, b) => a.backlog_position - b.backlog_position)
  }
}

/** Human-readable summary of a filter, shown as a subtitle on saved filters. */
export function describeFilter(filter: IssueFilter): string {
  const parts: string[] = []
  if (filter.text) parts.push(`text ~ "${filter.text}"`)
  if (filter.types?.length) parts.push(`type in (${filter.types.join(', ')})`)
  if (filter.priorities?.length) parts.push(`priority in (${filter.priorities.join(', ')})`)
  if (filter.statusCategories?.length) {
    parts.push(`status in (${filter.statusCategories.join(', ')})`)
  }
  if (filter.assigneeIds?.length) parts.push(`assignee in (${filter.assigneeIds.length})`)
  if (filter.labelIds?.length) parts.push(`labels in (${filter.labelIds.length})`)
  if (filter.sprintIds?.length) parts.push(`sprint in (${filter.sprintIds.length})`)
  if (filter.overdue) parts.push('overdue')
  if (filter.dueFrom || filter.dueTo) {
    parts.push(`due ${filter.dueFrom ?? '…'} → ${filter.dueTo ?? '…'}`)
  }
  return parts.length ? parts.join(' AND ') : 'All issues'
}

/* -------------------------------------------------------------------------- */
/* URL serialisation — filters survive a refresh and can be shared            */
/* -------------------------------------------------------------------------- */

const LIST_KEYS = [
  'types',
  'priorities',
  'statusIds',
  'statusCategories',
  'assigneeIds',
  'reporterIds',
  'labelIds',
  'sprintIds',
  'epicIds',
] as const

export function filterToSearchParams(filter: IssueFilter): URLSearchParams {
  const params = new URLSearchParams()
  if (filter.text) params.set('q', filter.text)
  for (const key of LIST_KEYS) {
    const value = filter[key]
    if (value?.length) params.set(key, value.join(','))
  }
  if (filter.dueFrom) params.set('dueFrom', filter.dueFrom)
  if (filter.dueTo) params.set('dueTo', filter.dueTo)
  if (filter.createdFrom) params.set('createdFrom', filter.createdFrom)
  if (filter.createdTo) params.set('createdTo', filter.createdTo)
  if (filter.overdue) params.set('overdue', '1')
  if (filter.sort && filter.sort !== 'rank') params.set('sort', filter.sort)
  return params
}

export function filterFromSearchParams(
  params: URLSearchParams | ReadonlyURLSearchParams
): IssueFilter {
  const get = (key: string) => params.get(key) ?? undefined
  const list = (key: string) => {
    const raw = get(key)
    return raw ? raw.split(',').filter(Boolean) : undefined
  }

  const filter: IssueFilter = {
    text: get('q'),
    dueFrom: get('dueFrom'),
    dueTo: get('dueTo'),
    createdFrom: get('createdFrom'),
    createdTo: get('createdTo'),
    overdue: get('overdue') === '1' || undefined,
    sort: (get('sort') as IssueSort | undefined) ?? undefined,
  }

  for (const key of LIST_KEYS) {
    const value = list(key)
    if (value) (filter as Record<string, unknown>)[key] = value
  }

  // Strip undefined so `countActiveFilters` stays accurate.
  return Object.fromEntries(
    Object.entries(filter).filter(([, v]) => v !== undefined)
  ) as IssueFilter
}

type ReadonlyURLSearchParams = {
  get(name: string): string | null
}
