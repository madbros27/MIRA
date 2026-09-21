'use client'

import { Network } from 'lucide-react'
import * as React from 'react'

import { Avatar, Badge, Card, EmptyState } from '@/components/ui/primitives'
import { useMembers } from '@/lib/queries/workspaces'
import type { Member } from '@/lib/types/app'
import { cn, displayName } from '@/lib/utils'

type Node = { member: Member; reports: Node[] }

/**
 * Reporting structure, built from `workspace_members.reports_to_user_id`.
 *
 * Anyone without a manager is a root, which means a workspace that has never
 * set a reporting line renders as one flat list rather than an error. Cycles
 * are broken by a visited set — the database forbids self-reporting but not
 * a longer loop, and a stack overflow is a poor way to find out.
 */
export function OrgChart({ workspaceId }: { workspaceId: string }) {
  const { data: members } = useMembers(workspaceId)

  const roots = React.useMemo(() => buildTree(members ?? []), [members])

  if (!members?.length) {
    return (
      <EmptyState
        icon={<Network />}
        title="Nobody to chart yet"
        description="Invite your team, then set who reports to whom from the directory."
      />
    )
  }

  const unassigned = members.filter((member) => !member.reports_to_user_id).length

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Built from the reporting lines set in the directory.
        {unassigned === members.length
          ? ' Nobody has a manager yet, so everyone shows as a root.'
          : ''}
      </p>

      <Card className="overflow-x-auto p-4 sm:p-5">
        <ul className="space-y-4">
          {roots.map((node) => (
            <OrgNode key={node.member.user_id} node={node} depth={0} />
          ))}
        </ul>
      </Card>
    </div>
  )
}

function OrgNode({ node, depth }: { node: Node; depth: number }) {
  const { member, reports } = node

  return (
    <li>
      <div
        className={cn(
          'flex items-center gap-2.5 rounded-lg border border-border bg-surface p-2.5',
          depth === 0 && 'border-primary/30 bg-primary-subtle/30'
        )}
      >
        <Avatar
          id={member.user_id}
          name={displayName(member.profile)}
          src={member.profile?.avatar_url}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{displayName(member.profile)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {member.position?.name ?? (member.is_owner ? 'Owner' : 'No position')}
          </p>
        </div>
        {reports.length ? (
          <Badge variant="neutral">
            {reports.length} report{reports.length === 1 ? '' : 's'}
          </Badge>
        ) : null}
      </div>

      {reports.length ? (
        <ul className="ml-4 mt-2 space-y-2 border-l border-border pl-4">
          {reports.map((child) => (
            <OrgNode key={child.member.user_id} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function buildTree(members: Member[]): Node[] {
  const byId = new Map(members.map((member) => [member.user_id, member]))
  const nodes = new Map<string, Node>(
    members.map((member) => [member.user_id, { member, reports: [] }])
  )

  const roots: Node[] = []

  for (const member of members) {
    const node = nodes.get(member.user_id)!
    const managerId = member.reports_to_user_id

    // No manager, a manager who has left, or a reporting loop: treat as root.
    if (!managerId || !byId.has(managerId) || createsCycle(member, byId)) {
      roots.push(node)
      continue
    }
    nodes.get(managerId)!.reports.push(node)
  }

  const byName = (a: Node, b: Node) =>
    displayName(a.member.profile).localeCompare(displayName(b.member.profile))

  const sortDeep = (list: Node[]) => {
    list.sort(byName)
    for (const node of list) sortDeep(node.reports)
  }
  sortDeep(roots)

  return roots
}

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
