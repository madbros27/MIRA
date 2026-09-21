'use client'

import { FileQuestion } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import * as React from 'react'

import { IssueDetail, IssueDetailSkeleton } from '@/components/issues/issue-detail'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/primitives'
import { useIssueByKey } from '@/lib/queries/issues'
import { parseIssueKey } from '@/lib/utils'

/**
 * Deep-linkable issue page: `/issues/MIRA-101`. The key is resolved against
 * the active workspace, then the same detail component the dialog uses renders
 * the issue.
 */
export default function IssuePage() {
  const params = useParams<{ key: string }>()
  const rawKey = decodeURIComponent(params.key ?? '')
  const parsed = parseIssueKey(rawKey)
  const { workspaceId, workspaces } = useWorkspaceContext()

  const { data: issueId, isLoading, isError } = useIssueByKey(workspaceId, rawKey)

  if (!parsed) {
    return (
      <div className="p-4 sm:p-8">
        <EmptyState
          icon={<FileQuestion />}
          title={`“${rawKey}” is not an issue key`}
          description="Issue keys look like MIRA-101 — a project key, a dash, then the number."
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/search">Search instead</Link>
            </Button>
          }
        />
      </div>
    )
  }

  if (isLoading) return <IssueDetailSkeleton />

  if (isError || !issueId) {
    return (
      <div className="p-4 sm:p-8">
        <EmptyState
          icon={<FileQuestion />}
          title={`${parsed.key}-${parsed.number} was not found`}
          description={
            workspaces.length > 1
              ? 'It may live in another workspace — switch workspace in the sidebar — or it may have been deleted.'
              : 'It may have been deleted, or you may not have access to its project.'
          }
          action={
            <div className="flex gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link href="/projects">All projects</Link>
              </Button>
              <Button asChild variant="primary" size="sm">
                <Link href="/search">Search issues</Link>
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100dvh-theme(spacing.topbar))] flex-col">
      <IssueDetail issueId={issueId} mode="page" />
    </div>
  )
}
