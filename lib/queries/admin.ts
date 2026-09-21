'use client'

/**
 * Data layer for the System Administrator portal.
 *
 * Reads go straight to Postgres through the admin RPCs — every one of them
 * re-checks `is_platform_admin()` server-side, so a tampered client gets an
 * `insufficient_privilege` error rather than data.
 *
 * The two operations that need the service-role key — minting an auth user
 * for a new Owner, and triggering a password reset — go through API routes
 * instead, because that key must never reach the browser.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { unwrap, useSupabase } from './shared'
import type {
  AdminOwner,
  AdminUserRow,
  AdminWorkspaceDetail,
  AdminWorkspaceRow,
  AuditEntry,
  PlatformStats,
} from '@/lib/types/admin'
import type { WorkspaceStatus } from '@/lib/types/database'
import { errorMessage } from '@/lib/utils'

export const ak = {
  stats: ['admin', 'stats'] as const,
  workspaces: (search: string, status: string) =>
    ['admin', 'workspaces', search, status] as const,
  workspace: (id: string) => ['admin', 'workspace', id] as const,
  owners: (search: string) => ['admin', 'owners', search] as const,
  users: (search: string) => ['admin', 'users', search] as const,
  audit: (filters: Record<string, string>) => ['admin', 'audit', filters] as const,
  admins: ['admin', 'admins'] as const,
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

export function usePlatformStats() {
  const supabase = useSupabase()
  return useQuery({
    queryKey: ak.stats,
    queryFn: async () => {
      const result = await supabase.rpc('admin_platform_stats')
      return unwrap(result) as unknown as PlatformStats
    },
    staleTime: 30_000,
  })
}

/* -------------------------------------------------------------------------- */
/* Workspaces                                                                 */
/* -------------------------------------------------------------------------- */

export function useAdminWorkspaces(search = '', status = '') {
  const supabase = useSupabase()
  return useQuery({
    queryKey: ak.workspaces(search, status),
    queryFn: async () => {
      const result = await supabase.rpc('admin_list_workspaces', {
        p_search: search || null,
        p_status: status || null,
        p_include_deleted: status === 'deleted',
      })
      return unwrap(result) as unknown as AdminWorkspaceRow[]
    },
    staleTime: 15_000,
  })
}

export function useAdminWorkspace(id?: string) {
  const supabase = useSupabase()
  return useQuery({
    queryKey: ak.workspace(id ?? 'none'),
    enabled: Boolean(id),
    queryFn: async () => {
      const result = await supabase.rpc('admin_workspace_detail', { p_workspace: id! })
      return unwrap(result) as unknown as AdminWorkspaceDetail
    },
  })
}

/** Invalidate everything the admin portal renders. Mutations are infrequent. */
function useAdminInvalidate() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: ['admin'] })
}

export type CreateWorkspaceInput = {
  name: string
  slug?: string
  companyName?: string
  plan: string
  seatLimit: number
  projectLimit: number
  startsAt?: string | null
  expiresAt?: string | null
}

export function useCreateWorkspace() {
  const supabase = useSupabase()
  const invalidate = useAdminInvalidate()

  return useMutation({
    mutationFn: async (input: CreateWorkspaceInput) => {
      const result = await supabase.rpc('admin_create_workspace', {
        p_name: input.name,
        p_slug: input.slug || null,
        p_company_name: input.companyName || null,
        p_plan: input.plan,
        p_seat_limit: input.seatLimit,
        p_project_limit: input.projectLimit,
        p_starts_at: input.startsAt || null,
        p_expires_at: input.expiresAt || null,
      })
      return unwrap(result)
    },
    onSuccess: invalidate,
  })
}

export type UpdateWorkspaceInput = {
  id: string
  name?: string
  companyName?: string
  plan?: string
  seatLimit?: number
  projectLimit?: number
  startsAt?: string | null
  expiresAt?: string | null
  clearExpiry?: boolean
}

