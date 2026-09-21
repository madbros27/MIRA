'use client'

/**
 * Project membership — the table that decides who can reach a project at all.
 *
 * Belonging to the workspace grants nothing here. A Manager or Member sees a
 * project only if they hold a row in `project_members` (or the `project.view_all`
 * capability, which Owners and Workspace Admins have). This is the rule that
 * keeps one Manager out of another Manager's project.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { qk } from './keys'
import { unwrap, useSupabase } from './shared'
import type { ProjectMember } from '@/lib/types/app'
import type { ProjectRole } from '@/lib/types/database'

const PROJECT_MEMBER_SELECT = `
  id,
  project_id,
  user_id,
  project_role,
  added_at,
  profile:profiles!project_members_user_id_fkey(id,full_name,avatar_url,email)
`.replace(/\s+/g, '')

export function useProjectMembers(projectId?: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: qk.projectMembers(projectId ?? 'none'),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const result = await supabase
        .from('project_members')
        .select(PROJECT_MEMBER_SELECT)
        .eq('project_id', projectId!)
      const rows = unwrap(result) as unknown as ProjectMember[]
      return rows.sort((a, b) =>
        (a.profile?.full_name ?? a.profile?.email ?? '').localeCompare(
          b.profile?.full_name ?? b.profile?.email ?? ''
        )
      )
    },
    staleTime: 30_000,
  })
}

export function useAddProjectMember(projectId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({
      userId,
      projectRole = 'member',
    }: {
      userId: string
      projectRole?: ProjectRole
    }) => {
      const result = await supabase
        .from('project_members')
        .insert({ project_id: projectId, user_id: userId, project_role: projectRole })
        .select(PROJECT_MEMBER_SELECT)
        .single()
      return unwrap(result) as unknown as ProjectMember
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.projectMembers(projectId) }),
  })
}

export function useSetProjectRole(projectId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({
      userId,
      projectRole,
    }: {
      userId: string
      projectRole: ProjectRole
    }) => {
      const result = await supabase
        .from('project_members')
        .update({ project_role: projectRole })
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .select(PROJECT_MEMBER_SELECT)
        .single()
      return unwrap(result) as unknown as ProjectMember
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.projectMembers(projectId) }),
  })
}

export function useRemoveProjectMember(projectId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('project_members')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.projectMembers(projectId) })
      // They may have just lost sight of the project entirely.
      client.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
