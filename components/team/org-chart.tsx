'use client'

import {
  ArrowUp,
  Briefcase,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Crown,
  GitBranch,
  Mail,
  Maximize2,
  Minimize2,
  Network,
  Search,
  Sparkles,
  User,
  Users,
  X,
} from 'lucide-react'
import * as React from 'react'

import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, Badge, Card, EmptyState } from '@/components/ui/primitives'
import { getSubordinateUserIds } from '@/lib/permissions/team-access'
import { useMembers } from '@/lib/queries/workspaces'
import type { Member } from '@/lib/types/app'
import { cn, displayName } from '@/lib/utils'

/**
 * Microsoft Teams-style interactive Organizational Chart.
 *
 * Features:
 * 1. Teams Focus View:
 *    - Hierarchical chain from root leaders down to the focused member.
 *    - Direct manager card above with connecting stem.
 *    - Prominent focused member hero card with avatar, role, contact, and team metrics.
 *    - Branching connector lines to direct reports cards below with report counts.
 *    - Peer discovery (coworkers under the same manager).
 * 2. Visual Tree View:
 *    - Multi-tier visual hierarchy diagram with expandable/collapsible departments.
 * 3. Interactive Toolbar:
 *    - Instant member search with auto-suggest dropdown.
 *    - "Focus on Me" shortcut for the signed-in user.
 *    - Root leader switcher.
 *    - View mode switcher (Teams Drilldown vs Full Chart).
 */
