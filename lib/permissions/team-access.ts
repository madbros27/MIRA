import type { Grants } from './capabilities'
import type { Member, Position } from '@/lib/types/app'

export type TeamAccessConfig = {
  /** Individual member user IDs who are granted access to view Directory */
  directoryMemberIds: string[]
  /** Individual member user IDs who are granted access to view Positions */
  positionsMemberIds: string[]
  /** Position IDs whose holders are granted access to view Directory */
  directoryPositionIds: string[]
  /** Position IDs whose holders are granted access to view Positions */
  positionsPositionIds: string[]
}

export const DEFAULT_TEAM_ACCESS: TeamAccessConfig = {
  directoryMemberIds: [],
  positionsMemberIds: [],
  directoryPositionIds: [],
  positionsPositionIds: [],
}

/**
 * Checks whether a user has access to view Directory.
 * Owner always has access.
 * Non-owners only have access if granted explicitly by member ID or position ID.
 */
export function hasDirectoryAccess(
  userId: string | undefined,
  positionId: string | null | undefined,
  config: TeamAccessConfig | null | undefined,
  isOwner: boolean
): boolean {
  if (isOwner) return true
  if (!userId || !config) return false
  if (config.directoryMemberIds.includes(userId)) return true
  if (positionId && config.directoryPositionIds.includes(positionId)) return true
  return false
}

/**
 * Checks whether a user has access to view Positions.
 * Owner always has access.
 * Non-owners only have access if granted explicitly by member ID or position ID.
 */
export function hasPositionsAccess(
  userId: string | undefined,
  positionId: string | null | undefined,
  config: TeamAccessConfig | null | undefined,
  isOwner: boolean
): boolean {
  if (isOwner) return true
  if (!userId || !config) return false
  if (config.positionsMemberIds.includes(userId)) return true
  if (positionId && config.positionsPositionIds.includes(positionId)) return true
  return false
}

/**
 * Returns all user IDs who report directly or indirectly to currentUserId (subordinates).
 */
export function getSubordinateUserIds(members: Member[], currentUserId: string): Set<string> {
  const subordinates = new Set<string>()
  if (!currentUserId || !members?.length) return subordinates

  const queue = [currentUserId]
  const visited = new Set<string>([currentUserId])

  while (queue.length > 0) {
    const managerId = queue.shift()!
    for (const member of members) {
      if (member.reports_to_user_id === managerId && !visited.has(member.user_id)) {
        visited.add(member.user_id)
        subordinates.add(member.user_id)
        queue.push(member.user_id)
      }
    }
  }

  return subordinates
}

/**
 * Returns all user IDs who are higher in the reporting line (manager, manager's manager, etc. up to root/owner).
 */
export function getHigherUpUserIds(members: Member[], currentUserId: string): Set<string> {
  const higherUps = new Set<string>()
  if (!currentUserId || !members?.length) return higherUps

  const byId = new Map(members.map((m) => [m.user_id, m]))
  let current = byId.get(currentUserId)?.reports_to_user_id

  while (current && !higherUps.has(current)) {
    higherUps.add(current)
    current = byId.get(current)?.reports_to_user_id ?? null
  }

  // Also include any workspace owners as higher-ups
  for (const m of members) {
    if (m.is_owner && m.user_id !== currentUserId) {
      higherUps.add(m.user_id)
    }
  }

  return higherUps
}

/**
 * Determines whether viewerId can change controls or permissions of targetMember in the Directory.
 * Rule: Member cannot change controls/permissions of higher level position who they are reporting to;
 * they can ONLY control their reporting people (subordinates).
 */
export function canManageMember(
  viewerId: string,
  targetMember: Member,
  members: Member[],
  isOwner: boolean
): boolean {
  // Owner can manage any member except themselves or other co-owners if restricted
  if (isOwner) {
    return !targetMember.is_owner
  }

  // Non-owner cannot manage themselves
  if (targetMember.user_id === viewerId) {
    return false
  }

  // Non-owner cannot manage workspace owners
  if (targetMember.is_owner) {
    return false
  }

  // Non-owner can only manage members who report to them (direct or indirect reports)
  const subordinates = getSubordinateUserIds(members, viewerId)
  return subordinates.has(targetMember.user_id)
}

/**
 * Determines whether viewerId can change controls or permissions of a Position in Positions Editor.
 * Rule: Member cannot change controls or permissions of higher level position who he is reporting to;
 * they can ONLY control the positions and permissions of their reporting people.
 */
export function canControlPosition(
  viewerId: string,
  position: Position,
  members: Member[],
  isOwner: boolean
): boolean {
  if (isOwner) return true
  if (!viewerId) return false

  const higherUps = getHigherUpUserIds(members, viewerId)
  // The viewer themselves is also protected (viewer cannot edit their own position to escalate privileges)
  higherUps.add(viewerId)

  const subordinates = getSubordinateUserIds(members, viewerId)
  const membersInPosition = members.filter((m) => m.position_id === position.id)

  // If higher-level people or viewer hold this position, it is NOT controllable
  for (const member of membersInPosition) {
    if (higherUps.has(member.user_id) || member.is_owner) {
      return false
    }
  }

  // If any peers who are NOT subordinates hold this position, it is NOT controllable
  for (const member of membersInPosition) {
    if (!subordinates.has(member.user_id)) {
      return false
    }
  }

  // Must have at least one subordinate in this position, or if none assigned yet,
  // non-owners cannot control unassigned system default positions
  if (position.is_system_default) {
    return false
  }

  return membersInPosition.length > 0
}

/**
 * Filters the list of positions a viewer is permitted to assign to a subordinate.
 * A member cannot assign a subordinate to a higher-level position or a position
 * that grants capabilities exceeding what the member holds.
 */
export function getAssignablePositions(
  viewerCaps: Grants,
  positions: Position[],
  isOwner: boolean
): Position[] {
  if (isOwner) return positions

  return positions.filter((position) => {
    // Cannot assign positions that have capabilities the viewer does not possess
    return position.capabilities.every((cap) => viewerCaps.has(cap))
  })
}
