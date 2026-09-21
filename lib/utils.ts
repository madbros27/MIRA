import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** MIRA-101 */
export function issueKey(projectKey: string | undefined, issueNumber: number) {
  return `${projectKey ?? '???'}-${issueNumber}`
}

/** Split "MIRA-101" back into its parts. Returns null for anything else. */
export function parseIssueKey(raw: string): { key: string; number: number } | null {
  const match = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(raw.trim())
  if (!match) return null
  return { key: match[1].toUpperCase(), number: Number(match[2]) }
}

export function initials(name?: string | null, fallback = '?') {
  const source = name?.trim()
  if (!source) return fallback
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function displayName(
  profile?: { full_name?: string | null; email?: string | null } | null
) {
  if (!profile) return 'Unassigned'
  return profile.full_name?.trim() || profile.email?.split('@')[0] || 'Unknown'
}

/** Deterministic avatar tint derived from a user id. */
export function avatarTint(seed: string) {
  const palette = [
    'bg-[#5B5BD6] text-white',
    'bg-[#0E7C86] text-white',
    'bg-[#B45309] text-white',
    'bg-[#BE185D] text-white',
    'bg-[#4338CA] text-white',
    'bg-[#047857] text-white',
    'bg-[#7C3AED] text-white',
    'bg-[#C2410C] text-white',
  ]
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return palette[Math.abs(hash) % palette.length]
}

/**
 * Fractional ranking for drag-and-drop. Returns a position strictly between
 * two neighbours, so reordering only ever writes one row.
 */
export const RANK_GAP = 1024

export function positionBetween(before?: number, after?: number): number {
  if (before == null && after == null) return RANK_GAP
  if (before == null) return (after as number) - RANK_GAP
  if (after == null) return before + RANK_GAP
  return (before + after) / 2
}

/** Move an item inside an array, returning a new array. */
export function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export function groupBy<T, K extends string>(
  items: T[],
  key: (item: T) => K
): Record<K, T[]> {
  return items.reduce(
    (acc, item) => {
      const k = key(item)
      ;(acc[k] ||= []).push(item)
      return acc
    },
    {} as Record<K, T[]>
  )
}

export function sum(values: (number | null | undefined)[]) {
  return values.reduce<number>((total, v) => total + (v ?? 0), 0)
}

export function percent(part: number, whole: number) {
  if (!whole) return 0
  return Math.round((part / whole) * 100)
}

export function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** i
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
}

export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delay = 250
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const wrapped = (...args: TArgs) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
  wrapped.cancel = () => timer && clearTimeout(timer)
  return wrapped
}

/** Turn an unknown thrown value into something worth showing a user. */
export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (!error) return fallback
  if (typeof error === 'string') return error
  if (error instanceof Error && error.message) return friendlyDbError(error.message)
  if (typeof error === 'object') {
    const maybe = error as { message?: string; error_description?: string; details?: string }
    const raw = maybe.message || maybe.error_description || maybe.details
    if (raw) return friendlyDbError(raw)
  }
  return fallback
}

/** Translate the Postgres/PostgREST errors users actually hit. */
function friendlyDbError(message: string): string {
  if (/row-level security/i.test(message)) {
    return "You don't have permission to do that in this workspace."
  }
  if (/duplicate key value.*projects_workspace_id_key_key/i.test(message)) {
    return 'That project key is already used in this workspace.'
  }
  if (/duplicate key value.*labels_project_id_name/i.test(message)) {
    return 'A label with that name already exists in this project.'
  }
  if (/duplicate key value.*project_statuses_project_id_name/i.test(message)) {
    return 'A status with that name already exists in this project.'
  }
  if (/duplicate key value.*sprints_one_active_per_project/i.test(message)) {
    return 'This project already has an active sprint. Complete it first.'
  }
  if (/duplicate key value.*workspace_invites_pending_unique/i.test(message)) {
    return 'There is already a pending invitation for that email address.'
  }
  if (/duplicate key value/i.test(message)) return 'That value is already taken.'
  if (/not allowed by this project workflow/i.test(message)) {
    return 'That transition is not allowed by this project workflow.'
  }
  if (/violates foreign key/i.test(message)) {
    return 'That item is still referenced somewhere else.'
  }
  if (/Failed to fetch|fetch failed|NetworkError/i.test(message)) {
    return 'Cannot reach Supabase. Check your project URL and network connection.'
  }
  return message
}
