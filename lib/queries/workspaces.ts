'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { qk } from './keys'
import {
  INVITE_SELECT,
  MEMBER_SELECT,
  POSITION_SELECT,
  unwrap,
  useSupabase,
} from './shared'
import type {
  Invite,
  Member,
  Position,
  Profile,
  Workspace,
  WorkspaceWithAccess,
} from '@/lib/types/app'
import type { Capability } from '@/lib/permissions/capabilities'
import type { MemberStatus, WorkspaceRole } from '@/lib/types/database'

/* -------------------------------------------------------------------------- */
/* Profile                                                                    */
/* -------------------------------------------------------------------------- */

export function useProfile() {
  const supabase = useSupabase()
  return useQuery({
    queryKey: qk.profile,
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return null
      const result = await supabase.from('profiles').select('*').eq('id', user.id).single()
      return unwrap(result) as Profile
    },
    staleTime: 60_000,
  })
}

export function useUpdateProfile() {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (patch: Partial<Profile> & { id: string }) => {
      const { id, ...rest } = patch
      const result = await supabase
        .from('profiles')
        .update(rest)
        .eq('id', id)
        .select('*')
        .single()
      return unwrap(result) as Profile
    },
    onSuccess: (profile) => {
      client.setQueryData(qk.profile, profile)
      client.invalidateQueries({ queryKey: ['members'] })
    },
  })
}

/* -------------------------------------------------------------------------- */
/* Workspaces                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The workspaces this person can enter, each with the capabilities their
 * position grants. Ownership is fetched alongside because an Owner's
 * authority does not come from a position — they hold everything by virtue
 * of owning the tenant.
 */
export function useWorkspaces(userId?: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: qk.workspaces,
    enabled: Boolean(userId),
    queryFn: async () => {
      const [membershipResult, ownerResult] = await Promise.all([
        supabase
          .from('workspace_members')
          .select(
            `role, status,
             workspace:workspaces!workspace_members_workspace_id_fkey(*),
             position:positions(id, name, slug,
               permissions:position_permissions(capability, allowed))`
          )
          .eq('user_id', userId!)
          .eq('status', 'active'),
        supabase.from('workspace_owners').select('workspace_id, is_primary').eq('user_id', userId!),
      ])

      const rows = unwrap(membershipResult) as unknown as {
        role: WorkspaceRole
        workspace: Workspace | null
        position: {
          id: string
          name: string
          slug: string | null
          permissions: { capability: string; allowed: boolean }[] | null
        } | null
      }[]

      const owned = new Set(
        ((ownerResult.data ?? []) as { workspace_id: string }[]).map(
          (row) => row.workspace_id
        )
      )

      return rows
        .filter((row) => row.workspace)
        .map((row) => {
          const workspace = row.workspace as Workspace
          return {
            ...workspace,
            role: row.role,
            isOwner: owned.has(workspace.id),
            position: row.position
              ? { id: row.position.id, name: row.position.name, slug: row.position.slug }
              : null,
            capabilities: (row.position?.permissions ?? [])
              .filter((permission) => permission.allowed)
              .map((permission) => permission.capability),
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name)) as WorkspaceWithAccess[]
    },
    staleTime: 60_000,
  })
}

export function useCreateWorkspace() {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (input: { name: string }) => {
      const result = await supabase.rpc('create_workspace', { p_name: input.name })
      return unwrap(result) as unknown as Workspace
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.workspaces }),
  })
}

export function useUpdateWorkspace() {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Workspace> & { id: string }) => {
      const result = await supabase
        .from('workspaces')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single()
      return unwrap(result) as Workspace
    },
    onSuccess: (workspace) => {
      client.invalidateQueries({ queryKey: qk.workspaces })
      client.invalidateQueries({ queryKey: qk.workspace(workspace.id) })
    },
  })
}

/* -------------------------------------------------------------------------- */
/* Members                                                                    */
/* -------------------------------------------------------------------------- */

export function useMembers(workspaceId?: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: qk.members(workspaceId ?? 'none'),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const result = await supabase
        .from('workspace_members')
        .select(MEMBER_SELECT)
        .eq('workspace_id', workspaceId!)
      const rows = unwrap(result) as unknown as Member[]
      return rows.sort((a, b) =>
        (a.profile?.full_name ?? a.profile?.email ?? '').localeCompare(
          b.profile?.full_name ?? b.profile?.email ?? ''
        )
      )
    },
    staleTime: 60_000,
  })
}

/**
 * Move a member to a different position. This is the only supported way to
 * change what somebody can do — there is no free-floating role any more.
 */
export function useAssignPosition(workspaceId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({
      userId,
      positionId,
    }: {
      userId: string
      positionId: string | null
    }) => {
      const result = await supabase
        .from('workspace_members')
        .update({ position_id: positionId })
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .select(MEMBER_SELECT)
        .single()
      return unwrap(result) as unknown as Member
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.members(workspaceId) })
      // The viewer may have just changed their own capabilities.
      client.invalidateQueries({ queryKey: qk.workspaces })
    },
  })
}

/** Set or clear who a member reports to, for the org chart. */
export function useSetReportsTo(workspaceId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({
      userId,
      reportsTo,
    }: {
      userId: string
      reportsTo: string | null
    }) => {
      const result = await supabase
        .from('workspace_members')
        .update({ reports_to_user_id: reportsTo })
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .select(MEMBER_SELECT)
        .single()
      return unwrap(result) as unknown as Member
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.members(workspaceId) }),
  })
}

