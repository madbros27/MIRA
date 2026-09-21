'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { qk } from './keys'
import { unwrap, useSupabase } from './shared'
import type { Sprint } from '@/lib/types/app'

export function useSprints(projectId?: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: qk.sprints(projectId ?? 'none'),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const result = await supabase
        .from('sprints')
        .select('*')
        .eq('project_id', projectId!)
        .order('created_at')
      return unwrap(result) as Sprint[]
    },
    staleTime: 30_000,
  })
}

export function useCreateSprint(projectId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      name: string
      goal?: string | null
      start_date?: string | null
      end_date?: string | null
    }) => {
      const result = await supabase
        .from('sprints')
        .insert({ project_id: projectId, ...input })
        .select('*')
        .single()
      return unwrap(result) as Sprint
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.sprints(projectId) }),
  })
}

export function useUpdateSprint(projectId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Sprint> & { id: string }) => {
      const result = await supabase
        .from('sprints')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single()
      return unwrap(result) as Sprint
    },
    onMutate: async ({ id, ...patch }) => {
      const key = qk.sprints(projectId)
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<Sprint[]>(key)
      client.setQueryData(key, (old?: Sprint[]) =>
        old?.map((sprint) => (sprint.id === id ? { ...sprint, ...patch } : sprint))
      )
      return { previous, key }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(context.key, context.previous)
    },
    onSettled: () => client.invalidateQueries({ queryKey: qk.sprints(projectId) }),
  })
}

export function useDeleteSprint(projectId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (sprintId: string) => {
      const { error } = await supabase.from('sprints').delete().eq('id', sprintId)
      if (error) throw error
      return sprintId
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.sprints(projectId) })
      client.invalidateQueries({ queryKey: qk.issues(projectId) })
    },
  })
}

/**
 * Starting and completing a sprint are RPCs: the point totals have to be
 * snapshotted and unfinished work moved in the same transaction.
 */
export function useStartSprint(projectId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({
      sprintId,
      startDate,
      endDate,
    }: {
      sprintId: string
      startDate?: string
      endDate?: string | null
    }) => {
      const result = await supabase.rpc('start_sprint', {
        p_sprint: sprintId,
        p_start: startDate ?? new Date().toISOString(),
        p_end: endDate ?? null,
      })
      return unwrap(result) as unknown as Sprint
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.sprints(projectId) })
      client.invalidateQueries({ queryKey: qk.issues(projectId) })
    },
  })
}

export function useCompleteSprint(projectId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({
      sprintId,
      targetSprintId,
    }: {
      sprintId: string
      targetSprintId?: string | null
    }) => {
      const result = await supabase.rpc('complete_sprint', {
        p_sprint: sprintId,
        p_target_sprint: targetSprintId ?? null,
      })
      return unwrap(result) as unknown as Sprint
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.sprints(projectId) })
      client.invalidateQueries({ queryKey: qk.issues(projectId) })
    },
  })
}
