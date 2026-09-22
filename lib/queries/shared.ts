'use client'

import { usePathname } from 'next/navigation'

import {
  getAdminSupabaseBrowserClient,
  getTenantSupabaseBrowserClient,
} from '@/lib/supabase/clients'
import type { IssueRow, LabelRow } from '@/lib/types/database'
import type { IssueSummary } from '@/lib/types/app'

export function useSupabase() {
  const pathname = usePathname()
  return pathname.startsWith('/miraadmin')
    ? getAdminSupabaseBrowserClient()
    : getTenantSupabaseBrowserClient()
}

/** Throw PostgREST errors so React Query surfaces them through `error`. */
export function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error
  return data as T
}

/* -------------------------------------------------------------------------- */
/* Select strings                                                             */
/*                                                                            */
/* `profiles` is referenced twice from `issues`, so those embeds must name the */
/* foreign key explicitly or PostgREST cannot pick a direction.               */
/* -------------------------------------------------------------------------- */

const ISSUE_SELECT_BASE = `
  *,
  status:project_statuses!issues_status_id_fkey(id,name,category,color,position),
  assignee:profiles!issues_assignee_id_fkey(id,full_name,avatar_url,email),
  reporter:profiles!issues_reporter_id_fkey(id,full_name,avatar_url,email),
  project:projects!issues_project_id_fkey(id,key,name,color),
  sprint:sprints!issues_sprint_id_fkey(id,name,status),
  issue_labels(label:labels(id,project_id,name,color,created_at))
`.replace(/\s+/g, '')

export const ISSUE_SELECT = `${ISSUE_SELECT_BASE},comments(count)`

/**
 * The comment-count badge relies on a PostgREST aggregate embed. Aggregates
 * are enabled on Supabase Cloud but can be switched off (and are off by
 * default in a bare PostgREST), so the first request that trips over it
 * downgrades every later issue query instead of leaving the board broken.
 */
let commentCountSupported = true

export function issueSelect() {
  return commentCountSupported ? ISSUE_SELECT : ISSUE_SELECT_BASE
}

function isAggregateUnsupported(error: unknown): boolean {
  const message =
    typeof error === 'object' && error
      ? [
          (error as { message?: string }).message,
          (error as { hint?: string }).hint,
          (error as { details?: string }).details,
        ]
          .filter(Boolean)
          .join(' ')
      : String(error ?? '')
  return /aggregate/i.test(message)
}

/**
 * Run an issue query, retrying once without the aggregate embed if PostgREST
 * rejects it.
 */
export async function runIssueQuery<T>(
  run: (select: string) => PromiseLike<{ data: T | null; error: unknown }>
): Promise<T> {
  const first = await run(issueSelect())
  if (first.error && commentCountSupported && isAggregateUnsupported(first.error)) {
    commentCountSupported = false
    return unwrap(await run(issueSelect()))
  }
  return unwrap(first)
}

type RawIssue = IssueRow & {
  status?: IssueSummary['status']
  assignee?: IssueSummary['assignee']
  reporter?: IssueSummary['reporter']
  project?: IssueSummary['project']
  sprint?: IssueSummary['sprint']
  issue_labels?: { label: LabelRow | null }[] | null
  comments?: { count: number }[] | { count: number } | null
}

function embeddedCount(value: RawIssue['comments']): number {
  if (!value) return 0
  if (Array.isArray(value)) return value[0]?.count ?? 0
  return value.count ?? 0
}

/**
 * Normalise a PostgREST row into the flat shape the UI renders. `epic` and
 * `subtask_count` are resolved from the sibling issues of the same project by
 * `withDerivedFields` — self-referencing embeds are ambiguous in PostgREST, so
 * MIRA never asks for them.
 */
export function mapIssue(raw: RawIssue): IssueSummary {
  return {
    ...(raw as IssueRow),
    status: raw.status ?? null,
    assignee: raw.assignee ?? null,
    reporter: raw.reporter ?? null,
    project: raw.project ?? null,
    sprint: raw.sprint ?? null,
    epic: null,
    labels: (raw.issue_labels ?? [])
      .map((row) => row.label)
      .filter((label): label is LabelRow => Boolean(label))
      .sort((a, b) => a.name.localeCompare(b.name)),
    subtask_count: 0,
    comment_count: embeddedCount(raw.comments),
  }
}

/** Fill in `epic` and `subtask_count` using the whole project issue list. */
export function withDerivedFields(issues: IssueSummary[]): IssueSummary[] {
  const byId = new Map(issues.map((i) => [i.id, i]))
  const subtaskCounts = new Map<string, number>()
  for (const issue of issues) {
    if (issue.parent_id) {
      subtaskCounts.set(issue.parent_id, (subtaskCounts.get(issue.parent_id) ?? 0) + 1)
    }
  }
  return issues.map((issue) => {
    const epic = issue.epic_id ? byId.get(issue.epic_id) : undefined
    return {
      ...issue,
      epic: epic
        ? { id: epic.id, title: epic.title, issue_number: epic.issue_number }
        : issue.epic,
      subtask_count: subtaskCounts.get(issue.id) ?? 0,
    }
  })
}

// Revisions are few per comment, so the ids are fetched and counted client
// side rather than using an aggregate embed.
export const COMMENT_SELECT = `
  *,
  author:profiles!comments_author_id_fkey(id,full_name,avatar_url,email),
  comment_revisions(id)
`.replace(/\s+/g, '')

export const ACTIVITY_SELECT = `
  *,
  actor:profiles!activity_log_actor_id_fkey(id,full_name,avatar_url)
`.replace(/\s+/g, '')

export const ATTACHMENT_SELECT = `
  *,
  uploader:profiles!attachments_uploaded_by_fkey(id,full_name,avatar_url)
`.replace(/\s+/g, '')

export const MEMBER_SELECT = `
  id,
  workspace_id,
  user_id,
  role,
  position_id,
  reports_to_user_id,
  status,
  title,
  joined_at,
  created_at,
  position:positions(id,name,slug),
  profile:profiles!workspace_members_user_id_fkey(*)
`.replace(/\s+/g, '')

/** A position with its capability checklist, for the Team page editor. */
export const POSITION_SELECT = `
  *,
  permissions:position_permissions(capability,allowed)
`.replace(/\s+/g, '')

export const PROJECT_SELECT = `
  *,
  lead:profiles!projects_lead_id_fkey(id,full_name,avatar_url,email)
`.replace(/\s+/g, '')

export const INVITE_SELECT = `
  *,
  inviter:profiles!workspace_invites_invited_by_fkey(id,full_name)
`.replace(/\s+/g, '')
