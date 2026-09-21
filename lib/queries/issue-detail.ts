'use client'

/** Comments, attachments, activity and watchers — everything on issue detail. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { qk } from './keys'
import {
  ACTIVITY_SELECT,
  ATTACHMENT_SELECT,
  COMMENT_SELECT,
  unwrap,
  useSupabase,
} from './shared'
import { ATTACHMENT_BUCKET } from '@/lib/constants'
import type { Activity, Attachment, Comment, Watcher } from '@/lib/types/app'
import type { CommentRevisionRow } from '@/lib/types/database'

/* -------------------------------------------------------------------------- */
/* Comments                                                                   */
/* -------------------------------------------------------------------------- */

type RawComment = Omit<Comment, 'revision_count'> & {
  comment_revisions?: { id: string }[] | null
}

function mapComment(raw: RawComment): Comment {
  const { comment_revisions, ...rest } = raw
  return { ...rest, revision_count: comment_revisions?.length ?? 0 }
}

export function useComments(issueId?: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: qk.comments(issueId ?? 'none'),
    enabled: Boolean(issueId),
    queryFn: async () => {
      const result = await supabase
        .from('comments')
        .select(COMMENT_SELECT)
        .eq('issue_id', issueId!)
        .order('created_at')
      const rows = unwrap(result) as unknown as RawComment[]
      return rows.map(mapComment)
    },
  })
}

export function useAddComment(issueId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({ body, authorId }: { body: string; authorId: string }) => {
      const result = await supabase
        .from('comments')
        .insert({ issue_id: issueId, author_id: authorId, body })
        .select(COMMENT_SELECT)
        .single()
      return mapComment(unwrap(result) as unknown as RawComment)
    },
    onMutate: async ({ body, authorId }) => {
      const key = qk.comments(issueId)
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<Comment[]>(key)

      // Optimistic bubble, replaced by the real row on success.
      const optimistic: Comment = {
        id: `optimistic-${Date.now()}`,
        issue_id: issueId,
        author_id: authorId,
        body,
        is_edited: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        author: null,
        revision_count: 0,
      }
      client.setQueryData(key, [...(previous ?? []), optimistic])
      return { previous, key }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(context.key, context.previous)
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.comments(issueId) })
      client.invalidateQueries({ queryKey: qk.activity(issueId) })
      client.invalidateQueries({ queryKey: qk.watchers(issueId) })
    },
  })
}

export function useUpdateComment(issueId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const result = await supabase
        .from('comments')
        .update({ body })
        .eq('id', id)
        .select(COMMENT_SELECT)
        .single()
      return mapComment(unwrap(result) as unknown as RawComment)
    },
    onSettled: () => client.invalidateQueries({ queryKey: qk.comments(issueId) }),
  })
}

export function useDeleteComment(issueId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase.from('comments').delete().eq('id', commentId)
      if (error) throw error
      return commentId
    },
    onMutate: async (commentId) => {
      const key = qk.comments(issueId)
      const previous = client.getQueryData<Comment[]>(key)
      client.setQueryData(key, (old?: Comment[]) => old?.filter((c) => c.id !== commentId))
      return { previous, key }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(context.key, context.previous)
    },
    onSettled: () => client.invalidateQueries({ queryKey: qk.comments(issueId) }),
  })
}

export function useCommentRevisions(commentId?: string, enabled = false) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: qk.commentRevisions(commentId ?? 'none'),
    enabled: Boolean(commentId) && enabled,
    queryFn: async () => {
      const result = await supabase
        .from('comment_revisions')
        .select('*')
        .eq('comment_id', commentId!)
        .order('created_at', { ascending: false })
      return unwrap(result) as CommentRevisionRow[]
    },
  })
}

/* -------------------------------------------------------------------------- */
/* Activity                                                                   */
/* -------------------------------------------------------------------------- */

export function useActivity(issueId?: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: qk.activity(issueId ?? 'none'),
    enabled: Boolean(issueId),
    queryFn: async () => {
      const result = await supabase
        .from('activity_log')
        .select(ACTIVITY_SELECT)
        .eq('issue_id', issueId!)
        .order('created_at', { ascending: false })
        .limit(200)
      return unwrap(result) as unknown as Activity[]
    },
  })
}

/* -------------------------------------------------------------------------- */
/* Attachments                                                                */
/* -------------------------------------------------------------------------- */

export function useAttachments(issueId?: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: qk.attachments(issueId ?? 'none'),
    enabled: Boolean(issueId),
    queryFn: async () => {
      const result = await supabase
        .from('attachments')
        .select(ATTACHMENT_SELECT)
        .eq('issue_id', issueId!)
        .order('created_at', { ascending: false })
      const rows = unwrap(result) as unknown as Attachment[]
      if (!rows.length) return rows

      // The bucket is private, so hand the UI short-lived signed URLs.
      const { data } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrls(
          rows.map((row) => row.storage_path),
          60 * 60
        )

      const urls = new Map((data ?? []).map((item) => [item.path, item.signedUrl]))
      return rows.map((row) => ({
        ...row,
        signed_url: urls.get(row.storage_path) ?? null,
      }))
    },
  })
}

export function useUploadAttachment(issueId: string, projectId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({ file, userId }: { file: File; userId: string }) => {
      // Path shape is what the storage RLS policy reads: {project}/{issue}/...
      const safeName = file.name.replace(/[^\w.\-() ]+/g, '_').slice(-120)
      const path = `${projectId}/${issueId}/${crypto.randomUUID()}-${safeName}`

      const { error: uploadError } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (uploadError) throw uploadError

      const result = await supabase
        .from('attachments')
        .insert({
          issue_id: issueId,
          storage_path: path,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || null,
          uploaded_by: userId,
        })
        .select(ATTACHMENT_SELECT)
        .single()

      if (result.error) {
        // Do not leave an orphaned object behind if the metadata row fails.
        await supabase.storage.from(ATTACHMENT_BUCKET).remove([path])
        throw result.error
      }

      return result.data as unknown as Attachment
    },
    onSettled: () => client.invalidateQueries({ queryKey: qk.attachments(issueId) }),
  })
}

export function useDeleteAttachment(issueId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (attachment: Attachment) => {
      const { error } = await supabase.from('attachments').delete().eq('id', attachment.id)
      if (error) throw error
      await supabase.storage.from(ATTACHMENT_BUCKET).remove([attachment.storage_path])
      return attachment.id
    },
    onSettled: () => client.invalidateQueries({ queryKey: qk.attachments(issueId) }),
  })
}

/* -------------------------------------------------------------------------- */
/* Watchers                                                                   */
/* -------------------------------------------------------------------------- */

export function useWatchers(issueId?: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: qk.watchers(issueId ?? 'none'),
    enabled: Boolean(issueId),
    queryFn: async () => {
      const result = await supabase
        .from('watchers')
        .select(
          'issue_id,user_id,profile:profiles!watchers_user_id_fkey(id,full_name,avatar_url,email)'
        )
        .eq('issue_id', issueId!)
      return unwrap(result) as unknown as Watcher[]
    },
  })
}

export function useToggleWatch(issueId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, watching }: { userId: string; watching: boolean }) => {
      if (watching) {
        const { error } = await supabase
          .from('watchers')
          .delete()
          .eq('issue_id', issueId)
          .eq('user_id', userId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('watchers')
          .insert({ issue_id: issueId, user_id: userId })
        if (error) throw error
      }
      return !watching
    },
    onSettled: () => client.invalidateQueries({ queryKey: qk.watchers(issueId) }),
  })
}
