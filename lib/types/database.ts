/**
 * Database types for the MIRA schema.
 *
 * Hand-maintained to mirror `supabase/migrations`. Once your project is linked
 * you can regenerate this file instead:
 *
 *   npm run db:types
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type WorkspaceRole = 'admin' | 'lead' | 'member' | 'viewer'
export type IssueType = 'epic' | 'story' | 'task' | 'bug' | 'subtask'
export type IssuePriority = 'highest' | 'high' | 'medium' | 'low' | 'lowest'
export type StatusCategory = 'todo' | 'in_progress' | 'done'
export type SprintStatus = 'planned' | 'active' | 'completed'
export type NotificationType =
  | 'assigned'
  | 'mentioned'
  | 'status_changed'
  | 'commented'
  | 'issue_created'
  | 'sprint_started'
  | 'sprint_completed'
  | 'invited'
export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

/* --- platform tier -------------------------------------------------------- */
export type WorkspaceStatus = 'active' | 'suspended' | 'archived' | 'deleted'
export type MemberStatus = 'invited' | 'active' | 'suspended'
export type ProjectRole = 'lead' | 'manager' | 'member' | 'viewer'

type Timestamps = {
  created_at: string
  updated_at: string
}

export type ProfileRow = Timestamps & {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  job_title: string | null
  timezone: string | null
  phone: string | null
  is_active: boolean
}

export type WorkspaceRow = Timestamps & {
  id: string
  name: string
  slug: string
  description: string | null
  avatar_url: string | null
  /** Denormalised primary owner. `workspace_owners` is the source of truth. */
  owner_id: string | null
  company_name: string | null
  plan: string
  seat_limit: number
  project_limit: number
  status: WorkspaceStatus
  starts_at: string
  expires_at: string | null
  created_by_admin_id: string | null
  deleted_at: string | null
  timezone: string
  working_days: number[]
  issue_key_prefix: string | null
}

export type WorkspaceMemberRow = {
  id: string
  workspace_id: string
  user_id: string
  /** Legacy coarse role, kept in sync with `position_id` by a trigger. */
  role: WorkspaceRole
  position_id: string | null
  reports_to_user_id: string | null
  status: MemberStatus
  title: string | null
  joined_at: string
  created_at: string
}

export type PlatformAdminRow = {
  id: string
  user_id: string
  name: string | null
  email: string
  must_change_password: boolean
  is_active: boolean
  created_at: string
  last_login_at: string | null
}

export type PlatformAuditLogRow = {
  id: string
  actor_id: string | null
  actor_email: string | null
  action: string
  target_type: string | null
  target_id: string | null
  metadata: Json
  ip: string | null
  user_agent: string | null
  created_at: string
}

export type AdminImpersonationRow = {
  id: string
  admin_id: string
  workspace_id: string
  reason: string | null
  started_at: string
  expires_at: string
  ended_at: string | null
}

export type WorkspaceOwnerRow = {
  id: string
  workspace_id: string
  user_id: string
  is_primary: boolean
  assigned_by_admin_id: string | null
  assigned_at: string
}

export type CapabilityRow = {
  key: string
  label: string
  description: string | null
  group_name: string
  position: number
}

export type PositionRow = Timestamps & {
  id: string
  workspace_id: string
  name: string
  slug: string | null
  description: string | null
  is_system_default: boolean
}

export type PositionPermissionRow = {
  id: string
  position_id: string
  capability: string
  allowed: boolean
}

export type ProjectMemberRow = {
  id: string
  project_id: string
  user_id: string
  project_role: ProjectRole
  added_by: string | null
  added_at: string
}

export type WorkflowRow = {
  id: string
  project_id: string
  name: string
  created_at: string
}

export type ProjectRow = Timestamps & {
  id: string
  workspace_id: string
  name: string
  key: string
  description: string | null
  lead_id: string | null
  icon: string
  color: string
  is_archived: boolean
  issue_counter: number
  created_by: string | null
  start_date: string | null
  target_date: string | null
  status: string
}

export type ProjectStatusRow = {
  id: string
  project_id: string
  name: string
  category: StatusCategory
  color: string
  position: number
  wip_limit: number | null
  created_at: string
}

export type StatusTransitionRow = {
  id: string
  project_id: string
  from_status_id: string
  to_status_id: string
}

export type SprintRow = Timestamps & {
  id: string
  project_id: string
  name: string
  goal: string | null
  start_date: string | null
  end_date: string | null
  status: SprintStatus
  retrospective: string | null
  committed_points: number | null
  completed_points: number | null
  completed_at: string | null
}

export type IssueRow = Timestamps & {
  id: string
  project_id: string
  issue_number: number
  type: IssueType
  title: string
  description: string | null
  status_id: string
  priority: IssuePriority
  assignee_id: string | null
  reporter_id: string | null
  epic_id: string | null
  parent_id: string | null
  sprint_id: string | null
  story_points: number | null
  due_date: string | null
  board_position: number
  backlog_position: number
  resolved_at: string | null
}