export function useUpdateWorkspace() {
  const supabase = useSupabase()
  const invalidate = useAdminInvalidate()

  return useMutation({
    mutationFn: async (input: UpdateWorkspaceInput) => {
      const result = await supabase.rpc('admin_update_workspace', {
        p_workspace: input.id,
        p_name: input.name ?? null,
        p_company_name: input.companyName ?? null,
        p_plan: input.plan ?? null,
        p_seat_limit: input.seatLimit ?? null,
        p_project_limit: input.projectLimit ?? null,
        p_starts_at: input.startsAt ?? null,
        p_expires_at: input.expiresAt ?? null,
        p_clear_expiry: input.clearExpiry ?? false,
      })
      return unwrap(result)
    },
    onSuccess: invalidate,
  })
}

export function useSetWorkspaceStatus() {
  const supabase = useSupabase()
  const invalidate = useAdminInvalidate()

  return useMutation({
    mutationFn: async ({
      id,
      status,
      reason,
    }: {
      id: string
      status: Exclude<WorkspaceStatus, 'deleted'>
      reason?: string
    }) => {
      const result = await supabase.rpc('admin_set_workspace_status', {
        p_workspace: id,
        p_status: status,
        p_reason: reason ?? null,
      })
      return unwrap(result)
    },
    onSuccess: invalidate,
  })
}

export function useSoftDeleteWorkspace() {
  const supabase = useSupabase()
  const invalidate = useAdminInvalidate()

  return useMutation({
    mutationFn: async ({ id, confirmName }: { id: string; confirmName: string }) => {
      const result = await supabase.rpc('admin_soft_delete_workspace', {
        p_workspace: id,
        p_confirm_name: confirmName,
      })
      return unwrap(result)
    },
    onSuccess: invalidate,
  })
}

export function useRestoreWorkspace() {
  const supabase = useSupabase()
  const invalidate = useAdminInvalidate()

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await supabase.rpc('admin_restore_workspace', { p_workspace: id })
      return unwrap(result)
    },
    onSuccess: invalidate,
  })
}

