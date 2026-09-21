'use client'

import { FolderX } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'

import { ProjectNav } from './project-nav'
import { useProjectContext } from './project-provider'
import { PageHeader } from '@/components/layout/app-shell'
import { ProjectIcon } from '@/components/layout/project-icon'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Button } from '@/components/ui/button'
import { Badge, EmptyState, Skeleton } from '@/components/ui/primitives'
import { can } from '@/lib/permissions'

/**
 * Wraps every project route: renders the shared header and tab strip, and
 * handles the loading and not-found states in one place.
 */
export function ProjectPage({
  actions,
  description,
  children,
}: {
  actions?: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
}) {
  const { project, projectKey, isLoading, notFound } = useProjectContext()
  const { caps } = useWorkspaceContext()

  if (isLoading) {
    return (
      <>
        <div className="border-b border-border bg-background px-3 pt-4 sm:px-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="mt-4 flex gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-4 w-16" />
            ))}
          </div>
        </div>
        <div className="p-4">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </>
    )
  }

  if (notFound || !project) {
    return (
      <div className="p-4 sm:p-8">
        <EmptyState
          icon={<FolderX />}
          title={`No project with the key ${projectKey}`}
          description="It may have been deleted, renamed, or it belongs to a different workspace. Check the workspace switcher in the sidebar."
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/projects">All projects</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <ProjectIcon icon={project.icon} color={project.color} size="md" />
            <span className="truncate">{project.name}</span>
            <span className="shrink-0 font-mono text-xs font-medium text-muted-foreground">
              {project.key}
            </span>
            {project.is_archived ? <Badge variant="warning">Archived</Badge> : null}
          </span>
        }
        description={description ?? project.description ?? undefined}
        actions={actions}
        tabs={
          <ProjectNav projectKey={project.key} canManage={can.manageProject(caps)} />
        }
      />
      {children}
    </>
  )
}
