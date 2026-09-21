/**
 * Report maths.
 *
 * Burndown is derived from `resolved_at` on the sprint's issues rather than
 * from nightly snapshots: one fewer table, and it stays correct when an issue
 * is reopened (the trigger clears `resolved_at`).
 */

import {
  addDays,
  eachDayOfInterval,
  endOfDay,
  format,
  isAfter,
  parseISO,
  startOfDay,
} from 'date-fns'

import { PRIORITY_WEIGHT } from '@/lib/constants'
import type { BurndownPoint, IssueSummary, VelocityPoint } from '@/lib/types/app'
import type { Sprint } from '@/lib/types/app'
import { sum } from '@/lib/utils'

export function computeBurndown(sprint: Sprint, issues: IssueSummary[]): BurndownPoint[] {
  if (!sprint.start_date || !sprint.end_date) return []

  const start = startOfDay(parseISO(sprint.start_date))
  const end = endOfDay(parseISO(sprint.end_date))
  if (isAfter(start, end)) return []

  const days = eachDayOfInterval({ start, end })
  // Cap the number of plotted points so a long-running sprint stays readable.
  if (days.length > 60) days.length = 60

  // Unestimated issues still count as work — treat them as 1 point so they do
  // not silently disappear from the chart.
  const weight = (issue: IssueSummary) => issue.story_points ?? 1
  const total = sum(issues.map(weight))

  const now = new Date()
  const step = total / Math.max(days.length - 1, 1)

  return days.map((day, index) => {
    const cutoff = endOfDay(day)
    const inFuture = isAfter(startOfDay(day), now)

    const completed = sum(
      issues
        .filter((i) => i.resolved_at && !isAfter(parseISO(i.resolved_at), cutoff))
        .map(weight)
    )

    return {
      date: format(day, 'yyyy-MM-dd'),
      label: format(day, 'd MMM'),
      remaining: inFuture ? null : Math.max(total - completed, 0),
      ideal: Math.max(total - step * index, 0),
      completed,
    }
  })
}

export function computeVelocity(
  sprints: Sprint[],
  issuesBySprint?: Map<string, IssueSummary[]>
): VelocityPoint[] {
  return sprints
    .filter((s) => s.status === 'completed' || s.status === 'active')
    .sort((a, b) => (a.start_date ?? a.created_at).localeCompare(b.start_date ?? b.created_at))
    .slice(-8)
    .map((sprint) => {
      const issues = issuesBySprint?.get(sprint.id)
      const committed =
        sprint.committed_points ?? (issues ? sum(issues.map((i) => i.story_points)) : 0)
      const completed =
        sprint.completed_points ??
        (issues
          ? sum(
              issues
                .filter((i) => i.status?.category === 'done')
                .map((i) => i.story_points)
            )
          : 0)
      return { sprint: sprint.name, committed: Number(committed), completed: Number(completed) }
    })
}

export type Distribution = { name: string; value: number; color: string }

export function distributionByType(issues: IssueSummary[]): Distribution[] {
  const meta: Record<string, string> = {
    epic: '#7C3AED',
    story: '#059669',
    task: '#2563EB',
    bug: '#DC2626',
    subtask: '#0891B2',
  }
  const labels: Record<string, string> = {
    epic: 'Epic',
    story: 'Story',
    task: 'Task',
    bug: 'Bug',
    subtask: 'Sub-task',
  }
  const counts = new Map<string, number>()
  for (const issue of issues) counts.set(issue.type, (counts.get(issue.type) ?? 0) + 1)
  return [...counts.entries()]
    .map(([type, value]) => ({ name: labels[type] ?? type, value, color: meta[type] ?? '#64748B' }))
    .sort((a, b) => b.value - a.value)
}

export function distributionByPriority(issues: IssueSummary[]): Distribution[] {
  const colors: Record<string, string> = {
    highest: '#DC2626',
    high: '#EA580C',
    medium: '#CA8A04',
    low: '#2563EB',
    lowest: '#64748B',
  }
  const counts = new Map<string, number>()
  for (const issue of issues) counts.set(issue.priority, (counts.get(issue.priority) ?? 0) + 1)
  return [...counts.entries()]
    .sort(
      (a, b) =>
        (PRIORITY_WEIGHT[b[0] as keyof typeof PRIORITY_WEIGHT] ?? 0) -
        (PRIORITY_WEIGHT[a[0] as keyof typeof PRIORITY_WEIGHT] ?? 0)
    )
    .map(([priority, value]) => ({
      name: priority.charAt(0).toUpperCase() + priority.slice(1),
      value,
      color: colors[priority] ?? '#64748B',
    }))
}

export function distributionByStatus(issues: IssueSummary[]): Distribution[] {
  const counts = new Map<string, { value: number; color: string; position: number }>()
  for (const issue of issues) {
    const name = issue.status?.name ?? 'Unknown'
    const existing = counts.get(name)
    counts.set(name, {
      value: (existing?.value ?? 0) + 1,
      color: issue.status?.color ?? '#64748B',
      position: issue.status?.position ?? 99,
    })
  }
  return [...counts.entries()]
    .sort((a, b) => a[1].position - b[1].position)
    .map(([name, v]) => ({ name, value: v.value, color: v.color }))
}

export type WorkloadRow = {
  userId: string
  name: string
  avatarUrl: string | null
  open: number
  done: number
  points: number
}

export function workloadByAssignee(issues: IssueSummary[]): WorkloadRow[] {
  const rows = new Map<string, WorkloadRow>()

  for (const issue of issues) {
    const userId = issue.assignee?.id ?? 'unassigned'
    const row =
      rows.get(userId) ??
      ({
        userId,
        name: issue.assignee
          ? issue.assignee.full_name || issue.assignee.email || 'Unknown'
          : 'Unassigned',
        avatarUrl: issue.assignee?.avatar_url ?? null,
        open: 0,
        done: 0,
        points: 0,
      } satisfies WorkloadRow)

    if (issue.status?.category === 'done') row.done += 1
    else {
      row.open += 1
      row.points += issue.story_points ?? 0
    }
    rows.set(userId, row)
  }

  return [...rows.values()].sort((a, b) => b.open + b.done - (a.open + a.done))
}

/** Cumulative "created vs resolved" trend for the project dashboard. */
export function createdVsResolved(issues: IssueSummary[], days = 30) {
  const end = startOfDay(new Date())
  const start = addDays(end, -(days - 1))
  const buckets = eachDayOfInterval({ start, end }).map((day) => ({
    date: format(day, 'yyyy-MM-dd'),
    label: format(day, 'd MMM'),
    created: 0,
    resolved: 0,
  }))
  const index = new Map(buckets.map((b, i) => [b.date, i]))

  for (const issue of issues) {
    const createdKey = format(parseISO(issue.created_at), 'yyyy-MM-dd')
    const createdAt = index.get(createdKey)
    if (createdAt != null) buckets[createdAt].created += 1

    if (issue.resolved_at) {
      const resolvedKey = format(parseISO(issue.resolved_at), 'yyyy-MM-dd')
      const resolvedAt = index.get(resolvedKey)
      if (resolvedAt != null) buckets[resolvedAt].resolved += 1
    }
  }

  return buckets
}