export function OrgChart({
  workspaceId,
  currentUserId: propUserId,
}: {
  workspaceId: string
  currentUserId?: string
}) {
  const { data: members, isLoading } = useMembers(workspaceId)
  const { userId: contextUserId } = useWorkspaceContext()
  const currentUserId = propUserId ?? contextUserId

  const [viewMode, setViewMode] = React.useState<'teams' | 'tree'>('teams')
  const [focusedUserId, setFocusedUserId] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [showPeers, setShowPeers] = React.useState(false)
  const [copiedEmail, setCopiedEmail] = React.useState<string | null>(null)
  const [expandedNodes, setExpandedNodes] = React.useState<Set<string>>(new Set())

  // Maps and tree structures
  const { byId, directReportsMap, roots } = React.useMemo(() => {
    const list = members ?? []
    const byIdMap = new Map<string, Member>(list.map((m) => [m.user_id, m]))
    const reportsMap = new Map<string, Member[]>()
    for (const m of list) {
      reportsMap.set(m.user_id, [])
    }

    const rootList: Member[] = []

    for (const m of list) {
      const managerId = m.reports_to_user_id
      if (!managerId || !byIdMap.has(managerId) || createsCycle(m, byIdMap)) {
        rootList.push(m)
      } else {
        reportsMap.get(managerId)?.push(m)
      }
    }

    // Sort by name
    const sortByName = (a: Member, b: Member) =>
      displayName(a.profile).localeCompare(displayName(b.profile))

    rootList.sort(sortByName)
    for (const reports of reportsMap.values()) {
      reports.sort(sortByName)
    }

    return { byId: byIdMap, directReportsMap: reportsMap, roots: rootList }
  }, [members])

  // Initialize or maintain focused user
  React.useEffect(() => {
    if (!members?.length) return
    if (!focusedUserId || !byId.has(focusedUserId)) {
      // Default priority: current user -> workspace owner -> first root -> first member
      const currentUserMember = members.find((m) => m.user_id === currentUserId)
      const ownerMember = members.find((m) => m.is_owner)
      const initial = currentUserMember ?? ownerMember ?? roots[0] ?? members[0]
      if (initial) {
        setFocusedUserId(initial.user_id)
      }
    }
  }, [members, focusedUserId, byId, currentUserId, roots])

  // Initialize expanded nodes for tree view (expand top 2 levels by default)
  React.useEffect(() => {
    if (!roots.length) return
    const initialExpanded = new Set<string>()
    for (const r of roots) {
      initialExpanded.add(r.user_id)
      const children = directReportsMap.get(r.user_id) ?? []
      for (const c of children) {
        initialExpanded.add(c.user_id)
      }
    }
    setExpandedNodes(initialExpanded)
  }, [roots, directReportsMap])

  // Current focused member
  const focusedMember = focusedUserId ? byId.get(focusedUserId) : null

  // Ancestor chain from root to focused member's manager
  const ancestorChain = React.useMemo(() => {
    if (!focusedMember) return []
    const chain: Member[] = []
    const seen = new Set<string>([focusedMember.user_id])
    let curr = focusedMember.reports_to_user_id

    while (curr && byId.has(curr) && !seen.has(curr)) {
      seen.add(curr)
      chain.unshift(byId.get(curr)!)
      curr = byId.get(curr)?.reports_to_user_id ?? null
    }
    return chain
  }, [focusedMember, byId])

  // Direct reports of focused member
  const directReports = focusedMember ? directReportsMap.get(focusedMember.user_id) ?? [] : []

  // Direct manager of focused member
  const directManager = focusedMember?.reports_to_user_id
    ? byId.get(focusedMember.reports_to_user_id) ?? null
    : null

  // Peers (reporting to the same manager)
  const peers = React.useMemo(() => {
    if (!focusedMember || !directManager) return []
    return (directReportsMap.get(directManager.user_id) ?? []).filter(
      (m) => m.user_id !== focusedMember.user_id
    )
  }, [focusedMember, directManager, directReportsMap])

  // Total subordinate team count for focused member
  const totalDownlineCount = React.useMemo(() => {
    if (!focusedMember || !members) return 0
    return getSubordinateUserIds(members, focusedMember.user_id).size
  }, [focusedMember, members])

  // Search filter
  const searchResults = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q || !members) return []
    return members
      .filter((m) => {
        const name = displayName(m.profile).toLowerCase()
        const email = (m.profile?.email ?? '').toLowerCase()
        const pos = (m.position?.name ?? (m.is_owner ? 'owner' : '')).toLowerCase()
        return name.includes(q) || email.includes(q) || pos.includes(q)
      })
      .slice(0, 8)
  }, [members, searchQuery])

  const handleCopyEmail = (email: string, e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(email).then(() => {
      setCopiedEmail(email)
      setTimeout(() => setCopiedEmail(null), 2000)
    })
  }

  const toggleExpand = (userId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const expandAll = () => {
    if (!members) return
    setExpandedNodes(new Set(members.map((m) => m.user_id)))
  }

  const collapseAll = () => {
    setExpandedNodes(new Set())
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Loading organization chart…</span>
        </div>
      </div>
    )
  }

  if (!members?.length) {
    return (
      <EmptyState
        icon={<Network />}
        title="Nobody to chart yet"
        description="Invite your team, then set who reports to whom from the directory."
      />
    )
  }

  const unassignedCount = members.filter((m) => !m.reports_to_user_id).length
  const allUnassigned = unassignedCount === members.length

  return (
    <div className="space-y-4">
      {/* Informational banner when reporting structure is not yet configured */}
      {allUnassigned && (
        <div className="flex items-center justify-between rounded-lg border border-info/30 bg-info-subtle/30 px-3.5 py-2.5 text-xs text-foreground">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-info shrink-0" />
            <span>
              Reporting lines haven&apos;t been configured yet. In the Directory tab, set each member&apos;s
              manager to build the reporting hierarchy. Select any member below to explore their card.
            </span>
          </div>
        </div>
      )}

      {/* Main Toolbar */}
      <Card className="p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Search bar with instant results popover */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search person or position…"
              className="pl-8 pr-7 h-9 text-xs"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            ) : null}

            {/* Instant Search Results Dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-border bg-surface shadow-xl max-h-64 overflow-y-auto p-1.5">
                <p className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Matching Members ({searchResults.length})
                </p>
                {searchResults.map((m) => (
                  <button
                    key={m.user_id}
                    type="button"
                    onClick={() => {
                      setFocusedUserId(m.user_id)
                      setSearchQuery('')
                    }}
                    className={cn(
                      'flex items-center gap-2.5 w-full p-2 text-left rounded-lg transition-colors text-xs',
                      m.user_id === focusedUserId
                        ? 'bg-primary-subtle text-primary font-medium'
                        : 'hover:bg-muted text-foreground'
                    )}
                  >
                    <Avatar
                      id={m.user_id}
                      name={displayName(m.profile)}
                      src={m.profile?.avatar_url}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{displayName(m.profile)}</p>
                      <p className="text-2xs text-muted-foreground truncate">
                        {m.position?.name ?? (m.is_owner ? 'Owner' : 'No position')}
                      </p>
                    </div>
                    {m.user_id === currentUserId && (
                      <Badge variant="info" size="sm">
                        You
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Action Buttons & View Mode Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Focus on Me button */}
            {currentUserId && byId.has(currentUserId) && (
              <Button
                variant={focusedUserId === currentUserId ? 'subtle' : 'secondary'}
                size="sm"
                onClick={() => setFocusedUserId(currentUserId)}
                className="h-9 gap-1.5 text-xs"
                title="Focus chart on your profile"
              >
                <User className="size-3.5 text-primary" />
                <span>Focus on Me</span>
              </Button>
            )}

            {/* Jump to Root Leader button */}
            {roots.length > 0 && roots[0].user_id !== focusedUserId && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setFocusedUserId(roots[0].user_id)}
                className="h-9 gap-1.5 text-xs"
                title="Jump to workspace leadership"
              >
                <Crown className="size-3.5 text-amber-500" />
                <span>Top Leader</span>
              </Button>
            )}

            {/* View Mode Switcher (Teams View vs Full Chart) */}
            <div className="flex items-center rounded-lg border border-border bg-surface-sunken p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('teams')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  viewMode === 'teams'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Users className="size-3.5" />
                <span>Teams View</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('tree')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  viewMode === 'tree'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Network className="size-3.5" />
                <span>Full Chart</span>
              </button>
            </div>
          </div>
        </div>

        {/* Root Leaders Quick Filter Bar (when multiple roots exist) */}
        {roots.length > 1 && (
          <div className="mt-3 pt-3 border-t border-border flex items-center gap-1.5 overflow-x-auto text-xs">
            <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground shrink-0 flex items-center gap-1">
              <Crown className="size-3 text-amber-500" /> Top Leaders:
            </span>
            {roots.map((root) => {
              const isSelected = focusedUserId === root.user_id
              return (
                <button
                  key={root.user_id}
                  type="button"
                  onClick={() => setFocusedUserId(root.user_id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs transition-colors shrink-0 border',
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground font-semibold shadow-xs'
                      : 'border-border bg-surface hover:bg-muted text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Avatar
                    id={root.user_id}
                    name={displayName(root.profile)}
                    src={root.profile?.avatar_url}
                    size="xs"
                  />
                  <span className="truncate max-w-[120px]">{displayName(root.profile)}</span>
                  {directReportsMap.get(root.user_id)?.length ? (
                    <span className="rounded-full bg-black/10 dark:bg-white/10 px-1 text-[0.625rem]">
                      {directReportsMap.get(root.user_id)!.length}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
      </Card>

      {/* Main Content Area based on View Mode */}
      {viewMode === 'teams' ? (
        <TeamsFocusView
          focusedMember={focusedMember}
          directManager={directManager}
          ancestorChain={ancestorChain}
          directReports={directReports}
          peers={peers}
          showPeers={showPeers}
          setShowPeers={setShowPeers}
          currentUserId={currentUserId}
          totalDownlineCount={totalDownlineCount}
          copiedEmail={copiedEmail}
          onCopyEmail={handleCopyEmail}
          onSelectMember={(uid) => setFocusedUserId(uid)}
          directReportsMap={directReportsMap}
        />
      ) : (
        <FullTreeView
          roots={roots}
          directReportsMap={directReportsMap}
          expandedNodes={expandedNodes}
          onToggleExpand={toggleExpand}
          onExpandAll={expandAll}
          onCollapseAll={collapseAll}
          focusedUserId={focusedUserId}
          currentUserId={currentUserId}
          onSelectMember={(uid) => {
            setFocusedUserId(uid)
            setViewMode('teams')
          }}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Microsoft Teams Focus View Component                                       */
/* -------------------------------------------------------------------------- */

function TeamsFocusView({
  focusedMember,
  directManager,
  ancestorChain,
  directReports,
  peers,
  showPeers,
  setShowPeers,
  currentUserId,
  totalDownlineCount,
  copiedEmail,
  onCopyEmail,
  onSelectMember,
  directReportsMap,
}: {
  focusedMember: Member | null | undefined
  directManager: Member | null
  ancestorChain: Member[]
  directReports: Member[]
  peers: Member[]
  showPeers: boolean
  setShowPeers: (show: boolean) => void
  currentUserId: string | undefined
  totalDownlineCount: number
  copiedEmail: string | null
  onCopyEmail: (email: string, e: React.MouseEvent) => void
  onSelectMember: (userId: string) => void
  directReportsMap: Map<string, Member[]>
}) {
  if (!focusedMember) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">Select a member to view their organization chart.</p>
      </Card>
    )
  }

  const grandManager = ancestorChain.length > 1 ? ancestorChain[ancestorChain.length - 2] : null
  const higherLevelsCount = ancestorChain.length > 1 ? ancestorChain.length - 1 : 0

  return (
    <div className="space-y-6">
      {/* Breadcrumb Hierarchy Trail */}
      <Card className="px-4 py-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          <span className="font-semibold text-muted-foreground shrink-0 flex items-center gap-1 text-2xs uppercase tracking-wide">
            <GitBranch className="size-3.5 text-primary" /> Chain of Command:
          </span>
          {ancestorChain.map((ancestor) => (
            <React.Fragment key={ancestor.user_id}>
              <button
                type="button"
                onClick={() => onSelectMember(ancestor.user_id)}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              >
                <Avatar
                  id={ancestor.user_id}
                  name={displayName(ancestor.profile)}
                  src={ancestor.profile?.avatar_url}
                  size="xs"
                />
                <span className="truncate max-w-[120px] font-medium">
                  {displayName(ancestor.profile)}
                </span>
                {ancestor.user_id === currentUserId && (
                  <Badge variant="info" size="sm">
                    You
                  </Badge>
                )}
              </button>
              <ChevronRight className="size-3.5 text-muted-foreground/60 shrink-0" />
            </React.Fragment>
          ))}

          {/* Current Focused Leaf in Breadcrumbs */}
          <div className="flex items-center gap-1.5 rounded-md bg-primary-subtle text-primary font-semibold px-2 py-1 border border-primary/20 shrink-0">
            <Avatar
              id={focusedMember.user_id}
              name={displayName(focusedMember.profile)}
              src={focusedMember.profile?.avatar_url}
              size="xs"
            />
            <span className="truncate max-w-[140px]">{displayName(focusedMember.profile)}</span>
            {focusedMember.user_id === currentUserId && (
              <Badge variant="info" size="sm">
                You
              </Badge>
            )}
            <Badge variant="primary" size="sm">
              Active
            </Badge>
          </div>
        </div>
      </Card>

      {/* Main Teams Org Canvas: Manager -> Focused Person -> Direct Reports */}
      <div className="relative rounded-2xl border border-border bg-gradient-to-b from-surface via-surface to-surface-sunken/40 p-4 sm:p-8 overflow-hidden">
        {/* Subtle decorative grid background */}
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />

        <div className="relative flex flex-col items-center">
          {/* LEVEL 1: MANAGER SECTION (ABOVE) */}
          {directManager ? (
            <div className="flex flex-col items-center w-full max-w-md">
              {/* Higher levels indicator if chain is deep */}
              {higherLevelsCount > 1 && grandManager && (
                <button
                  type="button"
                  onClick={() => onSelectMember(grandManager.user_id)}
                  className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-2xs font-medium text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors shadow-xs"
                >
                  <ArrowUp className="size-3 text-primary" />
                  <span>
                    {higherLevelsCount} levels above · {displayName(grandManager.profile)}
                  </span>
                </button>
              )}

              {/* Direct Manager Card */}
              <div
                onClick={() => onSelectMember(directManager.user_id)}
                className="group relative w-full cursor-pointer rounded-xl border border-border bg-surface p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md"
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/50 text-2xs uppercase font-semibold tracking-wider text-muted-foreground">
                  <span className="flex items-center gap-1 text-primary">
                    <ArrowUp className="size-3" /> Reports to Manager
                  </span>
                  <span className="text-muted-foreground group-hover:text-primary transition-colors flex items-center gap-0.5 text-[0.625rem]">
                    Click to view <ChevronRight className="size-3" />
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <Avatar
                    id={directManager.user_id}
                    name={displayName(directManager.profile)}
                    src={directManager.profile?.avatar_url}
                    size="md"
                    ring
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                        {displayName(directManager.profile)}
                      </p>
                      {directManager.user_id === currentUserId && (
                        <Badge variant="info" size="sm">
                          You
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {directManager.position?.name ??
                        (directManager.is_owner ? 'Workspace Owner' : 'Team Leader')}
                    </p>
                  </div>
                  {directReportsMap.get(directManager.user_id)?.length ? (
                    <Badge variant="neutral" size="sm" className="gap-1 shrink-0">
                      <Users className="size-3" />
                      {directReportsMap.get(directManager.user_id)!.length}
                    </Badge>
                  ) : null}
                </div>
              </div>

              {/* Vertical connector down to focused card */}
              <div className="flex flex-col items-center">
                <div className="h-6 w-0.5 bg-primary/40" />
                <div className="size-2 rounded-full bg-primary ring-4 ring-primary/20" />
                <div className="h-4 w-0.5 bg-primary/40" />
              </div>
            </div>
          ) : (
            /* Top-level leader indicator when member has no manager */
            <div className="flex flex-col items-center mb-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1 text-2xs font-semibold text-amber-600 dark:text-amber-400 shadow-xs">
                <Crown className="size-3.5 text-amber-500" />
                <span>Top-Level Leader · Workspace Leadership</span>
              </div>
              <div className="h-4 w-0.5 bg-primary/40 mt-1" />
            </div>
          )}

          {/* LEVEL 2: FOCUSED MEMBER HERO CARD (CENTER) */}
          <div className="relative w-full max-w-lg z-10">
            <div className="overflow-hidden rounded-2xl border-2 border-primary bg-surface shadow-xl ring-4 ring-primary/10 transition-all">
              {/* Header Ribbon */}
              <div className="flex items-center justify-between border-b border-primary/20 bg-primary-subtle px-4 py-2">
                <div className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-primary">
                  <Sparkles className="size-3.5" />
                  <span>Focused Profile</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {focusedMember.user_id === currentUserId && (
                    <Badge variant="info" size="sm">
                      You
                    </Badge>
                  )}
                  {focusedMember.is_owner && (
                    <Badge variant="warning" size="sm" className="gap-1">
                      <Crown className="size-3" /> Owner
                    </Badge>
                  )}
                  <Badge variant="outline" size="sm" className="bg-surface font-mono">
                    {focusedMember.status}
                  </Badge>
                </div>
              </div>

              {/* Body */}
              <div className="p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <Avatar
                    id={focusedMember.user_id}
                    name={displayName(focusedMember.profile)}
                    src={focusedMember.profile?.avatar_url}
                    size="lg"
                    className="size-16 text-base shadow-sm ring-4 ring-surface"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-lg sm:text-xl font-bold text-foreground">
                      {displayName(focusedMember.profile)}
                    </h3>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-primary">
                      <Briefcase className="size-3.5 shrink-0" />
                      <span>
                        {focusedMember.position?.name ??
                          (focusedMember.is_owner ? 'Workspace Owner' : 'No position assigned')}
                      </span>
                    </p>

                    {focusedMember.profile?.email && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="truncate text-xs text-muted-foreground flex items-center gap-1.5">
                          <Mail className="size-3 shrink-0" />
                          {focusedMember.profile.email}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => onCopyEmail(focusedMember.profile!.email!, e)}
                          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="Copy email address"
                        >
                          {copiedEmail === focusedMember.profile.email ? (
                            <Check className="size-3.5 text-success" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Team metrics row */}
                <div className="mt-5 grid grid-cols-2 gap-3 pt-4 border-t border-border">
                  <div className="rounded-xl border border-border bg-surface-sunken p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <Users className="size-3.5 text-primary" />
                      <span>Direct Reports</span>
                    </div>
                    <p className="mt-1 text-2xl font-bold text-foreground">
                      {directReports.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-sunken p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <Network className="size-3.5 text-primary" />
                      <span>Total Downline</span>
                    </div>
                    <p className="mt-1 text-2xl font-bold text-foreground">{totalDownlineCount}</p>
                  </div>
                </div>

                {/* Toggle peers under same manager button */}
                {peers.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-border flex justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPeers(!showPeers)}
                      className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Users className="size-3.5" />
                      <span>
                        {showPeers ? 'Hide' : 'Show'} {peers.length} Team Peer
                        {peers.length === 1 ? '' : 's'}
                      </span>
                      {showPeers ? (
                        <ChevronUp className="size-3.5" />
                      ) : (
                        <ChevronDown className="size-3.5" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* PEERS DRAWER (if toggled) */}
          {showPeers && peers.length > 0 && (
            <div className="mt-4 w-full max-w-3xl rounded-xl border border-border/80 bg-surface/90 p-4 shadow-sm backdrop-blur-xs">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Users className="size-3.5 text-primary" />
                  <span>
                    Peers reporting to {directManager ? displayName(directManager.profile) : 'same manager'} ({peers.length})
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setShowPeers(false)}
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {peers.map((peer) => (
                  <button
                    key={peer.user_id}
                    type="button"
                    onClick={() => onSelectMember(peer.user_id)}
                    className="flex items-center gap-2.5 rounded-lg border border-border bg-surface p-2.5 text-left hover:border-primary/60 hover:bg-muted/40 transition-colors"
                  >
                    <Avatar
                      id={peer.user_id}
                      name={displayName(peer.profile)}
                      src={peer.profile?.avatar_url}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate text-foreground">
                        {displayName(peer.profile)}
                      </p>
                      <p className="text-2xs text-muted-foreground truncate">
                        {peer.position?.name ?? (peer.is_owner ? 'Owner' : 'Member')}
                      </p>
                    </div>
                    {peer.user_id === currentUserId && (
                      <Badge variant="info" size="sm">
                        You
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* LEVEL 3: DIRECT REPORTS SECTION (BELOW) */}
          <div className="w-full mt-2">
            {/* Connecting stem from focused member down to reports */}
            <div className="flex flex-col items-center">
              <div className="h-6 w-0.5 bg-primary/40" />
              <div className="size-2 rounded-full bg-primary ring-4 ring-primary/20" />
              <div className="h-4 w-0.5 bg-primary/40" />
            </div>

            {directReports.length > 0 ? (
              <div className="mt-2 space-y-4">
                {/* Horizontal branching connector bar on desktop */}
                {directReports.length > 1 && (
                  <div className="hidden lg:block relative mx-auto h-4 w-3/4">
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary/40 rounded-full" />
                    <div className="absolute top-0 left-0 -translate-y-1/2 size-1.5 rounded-full bg-primary" />
                    <div className="absolute top-0 right-0 -translate-y-1/2 size-1.5 rounded-full bg-primary" />
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 size-2 rounded-full bg-primary" />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-foreground">Direct Reports</h4>
                    <Badge variant="neutral" size="sm">
                      {directReports.length}
                    </Badge>
                  </div>
                  <p className="text-2xs text-muted-foreground">
                    Click any card to drill down into their team
                  </p>
                </div>

                {/* Direct Reports Grid of MS Teams Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                  {directReports.map((report) => {
                    const childReports = directReportsMap.get(report.user_id) ?? []
                    const isSelf = report.user_id === currentUserId

                    return (
                      <div
                        key={report.user_id}
                        onClick={() => onSelectMember(report.user_id)}
                        className={cn(
                          'group relative cursor-pointer rounded-xl border border-border bg-surface p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary hover:shadow-md flex flex-col justify-between',
                          isSelf && 'border-info/40 bg-info-subtle/10'
                        )}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <Avatar
                              id={report.user_id}
                              name={displayName(report.profile)}
                              src={report.profile?.avatar_url}
                              size="md"
                              ring
                            />
                            <div className="flex flex-col items-end gap-1">
                              {isSelf && (
                                <Badge variant="info" size="sm">
                                  You
                                </Badge>
                              )}
                              {report.is_owner && (
                                <Badge variant="warning" size="sm">
                                  Owner
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 min-w-0">
                            <p className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                              {displayName(report.profile)}
                            </p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {report.position?.name ??
                                (report.is_owner ? 'Owner' : 'No position')}
                            </p>
                            {report.profile?.email && (
                              <p className="text-2xs text-muted-foreground/75 truncate mt-1">
                                {report.profile.email}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Card bottom actions/metrics */}
                        <div className="mt-3.5 pt-2.5 border-t border-border flex items-center justify-between text-2xs">
                          {childReports.length > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-primary-subtle px-2 py-0.5 font-medium text-primary">
                              <Users className="size-3" />
                              <span>
                                {childReports.length} report{childReports.length === 1 ? '' : 's'}
                              </span>
                              <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60 italic">
                              Individual contributor
                            </span>
                          )}

                          <span className="text-muted-foreground group-hover:text-primary transition-colors text-2xs font-medium">
                            Focus →
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              /* Individual Contributor empty state */
              <div className="mx-auto max-w-sm rounded-xl border border-dashed border-border bg-surface/60 p-6 text-center shadow-xs">
                <User className="size-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm font-semibold text-foreground">Individual Contributor</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {displayName(focusedMember.profile)} does not have any direct reports in this
                  workspace.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Full Visual Tree View Component                                            */
/* -------------------------------------------------------------------------- */

function FullTreeView({
  roots,
  directReportsMap,
  expandedNodes,
  onToggleExpand,
  onExpandAll,
  onCollapseAll,
  focusedUserId,
  currentUserId,
  onSelectMember,
}: {
  roots: Member[]
  directReportsMap: Map<string, Member[]>
  expandedNodes: Set<string>
  onToggleExpand: (userId: string) => void
  onExpandAll: () => void
  onCollapseAll: () => void
  focusedUserId: string | null
  currentUserId: string | undefined
  onSelectMember: (userId: string) => void
}) {
  return (
    <Card className="p-4 sm:p-6 space-y-4">
      {/* Tree controls */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Company Hierarchy</h4>
          <p className="text-xs text-muted-foreground">
            Full tree structure with expandable and collapsible branches
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="xs" onClick={onExpandAll} className="gap-1 text-2xs">
            <Maximize2 className="size-3" /> Expand All
          </Button>
          <Button variant="ghost" size="xs" onClick={onCollapseAll} className="gap-1 text-2xs">
            <Minimize2 className="size-3" /> Collapse All
          </Button>
        </div>
      </div>

      {/* Visual Tree */}
      <div className="overflow-x-auto py-2">
        <ul className="space-y-4">
          {roots.map((root) => (
            <VisualTreeNode
              key={root.user_id}
              member={root}
              directReportsMap={directReportsMap}
              expandedNodes={expandedNodes}
              onToggleExpand={onToggleExpand}
              focusedUserId={focusedUserId}
              currentUserId={currentUserId}
              onSelectMember={onSelectMember}
              depth={0}
            />
          ))}
        </ul>
      </div>
    </Card>
  )
}

function VisualTreeNode({
  member,
  directReportsMap,
  expandedNodes,
  onToggleExpand,
  focusedUserId,
  currentUserId,
  onSelectMember,
  depth,
}: {
  member: Member
  directReportsMap: Map<string, Member[]>
  expandedNodes: Set<string>
  onToggleExpand: (userId: string) => void
  focusedUserId: string | null
  currentUserId: string | undefined
  onSelectMember: (userId: string) => void
  depth: number
}) {
  const children = directReportsMap.get(member.user_id) ?? []
  const hasChildren = children.length > 0
  const isExpanded = expandedNodes.has(member.user_id)
  const isFocused = member.user_id === focusedUserId
  const isSelf = member.user_id === currentUserId

  return (
    <li className="relative">
      <div
        className={cn(
          'group flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5 transition-all max-w-xl',
          isFocused && 'border-primary ring-2 ring-primary/20 bg-primary-subtle/20',
          depth === 0 && !isFocused && 'border-primary/30 bg-primary-subtle/10'
        )}
      >
        {/* Expand/Collapse Toggle Button */}
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggleExpand(member.user_id)}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            title={isExpanded ? 'Collapse team' : 'Expand team'}
          >
            {isExpanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>
        ) : (
          <div className="size-6 shrink-0" />
        )}

        <Avatar
          id={member.user_id}
          name={displayName(member.profile)}
          src={member.profile?.avatar_url}
          size="sm"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">
              {displayName(member.profile)}
            </span>
            {isSelf && (
              <Badge variant="info" size="sm">
                You
              </Badge>
            )}
            {member.is_owner && (
              <Badge variant="warning" size="sm" className="gap-0.5">
                <Crown className="size-2.5" /> Owner
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {member.position?.name ?? (member.is_owner ? 'Workspace Owner' : 'No position')}
          </p>
        </div>

        {/* Reports Badge */}
        {hasChildren && (
          <Badge variant="neutral" size="sm" className="gap-1 shrink-0">
            <Users className="size-3" />
            {children.length}
          </Badge>
        )}

        {/* Drill into Teams View Button */}
        <Button
          variant="ghost"
          size="xs"
          onClick={() => onSelectMember(member.user_id)}
          className="shrink-0 text-2xs text-muted-foreground hover:text-primary"
        >
          View in Teams →
        </Button>
      </div>

      {/* Children branches with connector border */}
      {hasChildren && isExpanded && (
        <ul className="ml-5 mt-2 space-y-2 border-l-2 border-border/80 pl-4">
          {children.map((child) => (
            <VisualTreeNode
              key={child.user_id}
              member={child}
              directReportsMap={directReportsMap}
              expandedNodes={expandedNodes}
              onToggleExpand={onToggleExpand}
              focusedUserId={focusedUserId}
              currentUserId={currentUserId}
              onSelectMember={onSelectMember}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function createsCycle(start: Member, byId: Map<string, Member>): boolean {
  const seen = new Set<string>([start.user_id])
  let current = start.reports_to_user_id

  while (current) {
    if (seen.has(current)) return true
    seen.add(current)
    current = byId.get(current)?.reports_to_user_id ?? null
  }
  return false
}
