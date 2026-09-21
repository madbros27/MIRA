/**
 * Application-level shapes: the joined rows MIRA actually renders, plus the
 * filter model shared by the board, the backlog and the query builder.
 */

import type {
  AttachmentRow,
  ActivityLogRow,
  CommentRow,
  IssuePriority,
  IssueRow,
  IssueType,
  LabelRow,
  MemberStatus,
  NotificationRow,
  PositionRow,
  ProfileRow,
  ProjectRole,
  ProjectRow,
  ProjectStatusRow,
  SavedFilterRow,
  SprintRow,
  StatusCategory,
  WorkspaceInviteRow,
  WorkspaceRole,
  WorkspaceRow,
} from './database'
import type { Capability } from '@/lib/permissions/capabilities'

export type Profile = ProfileRow
export type Workspace = WorkspaceRow
export type Project = ProjectRow
export type ProjectStatus = ProjectStatusRow
export type Sprint = SprintRow
export type Label = LabelRow
export type Notification = NotificationRow
export type SavedFilter = Omit<SavedFilterRow, 'query'> & { query: IssueFilter }

/**
 * A workspace plus everything needed to decide what the viewer may do in it:
 * their position, the capabilities it grants, and whether they own the place.
 *
 * `role` is the legacy coarse value, kept in sync by a database trigger. It
 * is fine for a label; it is not what gates anything.
 */
export type WorkspaceWithAccess = Workspace & {
  role: WorkspaceRole
  isOwner: boolean
  position: Pick<PositionRow, 'id' | 'name' | 'slug'> | null
  capabilities: Capability[]
}

/** @deprecated Older name for {@link WorkspaceWithAccess}. */
export type WorkspaceWithRole = WorkspaceWithAccess

export type Position = PositionRow & {
  capabilities: Capability[]
  member_count?: number
}

export type Member = {
  id?: string
  workspace_id: string
  user_id: string
  role: WorkspaceRole
  position_id: string | null
  position: Pick<PositionRow, 'id' | 'name' | 'slug'> | null
  reports_to_user_id: string | null
  status: MemberStatus
  title: string | null
  joined_at?: string
  created_at: string
  profile: Profile | null
  is_owner?: boolean
}

export type ProjectMember = {
  id: string
  project_id: string
  user_id: string
  project_role: ProjectRole
  added_at: string
  profile: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'email'> | null
}

export type ProjectWithMeta = Project & {
  lead: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'email'> | null
  statuses?: ProjectStatus[]
}

export type IssueSummary = IssueRow & {
  status: Pick<ProjectStatus, 'id' | 'name' | 'category' | 'color' | 'position'> | null
  assignee: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'email'> | null
  reporter: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'email'> | null
  project: Pick<Project, 'id' | 'key' | 'name' | 'color'> | null
  labels: Label[]
  sprint: Pick<Sprint, 'id' | 'name' | 'status'> | null
  epic: Pick<IssueRow, 'id' | 'title' | 'issue_number'> | null
  subtask_count: number
  comment_count: number
}

export type Comment = CommentRow & {
  author: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'email'> | null
  revision_count: number
}

export type Attachment = AttachmentRow & {
  uploader: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  signed_url?: string | null
}

export type Activity = ActivityLogRow & {
  actor: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
}

export type Watcher = {
  issue_id: string
  user_id: string
  profile: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'email'> | null
}

export type Invite = WorkspaceInviteRow & {
  inviter: Pick<Profile, 'id' | 'full_name'> | null
}

/** The "JQL-lite" filter model. Every field is optional and ANDed together. */
export type IssueFilter = {
  text?: string
  types?: IssueType[]
  priorities?: IssuePriority[]
  statusIds?: string[]
  statusCategories?: StatusCategory[]
  assigneeIds?: (string | 'unassigned')[]
  reporterIds?: string[]
  labelIds?: string[]
  sprintIds?: (string | 'none' | 'active')[]
  epicIds?: string[]
  dueFrom?: string
  dueTo?: string
  createdFrom?: string
  createdTo?: string
  overdue?: boolean
  sort?: IssueSort
}

export type IssueSort =
  | 'rank'
  | 'created_desc'
  | 'created_asc'
  | 'updated_desc'
  | 'priority'
  | 'due_date'
  | 'story_points'

export const EMPTY_FILTER: IssueFilter = {}

export function isFilterEmpty(filter: IssueFilter): boolean {
  return !countActiveFilters(filter)
}

export function countActiveFilters(filter: IssueFilter): number {
  let count = 0
  if (filter.text?.trim()) count++
  if (filter.types?.length) count++
  if (filter.priorities?.length) count++
  if (filter.statusIds?.length) count++
  if (filter.statusCategories?.length) count++
  if (filter.assigneeIds?.length) count++
  if (filter.reporterIds?.length) count++
  if (filter.labelIds?.length) count++
  if (filter.sprintIds?.length) count++
  if (filter.epicIds?.length) count++
  if (filter.dueFrom || filter.dueTo) count++
  if (filter.createdFrom || filter.createdTo) count++
  if (filter.overdue) count++
  return count
}

/** Result of the burndown computation used by the sprint report. */
export type BurndownPoint = {
  date: string
  label: string
  remaining: number | null
  ideal: number
  completed: number
}

export type VelocityPoint = {
  sprint: string
  committed: number
  completed: number
}
