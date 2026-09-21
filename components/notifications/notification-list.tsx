'use client'

import {
  ArrowRightLeft,
  AtSign,
  Bell,
  Flag,
  Mail,
  MessageSquare,
  Play,
  Plus,
  UserPlus,
  X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { Avatar, EmptyState, Skeleton } from '@/components/ui/primitives'
import { NOTIFICATION_META } from '@/lib/constants'
import { formatRelative } from '@/lib/format'
import { stripMentionMarkup } from '@/lib/mentions'
import {
  useDeleteNotification,
  useMarkNotificationRead,
  type NotificationWithActor,
} from '@/lib/queries/notifications'
import type { NotificationType } from '@/lib/types/database'
import { cn } from '@/lib/utils'

const ICONS: Record<NotificationType, React.ElementType> = {
  assigned: UserPlus,
  mentioned: AtSign,
  status_changed: ArrowRightLeft,
  commented: MessageSquare,
  issue_created: Plus,
  sprint_started: Play,
  sprint_completed: Flag,
  invited: Mail,
}

/** Resolve the destination for a notification, or null when it has none. */
function hrefFor(notification: NotificationWithActor): string | null {
  const payload = (notification.payload ?? {}) as { issue_key?: string; project_key?: string }
  if (payload.issue_key) return `/issues/${payload.issue_key}`
  if (payload.project_key) return `/projects/${payload.project_key}/board`
  if (notification.project?.key) return `/projects/${notification.project.key}/board`
  return null
}

export function NotificationList({
  notifications,
  workspaceId,
  isLoading,
  onNavigate,
  dense = false,
  emptyTitle = 'You are all caught up',
  emptyDescription = 'Assignments, mentions, comments and status changes will show up here.',
}: {
  notifications: NotificationWithActor[] | undefined
  workspaceId: string
  isLoading?: boolean
  onNavigate?: () => void
  dense?: boolean
  emptyTitle?: string
  emptyDescription?: string
}) {
  const router = useRouter()
  const markRead = useMarkNotificationRead(workspaceId)
  const remove = useDeleteNotification(workspaceId)

  if (isLoading) {
    return (
      <ul className="divide-y divide-border">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="flex gap-3 p-3">
            <Skeleton className="size-8 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </li>
        ))}
      </ul>
    )
  }

  if (!notifications?.length) {
    return (
      <EmptyState
        icon={<Bell />}
        title={emptyTitle}
        description={emptyDescription}
        compact={dense}
        className={dense ? 'border-0 bg-transparent' : undefined}
      />
    )
  }

  return (
    <ul className="divide-y divide-border">
      {notifications.map((notification) => {
        const Icon = ICONS[notification.type] ?? Bell
        const meta = NOTIFICATION_META[notification.type]
        const href = hrefFor(notification)

        return (
          <li key={notification.id} className="group relative">
            <button
              type="button"
              onClick={() => {
                if (!notification.is_read) markRead.mutate({ id: notification.id })
                if (href) {
                  router.push(href)
                  onNavigate?.()
                }
              }}
              className={cn(
                'flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-muted/60',
                !notification.is_read && 'bg-primary-subtle/35'
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
                  meta?.className ?? 'bg-muted text-muted-foreground'
                )}
              >
                <Icon className="size-4" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-start gap-2">
                  <span
                    className={cn(
                      'min-w-0 flex-1 text-sm leading-snug',
                      notification.is_read ? 'text-muted-foreground' : 'font-medium'
                    )}
                  >
                    {notification.title}
                  </span>
                  {!notification.is_read ? (
                    <span
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                      aria-label="Unread"
                    />
                  ) : null}
                </span>

                {notification.body ? (
                  <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                    {stripMentionMarkup(notification.body)}
                  </span>
                ) : null}

                <span className="mt-1.5 flex items-center gap-2 text-2xs text-muted-foreground">
                  {notification.actor ? (
                    <>
                      <Avatar
                        id={notification.actor.id}
                        name={notification.actor.full_name}
                        src={notification.actor.avatar_url}
                        size="xs"
                      />
                      <span className="truncate">{notification.actor.full_name}</span>
                      <span aria-hidden>·</span>
                    </>
                  ) : null}
                  <time dateTime={notification.created_at}>
                    {formatRelative(notification.created_at)}
                  </time>
                  {notification.project ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="font-mono">{notification.project.key}</span>
                    </>
                  ) : null}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => remove.mutate(notification.id)}
              className="absolute right-2 top-2 hidden size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground group-hover:flex"
              aria-label="Dismiss notification"
            >
              <X className="size-3.5" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
