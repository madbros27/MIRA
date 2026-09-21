'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { qk } from './keys'
import { unwrap, useSupabase } from './shared'
import type { Notification } from '@/lib/types/app'

export function useNotifications(workspaceId?: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: qk.notifications(workspaceId ?? 'none'),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const result = await supabase
        .from('notifications')
        .select(
          '*,actor:profiles!notifications_actor_id_fkey(id,full_name,avatar_url),project:projects!notifications_project_id_fkey(id,key,name)'
        )
        .eq('workspace_id', workspaceId!)
        .order('created_at', { ascending: false })
        .limit(100)
      return unwrap(result) as unknown as NotificationWithActor[]
    },
    staleTime: 10_000,
  })
}

export type NotificationWithActor = Notification & {
  actor: { id: string; full_name: string | null; avatar_url: string | null } | null
  project: { id: string; key: string; name: string } | null
}

export function useUnreadCount(workspaceId?: string) {
  const { data } = useNotifications(workspaceId)
  return data?.filter((n) => !n.is_read).length ?? 0
}

export function useMarkNotificationRead(workspaceId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()
  const key = qk.notifications(workspaceId)

  return useMutation({
    mutationFn: async ({ id, isRead = true }: { id: string; isRead?: boolean }) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: isRead })
        .eq('id', id)
      if (error) throw error
      return id
    },
    onMutate: async ({ id, isRead = true }) => {
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<NotificationWithActor[]>(key)
      client.setQueryData(key, (old?: NotificationWithActor[]) =>
        old?.map((n) => (n.id === id ? { ...n, is_read: isRead } : n))
      )
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(key, context.previous)
    },
  })
}

export function useMarkAllRead(workspaceId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()
  const key = qk.notifications(workspaceId)

  return useMutation({
    mutationFn: async () => {
      const result = await supabase.rpc('mark_all_notifications_read', {
        p_workspace: workspaceId,
      })
      if (result.error) throw result.error
      return result.data as number
    },
    onMutate: async () => {
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<NotificationWithActor[]>(key)
      client.setQueryData(key, (old?: NotificationWithActor[]) =>
        old?.map((n) => ({ ...n, is_read: true }))
      )
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(key, context.previous)
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  })
}

export function useDeleteNotification(workspaceId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()
  const key = qk.notifications(workspaceId)

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notifications').delete().eq('id', id)
      if (error) throw error
      return id
    },
    onMutate: async (id) => {
      const previous = client.getQueryData<NotificationWithActor[]>(key)
      client.setQueryData(key, (old?: NotificationWithActor[]) =>
        old?.filter((n) => n.id !== id)
      )
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(key, context.previous)
    },
  })
}
