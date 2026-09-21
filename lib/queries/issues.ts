'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { qk } from './keys'
import {
  mapIssue,
  runIssueQuery,
  unwrap,
  useSupabase,
  withDerivedFields,
} from './shared'
import { applyIssueFilter } from '@/lib/filters'
import type { IssueFilter, IssueSummary } from '@/lib/types/app'
import type { IssuePriority, IssueRow, IssueType } from '@/lib/types/database'
import { parseIssueKey, positionBetween } from '@/lib/utils'

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Every issue in a project. The board, the backlog and the sprint views all
 * read from this one cache entry, which keeps drag-and-drop, quick filters and
 * realtime patches consistent with each other.
 */
export function useProjectIssues(projectId?: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: qk.issues(projectId ?? 'none'),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const rows = await runIssueQuery<unknown[]>((select) =>
        supabase
          .from('issues')
          .select(select)
          .eq('project_id', projectId!)
          .order('backlog_position')
      )
      return withDerivedFields(rows.map((row) => mapIssue(row as never)))
    },
    staleTime: 15_000,
  })
}

export function useIssue(issueId?: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: qk.issue(issueId ?? 'none'),
    enabled: Boolean(issueId),
    queryFn: async () => {
      const row = await runIssueQuery<unknown>((select) =>
        supabase.from('issues').select(select).eq('id', issueId!).single()
      )
      const issue = mapIssue(row as never)

      // Resolve the epic and the sub-task count with two small follow-ups
      // rather than a self-referencing embed.
      const [epic, subtasks] = await Promise.all([
        issue.epic_id
          ? supabase
              .from('issues')
              .select('id,title,issue_number')
              .eq('id', issue.epic_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from('issues')
          .select('id', { count: 'exact', head: true })
          .eq('parent_id', issue.id),
      ])

      return {
        ...issue,
        epic: (epic.data as IssueSummary['epic']) ?? null,
        subtask_count: subtasks.count ?? 0,
      } satisfies IssueSummary
    },
  })
}

/** Resolve "MIRA-101" within a workspace. Used by the issue detail route. */
export function useIssueByKey(workspaceId?: string, rawKey?: string) {
  const supabase = useSupabase()
  const parsed = rawKey ? parseIssueKey(rawKey) : null

  return useQuery({
    queryKey: qk.issueByKey(workspaceId ?? 'none', rawKey ?? 'none'),
    enabled: Boolean(workspaceId && parsed),
    queryFn: async () => {
      const projectResult = await supabase
        .from('projects')
        .select('id')
        .eq('workspace_id', workspaceId!)
        .eq('key', parsed!.key)
        .maybeSingle()
      const project = unwrap(projectResult) as { id: string } | null
      if (!project) return null

      const result = await supabase
        .from('issues')
        .select('id')
        .eq('project_id', project.id)
        .eq('issue_number', parsed!.number)
        .maybeSingle()
      return (unwrap(result) as { id: string } | null)?.id ?? null
    },
  })
}

export function useSubtasks(issueId?: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: qk.subtasks(issueId ?? 'none'),
    enabled: Boolean(issueId),
    queryFn: async () => {
      const rows = await runIssueQuery<unknown[]>((select) =>
        supabase.from('issues').select(select).eq('parent_id', issueId!).order('created_at')
      )
      return rows.map((row) => mapIssue(row as never))
    },
  })
}

/** Cross-project issue list, used by the workspace dashboard and reports. */
export function useWorkspaceIssues(workspaceId?: string, filter: IssueFilter = {}) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: qk.workspaceIssues(workspaceId ?? 'none', filter),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const projectsResult = await supabase
        .from('projects')
        .select('id')
        .eq('workspace_id', workspaceId!)
        .eq('is_archived', false)
      const projectIds = (unwrap(projectsResult) as { id: string }[]).map((p) => p.id)
      if (!projectIds.length) return [] as IssueSummary[]

      const rows = await runIssueQuery<unknown[]>((select) =>
        applyIssueFilter(
          supabase.from('issues').select(select).in('project_id', projectIds).limit(2000),
          filter
        )
      )
      return withDerivedFields(rows.map((row) => mapIssue(row as never)))
    },
    staleTime: 20_000,
  })
}

/* -------------------------------------------------------------------------- */
/* Optimistic cache helpers                                                   */
/* -------------------------------------------------------------------------- */

type IssuePatch = Partial<
  Pick<
    IssueRow,
    | 'title'
    | 'description'
    | 'type'
    | 'status_id'
    | 'priority'
    | 'assignee_id'
    | 'epic_id'
    | 'parent_id'
    | 'sprint_id'
    | 'story_points'
    | 'due_date'
    | 'board_position'
    | 'backlog_position'
  >
>

