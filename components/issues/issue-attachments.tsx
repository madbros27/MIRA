'use client'

import {
  Download,
  FileArchive,
  FileText,
  ImageIcon,
  Paperclip,
  Trash2,
  Upload,
} from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState, Skeleton } from '@/components/ui/primitives'
import { MAX_ATTACHMENT_BYTES } from '@/lib/constants'
import { formatRelative } from '@/lib/format'
import { can } from '@/lib/permissions'
import {
  useAttachments,
  useDeleteAttachment,
  useUploadAttachment,
} from '@/lib/queries/issue-detail'
import type { Attachment } from '@/lib/types/app'
import { cn, errorMessage, formatBytes } from '@/lib/utils'

function iconFor(mime: string | null) {
  if (!mime) return FileText
  if (mime.startsWith('image/')) return ImageIcon
  if (/zip|tar|gzip|rar|7z/.test(mime)) return FileArchive
  return FileText
}

export function IssueAttachments({
  issueId,
  projectId,
  canWrite,
}: {
  issueId: string
  projectId: string
  canWrite: boolean
}) {
  const { userId, caps } = useWorkspaceContext()
  const { data: attachments, isLoading } = useAttachments(issueId)
  const upload = useUploadAttachment(issueId, projectId)
  const remove = useDeleteAttachment(issueId)

  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = React.useState(false)
  const [pendingDelete, setPendingDelete] = React.useState<Attachment | null>(null)

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return

    for (const file of Array.from(files)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(
          `${file.name} is ${formatBytes(file.size)} — the limit is ${formatBytes(
            MAX_ATTACHMENT_BYTES
          )}.`
        )
        continue
      }
      try {
        await upload.mutateAsync({ file, userId })
        toast.success(`${file.name} attached`)
      } catch (error) {
        toast.error(errorMessage(error, `Could not upload ${file.name}`))
      }
    }

    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="space-y-3">
      {canWrite ? (
        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragOver(false)
            handleFiles(event.dataTransfer.files)
          }}
          className={cn(
            'rounded-xl border border-dashed p-4 text-center transition-colors',
            dragOver ? 'border-primary bg-primary-subtle/50' : 'border-border bg-surface/50'
          )}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            className="sr-only"
            id={`attach-${issueId}`}
            onChange={(event) => handleFiles(event.target.files)}
          />
          <Upload className="mx-auto size-5 text-muted-foreground" />
          <p className="mt-2 text-xs text-muted-foreground">
            Drop files here, or{' '}
            <label
              htmlFor={`attach-${issueId}`}
              className="cursor-pointer font-medium text-primary underline underline-offset-2"
            >
              browse
            </label>
            . Up to {formatBytes(MAX_ATTACHMENT_BYTES)} each.
          </p>
          {upload.isPending ? (
            <p className="mt-2 text-2xs font-medium text-primary">Uploading…</p>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <ul className="space-y-2">
          {[0, 1].map((i) => (
            <li key={i}>
              <Skeleton className="h-12 w-full rounded-lg" />
            </li>
          ))}
        </ul>
      ) : attachments?.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {attachments.map((attachment) => {
            const Icon = iconFor(attachment.mime_type)
            const isImage = attachment.mime_type?.startsWith('image/')

            return (
              <li key={attachment.id} className="flex items-center gap-3 bg-surface p-2.5">
                {isImage && attachment.signed_url ? (
                  // Signed URLs are short-lived and point at a private bucket,
                  // so `next/image` optimisation is skipped deliberately.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={attachment.signed_url}
                    alt={attachment.file_name}
                    className="size-10 shrink-0 rounded-lg border border-border object-cover"
                  />
                ) : (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{attachment.file_name}</p>
                  <p className="text-2xs text-muted-foreground">
                    {formatBytes(attachment.file_size)} ·{' '}
                    {formatRelative(attachment.created_at)}
                    {attachment.uploader?.full_name
                      ? ` · ${attachment.uploader.full_name}`
                      : ''}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {attachment.signed_url ? (
                    <Button
                      asChild
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Download ${attachment.file_name}`}
                    >
                      <a
                        href={attachment.signed_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={attachment.file_name}
                      >
                        <Download />
                      </a>
                    </Button>
                  ) : null}
                  {/* Uploaders manage their own files; leads can remove any. */}
                  {canWrite &&
                  (attachment.uploaded_by === userId ||
                    attachment.uploaded_by === null ||
                    can.manageProject(caps)) ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setPendingDelete(attachment)}
                      aria-label={`Delete ${attachment.file_name}`}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState
          icon={<Paperclip />}
          title="No attachments"
          description={
            canWrite
              ? 'Screenshots, logs and design exports all belong here.'
              : 'Nothing has been attached to this issue.'
          }
          compact
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => (open ? null : setPendingDelete(null))}
        title={`Delete ${pendingDelete?.file_name ?? 'this file'}?`}
        description="The file is removed from storage and cannot be recovered."
        confirmLabel="Delete file"
        destructive
        onConfirm={async () => {
          if (!pendingDelete) return
          try {
            await remove.mutateAsync(pendingDelete)
            setPendingDelete(null)
          } catch (error) {
            toast.error(errorMessage(error, 'Could not delete the file'))
          }
        }}
      />
    </div>
  )
}
