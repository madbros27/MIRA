'use client'

import * as React from 'react'

import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { useProjects } from '@/lib/queries/projects'
import type { ProjectWithMeta } from '@/lib/types/app'

type ProjectContextValue = {
  project: ProjectWithMeta | null
  projectId: string | undefined
  projectKey: string
  isLoading: boolean
  notFound: boolean
}

const ProjectContext = React.createContext<ProjectContextValue | null>(null)

/**
 * Resolves the `[key]` route segment (e.g. `MIRA`) to a project inside the
 * active workspace, so the project pages never repeat that lookup.
 */
export function ProjectProvider({
  projectKey,
  children,
}: {
  projectKey: string
  children: React.ReactNode
}) {
  const { workspaceId } = useWorkspaceContext()
  // Archived projects still need to be reachable by URL.
  const { data: projects, isLoading } = useProjects(workspaceId, true)

  const value = React.useMemo<ProjectContextValue>(() => {
    const normalised = projectKey.toUpperCase()
    const project = projects?.find((item) => item.key === normalised) ?? null
    return {
      project,
      projectId: project?.id,
      projectKey: normalised,
      isLoading,
      notFound: !isLoading && !project,
    }
  }, [isLoading, projectKey, projects])

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}

export function useProjectContext() {
  const context = React.useContext(ProjectContext)
  if (!context) {
    throw new Error('useProjectContext must be used inside <ProjectProvider>')
  }
  return context
}