function patchIssueInList(
  issues: IssueSummary[] | undefined,
  issueId: string,
  patch: IssuePatch,
  statusLookup?: Map<string, IssueSummary['status']>
): IssueSummary[] | undefined {
  if (!issues) return issues
  return issues.map((issue) =>
    issue.id === issueId
      ? {
          ...issue,
          ...patch,
          status:
            patch.status_id && statusLookup?.get(patch.status_id)
              ? statusLookup.get(patch.status_id)!
              : issue.status,
        }
      : issue
  )
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export type CreateIssueInput = {
  project_id: string
  title: string
  type?: IssueType
  description?: string | null
  status_id?: string
  priority?: IssuePriority
  assignee_id?: string | null
  epic_id?: string | null
  parent_id?: string | null
  sprint_id?: string | null
  story_points?: number | null
  due_date?: string | null
  labelIds?: string[]
}

export function useCreateIssue() {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({ labelIds, ...input }: CreateIssueInput) => {
      const row = await runIssueQuery<unknown>((select) =>
        supabase.from('issues').insert(input).select(select).single()
      )
      const issue = mapIssue(row as never)

      if (labelIds?.length) {
        const { error } = await supabase
          .from('issue_labels')
          .insert(labelIds.map((label_id) => ({ issue_id: issue.id, label_id })))
        if (error) throw error
      }

      return issue
    },
    onSuccess: (issue) => {
      client.invalidateQueries({ queryKey: qk.issues(issue.project_id) })
      client.invalidateQueries({ queryKey: ['workspace-issues'] })
      if (issue.parent_id) {
        client.invalidateQueries({ queryKey: qk.subtasks(issue.parent_id) })
        client.invalidateQueries({ queryKey: qk.issue(issue.parent_id) })
      }
    },
  })
}

export function useUpdateIssue(projectId?: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...patch }: IssuePatch & { id: string }) => {
      const row = await runIssueQuery<unknown>((select) =>
        supabase.from('issues').update(patch).eq('id', id).select(select).single()
      )
      return mapIssue(row as never)
    },
    onMutate: async ({ id, ...patch }) => {
      const listKey = qk.issues(projectId ?? 'none')
      await client.cancelQueries({ queryKey: listKey })

      const previousList = client.getQueryData<IssueSummary[]>(listKey)
      const previousIssue = client.getQueryData<IssueSummary>(qk.issue(id))

      const statusLookup = new Map(
        (previousList ?? []).flatMap((i) => (i.status ? [[i.status.id, i.status]] : []))
      )

      client.setQueryData(listKey, (old?: IssueSummary[]) =>
        patchIssueInList(old, id, patch, statusLookup)
      )
      if (previousIssue) {
        client.setQueryData(qk.issue(id), {
          ...previousIssue,
          ...patch,
          status:
            patch.status_id && statusLookup.get(patch.status_id)
              ? statusLookup.get(patch.status_id)!
              : previousIssue.status,
        })
      }

      return { previousList, previousIssue, listKey }
    },
    onError: (_error, variables, context) => {
      if (context?.previousList) client.setQueryData(context.listKey, context.previousList)
      if (context?.previousIssue) {
        client.setQueryData(qk.issue(variables.id), context.previousIssue)
      }
    },
    onSuccess: (issue) => {
      client.setQueryData(qk.issue(issue.id), (old?: IssueSummary) =>
        old ? { ...old, ...issue, epic: old.epic, subtask_count: old.subtask_count } : issue
      )
      client.invalidateQueries({ queryKey: qk.activity(issue.id) })
      client.invalidateQueries({ queryKey: ['workspace-issues'] })
    },
    onSettled: (issue) => {
      const id = issue?.project_id ?? projectId
      if (id) client.invalidateQueries({ queryKey: qk.issues(id) })
    },
  })
}

/**
 * Board drag-and-drop. `board_position` is fractional so moving one card only
 * ever writes one row; the optimistic patch makes the drop feel instant.
 */
export function useMoveIssue(projectId: string) {
  const update = useUpdateIssue(projectId)

  return {
    ...update,
    move: ({
      issueId,
      statusId,
      before,
      after,
    }: {
      issueId: string
      statusId: string
      before?: number
      after?: number
    }) =>
      update.mutateAsync({
        id: issueId,
        status_id: statusId,
        board_position: positionBetween(before, after),
      }),
  }
}