export type LabelRow = {
  id: string
  project_id: string
  name: string
  color: string
  created_at: string
}

export type IssueLabelRow = {
  issue_id: string
  label_id: string
}

export type CommentRow = Timestamps & {
  id: string
  issue_id: string
  author_id: string | null
  body: string
  is_edited: boolean
}

export type CommentRevisionRow = {
  id: string
  comment_id: string
  body: string
  editor_id: string | null
  created_at: string
}

export type AttachmentRow = {
  id: string
  issue_id: string
  storage_path: string
  file_name: string
  file_size: number
  mime_type: string | null
  uploaded_by: string | null
  created_at: string
}

export type ActivityLogRow = {
  id: string
  issue_id: string
  actor_id: string | null
  action: string
  field_changed: string | null
  old_value: string | null
  new_value: string | null
  created_at: string
}

export type WatcherRow = {
  issue_id: string
  user_id: string
  created_at: string
}

export type NotificationRow = {
  id: string
  user_id: string
  workspace_id: string | null
  project_id: string | null
  issue_id: string | null
  actor_id: string | null
  type: NotificationType
  title: string
  body: string | null
  payload: Json
  is_read: boolean
  created_at: string
}

export type SavedFilterRow = Timestamps & {
  id: string
  workspace_id: string
  project_id: string | null
  owner_id: string
  name: string
  query: Json
  is_shared: boolean
}

export type WorkspaceInviteRow = {
  id: string
  workspace_id: string
  email: string
  role: WorkspaceRole
  position_id: string | null
  full_name: string | null
  invited_by: string | null
  token: string
  status: InviteStatus
  expires_at: string
  accepted_at: string | null
  created_at: string
}

/** Helper that turns a Row type into the shape accepted by `.insert()`. */
type Insertable<TRow, TRequired extends keyof TRow> = Partial<TRow> &
  Pick<TRow, TRequired>

