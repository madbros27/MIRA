/**
 * The capability vocabulary, mirrored from the `capabilities` table.
 *
 * This module decides what to *render*. Postgres decides what is *allowed* —
 * see `public.has_capability()` and the policies in
 * `supabase/migrations/20250201000300_platform_rls.sql`. Keeping the two in
 * step means a person never sees a button whose action would be refused.
 */

export const CAPABILITIES = [
  'project.create',
  'project.edit',
  'project.delete',
  'project.archive',
  'project.view_all',
  'issue.create',
  'issue.edit_any',
  'issue.edit_own',
  'issue.delete',
  'issue.assign',
  'issue.transition',
  'sprint.create',
  'sprint.start',
  'sprint.complete',
  'member.invite',
  'member.remove',
  'member.assign_position',
  'position.manage',
  'report.view',
  'report.export',
  'workspace.settings',
  'billing.view',
] as const

export type Capability = (typeof CAPABILITIES)[number]

export type CapabilityGroup =
  | 'Projects'
  | 'Issues'
  | 'Sprints'
  | 'People'
  | 'Insights'
  | 'Workspace'

export type CapabilityMeta = {
  key: Capability
  label: string
  description: string
  group: CapabilityGroup
}

/**
 * Labels for the Owner's position editor. The database holds the same text;
 * this copy keeps the checklist renderable before the query resolves.
 */
export const CAPABILITY_META: CapabilityMeta[] = [
  { key: 'project.create', label: 'Create projects', group: 'Projects', description: 'Start a new project in this workspace.' },
  { key: 'project.edit', label: 'Edit projects', group: 'Projects', description: 'Rename, re-scope and configure the workflow of a project.' },
  { key: 'project.delete', label: 'Delete projects', group: 'Projects', description: 'Permanently remove a project and its issues.' },
  { key: 'project.archive', label: 'Archive projects', group: 'Projects', description: 'Make a project read-only without deleting it.' },
  { key: 'project.view_all', label: 'View all projects', group: 'Projects', description: 'See every project in the workspace, not only assigned ones.' },
  { key: 'issue.create', label: 'Create issues', group: 'Issues', description: 'Raise new issues in accessible projects.' },
  { key: 'issue.edit_any', label: 'Edit any issue', group: 'Issues', description: 'Change issues reported or assigned to someone else.' },
  { key: 'issue.edit_own', label: 'Edit own issues', group: 'Issues', description: 'Change issues you reported or are assigned to.' },
  { key: 'issue.delete', label: 'Delete issues', group: 'Issues', description: 'Delete issues raised by anyone.' },
  { key: 'issue.assign', label: 'Assign issues', group: 'Issues', description: 'Set or change the assignee of an issue.' },
  { key: 'issue.transition', label: 'Move issues', group: 'Issues', description: 'Drag issues between board columns.' },
  { key: 'sprint.create', label: 'Create sprints', group: 'Sprints', description: 'Plan a new sprint.' },
  { key: 'sprint.start', label: 'Start sprints', group: 'Sprints', description: 'Begin a planned sprint.' },
  { key: 'sprint.complete', label: 'Complete sprints', group: 'Sprints', description: 'Close an active sprint and roll over its work.' },
  { key: 'member.invite', label: 'Invite people', group: 'People', description: 'Send workspace invitations.' },
  { key: 'member.remove', label: 'Remove people', group: 'People', description: 'Revoke workspace access.' },
  { key: 'member.assign_position', label: 'Assign positions', group: 'People', description: 'Change which position a member holds.' },
  { key: 'position.manage', label: 'Manage positions', group: 'People', description: 'Create positions and edit their capabilities.' },
  { key: 'report.view', label: 'View reports', group: 'Insights', description: 'Open dashboards, burndown and velocity.' },
  { key: 'report.export', label: 'Export reports', group: 'Insights', description: 'Download report data as CSV.' },
  { key: 'workspace.settings', label: 'Workspace settings', group: 'Workspace', description: 'Edit company profile, branding and defaults.' },
  { key: 'billing.view', label: 'View plan & usage', group: 'Workspace', description: 'See seats, project limits and renewal date.' },
]

