'use client'

import { Bell, CheckCheck } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'

import { NotificationList } from '@/components/notifications/notification-list'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/menu'
import { Button } from '@/components/ui/button'
import { useNotifications } from '@/lib/queries/notifications'
import { useMarkAllRead } from '@/lib/queries/notifications'
import { useRealtimeNotifications } from '@/lib/queries/realtime'
import { cn } from '@/lib/utils'

export function NotificationBell() {
  const { workspaceId, userId } = useWorkspaceContext()
  const [open, setOpen] = React.useState(false)
  const { data, isLoading } = useNotifications(workspaceId)
  const markAll = useMarkAllRead(workspaceId)

  useRealtimeNotifications(userId, workspaceId)

  const unread = data?.filter((n) => !n.is_read).length ?? 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        >
          <Bell className="size-5 md:size-4" />
          {unread ? (
            <span
              className={cn(
                'absolute right-1.5 top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.5625rem] font-bold leading-4 text-destructive-foreground'
              )}
            >
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))]">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          {unread ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => markAll.mutate()}
              loading={markAll.isPending}
            >
              <CheckCheck />
              Mark all read
            </Button>
          ) : null}
        </div>

        <div className="max-h-[min(28rem,60vh)] overflow-y-auto">
          <NotificationList
            notifications={data?.slice(0, 15)}
            workspaceId={workspaceId}
            isLoading={isLoading}
            onNavigate={() => setOpen(false)}
            dense
          />
        </div>

        <div className="border-t border-border p-1.5">
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-2 py-1.5 text-center text-xs font-medium text-primary transition-colors hover:bg-muted"
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
