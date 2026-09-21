import { stripMentionMarkup } from '@/lib/mentions'
import type { IssueSummary } from '@/lib/types/app'
import { issueKey } from '@/lib/utils'

/** RFC 4180 escaping: quote when needed, double up embedded quotes. */
function cell(value: unknown): string {
  if (value == null) return ''
  const text = String(value)
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export const ISSUE_CSV_COLUMNS = [
  'Key',
  'Type',
  'Title',
  'Status',
  'Status category',
  'Priority',
  'Assignee',
  'Reporter',
  'Labels',
  'Sprint',
  'Epic',
  'Story points',
  'Due date',
  'Created',
  'Updated',
  'Resolved',
] as const

export function issuesToCsv(issues: IssueSummary[]): string {
  const rows = issues.map((issue) => [
    issueKey(issue.project?.key, issue.issue_number),
    issue.type,
    stripMentionMarkup(issue.title),
    issue.status?.name ?? '',
    issue.status?.category ?? '',
    issue.priority,
    issue.assignee?.full_name ?? issue.assignee?.email ?? '',
    issue.reporter?.full_name ?? issue.reporter?.email ?? '',
    issue.labels.map((l) => l.name).join(' '),
    issue.sprint?.name ?? '',
    issue.epic?.title ?? '',
    issue.story_points ?? '',
    issue.due_date ?? '',
    issue.created_at,
    issue.updated_at,
    issue.resolved_at ?? '',
  ])

  return [ISSUE_CSV_COLUMNS, ...rows]
    .map((row) => row.map(cell).join(','))
    .join('\r\n')
}

/**
 * Generic serialiser for any array of flat records — used by the platform
 * audit export, where the columns are not known up front.
 *
 * Column order comes from the first row; later rows contribute any keys the
 * first one lacked, so a sparse record set still round-trips.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''

  const columns: string[] = []
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key)
    }
  }

  return [columns, ...rows.map((row) => columns.map((column) => row[column]))]
    .map((row) => row.map(cell).join(','))
    .join('\r\n')
}

/** Trigger a client-side download without touching the DOM permanently. */
export function downloadCsv(filename: string, csv: string) {
  // The BOM keeps Excel happy with UTF-8.
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
