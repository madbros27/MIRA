'use client'

/**
 * Field editors shared by the create dialog, the detail panel and inline
 * board/backlog edits. Each one is uncontrolled-friendly: give it a value and
 * an `onChange`, and it renders the same everywhere.
 */

import { Check, Plus, Search, Tag, UserRound, X } from 'lucide-react'
import * as React from 'react'

import { IssueTypeIcon, LabelChip, PriorityIcon, StatusPill } from './issue-atoms'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/controls'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/menu'
import { Avatar } from '@/components/ui/primitives'
import {
  ISSUE_PRIORITIES,
  ISSUE_TYPES,
  ISSUE_TYPE_META,
  PRIORITY_META,
  STORY_POINT_OPTIONS,
} from '@/lib/constants'
import type {
  IssueSummary,
  Label as LabelType,
  Member,
  ProjectStatus,
  Sprint,
} from '@/lib/types/app'
import type { IssuePriority, IssueType, StatusTransitionRow } from '@/lib/types/database'
import { cn, displayName } from '@/lib/utils'

const NONE = '__none__'

/* -------------------------------------------------------------------------- */
/* Type                                                                       */
/* -------------------------------------------------------------------------- */

export function TypeSelect({
  value,
  onChange,
  size = 'md',
  allowSubtask = true,
  disabled,
}: {
  value: IssueType
  onChange: (value: IssueType) => void
  size?: 'sm' | 'md'
  allowSubtask?: boolean
  disabled?: boolean
}) {
  const options = allowSubtask ? ISSUE_TYPES : ISSUE_TYPES.filter((t) => t !== 'subtask')

  return (
    <Select value={value} onValueChange={(v) => onChange(v as IssueType)} disabled={disabled}>
      <SelectTrigger size={size} aria-label="Issue type">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((type) => (
          <SelectItem key={type} value={type}>
            <span className="flex items-center gap-2">
              <IssueTypeIcon type={type} withTooltip={false} />
              {ISSUE_TYPE_META[type].label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/* -------------------------------------------------------------------------- */
/* Priority                                                                   */
/* -------------------------------------------------------------------------- */

export function PrioritySelect({
  value,
  onChange,
  size = 'md',
  disabled,
}: {
  value: IssuePriority
  onChange: (value: IssuePriority) => void
  size?: 'sm' | 'md'
  disabled?: boolean
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as IssuePriority)}
      disabled={disabled}
    >
      <SelectTrigger size={size} aria-label="Priority">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ISSUE_PRIORITIES.map((priority) => (
          <SelectItem key={priority} value={priority}>
            <span className="flex items-center gap-2">
              <PriorityIcon priority={priority} withTooltip={false} />
              {PRIORITY_META[priority].label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

export function StatusSelect({
  value,
  onChange,
  statuses,
  transitions,
  size = 'md',
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  statuses: ProjectStatus[]
  /** When the project restricts transitions, disallowed targets are hidden. */
  transitions?: StatusTransitionRow[]
  size?: 'sm' | 'md'
  disabled?: boolean
}) {
  const allowed = React.useMemo(() => {
    if (!transitions?.length) return statuses
    const fromCurrent = transitions.filter((t) => t.from_status_id === value)
    if (!fromCurrent.length) return statuses
    const ids = new Set(fromCurrent.map((t) => t.to_status_id))
    return statuses.filter((status) => status.id === value || ids.has(status.id))
  }, [statuses, transitions, value])

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger size={size} aria-label="Status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowed.map((status) => (
          <SelectItem key={status.id} value={status.id}>
            <StatusPill status={status} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/* -------------------------------------------------------------------------- */
/* Assignee                                                                   */
/* -------------------------------------------------------------------------- */

export function AssigneePicker({
  value,
  onChange,
  members,
  currentUserId,
  disabled,
  align = 'start',
}: {
  value: string | null
  onChange: (value: string | null) => void
  members: Member[]
  currentUserId?: string
  disabled?: boolean
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')

  const selected = members.find((member) => member.user_id === value)?.profile ?? null

  const filtered = members.filter((member) => {
    if (!query.trim()) return true
    const haystack = `${member.profile?.full_name ?? ''} ${member.profile?.email ?? ''}`
    return haystack.toLowerCase().includes(query.trim().toLowerCase())
  })

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-surface px-2.5 text-left text-sm shadow-xs transition-colors hover:bg-muted disabled:opacity-60"
          aria-label="Assignee"
        >
          {selected ? (
            <>
              <Avatar
                id={selected.id}
                name={selected.full_name}
                src={selected.avatar_url}
                size="sm"
              />
              <span className="min-w-0 flex-1 truncate">{displayName(selected)}</span>
            </>
          ) : (
            <>
              <span className="flex size-6 items-center justify-center rounded-full border border-dashed border-border-strong text-muted-foreground">
                <UserRound className="size-3" />
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">Unassigned</span>
            </>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align={align} className="w-64">
        <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a teammate…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
        </div>

        <ul className="max-h-64 overflow-y-auto p-1">
          {currentUserId && !query ? (
            <li>
              <OptionButton
                selected={value === currentUserId}
                onClick={() => {
                  onChange(currentUserId)
                  setOpen(false)
                }}
              >
                <Avatar id={currentUserId} name="You" size="sm" />
                Assign to me
              </OptionButton>
            </li>
          ) : null}

          <li>
            <OptionButton
              selected={value === null}
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
            >
              <span className="flex size-6 items-center justify-center rounded-full border border-dashed border-border-strong text-muted-foreground">
                <X className="size-3" />
              </span>
              Unassigned
            </OptionButton>
          </li>

          {filtered.map((member) => (
            <li key={member.user_id}>
              <OptionButton
                selected={value === member.user_id}
                onClick={() => {
                  onChange(member.user_id)
                  setOpen(false)
                }}
              >
                <Avatar
                  id={member.user_id}
                  name={member.profile?.full_name}
                  src={member.profile?.avatar_url}
                  size="sm"
                />
                <span className="min-w-0 flex-1 truncate">{displayName(member.profile)}</span>
              </OptionButton>
            </li>
          ))}

          {!filtered.length ? (
            <li className="px-2 py-3 text-center text-xs text-muted-foreground">
              No teammate matches “{query}”.
            </li>
          ) : null}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function OptionButton({
  selected,
  onClick,
  children,
}: {
  selected?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
        selected ? 'bg-accent font-medium' : 'hover:bg-accent/60'
      )}
    >
      {children}
      {selected ? <Check className="ml-auto size-3.5 shrink-0 text-primary" /> : null}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Sprint / Epic / Points                                                     */
/* -------------------------------------------------------------------------- */

export function SprintSelect({
  value,
  onChange,
  sprints,
  size = 'md',
  disabled,
}: {
  value: string | null
  onChange: (value: string | null) => void
  sprints: Sprint[]
  size?: 'sm' | 'md'
  disabled?: boolean
}) {
  const open = sprints.filter((sprint) => sprint.status !== 'completed')

  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger size={size} aria-label="Sprint">
        <SelectValue placeholder="Backlog" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Backlog (no sprint)</SelectItem>
        {open.map((sprint) => (
          <SelectItem key={sprint.id} value={sprint.id}>
            {sprint.name}
            {sprint.status === 'active' ? ' · active' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function EpicSelect({
  value,
  onChange,
  epics,
  size = 'md',
  disabled,
}: {
  value: string | null
  onChange: (value: string | null) => void
  epics: IssueSummary[]
  size?: 'sm' | 'md'
  disabled?: boolean
}) {
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger size={size} aria-label="Epic">
        <SelectValue placeholder="No epic" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No epic</SelectItem>
        {epics.map((epic) => (
          <SelectItem key={epic.id} value={epic.id}>
            {epic.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function StoryPointsSelect({
  value,
  onChange,
  size = 'md',
  disabled,
}: {
  value: number | null
  onChange: (value: number | null) => void
  size?: 'sm' | 'md'
  disabled?: boolean
}) {
  return (
    <Select
      value={value == null ? NONE : String(value)}
      onValueChange={(v) => onChange(v === NONE ? null : Number(v))}
      disabled={disabled}
    >
      <SelectTrigger size={size} aria-label="Story points">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Not estimated</SelectItem>
        {STORY_POINT_OPTIONS.map((points) => (
          <SelectItem key={points} value={String(points)}>
            {points}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                     */
/* -------------------------------------------------------------------------- */

export function LabelPicker({
  value,
  onChange,
  labels,
  onCreateLabel,
  disabled,
}: {
  value: string[]
  onChange: (value: string[]) => void
  labels: LabelType[]
  onCreateLabel?: (name: string) => Promise<LabelType | void>
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [creating, setCreating] = React.useState(false)

  const selected = labels.filter((label) => value.includes(label.id))
  const filtered = labels.filter((label) =>
    label.name.toLowerCase().includes(query.trim().toLowerCase())
  )
  const exactExists = labels.some(
    (label) => label.name.toLowerCase() === query.trim().toLowerCase()
  )

  function toggle(labelId: string) {
    onChange(
      value.includes(labelId) ? value.filter((id) => id !== labelId) : [...value, labelId]
    )
  }

  async function handleCreate() {
    if (!onCreateLabel || !query.trim()) return
    setCreating(true)
    try {
      const created = await onCreateLabel(query.trim())
      if (created) onChange([...value, created.id])
      setQuery('')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex min-h-9 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-surface px-2.5 py-1.5 text-left text-sm shadow-xs transition-colors hover:bg-muted disabled:opacity-60"
          aria-label="Labels"
        >
          {selected.length ? (
            selected.map((label) => <LabelChip key={label.id} label={label} />)
          ) : (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Tag className="size-3.5" />
              No labels
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-64">
        <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={onCreateLabel ? 'Find or create…' : 'Find a label…'}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
        </div>

        <ul className="max-h-56 overflow-y-auto p-1">
          {filtered.map((label) => (
            <li key={label.id}>
              <OptionButton selected={value.includes(label.id)} onClick={() => toggle(label.id)}>
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: label.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{label.name}</span>
              </OptionButton>
            </li>
          ))}

          {!filtered.length && !query ? (
            <li className="px-2 py-3 text-center text-xs text-muted-foreground">
              This project has no labels yet.
            </li>
          ) : null}
        </ul>

        {onCreateLabel && query.trim() && !exactExists ? (
          <div className="border-t border-border p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={handleCreate}
              loading={creating}
            >
              <Plus />
              Create “{query.trim()}”
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

/* -------------------------------------------------------------------------- */
/* Date                                                                       */
/* -------------------------------------------------------------------------- */

export function DateField({
  value,
  onChange,
  disabled,
  id,
  min,
}: {
  value: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
  id?: string
  min?: string
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        type="date"
        value={value ?? ''}
        min={min}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value || null)}
        className="pr-8"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Clear date"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}
