'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useSupabase } from './shared'
import {
  DEFAULT_TEAM_ACCESS,
  type TeamAccessConfig,
} from '@/lib/permissions/team-access'

export const ACCESS_FILTER_NAME = '__mira_team_access__'

export function useTeamAccessConfig(workspaceId?: string) {
  const supabase = useSupabase()

  return useQuery<TeamAccessConfig>({
    queryKey: ['team-access-config', workspaceId ?? 'none'],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      // 1. Try to read from saved_filters table (shared across workspace)
      try {
        const { data, error } = await supabase
          .from('saved_filters')
          .select('query')
          .eq('workspace_id', workspaceId!)
          .eq('name', ACCESS_FILTER_NAME)
          .maybeSingle()

        if (!error && data?.query && typeof data.query === 'object') {
          const config = data.query as unknown as TeamAccessConfig
          if (
            Array.isArray(config.directoryMemberIds) &&
            Array.isArray(config.positionsMemberIds) &&
            Array.isArray(config.directoryPositionIds) &&
            Array.isArray(config.positionsPositionIds)
          ) {
            // Sync to local cache
            if (typeof window !== 'undefined') {
              try {
                localStorage.setItem(`mira_team_access_${workspaceId}`, JSON.stringify(config))
              } catch {
                // ignore
              }
            }
            return config
          }
        }
      } catch {
        // Fall through to local storage
      }

      // 2. Fallback to localStorage
      if (typeof window !== 'undefined') {
        try {
          const cached = localStorage.getItem(`mira_team_access_${workspaceId}`)
          if (cached) {
            const parsed = JSON.parse(cached) as TeamAccessConfig
            if (
              Array.isArray(parsed.directoryMemberIds) &&
              Array.isArray(parsed.positionsMemberIds)
            ) {
              return parsed
            }
          }
        } catch {
          // ignore
        }
      }

      return DEFAULT_TEAM_ACCESS
    },
    staleTime: 10_000,
  })
}

export function useUpdateTeamAccessConfig(workspaceId: string, ownerUserId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (config: TeamAccessConfig) => {
      // 1. Update local cache immediately
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(`mira_team_access_${workspaceId}`, JSON.stringify(config))
        } catch {
          // ignore
        }
      }

      // 2. Persist to saved_filters in database
      try {
        const { data: existing } = await supabase
          .from('saved_filters')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('name', ACCESS_FILTER_NAME)
          .maybeSingle()

        if (existing?.id) {
          const { error } = await supabase
            .from('saved_filters')
            .update({
              query: config as never,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id)
          if (error) throw error
        } else {
          const { error } = await supabase.from('saved_filters').insert({
            workspace_id: workspaceId,
            owner_id: ownerUserId,
            name: ACCESS_FILTER_NAME,
            query: config as never,
            is_shared: true,
          })
          if (error) throw error
        }
      } catch (err) {
        console.warn('Could not persist team access to remote database, saved locally:', err)
      }

      return config
    },
    onSuccess: (config) => {
      client.setQueryData(['team-access-config', workspaceId], config)
      client.invalidateQueries({ queryKey: ['team-access-config', workspaceId] })
      client.invalidateQueries({ queryKey: ['saved-filters', workspaceId] })
    },
  })
}