export function useHardDeleteWorkspace() {
  const supabase = useSupabase()
  const invalidate = useAdminInvalidate()

  return useMutation({
    mutationFn: async ({ id, confirmName }: { id: string; confirmName: string }) => {
      const { error } = await supabase.rpc('admin_hard_delete_workspace', {
        p_workspace: id,
        p_confirm_name: confirmName,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/* -------------------------------------------------------------------------- */
/* Owners                                                                     */
/* -------------------------------------------------------------------------- */

export function useAdminOwners(search = '') {
  const supabase = useSupabase()
  return useQuery({
    queryKey: ak.owners(search),
    queryFn: async () => {
      const result = await supabase.rpc('admin_list_owners', { p_search: search || null })
      return unwrap(result) as unknown as AdminOwner[]
    },
    staleTime: 15_000,
  })
}

export type CreateOwnerInput = {
  email: string
  fullName: string
  phone?: string
  /** Omit to email an invitation link instead of setting a password. */
  password?: string
  workspaceId?: string
  makePrimary?: boolean
}

export type CreateOwnerResult = {
  userId: string
  email: string
  /** Present when no password was supplied — hand this to the customer. */
  inviteUrl?: string
  emailed: boolean
  temporaryPassword?: string
}

/** Minting credentials needs the service-role key, so this goes via an API route. */
export function useCreateOwner() {
  const invalidate = useAdminInvalidate()

  return useMutation({
    mutationFn: async (input: CreateOwnerInput) => {
      const response = await fetch('/api/admin/owners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const payload = (await response.json()) as CreateOwnerResult & { error?: string }
      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? 'Could not create the owner account')
      }
      return payload
    },
    onSuccess: invalidate,
  })
}

export function useAssignOwner() {
  const supabase = useSupabase()
  const invalidate = useAdminInvalidate()

  return useMutation({
    mutationFn: async ({
      workspaceId,
      userId,
      isPrimary = true,
    }: {
      workspaceId: string
      userId: string
      isPrimary?: boolean
    }) => {
      const result = await supabase.rpc('admin_assign_owner', {
        p_workspace: workspaceId,
        p_user: userId,
        p_is_primary: isPrimary,
      })
      return unwrap(result)
    },
    onSuccess: invalidate,
  })
}

export function useRemoveOwner() {
  const supabase = useSupabase()
  const invalidate = useAdminInvalidate()

  return useMutation({
    mutationFn: async ({ workspaceId, userId }: { workspaceId: string; userId: string }) => {
      const { error } = await supabase.rpc('admin_remove_owner', {
        p_workspace: workspaceId,
        p_user: userId,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useTransferWorkspace() {
  const supabase = useSupabase()
  const invalidate = useAdminInvalidate()

  return useMutation({
    mutationFn: async ({
      workspaceId,
      newOwnerId,
    }: {
      workspaceId: string
      newOwnerId: string
    }) => {
      const result = await supabase.rpc('admin_transfer_workspace', {
        p_workspace: workspaceId,
        p_new_owner: newOwnerId,
      })
      return unwrap(result)
    },
    onSuccess: invalidate,
  })
}

export function useSendPasswordReset() {
  return useMutation({
    mutationFn: async (email: string) => {
      const response = await fetch('/api/admin/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const payload = (await response.json()) as {
        ok?: boolean
        error?: string
        resetUrl?: string
        emailed?: boolean
      }
      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? 'Could not send the reset link')
      }
      return payload
    },
  })
}

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

export function useAdminUsers(search = '') {
  const supabase = useSupabase()
  return useQuery({
    queryKey: ak.users(search),
    queryFn: async () => {
      const result = await supabase.rpc('admin_list_users', {
        p_search: search || null,
        p_limit: 200,
        p_offset: 0,
      })
      return unwrap(result) as unknown as { total: number; rows: AdminUserRow[] }
    },
    staleTime: 15_000,
  })
}

export function useSetUserActive() {
  const supabase = useSupabase()
  const invalidate = useAdminInvalidate()

  return useMutation({
    mutationFn: async ({
      userId,
      active,
      reason,
    }: {
      userId: string
      active: boolean
      reason?: string
    }) => {
      const { error } = await supabase.rpc('admin_set_user_active', {
        p_user: userId,
        p_active: active,
        p_reason: reason ?? null,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/* -------------------------------------------------------------------------- */
/* Audit log                                                                  */
/* -------------------------------------------------------------------------- */

export function useAuditLog(filters: { action?: string; search?: string } = {}) {
  const supabase = useSupabase()
  const key = { action: filters.action ?? '', search: filters.search ?? '' }

  return useQuery({
    queryKey: ak.audit(key),
    queryFn: async () => {
      let query = supabase
        .from('platform_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(250)

      if (key.action) query = query.eq('action', key.action)
      if (key.search) {
        query = query.or(
          `actor_email.ilike.%${key.search}%,action.ilike.%${key.search}%`
        )
      }

      const result = await query
      // `metadata` is `Json` on the row type; every writer stores an object.
      return unwrap(result) as unknown as AuditEntry[]
    },
  })
}

/* -------------------------------------------------------------------------- */
/* Impersonation                                                              */
/* -------------------------------------------------------------------------- */

export function useStartImpersonation() {
  return useMutation({
    mutationFn: async ({
      workspaceId,
      reason,
      minutes = 30,
    }: {
      workspaceId: string
      reason: string
      minutes?: number
    }) => {
      const response = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, reason, minutes }),
      })
      const payload = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? 'Could not start the support session')
      }
      return payload
    },
  })
}

/** Turn a PostgREST privilege error into something a human can act on. */
export function adminError(error: unknown) {
  const message = errorMessage(error, 'Something went wrong')
  if (/insufficient_privilege|Forbidden/i.test(message)) {
    return 'Your session is no longer recognised as a system administrator. Sign in again.'
  }
  return message
}
