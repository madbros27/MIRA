import type {
  IssuePriority,
  IssueType,
  NotificationType,
  StatusCategory,
  WorkspaceRole,
} from '@/lib/types/database'

/* -------------------------------------------------------------------------- */
/* Issue types                                                                */
/* -------------------------------------------------------------------------- */

export const ISSUE_TYPES: IssueType[] = ['epic', 'story', 'task', 'bug', 'subtask']

export const ISSUE_TYPE_META: Record<
  IssueType,
  { label: string; icon: string; className: string; dot: string }
> = {
  epic: {
    label: 'Epic',
    icon: 'Zap',
    className: 'bg-[#7C3AED]/12 text-[#6D28D9] dark:text-[#C4B5FD]',
    dot: '#7C3AED',
  },
  story: {
    label: 'Story',
    icon: 'BookOpen',
    className: 'bg-[#059669]/12 text-[#047857] dark:text-[#6EE7B7]',
    dot: '#059669',
  },
  task: {
    label: 'Task',
    icon: 'SquareCheck',
    className: 'bg-[#2563EB]/12 text-[#1D4ED8] dark:text-[#93C5FD]',
    dot: '#2563EB',
  },
  bug: {
    label: 'Bug',
    icon: 'Bug',
    className: 'bg-[#DC2626]/12 text-[#B91C1C] dark:text-[#FCA5A5]',
    dot: '#DC2626',
  },
  subtask: {
    label: 'Sub-task',
    icon: 'GitBranch',
    className: 'bg-[#0891B2]/12 text-[#0E7490] dark:text-[#67E8F9]',
    dot: '#0891B2',
  },
}

/* -------------------------------------------------------------------------- */
/* Priorities                                                                 */
/* -------------------------------------------------------------------------- */

export const ISSUE_PRIORITIES: IssuePriority[] = [
  'highest',
  'high',
  'medium',
  'low',
  'lowest',
]

/** Descending weight, used for sorting. */
export const PRIORITY_WEIGHT: Record<IssuePriority, number> = {
  highest: 5,
  high: 4,
  medium: 3,
  low: 2,
  lowest: 1,
}

export const PRIORITY_META: Record<
  IssuePriority,
  { label: string; icon: string; className: string; color: string }
> = {
  highest: {
    label: 'Highest',
    icon: 'ChevronsUp',
    className: 'text-[#B91C1C] dark:text-[#FCA5A5]',
    color: '#DC2626',
  },
  high: {
    label: 'High',
    icon: 'ChevronUp',
    className: 'text-[#C2410C] dark:text-[#FDBA74]',
    color: '#EA580C',
  },
  medium: {
    label: 'Medium',
    icon: 'Equal',
    className: 'text-[#A16207] dark:text-[#FCD34D]',
    color: '#CA8A04',
  },
  low: {
    label: 'Low',
    icon: 'ChevronDown',
    className: 'text-[#1D4ED8] dark:text-[#93C5FD]',
    color: '#2563EB',
  },
  lowest: {
    label: 'Lowest',
    icon: 'ChevronsDown',
    className: 'text-[#475569] dark:text-[#CBD5E1]',
    color: '#64748B',
  },
}

/* -------------------------------------------------------------------------- */
/* Status categories                                                          */
/* -------------------------------------------------------------------------- */

export const STATUS_CATEGORIES: StatusCategory[] = ['todo', 'in_progress', 'done']

export const STATUS_CATEGORY_META: Record<
  StatusCategory,
  { label: string; className: string; color: string }
> = {
  todo: {
    label: 'To do',
    className: 'bg-muted text-muted-foreground',
    color: '#64748B',
  },
  in_progress: {
    label: 'In progress',
    className: 'bg-info-subtle text-info',
    color: '#2563EB',
  },
  done: {
    label: 'Done',
    className: 'bg-success-subtle text-success',
    color: '#059669',
  },
}

/* -------------------------------------------------------------------------- */
/* Roles                                                                      */
/* -------------------------------------------------------------------------- */

export const WORKSPACE_ROLES: WorkspaceRole[] = ['admin', 'lead', 'member', 'viewer']

export const ROLE_META: Record<
  WorkspaceRole,
  { label: string; description: string; className: string }
> = {
  admin: {
    label: 'Admin',
    description: 'Full control, including members and workspace settings.',
    className: 'bg-primary-subtle text-primary-subtle-foreground',
  },
  lead: {
    label: 'Project lead',
    description: 'Manage projects, workflows and sprints; delete issues.',
    className: 'bg-info-subtle text-info',
  },
  member: {
    label: 'Member',
    description: 'Create and edit issues, comment and attach files.',
    className: 'bg-success-subtle text-success',
  },
  viewer: {
    label: 'Viewer',
    description: 'Read-only access to everything in the workspace.',
    className: 'bg-muted text-muted-foreground',
  },
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

export const NOTIFICATION_META: Record<
  NotificationType,
  { icon: string; className: string }
> = {
  assigned: { icon: 'UserPlus', className: 'bg-primary-subtle text-primary-subtle-foreground' },
  mentioned: { icon: 'AtSign', className: 'bg-warning-subtle text-warning' },
  status_changed: { icon: 'ArrowRightLeft', className: 'bg-info-subtle text-info' },
  commented: { icon: 'MessageSquare', className: 'bg-muted text-muted-foreground' },
  issue_created: { icon: 'Plus', className: 'bg-muted text-muted-foreground' },
  sprint_started: { icon: 'Play', className: 'bg-success-subtle text-success' },
  sprint_completed: { icon: 'Flag', className: 'bg-success-subtle text-success' },
  invited: { icon: 'Mail', className: 'bg-primary-subtle text-primary-subtle-foreground' },
}

/* -------------------------------------------------------------------------- */
/* Misc                                                                       */
/* -------------------------------------------------------------------------- */

/** Fibonacci-ish estimates offered in the story-point picker. */
export const STORY_POINT_OPTIONS = [0.5, 1, 2, 3, 5, 8, 13, 21]

export const PROJECT_ICONS = [
  'Rocket',
  'Palette',
  'Layers',
  'Boxes',
  'Compass',
  'Cpu',
  'Database',
  'Globe',
  'Hammer',
  'LineChart',
  'Shield',
  'Sparkles',
] as const

export const PROJECT_COLORS = [
  '#5B5BD6',
  '#2563EB',
  '#0891B2',
  '#059669',
  '#CA8A04',
  '#EA580C',
  '#DC2626',
  '#DB2777',
  '#7C3AED',
  '#475569',
] as const

export const LABEL_COLORS = [
  '#2563EB',
  '#0891B2',
  '#059669',
  '#65A30D',
  '#CA8A04',
  '#EA580C',
  '#DC2626',
  '#DB2777',
  '#7C3AED',
  '#64748B',
] as const

export const ATTACHMENT_BUCKET = 'attachments'
export const AVATAR_BUCKET = 'avatars'
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024
