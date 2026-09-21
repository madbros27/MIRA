'use client'

import {
  Bookmark,
  BookmarkPlus,
  Download,
  Filter,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { FilterPanel, type FilterSources } from './filter-panel'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Button } from '@/components/ui/button'
import { Switch, Tooltip } from '@/components/ui/controls'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { Avatar, Badge } from '@/components/ui/primitives'
import { describeFilter } from '@/lib/filters'
import {
  useCreateSavedFilter,
  useDeleteSavedFilter,
  useSavedFilters,
} from '@/lib/queries/search'
import { countActiveFilters, type IssueFilter } from '@/lib/types/app'
import { cn, debounce, displayName, errorMessage } from '@/lib/utils'

export function FilterBar({
  filter,
  onChange,
  sources,
  projectId,
  onExport,
  className,
}: {
  filter: IssueFilter
  onChange: (filter: IssueFilter) => void
  sources: FilterSources
  projectId?: string
  onExport?: () => void
  className?: string
}) {
  const { userId, workspaceId } = useWorkspaceContext()
  const [panelOpen, setPanelOpen] = React.useState(false)
  const [savingFilter, setSavingFilter] = React.useState<IssueFilter | null>(null)
  const [text, setText] = React.useState(filter.text ?? '')

  const { data: savedFilters } = useSavedFilters(workspaceId)
  const createSaved = useCreateSavedFilter(workspaceId)
  const deleteSaved = useDeleteSavedFilter(workspaceId)

  const activeCount = countActiveFilters(filter)

  // Keep the visible input in step when the filter is replaced from outside
  // (a saved filter, the URL, a cleared chip).
  React.useEffect(() => setText(filter.text ?? ''), [filter.text])

  const pushText = React.useMemo(
    () =>
      debounce((value: string) => {
        onChange({ ...filter, text: value || undefined })
      }, 250),
    // `filter` is captured deliberately: the debounce always merges into the
    // latest filter object supplied by the parent.
    [filter, onChange]
  )

  const isMine = filter.assigneeIds?.length === 1 && filter.assigneeIds[0] === userId
  const isUnassigned =
    filter.assigneeIds?.length === 1 && filter.assigneeIds[0] === 'unassigned'

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="relative min-w-0 flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            pushText(event.target.value)
          }}
          placeholder="Filter by title…"
          aria-label="Filter issues by title"
          className="h-8 pl-8 pr-8 text-xs"
        />
        {text ? (
          <button
            type="button"
            onClick={() => {
              setText('')
              onChange({ ...filter, text: undefined })
            }}
            className="absolute right-1.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear title filter"
          >
            <X className="size-3" />
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-1">
        <QuickChip
          active={Boolean(isMine)}
          onClick={() =>
            onChange({ ...filter, assigneeIds: isMine ? undefined : [userId] })
          }
        >
          My issues
        </QuickChip>
        <QuickChip
          active={Boolean(isUnassigned)}
          onClick={() =>
            onChange({
              ...filter,
              assigneeIds: isUnassigned ? undefined : ['unassigned'],
            })
          }
        >
          Unassigned
        </QuickChip>
        <QuickChip
          active={Boolean(filter.overdue)}
          onClick={() => onChange({ ...filter, overdue: filter.overdue ? undefined : true })}
        >
          Overdue
        </QuickChip>
      </div>

      {/* Avatar row — one tap to filter to a single teammate. */}
      {sources.members?.length ? (
        <div className="hidden items-center lg:flex">
          {sources.members.slice(0, 6).map((member, index) => {
            const selected = filter.assigneeIds?.includes(member.user_id) ?? false
            return (
              <Tooltip key={member.user_id} content={displayName(member.profile)}>
                <button
                  type="button"
                  onClick={() => {
                    const current = filter.assigneeIds ?? []
                    const next = selected
                      ? current.filter((id) => id !== member.user_id)
                      : [...current, member.user_id]
                    onChange({ ...filter, assigneeIds: next.length ? next : undefined })
                  }}
                  className={cn(
                    'rounded-full transition-[transform,box-shadow]',
                    index > 0 && '-ml-1.5',
                    selected
                      ? 'z-10 -translate-y-0.5 ring-2 ring-primary'
                      : 'ring-2 ring-surface hover:z-10 hover:-translate-y-0.5'
                  )}
                  aria-pressed={selected}
                  aria-label={`Filter by ${displayName(member.profile)}`}
                >
                  <Avatar
                    id={member.user_id}
                    name={member.profile?.full_name}
                    src={member.profile?.avatar_url}
                    size="sm"
                  />
                </button>
              </Tooltip>
            )
          })}
        </div>
      ) : null}

      <div className="ml-auto flex items-center gap-1.5">
        {activeCount ? (
          <Button variant="ghost" size="sm" onClick={() => onChange({ sort: filter.sort })}>
            <X />
            Clear
          </Button>
        ) : null}

        <SavedFiltersMenu
          savedFilters={savedFilters}
          onApply={onChange}
          onDelete={(id) => deleteSaved.mutate(id)}
          onSaveCurrent={() => setSavingFilter(filter)}
          canSave={activeCount > 0}
          userId={userId}
        />

        <Button variant="secondary" size="sm" onClick={() => setPanelOpen(true)}>
          <Filter />
          Filters
          {activeCount ? (
            <Badge variant="primary" className="ml-0.5">
              {activeCount}
            </Badge>
          ) : null}
        </Button>

        {onExport ? (
          <Tooltip content="Export the current list as CSV">
            <Button variant="secondary" size="icon-sm" onClick={onExport} aria-label="Export CSV">
              <Download />
            </Button>
          </Tooltip>
        ) : null}
      </div>

      <FilterPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        filter={filter}
        onApply={onChange}
        onSaveAsFilter={(draft) => setSavingFilter(draft)}
        sources={sources}
      />

      <SaveFilterDialog
        filter={savingFilter}
        onClose={() => setSavingFilter(null)}
        onSave={async ({ name, isShared }) => {
          if (!savingFilter) return
          try {
            await createSaved.mutateAsync({
              name,
              query: savingFilter,
              projectId: projectId ?? null,
              ownerId: userId,
              isShared,
            })
            toast.success(`Saved “${name}”`)
            setSavingFilter(null)
          } catch (error) {
            toast.error(errorMessage(error, 'Could not save the filter'))
          }
        }}
        saving={createSaved.isPending}
      />
    </div>
  )
}

function QuickChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-8 whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary-subtle text-primary-subtle-foreground'
          : 'border-border bg-surface text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function SavedFiltersMenu({
  savedFilters,
  onApply,
  onDelete,
  onSaveCurrent,
  canSave,
  userId,
}: {
  savedFilters: { id: string; name: string; query: IssueFilter; owner_id: string; is_shared: boolean }[] | undefined
  onApply: (filter: IssueFilter) => void
  onDelete: (id: string) => void
  onSaveCurrent: () => void
  canSave: boolean
  userId: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm">
          <Bookmark />
          <span className="hidden sm:inline">Saved</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Saved filters</DropdownMenuLabel>
        {savedFilters?.length ? (
          savedFilters.map((saved) => (
            <DropdownMenuItem
              key={saved.id}
              onSelect={() => onApply(saved.query ?? {})}
              className="items-start"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{saved.name}</p>
                <p className="truncate text-2xs text-muted-foreground">
                  {describeFilter(saved.query ?? {})}
                </p>
              </div>
              {saved.owner_id === userId ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDelete(saved.id)
                  }}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive-subtle hover:text-destructive"
                  aria-label={`Delete ${saved.name}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </DropdownMenuItem>
          ))
        ) : (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            No saved filters yet. Build a filter, then save it here.
          </p>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!canSave} onSelect={onSaveCurrent}>
          <BookmarkPlus />
          Save current filter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SaveFilterDialog({
  filter,
  onClose,
  onSave,
  saving,
}: {
  filter: IssueFilter | null
  onClose: () => void
  onSave: (input: { name: string; isShared: boolean }) => void
  saving: boolean
}) {
  const [name, setName] = React.useState('')
  const [isShared, setIsShared] = React.useState(false)

  React.useEffect(() => {
    if (filter) {
      setName('')
      setIsShared(false)
    }
  }, [filter])

  return (
    <Dialog open={Boolean(filter)} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent size="sm">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim()) onSave({ name: name.trim(), isShared })
          }}
        >
          <DialogHeader>
            <DialogTitle>Save this filter</DialogTitle>
            <DialogDescription>{filter ? describeFilter(filter) : ''}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field label="Name" htmlFor="saved-filter-name" required>
              <Input
                id="saved-filter-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Open bugs by priority"
                maxLength={60}
                autoFocus
                required
              />
            </Field>
            <label className="flex items-start gap-2.5 text-xs">
              <Switch
                checked={isShared}
                onCheckedChange={setIsShared}
                aria-label="Share with the workspace"
              />
              <span>
                <span className="block font-medium">Share with the workspace</span>
                <span className="block text-muted-foreground">
                  Everyone in this workspace can apply it. Only you can edit or delete it.
                </span>
              </span>
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              Save filter
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
