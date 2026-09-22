'use client'

import { CheckCheck } from 'lucide-react'
import * as React from 'react'

import { PageHeader } from '@/components/layout/app-shell'
import { NotificationList } from '@/components/notifications/notification-list'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/primitives'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls'
import { useMarkAllRead, useNotifications } from '@/lib/queries/notifications'

export default function NotificationsPage() {
  const { workspaceId } = useWorkspaceContext()
  const { data, isLoading } = useNotifications(workspaceId)
  const markAll = useMarkAllRead(workspaceId)

  const unread = (data ?? []).filter((notification) => !notification.is_read)
  const mentions = (data ?? []).filter((notification) => notification.type === 'mentioned')
  const assigned = (data ?? []).filter((notification) => notification.type === 'assigned')

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Assignments, mentions, comments and status changes on issues you watch."
        actions={
          unread.length ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => markAll.mutate()}
              loading={markAll.isPending}
            >
              <CheckCheck />
              Mark all read
            </Button>
          ) : null
        }
      />

      <div className="p-3 sm:p-4">
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">
              Unread
              {unread.length ? (
                <Badge variant="primary" className="ml-1">
                  {unread.length}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="mentions">Mentions</TabsTrigger>
            <TabsTrigger value="assigned">Assigned</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <Card className="overflow-hidden">
              <NotificationList
                notifications={data}
                workspaceId={workspaceId}
                isLoading={isLoading}
              />
            </Card>
          </TabsContent>
          <TabsContent value="unread">
            <Card className="overflow-hidden">
              <NotificationList
                notifications={unread}
                workspaceId={workspaceId}
                isLoading={isLoading}
                emptyTitle="Nothing unread"
                emptyDescription="Everything here has been read. New activity will appear at the top."
              />
            </Card>
          </TabsContent>
          <TabsContent value="mentions">
            <Card className="overflow-hidden">
              <NotificationList
                notifications={mentions}
                workspaceId={workspaceId}
                isLoading={isLoading}
                emptyTitle="No mentions"
                emptyDescription="When someone writes @your-name in a comment, it shows up here."
              />
            </Card>
          </TabsContent>
          <TabsContent value="assigned">
            <Card className="overflow-hidden">
              <NotificationList
                notifications={assigned}
                workspaceId={workspaceId}
                isLoading={isLoading}
                emptyTitle="Nothing assigned recently"
                emptyDescription="Issues assigned to you will be listed here."
              />
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