/** Suspend or restore a seat without removing the person from the workspace. */
export function useSetMemberStatus(workspaceId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: MemberStatus }) => {
      const result = await supabase
        .from('workspace_members')
        .update({ status })
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .select(MEMBER_SELECT)
        .single()
      return unwrap(result) as unknown as Member
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.members(workspaceId) }),
  })
}

/* -------------------------------------------------------------------------- */
/* Positions & capabilities                                                   */
/* -------------------------------------------------------------------------- */

export function usePositions(workspaceId?: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: qk.positions(workspaceId ?? 'none'),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const [positionsResult, membersResult] = await Promise.all([
        supabase
          .from('positions')
          .select(POSITION_SELECT)
          .eq('workspace_id', workspaceId!)
          .order('is_system_default', { ascending: false })
          .order('created_at'),
        supabase
          .from('workspace_members')
          .select('position_id')
          .eq('workspace_id', workspaceId!),
      ])

      const rows = unwrap(positionsResult) as unknown as (Position & {
        permissions: { capability: string; allowed: boolean }[] | null
      })[]

      const counts = new Map<string, number>()
      for (const row of (membersResult.data ?? []) as { position_id: string | null }[]) {
        if (!row.position_id) continue
        counts.set(row.position_id, (counts.get(row.position_id) ?? 0) + 1)
      }

      return rows.map((row) => ({
        ...row,
        capabilities: (row.permissions ?? [])
          .filter((permission) => permission.allowed)
          .map((permission) => permission.capability as Capability),
        member_count: counts.get(row.id) ?? 0,
      })) as Position[]
    },
    staleTime: 30_000,
  })
}

export function useCreatePosition(workspaceId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      name: string
      description?: string
      capabilities: Capability[]
    }) => {
      const created = await supabase
        .from('positions')
        .insert({
          workspace_id: workspaceId,
          name: input.name,
          description: input.description ?? null,
          is_system_default: false,
        })
        .select('*')
        .single()

      const position = unwrap(created) as Position

      if (input.capabilities.length) {
        const { error } = await supabase.from('position_permissions').insert(
          input.capabilities.map((capability) => ({
            position_id: position.id,
            capability,
            allowed: true,
          }))
        )
        if (error) throw error
      }

      return position
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.positions(workspaceId) }),
  })
}

/**
 * Replace a position's capability set.
 *
 * Delete-then-insert rather than a diff: the list is at most a couple of
 * dozen rows, and a wholesale replace cannot leave a stale grant behind.
 */
export function useSetPositionCapabilities(workspaceId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({
      positionId,
      capabilities,
    }: {
      positionId: string
      capabilities: Capability[]
    }) => {
      const { error: deleteError } = await supabase
        .from('position_permissions')
        .delete()
        .eq('position_id', positionId)
      if (deleteError) throw deleteError

      if (capabilities.length) {
        const { error } = await supabase.from('position_permissions').insert(
          capabilities.map((capability) => ({
            position_id: positionId,
            capability,
            allowed: true,
          }))
        )
        if (error) throw error
      }
      return capabilities
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.positions(workspaceId) })
      client.invalidateQueries({ queryKey: qk.workspaces })
    },
  })
}

export function useUpdatePosition(workspaceId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string
      name?: string
      description?: string | null
    }) => {
      const result = await supabase
        .from('positions')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single()
      return unwrap(result) as Position
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.positions(workspaceId) }),
  })
}

export function useDeletePosition(workspaceId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (positionId: string) => {
      const { error } = await supabase.from('positions').delete().eq('id', positionId)
      if (error) throw error
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.positions(workspaceId) })
      client.invalidateQueries({ queryKey: qk.members(workspaceId) })
    },
  })
}

export function useRemoveMember(workspaceId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('workspace_members')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
      if (error) throw error
      return userId
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.members(workspaceId) }),
  })
}

/* -------------------------------------------------------------------------- */
/* Invites                                                                    */
/* -------------------------------------------------------------------------- */

export function useInvites(workspaceId?: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: qk.invites(workspaceId ?? 'none'),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const result = await supabase
        .from('workspace_invites')
        .select(INVITE_SELECT)
        .eq('workspace_id', workspaceId!)
        .order('created_at', { ascending: false })
      return unwrap(result) as unknown as Invite[]
    },
  })
}

/**
 * Invites go through a route handler: the email is sent with the service-role
 * key, which must never reach the browser.
 */
export function useInviteMember(workspaceId: string) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      email: string
      positionId: string
      fullName?: string
      createTemporaryPassword?: boolean
    }) => {
      const response = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, ...input }),
      })
      const payload = (await response.json()) as {
        ok?: boolean
        error?: string
        inviteUrl?: string
        emailed?: boolean
        temporaryPasswordCreated?: boolean
        mailtoUrl?: string
      }
      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? 'Could not send the invitation')
      }
      return payload
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.invites(workspaceId) })
      client.invalidateQueries({ queryKey: qk.members(workspaceId) })
    },
  })
}

export function useRevokeInvite(workspaceId: string) {
  const supabase = useSupabase()
  const client = useQueryClient()

  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase
        .from('workspace_invites')
        .update({ status: 'revoked' })
        .eq('id', inviteId)
      if (error) throw error
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.invites(workspaceId) }),
  })
}
