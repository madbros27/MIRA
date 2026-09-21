'use client'

import { History, MessageSquare, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { Avatar, EmptyState, Skeleton } from '@/components/ui/primitives'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Markdown } from '@/components/ui/markdown'
import { MarkdownEditor } from '@/components/ui/markdown-editor'
import { formatDateTime, formatRelative } from '@/lib/format'
import { canDeleteComment, canEditComment } from '@/lib/permissions'
import {
  useAddComment,
  useCommentRevisions,
  useComments,
  useDeleteComment,
  useUpdateComment,
} from '@/lib/queries/issue-detail'
import { useMembers } from '@/lib/queries/workspaces'
import type { Comment } from '@/lib/types/app'
import { cn, displayName, errorMessage } from '@/lib/utils'

export function IssueComments({
  issueId,
  canWrite,
}: {
  issueId: string
  canWrite: boolean
}) {
  const { userId, workspaceId, caps } = useWorkspaceContext()
  const { data: comments, isLoading } = useComments(issueId)
  const { data: members } = useMembers(workspaceId)
  const add = useAddComment(issueId)

  const [draft, setDraft] = React.useState('')

  const people = React.useMemo(
    () => (members ?? []).flatMap((member) => (member.profile ? [member.profile] : [])),
    [members]
  )

  async function submit() {
    if (!draft.trim()) return
    try {
      await add.mutateAsync({ body: draft.trim(), authorId: userId })
      setDraft('')
    } catch (error) {
      toast.error(errorMessage(error, 'Could not post the comment'))
    }
  }

  return (
    <div className="space-y-4">
      {canWrite ? (
        <div className="space-y-2">
          <MarkdownEditor
            value={draft}
            onChange={setDraft}
            people={people}
            placeholder="Add a comment. Type @ to mention a teammate."
            rows={3}
            onSubmitShortcut={submit}
          />
          {draft.trim() ? (
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDraft('')}>
                Discard
              </Button>
              <Button variant="primary" size="sm" onClick={submit} loading={add.isPending}>
                Comment
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <ul className="space-y-4">
          {[0, 1].map((i) => (
            <li key={i} className="flex gap-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </li>
          ))}
        </ul>
      ) : comments?.length ? (
        <ul className="space-y-4">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              issueId={issueId}
              people={people}
              canEdit={canEditComment(comment.author_id, userId)}
              canDelete={canDeleteComment(caps, comment.author_id, userId)}
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<MessageSquare />}
          title="No comments yet"
          description={
            canWrite
              ? 'Start the conversation — mention a teammate with @ to pull them in.'
              : 'Nobody has commented on this issue.'
          }
          compact
        />
      )}
    </div>
  )
}

function CommentItem({
  comment,
  issueId,
  people,
  canEdit,
  canDelete,
}: {
  comment: Comment
  issueId: string
  people: { id: string; full_name: string | null; avatar_url: string | null; email: string }[]
  canEdit: boolean
  canDelete: boolean
}) {
  const update = useUpdateComment(issueId)
  const remove = useDeleteComment(issueId)
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(comment.body)
  const [confirming, setConfirming] = React.useState(false)
  const [showHistory, setShowHistory] = React.useState(false)
  const revisions = useCommentRevisions(comment.id, showHistory)

  const optimistic = comment.id.startsWith('optimistic-')

  async function save() {
    if (!draft.trim()) return
    try {
      await update.mutateAsync({ id: comment.id, body: draft.trim() })
      setEditing(false)
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save the comment'))
    }
  }

  return (
    <li className={cn('flex gap-3', optimistic && 'opacity-60')}>
      <Avatar
        id={comment.author?.id ?? comment.author_id ?? 'unknown'}
        name={comment.author?.full_name ?? comment.author?.email}
        src={comment.author?.avatar_url}
        size="md"
        className="mt-0.5"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {comment.author ? displayName(comment.author) : 'You'}
          </span>
          <time
            className="text-2xs text-muted-foreground"
            dateTime={comment.created_at}
            title={formatDateTime(comment.created_at)}
          >
            {formatRelative(comment.created_at)}
          </time>
          {comment.is_edited ? (
            <button
              type="button"
              onClick={() => setShowHistory((prev) => !prev)}
              className="inline-flex items-center gap-1 text-2xs text-muted-foreground underline decoration-dotted hover:text-foreground"
            >
              <History className="size-3" />
              edited
            </button>
          ) : null}

          {(canEdit || canDelete) && !optimistic ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="ml-auto inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Comment actions"
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit ? (
                  <DropdownMenuItem
                    onSelect={() => {
                      setDraft(comment.body)
                      setEditing(true)
                    }}
                  >
                    <Pencil />
                    Edit
                  </DropdownMenuItem>
                ) : null}
                {canDelete ? (
                  <DropdownMenuItem destructive onSelect={() => setConfirming(true)}>
                    <Trash2 />
                    Delete
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        {editing ? (
          <div className="mt-2 space-y-2">
            <MarkdownEditor
              value={draft}
              onChange={setDraft}
              people={people}
              rows={3}
              autoFocus
              onSubmitShortcut={save}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={save} loading={update.isPending}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-1 rounded-xl rounded-tl-sm border border-border bg-surface-raised px-3 py-2">
            <Markdown>{comment.body}</Markdown>
          </div>
        )}

        {showHistory ? (
          <div className="mt-2 space-y-2 rounded-lg border border-dashed border-border p-2.5">
            <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              Edit history
            </p>
            {revisions.isLoading ? (
              <Skeleton className="h-3 w-40" />
            ) : revisions.data?.length ? (
              <ul className="space-y-2">
                {revisions.data.map((revision) => (
                  <li key={revision.id} className="text-xs">
                    <span className="text-muted-foreground">
                      {formatDateTime(revision.created_at)}
                    </span>
                    <div className="mt-1 text-muted-foreground line-through decoration-muted-foreground/40">
                      <Markdown>{revision.body}</Markdown>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No earlier versions recorded.</p>
            )}
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this comment?"
        description="The comment and its edit history are removed permanently."
        confirmLabel="Delete comment"
        destructive
        onConfirm={async () => {
          try {
            await remove.mutateAsync(comment.id)
          } catch (error) {
            toast.error(errorMessage(error, 'Could not delete the comment'))
          }
        }}
      />
    </li>
  )
}
