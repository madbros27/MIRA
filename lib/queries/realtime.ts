'use client'

/**
 * Realtime bridges between Supabase `postgres_changes` and the React Query
 * cache.
 *
 * Events invalidate rather than patch: a change payload carries the raw row
 * without the embedded status/assignee/labels the UI renders, so a refetch is
 * both simpler and always correct. Invalidations are debounced so a burst of
 * board updates costs one request.
 */

import { useQueryClient } from '@tanstack/react-query'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useEffect, useRef } from 'react'

import { qk } from './keys'
import { useSupabase } from './shared'

type QueryKey = readonly unknown[]

function useDebouncedInvalidate(delay = 200) {
  const client = useQueryClient()
  const pending = useRef(new Map<string, QueryKey>())
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => timer.current && clearTimeout(timer.current), [])

  return (key: QueryKey) => {
    pending.current.set(JSON.stringify(key), key)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const keys = [...pending.current.values()]
      pending.current.clear()
      for (const queryKey of keys) client.invalidateQueries({ queryKey })
    }, delay)
  }
}

/** Board, backlog and sprint views: keep one project live. */
export function useRealtimeProject(projectId?: string) {
  const supabase = useSupabase()
  const invalidate = useDebouncedInvalidate()

  useEffect(() => {
    if (!projectId) return

    const channel: RealtimeChannel = supabase
      .channel(`project:${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'issues', filter: `project_id=eq.${projectId}` },
        (payload) => {
          invalidate(qk.issues(projectId))
          const id =
            (payload.new as { id?: string } | null)?.id ??
            (payload.old as { id?: string } | null)?.id
          if (id) invalidate(qk.issue(id))
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'issue_labels' },
        () => invalidate(qk.issues(projectId))
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sprints',
          filter: `project_id=eq.${projectId}`,
        },
        () => invalidate(qk.sprints(projectId))
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_statuses',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          invalidate(qk.statuses(projectId))
          invalidate(qk.issues(projectId))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // `invalidate` is stable for the lifetime of the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, supabase])
}

/** Issue detail: comments, activity and attachments. */
export function useRealtimeIssue(issueId?: string) {
  const supabase = useSupabase()
  const invalidate = useDebouncedInvalidate()

  useEffect(() => {
    if (!issueId) return

    const channel = supabase
      .channel(`issue:${issueId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments', filter: `issue_id=eq.${issueId}` },
        () => {
          invalidate(qk.comments(issueId))
          invalidate(qk.activity(issueId))
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'activity_log',
          filter: `issue_id=eq.${issueId}`,
        },
        () => invalidate(qk.activity(issueId))
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attachments',
          filter: `issue_id=eq.${issueId}`,
        },
        () => invalidate(qk.attachments(issueId))
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueId, supabase])
}

/** The notification bell, live for the signed-in user. */
export function useRealtimeNotifications(userId?: string, workspaceId?: string) {
  const supabase = useSupabase()
  const invalidate = useDebouncedInvalidate(400)
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (!userId || !workspaceId) return

    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const channel = supabase.channel(`notifications:${userId}`)
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      () => invalidate(qk.notifications(workspaceId))
    )
    channelRef.current = channel
    channel.subscribe()

    return () => {
      if (channelRef.current !== channel) return
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, workspaceId, supabase])
}
