'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { qk } from './keys'
import { unwrap, useSupabase } from './shared'
import type { IssueFilter, SavedFilter } from '@/lib/types/app'
import type { SearchResultRow } from '@/lib/types/database'

/* -------------------------------------------------------------------------- */
/* Global search                                                              */
/* -------------------------------------------------------------------------- */

export function useGlobalSearch(workspaceId?: string, term = '') {
  const supabase = useSupabase()
  const trimmed = term.trim()

  return useQuery({
    queryKey: qk.search(workspaceId ?? 'none', trimmed),
    enabled: Boolean(workspaceId) && trimmed.length >= 2,
    queryFn: async () => {
      const result = await supabase.rpc('global_search', {
        p_workspace: workspaceId!,
        p_query: trimmed,
        p_limit: 20,
      })
      const rows = (unwrap(result) as unknown as SearchResultRow[]) ?? []
      return rows.sort((a, b) => b.rank - a.rank)
    },
    staleTime: 15_000,
  })
}

/* -------------------------------------------------------------------------- */
/* Saved filters                                                              */
/* -------------------------------------------------------------------------- */

export function useSavedFilters(workspaceId?: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: qk.savedFilters(workspaceId ?? 'none'),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const result = await supabase
        .from('saved_filters')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .order('created_at')
      return unwrap(result) as unknown as SavedFilter[]
    },
    staleTime: 60_000,
  })
}

export function useCreateSavedFilter(workspaceId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      name: string
      query: IssueFilter
      projectId?: string | null
      ownerId: string
      isShared?: boolean
    }) => {
      const result = await supabase
        .from('saved_filters')
        .insert({
          workspace_id: workspaceId,
          project_id: input.projectId ?? null,
          owner_id: input.ownerId,
          name: input.name,
          query: input.query as never,
          is_shared: input.isShared ?? false,
        })
        .select('*')
        .single()
      return unwrap(result) as unknown as SavedFilter
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.savedFilters(workspaceId) }),
  })
}

export function useUpdateSavedFilter(workspaceId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string
      name?: string
      query?: IssueFilter
      is_shared?: boolean
    }) => {
      const result = await supabase
        .from('saved_filters')
        .update(patch as never)
        .eq('id', id)
        .select('*')
        .single()
      return unwrap(result) as unknown as SavedFilter
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.savedFilters(workspaceId) }),
  })
}

export function useDeleteSavedFilter(workspaceId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('saved_filters').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.savedFilters(workspaceId) }),
  })
}