type Table<TRow, TRequired extends keyof TRow> = {
  Row: TRow
  Insert: Insertable<TRow, TRequired>
  Update: Partial<TRow>
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, 'id' | 'email'>
      workspaces: Table<WorkspaceRow, 'name' | 'slug'>
      workspace_members: Table<WorkspaceMemberRow, 'workspace_id' | 'user_id'>
      projects: Table<ProjectRow, 'workspace_id' | 'name' | 'key'>
      platform_admins: Table<PlatformAdminRow, 'user_id' | 'email'>
      platform_audit_log: Table<PlatformAuditLogRow, 'action'>
      admin_impersonations: Table<AdminImpersonationRow, 'admin_id' | 'workspace_id'>
      workspace_owners: Table<WorkspaceOwnerRow, 'workspace_id' | 'user_id'>
      capabilities: Table<CapabilityRow, 'key' | 'label' | 'group_name'>
      positions: Table<PositionRow, 'workspace_id' | 'name'>
      position_permissions: Table<PositionPermissionRow, 'position_id' | 'capability'>
      project_members: Table<ProjectMemberRow, 'project_id' | 'user_id'>
      workflows: Table<WorkflowRow, 'project_id'>
      project_statuses: Table<ProjectStatusRow, 'project_id' | 'name'>
      status_transitions: Table<
        StatusTransitionRow,
        'project_id' | 'from_status_id' | 'to_status_id'
      >
      sprints: Table<SprintRow, 'project_id' | 'name'>
      // `status_id`, `issue_number` and `reporter_id` are filled in by the
      // `assign_issue_defaults` trigger, so they are optional on insert.
      issues: Table<IssueRow, 'project_id' | 'title'>
      labels: Table<LabelRow, 'project_id' | 'name'>
      issue_labels: Table<IssueLabelRow, 'issue_id' | 'label_id'>
      comments: Table<CommentRow, 'issue_id' | 'body'>
      comment_revisions: Table<CommentRevisionRow, 'comment_id' | 'body'>
      attachments: Table<AttachmentRow, 'issue_id' | 'storage_path' | 'file_name'>
      activity_log: Table<ActivityLogRow, 'issue_id' | 'action'>
      watchers: Table<WatcherRow, 'issue_id' | 'user_id'>
      notifications: Table<NotificationRow, 'user_id' | 'type' | 'title'>
      saved_filters: Table<SavedFilterRow, 'workspace_id' | 'owner_id' | 'name'>
      workspace_invites: Table<WorkspaceInviteRow, 'workspace_id' | 'email'>
    }
    /*
     * MIRA has no database views. This must be an empty *object* type rather
     * than `Record<string, never>`: PostgREST's type helpers intersect
     * `Tables & Views`, and an index signature of `never` would collapse every
     * table type to `never`.
     */
    Views: { [_ in never]: never }
    Functions: {
      create_workspace: {
        Args: { p_name: string; p_slug?: string | null }
        Returns: WorkspaceRow
      }
      create_project: {
        Args: {
          p_workspace: string
          p_name: string
          p_key: string
          p_description?: string | null
          p_lead?: string | null
          p_icon?: string
          p_color?: string
          p_start_date?: string | null
          p_target_date?: string | null
          p_managers?: string[] | null
        }
        Returns: ProjectRow
      }
      start_sprint: {
        Args: { p_sprint: string; p_start?: string; p_end?: string | null }
        Returns: SprintRow
      }
      complete_sprint: {
        Args: { p_sprint: string; p_target_sprint?: string | null }
        Returns: SprintRow
      }
      global_search: {
        Args: { p_workspace: string; p_query: string; p_limit?: number }
        Returns: SearchResultRow[]
      }
      mark_all_notifications_read: {
        Args: { p_workspace?: string | null }
        Returns: number
      }
      accept_invite: {
        Args: { p_token: string }
        Returns: string
      }

      /* --- permission helpers ------------------------------------------- */
      is_platform_admin: { Args: { p_user?: string }; Returns: boolean }
      has_capability: {
        Args: { p_user: string; p_workspace: string; p_capability: string }
        Returns: boolean
      }
      can_do: { Args: { p_workspace: string; p_capability: string }; Returns: boolean }
      current_workspace_ids: { Args: { p_user?: string }; Returns: string[] }
      can_read_project: { Args: { p_project: string }; Returns: boolean }
      can_admin_project: { Args: { p_project: string }; Returns: boolean }
      can_export_reports: { Args: { p_workspace: string }; Returns: boolean }

      /* --- platform administration -------------------------------------- */
      admin_record_login: { Args: Record<string, never>; Returns: undefined }
      admin_mark_password_changed: { Args: Record<string, never>; Returns: undefined }
      admin_platform_stats: { Args: Record<string, never>; Returns: Json }
      admin_workspace_detail: { Args: { p_workspace: string }; Returns: Json }
      admin_list_users: {
        Args: { p_search?: string | null; p_limit?: number; p_offset?: number }
        Returns: Json
      }
      admin_list_workspaces: {
        Args: {
          p_search?: string | null
          p_status?: string | null
          p_include_deleted?: boolean
        }
        Returns: Json
      }
      admin_list_owners: { Args: { p_search?: string | null }; Returns: Json }
      admin_create_workspace: {
        Args: {
          p_name: string
          p_slug?: string | null
          p_company_name?: string | null
          p_plan?: string
          p_seat_limit?: number
          p_project_limit?: number
          p_starts_at?: string | null
          p_expires_at?: string | null
        }
        Returns: WorkspaceRow
      }
      admin_update_workspace: {
        Args: {
          p_workspace: string
          p_name?: string | null
          p_company_name?: string | null
          p_plan?: string | null
          p_seat_limit?: number | null
          p_project_limit?: number | null
          p_starts_at?: string | null
          p_expires_at?: string | null
          p_clear_expiry?: boolean
        }
        Returns: WorkspaceRow
      }
      admin_set_workspace_status: {
        Args: { p_workspace: string; p_status: WorkspaceStatus; p_reason?: string | null }
        Returns: WorkspaceRow
      }
      admin_soft_delete_workspace: {
        Args: { p_workspace: string; p_confirm_name: string }
        Returns: WorkspaceRow
      }
      admin_restore_workspace: { Args: { p_workspace: string }; Returns: WorkspaceRow }
      admin_hard_delete_workspace: {
        Args: { p_workspace: string; p_confirm_name: string }
        Returns: undefined
      }
      admin_assign_owner: {
        Args: { p_workspace: string; p_user: string; p_is_primary?: boolean }
        Returns: WorkspaceOwnerRow
      }
      admin_remove_owner: {
        Args: { p_workspace: string; p_user: string }
        Returns: undefined
      }
      admin_transfer_workspace: {
        Args: { p_workspace: string; p_new_owner: string }
        Returns: WorkspaceRow
      }
      admin_set_user_active: {
        Args: { p_user: string; p_active: boolean; p_reason?: string | null }
        Returns: undefined
      }
      admin_start_impersonation: {
        Args: { p_workspace: string; p_reason?: string | null; p_minutes?: number }
        Returns: AdminImpersonationRow
      }
      admin_end_impersonation: {
        Args: { p_session?: string | null }
        Returns: undefined
      }
      log_platform_action: {
        Args: {
          p_action: string
          p_target_type?: string | null
          p_target_id?: string | null
          p_metadata?: Json
          p_ip?: string | null
          p_user_agent?: string | null
        }
        Returns: string
      }
    }
    Enums: {
      workspace_role: WorkspaceRole
      workspace_status: WorkspaceStatus
      member_status: MemberStatus
      project_role: ProjectRole
      issue_type: IssueType
      issue_priority: IssuePriority
      status_category: StatusCategory
      sprint_status: SprintStatus
      notification_type: NotificationType
      invite_status: InviteStatus
    }
    CompositeTypes: { [_ in never]: never }
  }
}

export type SearchResultRow = {
  kind: 'issue' | 'project' | 'comment'
  id: string
  project_id: string
  project_key: string
  project_name: string
  issue_id: string | null
  issue_number: number | null
  title: string
  snippet: string | null
  rank: number
}
