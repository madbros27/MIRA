/**
 * UI-side mirror of the Row-Level Security policies.
 *
 * These helpers decide what to *show*. They are deliberately not the security
 * boundary — Postgres is (see `supabase/migrations/*_rls.sql`). Keeping the
 * two in sync means a viewer never sees a button that would fail server-side.
 *
 * Every predicate takes the resolved `Grants` for the active workspace, which
 * `useWorkspaceContext()` provides as `caps`.
 */

import { has, type Capability, type Grants } from './capabilities'

export * from './capabilities'

export const can = {
  /* Issues ---------------------------------------------------------------- */
  /** Create issues, comment, attach files. */
  writeIssues: (g?: Grants) => has(g, 'issue.create'),
  editAnyIssue: (g?: Grants) => has(g, 'issue.edit_any'),
  assignIssues: (g?: Grants) => has(g, 'issue.assign'),
  transitionIssues: (g?: Grants) => has(g, 'issue.transition'),
  deleteAnyIssue: (g?: Grants) => has(g, 'issue.delete'),

  /* Projects -------------------------------------------------------------- */
  createProject: (g?: Grants) => has(g, 'project.create'),
  /** Project settings, workflow, labels, project membership. */
  manageProject: (g?: Grants) => has(g, 'project.edit'),
  archiveProject: (g?: Grants) => has(g, 'project.archive'),
  deleteProject: (g?: Grants) => has(g, 'project.delete'),
  viewAllProjects: (g?: Grants) => has(g, 'project.view_all'),

  /* Sprints --------------------------------------------------------------- */
  manageSprints: (g?: Grants) => has(g, 'sprint.create'),
  startSprints: (g?: Grants) => has(g, 'sprint.start'),
  completeSprints: (g?: Grants) => has(g, 'sprint.complete'),

  /* People ---------------------------------------------------------------- */
  inviteMembers: (g?: Grants) => has(g, 'member.invite'),
  removeMembers: (g?: Grants) => has(g, 'member.remove'),
  assignPositions: (g?: Grants) => has(g, 'member.assign_position'),
  managePositions: (g?: Grants) => has(g, 'position.manage'),
  /** Anything on the Team page beyond read-only browsing. */
  manageMembers: (g?: Grants) =>
    has(g, 'member.remove') || has(g, 'member.assign_position'),

  /* Insights & workspace -------------------------------------------------- */
  viewReports: (g?: Grants) => has(g, 'report.view'),
  exportReports: (g?: Grants) => has(g, 'report.export'),
  manageWorkspace: (g?: Grants) => has(g, 'workspace.settings'),
  viewBilling: (g?: Grants) => has(g, 'billing.view'),
} satisfies Record<string, (g?: Grants) => boolean>

/** Free-form check for a capability that has no named predicate above. */
export function allows(grants: Grants | undefined, capability: Capability) {
  return has(grants, capability)
}

/**
 * A Member may delete the issues they raised even without `issue.delete`;
 * this matches the `issues_delete` policy exactly.
 */
export function canDeleteIssue(
  grants: Grants | undefined,
  reporterId: string | null,
  userId: string | undefined
) {
  if (can.deleteAnyIssue(grants)) return true
  return can.writeIssues(grants) && !!reporterId && reporterId === userId
}

/**
 * Editing an issue: `issue.edit_any`, or `issue.edit_own` when you reported
 * it or it is assigned to you.
 */
export function canEditIssue(
  grants: Grants | undefined,
  issue: { reporter_id?: string | null; assignee_id?: string | null } | null,
  userId: string | undefined
) {
  if (can.editAnyIssue(grants)) return true
  if (!has(grants, 'issue.edit_own')) return false
  if (!issue || !userId) return false
  return issue.reporter_id === userId || issue.assignee_id === userId
}

export function canEditComment(authorId: string | null, userId: string | undefined) {
  return !!authorId && authorId === userId
}

export function canDeleteComment(
  grants: Grants | undefined,
  authorId: string | null,
  userId: string | undefined
) {
  return canEditComment(authorId, userId) || can.manageProject(grants)
}
