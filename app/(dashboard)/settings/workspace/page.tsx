'use client'

import { Info, Lock } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/controls'
import { Field, Input, Textarea } from '@/components/ui/input'
import {
  Badge,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ProgressBar,
} from '@/components/ui/primitives'
import { formatDate } from '@/lib/format'
import { can } from '@/lib/permissions'
import { useMembers, useUpdateWorkspace } from '@/lib/queries/workspaces'
import { useProjects } from '@/lib/queries/projects'
import { cn, errorMessage } from '@/lib/utils'

const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]

/**
 * The Owner's workspace settings.
 *
 * Note what is *not* editable here: plan, seat limit, project limit, status
 * and renewal date. Those belong to the System Administrator, and the
 * restriction is a column-level privilege in Postgres rather than a disabled
 * input — `authenticated` simply has no UPDATE grant on those columns.
 */
export default function WorkspaceSettingsPage() {
  const { workspace, workspaceId, caps } = useWorkspaceContext()
  const { data: members } = useMembers(workspaceId)
  const { data: projects } = useProjects(workspaceId, true)
  const update = useUpdateWorkspace()

  const [form, setForm] = React.useState({
    name: '',
    description: '',
    companyName: '',
    timezone: 'UTC',
    issueKeyPrefix: '',
    workingDays: [1, 2, 3, 4, 5] as number[],
  })

  React.useEffect(() => {
    if (!workspace) return
    setForm({
      name: workspace.name,
      description: workspace.description ?? '',
      companyName: workspace.company_name ?? '',
      timezone: workspace.timezone ?? 'UTC',
      issueKeyPrefix: workspace.issue_key_prefix ?? '',
      workingDays: workspace.working_days ?? [1, 2, 3, 4, 5],
    })
  }, [workspace])

  if (!can.manageWorkspace(caps)) {
    return (
      <div className="p-4 sm:p-8">
        <EmptyState
          icon={<Lock />}
          title="Workspace settings are restricted"
          description="Your position does not include “Workspace settings”. An owner or workspace admin can change that from the Team page."
        />
      </div>
    )
  }

  const activeSeats = (members ?? []).filter((member) => member.status === 'active').length
  const liveProjects = (projects ?? []).filter((project) => !project.is_archived).length

  const dirty =
    workspace &&
    (form.name !== workspace.name ||
      form.description !== (workspace.description ?? '') ||
      form.companyName !== (workspace.company_name ?? '') ||
      form.timezone !== (workspace.timezone ?? 'UTC') ||
      form.issueKeyPrefix !== (workspace.issue_key_prefix ?? '') ||
      form.workingDays.join(',') !== (workspace.working_days ?? []).join(','))

  const timezones =
    typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : ['UTC']

  return (
    <div className="max-w-2xl space-y-4 p-3 sm:p-4">
      {/* Company profile ------------------------------------------------- */}
      <Card>
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            if (!workspace) return
            try {
              await update.mutateAsync({
                id: workspace.id,
                name: form.name.trim(),
                description: form.description.trim() || null,
                company_name: form.companyName.trim() || null,
                timezone: form.timezone,
                issue_key_prefix: form.issueKeyPrefix.trim().toUpperCase() || null,
                working_days: form.workingDays,
              })
              toast.success('Workspace updated')
            } catch (error) {
              toast.error(errorMessage(error, 'Could not save the workspace'))
            }
          }}
        >
          <CardHeader>
            <CardTitle>Company profile</CardTitle>
            <CardDescription>
              The workspace is the boundary for permissions: your people only
              ever see projects and issues that belong to it.
            </CardDescription>
          </CardHeader>

          <div className="space-y-4 px-4 pb-4 sm:px-5">
            <Field label="Workspace name" htmlFor="workspace-name" required>
              <Input
                id="workspace-name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                maxLength={80}
                required
              />
            </Field>

            <Field
              label="Legal company name"
              htmlFor="workspace-company"
              hint="Used on exports and anywhere the formal name matters."
            >
              <Input
                id="workspace-company"
                value={form.companyName}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, companyName: event.target.value }))
                }
                maxLength={120}
                placeholder={form.name}
              />
            </Field>

            <Field label="Description" htmlFor="workspace-description">
              <Textarea
                id="workspace-description"
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
                rows={3}
                placeholder="What does this company work on?"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Timezone" htmlFor="workspace-timezone">
                <select
                  id="workspace-timezone"
                  value={form.timezone}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, timezone: event.target.value }))
                  }
                  className="h-9 w-full rounded-lg border border-input bg-surface px-3 text-sm shadow-xs"
                >
                  {timezones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Issue key prefix"
                htmlFor="workspace-prefix"
                hint="Optional default for new projects, e.g. ACME."
              >
                <Input
                  id="workspace-prefix"
                  value={form.issueKeyPrefix}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      issueKeyPrefix: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                    }))
                  }
                  maxLength={10}
                  className="font-mono uppercase"
                  placeholder="ACME"
                />
              </Field>
            </div>

            <fieldset>
              <legend className="mb-2 text-xs font-medium text-muted-foreground">
                Working days
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((day) => {
                  const on = form.workingDays.includes(day.value)
                  return (
                    <label
                      key={day.value}
                      className={cn(
                        'flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                        on
                          ? 'border-primary bg-primary-subtle text-primary-subtle-foreground'
                          : 'border-border text-muted-foreground hover:bg-muted'
                      )}
                    >
                      <Checkbox
                        checked={on}
                        onCheckedChange={(value) =>
                          setForm((prev) => ({
                            ...prev,
                            workingDays: value
                              ? [...prev.workingDays, day.value].sort()
                              : prev.workingDays.filter((entry) => entry !== day.value),
                          }))
                        }
                        className="size-3.5"
                      />
                      {day.label}
                    </label>
                  )
                })}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Used by the burndown chart to draw a realistic ideal line.
              </p>
            </fieldset>

            <Field
              label="URL slug"
              htmlFor="workspace-slug"
              hint="Set when your workspace was provisioned."
            >
              <Input
                id="workspace-slug"
                value={workspace?.slug ?? ''}
                readOnly
                disabled
                className="font-mono"
              />
            </Field>

            <div className="flex justify-end">
              <Button type="submit" variant="primary" disabled={!dirty} loading={update.isPending}>
                Save changes
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {/* Plan — read only ------------------------------------------------ */}
      {can.viewBilling(caps) && workspace ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Your plan
              <Badge variant="primary" className="capitalize">
                {workspace.plan}
              </Badge>
            </CardTitle>
            <CardDescription>
              {workspace.expires_at
                ? `Renews ${formatDate(workspace.expires_at)}.`
                : 'No expiry date set.'}{' '}
              Started {formatDate(workspace.starts_at)}.
            </CardDescription>
          </CardHeader>

          <div className="space-y-4 px-4 pb-4 sm:px-5">
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-muted-foreground">Seats</span>
                <span className="font-medium tabular-nums">
                  {activeSeats} / {workspace.seat_limit}
                </span>
              </div>
              <ProgressBar
                value={activeSeats}
                max={workspace.seat_limit}
                barClassName={
                  activeSeats >= workspace.seat_limit
                    ? 'bg-destructive'
                    : activeSeats / workspace.seat_limit >= 0.8
                      ? 'bg-warning'
                      : undefined
                }
                label="Seats used"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-muted-foreground">Projects</span>
                <span className="font-medium tabular-nums">
                  {liveProjects} / {workspace.project_limit}
                </span>
              </div>
              <ProgressBar
                value={liveProjects}
                max={workspace.project_limit}
                barClassName={
                  liveProjects >= workspace.project_limit
                    ? 'bg-destructive'
                    : liveProjects / workspace.project_limit >= 0.8
                      ? 'bg-warning'
                      : undefined
                }
                label="Projects used"
              />
            </div>

            <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-px size-3.5 shrink-0" aria-hidden />
              Plan limits are set by MIRA, not from inside your workspace. To
              add seats or projects, contact your MIRA representative.
            </p>
          </div>
        </Card>
      ) : null}

      {/* At a glance ----------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>At a glance</CardTitle>
        </CardHeader>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-b-xl border-t border-border bg-border sm:grid-cols-4">
          {[
            { label: 'People', value: activeSeats },
            { label: 'Projects', value: liveProjects },
            {
              label: 'Archived',
              value: (projects ?? []).filter((project) => project.is_archived).length,
            },
            { label: 'Created', value: formatDate(workspace?.created_at) },
          ].map((item) => (
            <div key={item.label} className="bg-surface px-4 py-3">
              <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                {item.label}
              </dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Deleting this workspace</CardTitle>
          <CardDescription>
            A workspace can only be deleted by a MIRA system administrator, and
            the deletion is soft for 30 days before anything is purged. Contact
            your MIRA representative if you need this. To tidy up inside the
            workspace, archive individual projects instead.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
