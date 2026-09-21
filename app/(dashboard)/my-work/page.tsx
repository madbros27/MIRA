'use client'

import { CheckCircle2, Eye, Inbox, MessageSquare } from 'lucide-react'
import * as React from 'react'

import { PageHeader } from '@/components/layout/app-shell'
import { IssueRow } from '@/components/issues/issue-card'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls'
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { isOverdue } from '@/lib/format'
import { useWorkspaceIssues } from '@/lib/queries/issues'
import { PRIORITY_WEIGHT } from '@/lib/constants'
import { useUiStore } from '@/lib/store/ui-store'
import type { IssueSummary } from '@/lib/types/app'
import { sum } from '@/lib/utils'

export default function MyWorkPage() {
  const { workspaceId, userId } = useWorkspaceContext()
  const { data: issues, isLoading } = useWorkspaceIssues(workspaceId)
  const openIssueDialog = useUiStore((state) => state.openIssueDialog)
  const openCreateIssue = useUiStore((state) => state.openCreateIssue)

  const buckets = React.useMemo(() => {
    const all = issues ?? []
    const mine = all.filter((issue) => issue.assignee_id === userId)
    const open = mine.filter((issue) => issue.status?.category !== 'done')

    const byPriorityThenDue = (a: IssueSummary, b: IssueSummary) => {
      const overdueDiff = Number(isOverdue(b.due_date)) - Number(isOverdue(a.due_date))
      if (overdueDiff) return overdueDiff
      const priorityDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
      if (priorityDiff) return priorityDiff
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1
      return b.updated_at.localeCompare(a.updated_at)
    }

    return {
      open: open.slice().sort(byPriorityThenDue),
      inProgress: open.filter((issue) => issue.status?.category === 'in_progress'),
      overdue: open.filter((issue) => isOverdue(issue.due_date)),
      done: mine
        .filter((issue) => issue.status?.category === 'done')
        .sort((a, b) => (b.resolved_at ?? '').localeCompare(a.resolved_at ?? ''))
        .slice(0, 50),
      reported: all
        .filter((issue) => issue.reporter_id === userId && issue.assignee_id !== userId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 50),
    }
  }, [issues, userId])

  return (
    <>
      <PageHeader
        title="My work"
        description={
          isLoading
            ? undefined
            : `${buckets.open.length} open · ${sum(
                buckets.open.map((issue) => issue.story_points)
              )} points · ${buckets.overdue.length} overdue`
        }
        actions={
          <Button variant="primary" size="sm" onClick={() => openCreateIssue()}>
            Create issue
          </Button>
        }
      />

      <div className="p-3 sm:p-4">
        <Tabs defaultValue="open">
          <TabsList>
            <TabsTrigger value="open">
              Open
              {buckets.open.length ? (
                <Badge variant="neutral" className="ml-1">
                  {buckets.open.length}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="progress">
              In progress
              {buckets.inProgress.length ? (
                <Badge variant="info" className="ml-1">
                  {buckets.inProgress.length}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="reported">
              <Eye className="hidden sm:block" />
              Reported by me
            </TabsTrigger>
            <TabsTrigger value="done">
              <CheckCircle2 className="hidden sm:block" />
              Done
            </TabsTrigger>
          </TabsList>

          <TabsContent value="open">
            <IssueList
              issues={buckets.open}
              isLoading={isLoading}
              onOpen={openIssueDialog}
              emptyTitle="Nothing assigned to you"
              emptyDescription="Your queue is clear. Pick something up from a board or the backlog."
            />
          </TabsContent>
          <TabsContent value="progress">
            <IssueList
              issues={buckets.inProgress}
              isLoading={isLoading}
              onOpen={openIssueDialog}
              emptyTitle="Nothing in progress"
              emptyDescription="Move an issue into an in-progress column to see it here."
            />
          </TabsContent>
          <TabsContent value="reported">
            <IssueList
              issues={buckets.reported}
              isLoading={isLoading}
              onOpen={openIssueDialog}
              emptyTitle="You have not reported anything"
              emptyDescription="Issues you raise for other people to pick up appear here."
              icon={<MessageSquare />}
            />
          </TabsContent>
          <TabsContent value="done">
            <IssueList
              issues={buckets.done}
              isLoading={isLoading}
              onOpen={openIssueDialog}
              emptyTitle="Nothing completed yet"
              emptyDescription="Issues you finish will be listed here, newest first."
              icon={<CheckCircle2 />}
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}

function IssueList({
  issues,
  isLoading,
  onOpen,
  emptyTitle,
  emptyDescription,
  icon,
}: {
  issues: IssueSummary[]
  isLoading?: boolean
  onOpen: (issueId: string) => void
  emptyTitle: string
  emptyDescription: string
  icon?: React.ReactNode
}) {
  if (isLoading) {
    return (
      <div className="space-y-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-9 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (!issues.length) {
    return (
      <EmptyState
        icon={icon ?? <Inbox />}
        title={emptyTitle}
        description={emptyDescription}
      />
    )
  }

  return (
    <Card className="overflow-hidden">
      {issues.map((issue) => (
        <IssueRow key={issue.id} issue={issue} onOpen={onOpen} showProject />
      ))}
    </Card>
  )
}
