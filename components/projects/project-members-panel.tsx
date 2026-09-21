'use client'

import { Info, UserPlus, X } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { useProjectContext } from './project-provider'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/controls'
import { Avatar, Badge, Card, EmptyState, Skeleton } from '@/components/ui/primitives'
import {
  useAddProjectMember,
  useProjectMembers,
  useRemoveProjectMember,
  useSetProjectRole,
} from '@/lib/queries/project-members'
import { useMembers } from '@/lib/queries/workspaces'
import type { ProjectRole } from '@/lib/types/database'
import { displayName, errorMessage } from '@/lib/utils'

const ROLE_HELP: Record<ProjectRole, string> = {
  lead: 'Owns the project. Shown as the lead everywhere.',
  manager: 'Runs the board, the backlog and the sprints.',
  member: 'Works the issues: create, comment, move their own.',
  viewer: 'Read-only. Useful for stakeholders and clients.',
}

/**
 * Who can reach this project.
 *
 * This is not a convenience list — it is the access-control table. Somebody
 * who belongs to the workspace but is not here cannot see the project at all,
 * unless their position carries `project.view_all`.
 */
export function ProjectMembersPanel() {
  const { projectId, project } = useProjectContext()
  const { workspaceId } = useWorkspaceContext()

  const { data: projectMembers, isLoading } = useProjectMembers(projectId)
  const { data: workspaceMembers } = useMembers(workspaceId)

  const addMember = useAddProjectMember(projectId ?? '')
  const setRole = useSetProjectRole(projectId ?? '')
  const removeMember = useRemoveProjectMember(projectId ?? '')

  const [selected, setSelected] = React.useState('')
  const [selectedRole, setSelectedRole] = React.useState<ProjectRole>('member')

  const alreadyIn = new Set((projectMembers ?? []).map((member) => member.user_id))
  const candidates = (workspaceMembers ?? []).filter(
    (member) => member.status === 'active' && !alreadyIn.has(member.user_id)
  )

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action()
      toast.success(success)
    } catch (caught) {
      toast.error('That did not work', { description: errorMessage(caught) })
    }
  }

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-start gap-2.5 rounded-lg border border-info/30 bg-info-subtle px-3.5 py-3">
        <Info className="mt-px size-4 shrink-0 text-info" aria-hidden />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Only the people listed here can open{' '}
          <strong className="font-medium text-foreground">{project?.name}</strong>.
          Workspace membership on its own is not enough — owners and workspace
          admins are the exception, because their position grants{' '}
          <em>View all projects</em>.
        </p>
      </div>

      {/* Add ------------------------------------------------------------- */}
      <Card className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="flex-1" aria-label="Choose someone to add">
            <SelectValue placeholder="Add someone from your workspace…" />
          </SelectTrigger>
          <SelectContent>
            {candidates.length ? (
              candidates.map((member) => (
                <SelectItem key={member.user_id} value={member.user_id}>
                  {displayName(member.profile)}
                  {member.position ? ` · ${member.position.name}` : ''}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="__none__" disabled>
                Everyone is already on this project
              </SelectItem>
            )}
          </SelectContent>
        </Select>

        <Select
          value={selectedRole}
          onValueChange={(value) => setSelectedRole(value as ProjectRole)}
        >
          <SelectTrigger className="sm:w-36" aria-label="Project role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ROLE_HELP) as ProjectRole[]).map((role) => (
              <SelectItem key={role} value={role}>
                {role.charAt(0).toUpperCase() + role.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="primary"
          disabled={!selected || selected === '__none__' || addMember.isPending}
          loading={addMember.isPending}
          onClick={async () => {
            await run(
              () => addMember.mutateAsync({ userId: selected, projectRole: selectedRole }),
              'Added to the project'
            )
            setSelected('')
          }}
        >
          <UserPlus aria-hidden />
          Add
        </Button>
      </Card>

      {/* Roster ---------------------------------------------------------- */}
      {isLoading ? (
        <Card className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 p-3.5">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-8 w-28 rounded-lg" />
            </div>
          ))}
        </Card>
      ) : !projectMembers?.length ? (
        <EmptyState
          icon={<UserPlus />}
          title="Nobody is on this project yet"
          description="Add the people who should be able to see and work on it."
        />
      ) : (
        <Card className="divide-y divide-border">
          {projectMembers.map((member) => {
            const isLead = member.user_id === project?.lead_id
            return (
              <div key={member.id} className="flex flex-wrap items-center gap-3 p-3.5">
                <Avatar
                  id={member.user_id}
                  name={displayName(member.profile)}
                  src={member.profile?.avatar_url}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {displayName(member.profile)}
                    {isLead ? <Badge variant="primary">Lead</Badge> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.profile?.email}
                  </p>
                </div>

                <Select
                  value={member.project_role}
                  onValueChange={(value) =>
                    void run(
                      () =>
                        setRole.mutateAsync({
                          userId: member.user_id,
                          projectRole: value as ProjectRole,
                        }),
                      'Project role updated'
                    )
                  }
                >
                  <SelectTrigger
                    className="w-32"
                    aria-label={`Project role for ${displayName(member.profile)}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROLE_HELP) as ProjectRole[]).map((role) => (
                      <SelectItem key={role} value={role}>
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${displayName(member.profile)} from the project`}
                  className="text-destructive hover:bg-destructive-subtle"
                  onClick={() =>
                    void run(
                      () => removeMember.mutateAsync(member.user_id),
                      `${displayName(member.profile)} removed from the project`
                    )
                  }
                >
                  <X />
                </Button>
              </div>
            )
          })}
        </Card>
      )}

      <dl className="grid gap-1.5 rounded-lg bg-muted px-3.5 py-3 text-xs sm:grid-cols-2">
        {(Object.entries(ROLE_HELP) as [ProjectRole, string][]).map(([role, help]) => (
          <div key={role} className="flex gap-1.5">
            <dt className="font-medium capitalize">{role}</dt>
            <dd className="text-muted-foreground">— {help}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
