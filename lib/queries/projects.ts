'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { qk } from './keys'
import { PROJECT_SELECT, unwrap, useSupabase } from './shared'
import type {
  Label,
  ProjectStatus,
  ProjectWithMeta,
} from '@/lib/types/app'
import type { StatusCategory, StatusTransitionRow } from '@/lib/types/database'

/* -------------------------------------------------------------------------- */
/* Projects                                                                   */
/* -------------------------------------------------------------------------- */

export function useProjects(workspaceId?: string, includeArchived = false) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: [...qk.projects(workspaceId ?? 'none'), includeArchived],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      let query = supabase
        .from('projects')
        .select(PROJECT_SELECT)
        .eq('workspace_id', workspaceId!)
        .order('name')
      if (!includeArchived) query = query.eq('is_archived', false)
      return unwrap(await query) as unknown as ProjectWithMeta[]
    },
    staleTime: 30_000,
  })
}

export function useProject(projectId?: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: qk.project(projectId ?? 'none'),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const result = await supabase
        .from('projects')
        .select(PROJECT_SELECT)
        .eq('id', projectId!)
        .single()
      return unwrap(result) as unknown as ProjectWithMeta
    },
  })
}

export function useCreateProject(workspaceId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      name: string
      key: string
      description?: string | null
      leadId?: string | null
      icon?: string
      color?: string
    }) => {
      const result = await supabase.rpc('create_project', {
        p_workspace: workspaceId,
        p_name: input.name,
        p_key: input.key.toUpperCase(),
        p_description: input.description ?? null,
        p_lead: input.leadId ?? null,
        p_icon: input.icon ?? 'Rocket',
        p_color: input.color ?? '#5B5BD6',
      })
      return unwrap(result) as unknown as ProjectWithMeta
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.projects(workspaceId) }),
  })
}

export function useUpdateProject(workspaceId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string
      name?: string
      key?: string
      description?: string | null
      lead_id?: string | null
      icon?: string
      color?: string
      is_archived?: boolean
    }) => {
      const result = await supabase
        .from('projects')
        .update(patch)
        .eq('id', id)
        .select(PROJECT_SELECT)
        .single()
      return unwrap(result) as unknown as ProjectWithMeta
    },
    onSuccess: (project) => {
      client.invalidateQueries({ queryKey: qk.projects(workspaceId) })
      client.setQueryData(qk.project(project.id), project)
    },
  })
}

export function useDeleteProject(workspaceId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase.from('projects').delete().eq('id', projectId)
      if (error) throw error
      return projectId
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.projects(workspaceId) }),
  })
}

/* -------------------------------------------------------------------------- */
/* Workflow statuses                                                          */
/* -------------------------------------------------------------------------- */

export function useStatuses(projectId?: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: qk.statuses(projectId ?? 'none'),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const result = await supabase
        .from('project_statuses')
        .select('*')
        .eq('project_id', projectId!)
        .order('position')
      return unwrap(result) as ProjectStatus[]
    },
    staleTime: 60_000,
  })
}

export function useCreateStatus(projectId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      name: string
      category: StatusCategory
      color?: string
      position?: number
      wip_limit?: number | null
    }) => {
      const result = await supabase
        .from('project_statuses')
        .insert({ project_id: projectId, ...input })
        .select('*')
        .single()
      return unwrap(result) as ProjectStatus
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.statuses(projectId) }),
  })
}

export function useUpdateStatus(projectId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<ProjectStatus> & { id: string }) => {
      const result = await supabase
        .from('project_statuses')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single()
      return unwrap(result) as ProjectStatus
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.statuses(projectId) }),
  })
}

export function useReorderStatuses(projectId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (ordered: ProjectStatus[]) => {
      // One request per column, but a project has a handful at most.
      await Promise.all(
        ordered.map((status, index) =>
          supabase
            .from('project_statuses')
            .update({ position: index })
            .eq('id', status.id)
            .then(({ error }) => {
              if (error) throw error
            })
        )
      )
      return ordered
    },
    onMutate: async (ordered) => {
      await client.cancelQueries({ queryKey: qk.statuses(projectId) })
      const previous = client.getQueryData<ProjectStatus[]>(qk.statuses(projectId))
      client.setQueryData(
        qk.statuses(projectId),
        ordered.map((status, index) => ({ ...status, position: index }))
      )
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(qk.statuses(projectId), context.previous)
    },
    onSettled: () => client.invalidateQueries({ queryKey: qk.statuses(projectId) }),
  })
}

export function useDeleteStatus(projectId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (statusId: string) => {
      const { error } = await supabase.from('project_statuses').delete().eq('id', statusId)
      if (error) throw error
      return statusId
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.statuses(projectId) })
      client.invalidateQueries({ queryKey: qk.issues(projectId) })
    },
  })
}

/* -------------------------------------------------------------------------- */
/* Allowed transitions                                                        */
/* -------------------------------------------------------------------------- */

export function useTransitions(projectId?: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: qk.transitions(projectId ?? 'none'),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const result = await supabase
        .from('status_transitions')
        .select('*')
        .eq('project_id', projectId!)
      return unwrap(result) as StatusTransitionRow[]
    },
    staleTime: 60_000,
  })
}

/**
 * Replace the transition set for one source status. An empty target list means
 * "unrestricted", which matches how the database trigger reads the table.
 */
export function useSetTransitions(projectId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({
      fromStatusId,
      toStatusIds,
    }: {
      fromStatusId: string
      toStatusIds: string[]
    }) => {
      const { error: deleteError } = await supabase
        .from('status_transitions')
        .delete()
        .eq('from_status_id', fromStatusId)
      if (deleteError) throw deleteError

      if (toStatusIds.length) {
        const { error } = await supabase.from('status_transitions').insert(
          toStatusIds.map((to) => ({
            project_id: projectId,
            from_status_id: fromStatusId,
            to_status_id: to,
          }))
        )
        if (error) throw error
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.transitions(projectId) }),
  })
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                     */
/* -------------------------------------------------------------------------- */

export function useLabels(projectId?: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: qk.labels(projectId ?? 'none'),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const result = await supabase
        .from('labels')
        .select('*')
        .eq('project_id', projectId!)
        .order('name')
      return unwrap(result) as Label[]
    },
    staleTime: 60_000,
  })
}

export function useCreateLabel(projectId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (input: { name: string; color: string }) => {
      const result = await supabase
        .from('labels')
        .insert({ project_id: projectId, ...input })
        .select('*')
        .single()
      return unwrap(result) as Label
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.labels(projectId) }),
  })
}

export function useUpdateLabel(projectId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; color?: string }) => {
      const result = await supabase
        .from('labels')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single()
      return unwrap(result) as Label
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.labels(projectId) })
      client.invalidateQueries({ queryKey: qk.issues(projectId) })
    },
  })
}

export function useDeleteLabel(projectId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (labelId: string) => {
      const { error } = await supabase.from('labels').delete().eq('id', labelId)
      if (error) throw error
      return labelId
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.labels(projectId) })
      client.invalidateQueries({ queryKey: qk.issues(projectId) })
    },
  })
}