export function useReorderBacklog(projectId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()
  const listKey = qk.issues(projectId)

  return useMutation({
    mutationFn: async ({
      issueId,
      backlogPosition,
      sprintId,
    }: {
      issueId: string
      backlogPosition: number
      sprintId?: string | null
    }) => {
      const patch: IssuePatch = { backlog_position: backlogPosition }
      if (sprintId !== undefined) patch.sprint_id = sprintId
      const row = await runIssueQuery<unknown>((select) =>
        supabase.from('issues').update(patch).eq('id', issueId).select(select).single()
      )
      return mapIssue(row as never)
    },
    onMutate: async ({ issueId, backlogPosition, sprintId }) => {
      await client.cancelQueries({ queryKey: listKey })
      const previous = client.getQueryData<IssueSummary[]>(listKey)
      client.setQueryData(listKey, (old?: IssueSummary[]) =>
        old
          ?.map((issue) =>
            issue.id === issueId
              ? {
                  ...issue,
                  backlog_position: backlogPosition,
                  sprint_id: sprintId !== undefined ? sprintId : issue.sprint_id,
                }
              : issue
          )
          .sort((a, b) => a.backlog_position - b.backlog_position)
      )
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(listKey, context.previous)
    },
    onSettled: () => client.invalidateQueries({ queryKey: listKey }),
  })
}

export function useDeleteIssue(projectId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (issueId: string) => {
      const { error } = await supabase.from('issues').delete().eq('id', issueId)
      if (error) throw error
      return issueId
    },
    onMutate: async (issueId) => {
      const listKey = qk.issues(projectId)
      await client.cancelQueries({ queryKey: listKey })
      const previous = client.getQueryData<IssueSummary[]>(listKey)
      client.setQueryData(listKey, (old?: IssueSummary[]) =>
        old?.filter((issue) => issue.id !== issueId && issue.parent_id !== issueId)
      )
      return { previous, listKey }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(context.listKey, context.previous)
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.issues(projectId) })
      client.invalidateQueries({ queryKey: ['workspace-issues'] })
    },
  })
}

/** Bulk edit from the backlog / search result checkboxes. */
export function useBulkUpdateIssues(projectId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: IssuePatch }) => {
      const { error } = await supabase.from('issues').update(patch).in('id', ids)
      if (error) throw error
      return ids
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.issues(projectId) })
      client.invalidateQueries({ queryKey: ['workspace-issues'] })
    },
  })
}

export function useCloneIssue() {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (source: IssueSummary) => {
      const row = await runIssueQuery<unknown>((select) =>
        supabase
          .from('issues')
          .insert({
            project_id: source.project_id,
            title: `${source.title} (copy)`,
            description: source.description,
            type: source.type,
            status_id: source.status_id,
            priority: source.priority,
            assignee_id: source.assignee_id,
            epic_id: source.epic_id,
            parent_id: source.parent_id,
            sprint_id: source.sprint_id,
            story_points: source.story_points,
            due_date: source.due_date,
          })
          .select(select)
          .single()
      )
      const clone = mapIssue(row as never)

      if (source.labels.length) {
        const { error } = await supabase.from('issue_labels').insert(
          source.labels.map((label) => ({ issue_id: clone.id, label_id: label.id }))
        )
        if (error) throw error
      }

      return clone
    },
    onSuccess: (issue) => {
      client.invalidateQueries({ queryKey: qk.issues(issue.project_id) })
    },
  })
}

/** Replace the label set of an issue in one round trip pair. */
export function useSetIssueLabels(projectId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({ issueId, labelIds }: { issueId: string; labelIds: string[] }) => {
      const { error: deleteError } = await supabase
        .from('issue_labels')
        .delete()
        .eq('issue_id', issueId)
      if (deleteError) throw deleteError

      if (labelIds.length) {
        const { error } = await supabase
          .from('issue_labels')
          .insert(labelIds.map((label_id) => ({ issue_id: issueId, label_id })))
        if (error) throw error
      }
      return labelIds
    },
    onMutate: async ({ issueId, labelIds }) => {
      const listKey = qk.issues(projectId)
      const labels = client.getQueryData<{ id: string; name: string; color: string }[]>(
        qk.labels(projectId)
      )
      const selected = (labels ?? []).filter((label) => labelIds.includes(label.id))

      await client.cancelQueries({ queryKey: listKey })
      const previousList = client.getQueryData<IssueSummary[]>(listKey)
      const previousIssue = client.getQueryData<IssueSummary>(qk.issue(issueId))

      client.setQueryData(listKey, (old?: IssueSummary[]) =>
        old?.map((issue) =>
          issue.id === issueId
            ? { ...issue, labels: selected as IssueSummary['labels'] }
            : issue
        )
      )
      if (previousIssue) {
        client.setQueryData(qk.issue(issueId), {
          ...previousIssue,
          labels: selected as IssueSummary['labels'],
        })
      }
      return { previousList, previousIssue, listKey }
    },
    onError: (_error, variables, context) => {
      if (context?.previousList) client.setQueryData(context.listKey, context.previousList)
      if (context?.previousIssue) {
        client.setQueryData(qk.issue(variables.issueId), context.previousIssue)
      }
    },
    onSettled: (_data, _error, variables) => {
      client.invalidateQueries({ queryKey: qk.issues(projectId) })
      client.invalidateQueries({ queryKey: qk.issue(variables.issueId) })
    },
  })
}
