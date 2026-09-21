/**
 * Shapes returned by the `admin_*` RPCs.
 *
 * These are JSON projections built in SQL rather than table rows, so they get
 * their own module instead of living in `lib/types/database.ts`.
 */

import type { MemberStatus, WorkspaceRow, WorkspaceStatus } from './database'

export type OwnerSummary = {
  user_id: string
  is_primary: boolean
  full_name: string | null
  email: string
  avatar_url: string | null
}

export type AdminWorkspaceRow = {
  id: string
  name: string
  slug: string
  company_name: string | null
  plan: string
  status: WorkspaceStatus
  seat_limit: number
  project_limit: number
  starts_at: string
  expires_at: string | null
  created_at: string
  deleted_at: string | null
  seats_used: number
  projects_used: number
  issue_count: number
  owners: OwnerSummary[]
}

export type AdminWorkspaceDetail = {
  workspace: WorkspaceRow
  owners: (OwnerSummary & {
    phone: string | null
    is_active: boolean
    assigned_at: string
  })[]
  members: {
    user_id: string
    status: MemberStatus
    joined_at: string
    position: string | null
    position_slug: string | null
    full_name: string | null
    email: string
    is_active: boolean
    avatar_url: string | null
  }[]
  projects: {
    id: string
    name: string
    key: string
    is_archived: boolean
    created_at: string
    issue_count: number
    member_count: number
  }[]
  usage: {
    seats_used: number
    seat_limit: number
    projects_used: number
    project_limit: number
    issue_count: number
    storage_bytes: number
  }
  activity: AuditEntry[]
}

export type AuditEntry = {
  id: string
  actor_email: string | null
  action: string
  target_type: string | null
  target_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  /** Only projected by the full audit-log query, not by the dashboard digest. */
  ip?: string | null
}

export type PlatformStats = {
  workspaces: {
    total: number
    active: number
    suspended: number
    archived: number
    deleted: number
  }
  owners: number
  users: number
  admins: number
  projects: number
  issues: number
  sprints: number
  storage_bytes: number
  expiring_soon: {
    id: string
    name: string
    slug: string
    expires_at: string
  }[]
  near_limits: {
    id: string
    name: string
    slug: string
    seat_limit: number
    project_limit: number
    seats_used: number
    projects_used: number
  }[]
  signups: { date: string; count: number }[]
  recent_activity: AuditEntry[]
}

export type AdminOwner = {
  user_id: string
  full_name: string | null
  email: string
  phone: string | null
  avatar_url: string | null
  is_active: boolean
  created_at: string
  workspaces: {
    workspace_id: string
    name: string
    slug: string
    status: WorkspaceStatus
    plan: string
    is_primary: boolean
  }[]
}

export type AdminUserRow = {
  id: string
  full_name: string | null
  email: string
  phone: string | null
  avatar_url: string | null
  is_active: boolean
  created_at: string
  is_platform_admin: boolean
  workspaces: {
    workspace_id: string
    workspace_name: string
    slug: string
    status: MemberStatus
    position: string | null
    is_owner: boolean
  }[]
}

/** The plans offered on the platform. Edited in /miraadmin/settings. */
export const PLANS = [
  { id: 'trial', label: 'Trial', seats: 10, projects: 3, days: 14 },
  { id: 'starter', label: 'Starter', seats: 25, projects: 10, days: 365 },
  { id: 'growth', label: 'Growth', seats: 100, projects: 50, days: 365 },
  { id: 'enterprise', label: 'Enterprise', seats: 1000, projects: 500, days: 365 },
] as const

export type PlanId = (typeof PLANS)[number]['id']

export const WORKSPACE_STATUS_META: Record<
  WorkspaceStatus,
  { label: string; tone: 'success' | 'warning' | 'neutral' | 'danger'; help: string }
> = {
  active: {
    label: 'Active',
    tone: 'success',
    help: 'Normal operation. Members can read and write.',
  },
  suspended: {
    label: 'Suspended',
    tone: 'danger',
    help: 'Members are locked out entirely — use for non-payment.',
  },
  archived: {
    label: 'Archived',
    tone: 'warning',
    help: 'Read-only. Data is retained and members can still look at it.',
  },
  deleted: {
    label: 'Deleted',
    tone: 'neutral',
    help: 'Soft-deleted and invisible to its members. Restorable until purged.',
  },
}
