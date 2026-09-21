'use client'

import {
  ArrowLeft,
  ChevronRight,
  FolderKanban,
  HardDrive,
  ListChecks,
  Pencil,
  Star,
  UserPlus,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'

import { PageHeader, StatCard, UsageMeter, WorkspaceStatusPill } from './admin-ui'
import { AuditRowList } from './audit-list'
import { AssignOwnerDialog } from './assign-owner-dialog'
import { EditWorkspaceDialog } from './edit-workspace-dialog'
import { WorkspaceLifecycle } from './workspace-lifecycle'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls'
import { Button } from '@/components/ui/button'
import {
  Avatar,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@/components/ui/primitives'
import { formatDate, formatDateTime, formatRelative } from '@/lib/format'
import { adminError, useAdminWorkspace } from '@/lib/queries/admin'
import { formatBytes } from '@/lib/utils'

export function WorkspaceDetail({ workspaceId }: { workspaceId: string }) {
  const { data, isLoading, error, refetch } = useAdminWorkspace(workspaceId)
  const [editOpen, setEditOpen] = React.useState(false)
  const [assignOpen, setAssignOpen] = React.useState(false)

  if (error) {
    return (
      <>
        <BackLink />
        <ErrorState
          title="Could not load this workspace"
          description={adminError(error)}
          onRetry={() => void refetch()}
        />
      </>
    )
  }

  if (isLoading || !data) {
    return (
      <>
        <BackLink />
        <Skeleton className="mb-6 h-9 w-64" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="mt-4 h-80 rounded-xl" />
      </>
    )
  }

  const { workspace, owners, members, projects, usage, activity } = data

  return (
    <>
      <PageHeader
        breadcrumb={<BackLink />}
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {workspace.name}
            <WorkspaceStatusPill status={workspace.status} size="md" />
          </span>
        }
        description={
          <>
            {workspace.company_name && workspace.company_name !== workspace.name
              ? `${workspace.company_name} · `
              : ''}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              /{workspace.slug}
            </code>{' '}
            · created {formatDate(workspace.created_at)}
            {workspace.expires_at ? ` · renews ${formatDate(workspace.expires_at)}` : ''}
          </>
        }
        action={
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            <Pencil aria-hidden />
            Edit plan
          </Button>
        }
      />

      {!owners.length ? (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-warning">
              This workspace has no Owner
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Nobody can sign in and run it until you assign one. Onboarding is
              not finished.
            </p>
          </div>
          <Button variant="primary" onClick={() => setAssignOpen(true)}>
            <UserPlus aria-hidden />
            Assign an Owner
          </Button>
        </div>
      ) : null}

      {/* Usage ----------------------------------------------------------- */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Seats"
          value={`${usage.seats_used} / ${usage.seat_limit}`}
          hint={`${Math.max(0, usage.seat_limit - usage.seats_used)} available`}
          icon={<Users />}
          tone={usage.seats_used >= usage.seat_limit ? 'danger' : 'neutral'}
        />
        <StatCard
          label="Projects"
          value={`${usage.projects_used} / ${usage.project_limit}`}
          hint={`${projects.filter((project) => project.is_archived).length} archived`}
          icon={<FolderKanban />}
          tone={usage.projects_used >= usage.project_limit ? 'danger' : 'neutral'}
        />
        <StatCard label="Issues" value={usage.issue_count.toLocaleString()} icon={<ListChecks />} />
        <StatCard
          label="Storage"
          value={formatBytes(usage.storage_bytes)}
          hint="Attachments"
          icon={<HardDrive />}
        />
      </section>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <UsageMeter label="Seats used" used={usage.seats_used} limit={usage.seat_limit} />
        </Card>
        <Card className="p-4">
          <UsageMeter
            label="Projects used"
            used={usage.projects_used}
            limit={usage.project_limit}
          />
        </Card>
      </div>

      {/* Tabs ------------------------------------------------------------ */}
      <Tabs defaultValue="owners" className="mt-6">
        <TabsList className="w-full overflow-x-auto sm:w-auto">
          <TabsTrigger value="owners">Owners ({owners.length})</TabsTrigger>
          <TabsTrigger value="people">People ({members.length})</TabsTrigger>
          <TabsTrigger value="projects">Projects ({projects.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
        </TabsList>

        {/* Owners -------------------------------------------------------- */}
        <TabsContent value="owners" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Owners</CardTitle>
                <CardDescription>
                  The customer accounts that control this workspace. One is primary.
                </CardDescription>
              </div>
              <Button variant="primary" size="sm" onClick={() => setAssignOpen(true)}>
                <UserPlus aria-hidden />
                Assign
              </Button>
            </CardHeader>
            <CardContent>
              {!owners.length ? (
                <EmptyState
                  compact
                  icon={<UserPlus />}
                  title="No owner assigned"
                  description="Create an Owner account, or assign an existing one."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {owners.map((owner) => (
                    <li
                      key={owner.user_id}
                      className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <Avatar
                        id={owner.user_id}
                        name={owner.full_name ?? owner.email}
                        src={owner.avatar_url}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-medium">
                          <span className="truncate">{owner.full_name ?? owner.email}</span>
                          {owner.is_primary ? (
                            <Badge variant="primary" title="Primary owner">
                              <Star className="size-2.5" aria-hidden />
                              Primary
                            </Badge>
                          ) : null}
                          {!owner.is_active ? (
                            <Badge variant="danger">Suspended</Badge>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {owner.email}
                          {owner.phone ? ` · ${owner.phone}` : ''}
                        </p>
                      </div>
                      <p className="text-2xs text-muted-foreground">
                        Assigned {formatDate(owner.assigned_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* People -------------------------------------------------------- */}
        <TabsContent value="people" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>People in this workspace</CardTitle>
              <CardDescription>
                Read-only. Members are invited and positioned by the Owner or HR,
                not from here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!members.length ? (
                <EmptyState
                  compact
                  icon={<Users />}
                  title="Nobody has joined yet"
                  description="The Owner invites their team from the workspace's Team page."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {members.map((member) => (
                    <li
                      key={member.user_id}
                      className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <Avatar
                        id={member.user_id}
                        name={member.full_name ?? member.email}
                        src={member.avatar_url}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{member.full_name ?? member.email}</p>
                        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {member.position ? (
                          <Badge variant="outline">{member.position}</Badge>
                        ) : null}
                        {member.status !== 'active' ? (
                          <Badge variant={member.status === 'invited' ? 'info' : 'danger'}>
                            {member.status}
                          </Badge>
                        ) : null}
                        {!member.is_active ? <Badge variant="danger">Suspended</Badge> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Projects ------------------------------------------------------ */}
        <TabsContent value="projects" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Projects</CardTitle>
              <CardDescription>
                Counts only. Issue content belongs to the customer — use a
                support session if you need to look inside.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!projects.length ? (
                <EmptyState
                  compact
                  icon={<FolderKanban />}
                  title="No projects yet"
                  description="The Owner creates projects from inside their workspace."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {projects.map((project) => (
                    <li
                      key={project.id}
                      className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-2xs font-semibold">
                        {project.key}
                      </code>
                      <p className="min-w-0 flex-1 truncate text-sm">{project.name}</p>
                      {project.is_archived ? <Badge variant="neutral">Archived</Badge> : null}
                      <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {project.issue_count} issues · {project.member_count} members
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity ------------------------------------------------------ */}
        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Administrative activity</CardTitle>
              <CardDescription>
                Platform actions taken against this workspace.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!activity.length ? (
                <EmptyState
                  compact
                  title="Nothing recorded yet"
                  description="Actions such as suspension or an ownership transfer appear here."
                />
              ) : (
                <AuditRowList entries={activity} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Lifecycle ----------------------------------------------------- */}
        <TabsContent value="lifecycle" className="mt-4">
          <WorkspaceLifecycle workspace={workspace} />
        </TabsContent>
      </Tabs>

      <p className="mt-6 text-center text-2xs text-muted-foreground">
        Created {formatDateTime(workspace.created_at)}
        {activity.length ? ` · last admin action ${formatRelative(activity[0].created_at)}` : ''}
      </p>

      <EditWorkspaceDialog
        workspace={workspace}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <AssignOwnerDialog
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        hasPrimary={owners.some((owner) => owner.is_primary)}
        open={assignOpen}
        onOpenChange={setAssignOpen}
      />
    </>
  )
}

function BackLink() {
  return (
    <Link
      href="/miraadmin/workspaces"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      Workspaces
      <ChevronRight className="size-3 opacity-50" aria-hidden />
    </Link>
  )
}
