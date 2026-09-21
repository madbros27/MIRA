import type { IssueFilter } from '@/lib/types/app'

/**
 * Every cache key in one place. Prefixes are stable so a mutation can
 * invalidate a whole subtree (`['issues']`) or one entity (`['issue', id]`).
 */
export const qk = {
  profile: ['profile'] as const,
  workspaces: ['workspaces'] as const,
  workspace: (id: string) => ['workspace', id] as const,
  members: (workspaceId: string) => ['members', workspaceId] as const,
  invites: (workspaceId: string) => ['invites', workspaceId] as const,
  positions: (workspaceId: string) => ['positions', workspaceId] as const,
  projectMembers: (projectId: string) => ['project-members', projectId] as const,

  projects: (workspaceId: string) => ['projects', workspaceId] as const,
  project: (id: string) => ['project', id] as const,
  statuses: (projectId: string) => ['statuses', projectId] as const,
  transitions: (projectId: string) => ['transitions', projectId] as const,
  labels: (projectId: string) => ['labels', projectId] as const,

  sprints: (projectId: string) => ['sprints', projectId] as const,
  sprint: (id: string) => ['sprint', id] as const,

  issues: (projectId: string) => ['issues', projectId] as const,
  issue: (id: string) => ['issue', id] as const,
  issueByKey: (workspaceId: string, key: string) =>
    ['issue-by-key', workspaceId, key] as const,
  subtasks: (issueId: string) => ['subtasks', issueId] as const,
  workspaceIssues: (workspaceId: string, filter?: IssueFilter) =>
    ['workspace-issues', workspaceId, filter ?? {}] as const,

  comments: (issueId: string) => ['comments', issueId] as const,
  commentRevisions: (commentId: string) => ['comment-revisions', commentId] as const,
  activity: (issueId: string) => ['activity', issueId] as const,
  attachments: (issueId: string) => ['attachments', issueId] as const,
  watchers: (issueId: string) => ['watchers', issueId] as const,

  notifications: (workspaceId: string) => ['notifications', workspaceId] as const,
  unreadCount: (workspaceId: string) => ['notifications-unread', workspaceId] as const,

  savedFilters: (workspaceId: string) => ['saved-filters', workspaceId] as const,
  search: (workspaceId: string, term: string) => ['search', workspaceId, term] as const,
}