export const CAPABILITY_GROUPS: CapabilityGroup[] = [
  'Projects',
  'Issues',
  'Sprints',
  'People',
  'Insights',
  'Workspace',
]

/**
 * Capabilities that still resolve in a read-only (archived) workspace.
 * Everything else is a write and is withheld once the tenant is frozen.
 */
const READ_ONLY_SAFE: ReadonlySet<Capability> = new Set<Capability>([
  'project.view_all',
  'report.view',
  'report.export',
  'billing.view',
])

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value)
}

/* -------------------------------------------------------------------------- */
/* Default grants per seeded position                                         */
/* -------------------------------------------------------------------------- */

export type DefaultPositionSlug =
  | 'admin'
  | 'manager'
  | 'hr'
  | 'team_lead'
  | 'member'
  | 'viewer'

/**
 * Mirrors `public.seed_default_positions()`. Used by the demo seed and by the
 * "reset to defaults" button in the position editor.
 */
export const DEFAULT_POSITION_CAPABILITIES: Record<
  DefaultPositionSlug,
  readonly Capability[]
> = {
  admin: CAPABILITIES,
  manager: [
    'project.edit',
    'project.archive',
    'issue.create',
    'issue.edit_any',
    'issue.edit_own',
    'issue.delete',
    'issue.assign',
    'issue.transition',
    'sprint.create',
    'sprint.start',
    'sprint.complete',
    'report.view',
    'report.export',
  ],
  hr: ['member.invite', 'member.remove', 'member.assign_position', 'report.view'],
  team_lead: [
    'issue.create',
    'issue.edit_any',
    'issue.edit_own',
    'issue.assign',
    'issue.transition',
    'sprint.create',
    'sprint.start',
    'sprint.complete',
    'report.view',
  ],
  member: ['issue.create', 'issue.edit_own', 'issue.transition', 'report.view'],
  viewer: ['report.view'],
}

export const DEFAULT_POSITION_LABELS: Record<DefaultPositionSlug, string> = {
  admin: 'Workspace Admin',
  manager: 'Manager',
  hr: 'HR',
  team_lead: 'Team Lead',
  member: 'Member',
  viewer: 'Viewer',
}

/* -------------------------------------------------------------------------- */
/* The resolved grant set for one person in one workspace                     */
/* -------------------------------------------------------------------------- */

export type Grants = {
  /** Owners hold every capability in their own workspace. */
  isOwner: boolean
  /** False for an archived workspace: reads work, writes do not. */
  writable: boolean
  /** A System Administrator browsing a tenant. Read-only, always. */
  impersonating: boolean
  granted: ReadonlySet<Capability>
  has: (capability: Capability) => boolean
}

export type GrantsInput = {
  isOwner?: boolean
  writable?: boolean
  impersonating?: boolean
  capabilities?: Iterable<string>
}

export function makeGrants({
  isOwner = false,
  writable = true,
  impersonating = false,
  capabilities = [],
}: GrantsInput): Grants {
  const granted = new Set<Capability>()
  if (isOwner) {
    for (const capability of CAPABILITIES) granted.add(capability)
  }
  for (const capability of capabilities) {
    if (isCapability(capability)) granted.add(capability)
  }

  return {
    isOwner,
    writable,
    impersonating,
    granted,
    has(capability) {
      if (!granted.has(capability)) return false
      if (READ_ONLY_SAFE.has(capability)) return true
      // A frozen tenant, or an admin looking in from the platform side, can
      // read everything and change nothing.
      return writable && !impersonating
    },
  }
}

/** A grant set that permits nothing. Used while the query is in flight. */
export const NO_GRANTS: Grants = makeGrants({ writable: false })

export function has(grants: Grants | undefined, capability: Capability): boolean {
  return grants?.has(capability) ?? false
}
