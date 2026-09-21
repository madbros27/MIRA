'use client'

/**
 * The "JQL-lite" query builder.
 *
 * Every control maps to one field of `IssueFilter`; nothing is free-text
 * except the title search, so a filter is always valid and can be saved,
 * shared through the URL, or re-applied against the cache without parsing.
 */

import { RotateCcw, Save } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/controls'
import { Field, Input } from '@/components/ui/input'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Avatar, Separator } from '@/components/ui/primitives'
import { IssueTypeIcon, PriorityIcon, StatusPill } from '@/components/issues/issue-atoms'
import {
  ISSUE_PRIORITIES,
  ISSUE_TYPES,
  ISSUE_TYPE_META,
  PRIORITY_META,
} from '@/lib/constants'
import { countActiveFilters } from '@/lib/types/app'
import type {
  IssueFilter,
  Label as LabelType,
  Member,
  ProjectStatus,
  Sprint,
} from '@/lib/types/app'
import { cn, displayName } from '@/lib/utils'

export type FilterSources = {
  statuses?: ProjectStatus[]
  labels?: LabelType[]
  sprints?: Sprint[]
  members?: Member[]
}

export function FilterPanel({
  open,
  onOpenChange,
  filter,
  onApply,
  onSaveAsFilter,
  sources,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  filter: IssueFilter
  onApply: (filter: IssueFilter) => void
  onSaveAsFilter?: (filter: IssueFilter) => void
  sources: FilterSources
}) {
  const [draft, setDraft] = React.useState<IssueFilter>(filter)

  // Re-sync whenever the panel is reopened with a different filter.
  React.useEffect(() => {
    if (open) setDraft(filter)
  }, [open, filter])

  function toggle<K extends keyof IssueFilter>(key: K, value: string) {
    setDraft((prev) => {
      const current = (prev[key] as string[] | undefined) ?? []
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
      return { ...prev, [key]: next.length ? next : undefined }
    })
  }

  const active = countActiveFilters(draft)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[min(26rem,94vw)]">
        <SheetHeader>
          <SheetTitle>Filter issues</SheetTitle>
          <SheetDescription>
            {active ? `${active} ${active === 1 ? 'condition' : 'conditions'}` : 'No conditions'} —
            all conditions must match.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="space-y-5">
          <Field label="Title contains" htmlFor="filter-text">
            <Input
              id="filter-text"
              value={draft.text ?? ''}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, text: event.target.value || undefined }))
              }
              placeholder="e.g. realtime"
            />
          </Field>

          <Group label="Type">
            {ISSUE_TYPES.map((type) => (
              <CheckRow
                key={type}
                checked={draft.types?.includes(type) ?? false}
                onChange={() => toggle('types', type)}
              >
                <IssueTypeIcon type={type} withTooltip={false} />
                {ISSUE_TYPE_META[type].label}
              </CheckRow>
            ))}
          </Group>

          <Group label="Priority">
            {ISSUE_PRIORITIES.map((priority) => (
              <CheckRow
                key={priority}
                checked={draft.priorities?.includes(priority) ?? false}
                onChange={() => toggle('priorities', priority)}
              >
                <PriorityIcon priority={priority} withTooltip={false} />
                {PRIORITY_META[priority].label}
              </CheckRow>
            ))}
          </Group>

          {sources.statuses?.length ? (
            <Group label="Status">
              {sources.statuses.map((status) => (
                <CheckRow
                  key={status.id}
                  checked={draft.statusIds?.includes(status.id) ?? false}
                  onChange={() => toggle('statusIds', status.id)}
                >
                  <StatusPill status={status} />
                </CheckRow>
              ))}
            </Group>
          ) : null}

          {sources.members?.length ? (
            <Group label="Assignee">
              <CheckRow
                checked={draft.assigneeIds?.includes('unassigned') ?? false}
                onChange={() => toggle('assigneeIds', 'unassigned')}
              >
                <span className="flex size-5 items-center justify-center rounded-full border border-dashed border-border-strong text-2xs text-muted-foreground">
                  ?
                </span>
                Unassigned
              </CheckRow>
              {sources.members.map((member) => (
                <CheckRow
                  key={member.user_id}
                  checked={draft.assigneeIds?.includes(member.user_id) ?? false}
                  onChange={() => toggle('assigneeIds', member.user_id)}
                >
                  <Avatar
                    id={member.user_id}
                    name={member.profile?.full_name}
                    src={member.profile?.avatar_url}
                    size="xs"
                  />
                  {displayName(member.profile)}
                </CheckRow>
              ))}
            </Group>
          ) : null}

          {sources.labels?.length ? (
            <Group label="Labels">
              {sources.labels.map((label) => (
                <CheckRow
                  key={label.id}
                  checked={draft.labelIds?.includes(label.id) ?? false}
                  onChange={() => toggle('labelIds', label.id)}
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: label.color }}
                    aria-hidden
                  />
                  {label.name}
                </CheckRow>
              ))}
            </Group>
          ) : null}

          {sources.sprints?.length ? (
            <Group label="Sprint">
              <CheckRow
                checked={draft.sprintIds?.includes('none') ?? false}
                onChange={() => toggle('sprintIds', 'none')}
              >
                Backlog (no sprint)
              </CheckRow>
              {sources.sprints.map((sprint) => (
                <CheckRow
                  key={sprint.id}
                  checked={draft.sprintIds?.includes(sprint.id) ?? false}
                  onChange={() => toggle('sprintIds', sprint.id)}
                >
                  {sprint.name}
                  {sprint.status === 'active' ? (
                    <span className="text-2xs text-success">active</span>
                  ) : null}
                </CheckRow>
              ))}
            </Group>
          ) : null}

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Due from" htmlFor="filter-due-from">
              <Input
                id="filter-due-from"
                type="date"
                value={draft.dueFrom ?? ''}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, dueFrom: event.target.value || undefined }))
                }
              />
            </Field>
            <Field label="Due to" htmlFor="filter-due-to">
              <Input
                id="filter-due-to"
                type="date"
                value={draft.dueTo ?? ''}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, dueTo: event.target.value || undefined }))
                }
              />
            </Field>
            <Field label="Created from" htmlFor="filter-created-from">
              <Input
                id="filter-created-from"
                type="date"
                value={draft.createdFrom ?? ''}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    createdFrom: event.target.value || undefined,
                  }))
                }
              />
            </Field>
            <Field label="Created to" htmlFor="filter-created-to">
              <Input
                id="filter-created-to"
                type="date"
                value={draft.createdTo ?? ''}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, createdTo: event.target.value || undefined }))
                }
              />
            </Field>
          </div>

          <CheckRow
            checked={Boolean(draft.overdue)}
            onChange={() =>
              setDraft((prev) => ({ ...prev, overdue: prev.overdue ? undefined : true }))
            }
          >
            Only overdue, unfinished issues
          </CheckRow>
        </SheetBody>

        <SheetFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDraft({})}
            className="sm:mr-auto"
          >
            <RotateCcw />
            Clear all
          </Button>
          {onSaveAsFilter ? (
            <Button variant="secondary" size="sm" onClick={() => onSaveAsFilter(draft)}>
              <Save />
              Save filter
            </Button>
          ) : null}
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              onApply(draft)
              onOpenChange(false)
            }}
          >
            Apply
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-1">
      <legend className="pb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </legend>
      <div className="space-y-0.5">{children}</div>
    </fieldset>
  )
}

function CheckRow({
  checked,
  onChange,
  children,
  className,
}: {
  checked: boolean
  onChange: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm transition-colors hover:bg-muted',
        className
      )}
    >
      <Checkbox checked={checked} onCheckedChange={onChange} />
      <span className="flex min-w-0 flex-1 items-center gap-2 truncate">{children}</span>
    </label>
  )
}
