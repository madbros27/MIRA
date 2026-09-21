'use client'

import { ExternalLink, KeyRound, ShieldCheck, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'

import { PageHeader } from './admin-ui'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/primitives'
import { formatDateTime } from '@/lib/format'
import { PLANS } from '@/lib/types/admin'
import type { PlatformAdminRow } from '@/lib/types/database'

/**
 * Platform configuration.
 *
 * Plan presets are a build-time constant (`PLANS` in lib/types/admin.ts)
 * rather than a database table: they are commercial packaging, they change
 * with a release, and every workspace's real limits are stored on the
 * workspace row anyway. The presets only pre-fill the create form.
 */
export function AdminSettingsPage({
  admin,
  appUrl,
  publicSignup,
  adminCount,
}: {
  admin: PlatformAdminRow
  appUrl: string
  publicSignup: boolean
  adminCount: number
}) {
  return (
    <>
      <PageHeader
        title="Platform settings"
        description="Configuration for this MIRA deployment."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Account ------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Your administrator account</CardTitle>
            <CardDescription>{admin.email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <dl className="space-y-2 text-xs">
              <Row label="Name" value={admin.name ?? '—'} />
              <Row
                label="Password"
                value={
                  admin.must_change_password ? (
                    <span className="font-medium text-destructive">
                      Still the seeded default
                    </span>
                  ) : (
                    'Changed'
                  )
                }
              />
              <Row
                label="Last sign-in"
                value={admin.last_login_at ? formatDateTime(admin.last_login_at) : '—'}
              />
              <Row
                label="Administrators on this platform"
                value={`${adminCount}`}
              />
            </dl>

            <Button variant="secondary" asChild>
              <Link href="/miraadmin/settings/password">
                <KeyRound aria-hidden />
                Change password
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Deployment ---------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Deployment</CardTitle>
            <CardDescription>
              Read from the environment. Change these in your hosting
              provider&apos;s settings, then redeploy.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-xs">
              <Row
                label="Base URL"
                value={<code className="font-mono">{appUrl}</code>}
                hint="NEXT_PUBLIC_APP_URL — every invitation and auth redirect is built from this."
              />
              <Row
                label="Admin portal"
                value={<code className="font-mono">{appUrl}/miraadmin/login</code>}
              />
              <Row
                label="Tenant portal"
                value={<code className="font-mono">{appUrl}/login</code>}
              />
              <Row
                label="Public signup"
                value={
                  publicSignup ? (
                    <span className="font-medium text-warning">Enabled</span>
                  ) : (
                    'Disabled (invitation only)'
                  )
                }
                hint="ALLOW_PUBLIC_SIGNUP"
              />
            </dl>
          </CardContent>
        </Card>

        {/* Plans --------------------------------------------------------- */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Plan presets</CardTitle>
            <CardDescription>
              Defaults offered when you create a workspace. Every workspace
              stores its own limits, so a negotiated contract can differ from
              the list price without touching this table.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Plan', 'Seats', 'Projects', 'Term'].map((heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className="px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {PLANS.map((plan) => (
                    <tr key={plan.id}>
                      <td className="px-3 py-2.5 font-medium">{plan.label}</td>
                      <td className="px-3 py-2.5 tabular-nums">{plan.seats}</td>
                      <td className="px-3 py-2.5 tabular-nums">{plan.projects}</td>
                      <td className="px-3 py-2.5 tabular-nums">{plan.days} days</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              To change these, edit <code className="font-mono">PLANS</code> in{' '}
              <code className="font-mono">lib/types/admin.ts</code> and redeploy.
            </p>
          </CardContent>
        </Card>

        {/* Security notes ------------------------------------------------ */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" aria-hidden />
              Security posture
            </CardTitle>
            <CardDescription>
              How the tiers are kept apart, for when somebody asks.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs leading-relaxed text-muted-foreground">
            <p>
              <strong className="font-medium text-foreground">Three independent checks.</strong>{' '}
              Next.js middleware routes the request, the shell layout re-checks
              the session on the server, and Postgres Row-Level Security decides
              every row. A bug in any one of them does not open the door.
            </p>
            <p>
              <strong className="font-medium text-foreground">
                Administrators cannot write tenant data.
              </strong>{' '}
              A system administrator holds no capability in any workspace, so
              reads succeed across tenants and every write is refused by the
              database — including during a support session.
            </p>
            <p>
              <strong className="font-medium text-foreground">Plan limits are privileges.</strong>{' '}
              The <code className="font-mono">authenticated</code> role has no
              UPDATE grant on the plan columns of{' '}
              <code className="font-mono">workspaces</code>, so an owner cannot
              raise their own seat limit however their capabilities are
              configured.
            </p>
            <p>
              <strong className="font-medium text-foreground">The audit log is append-only.</strong>{' '}
              No client role holds INSERT, UPDATE or DELETE on it; rows arrive
              only through a SECURITY DEFINER function.
            </p>

            {admin.must_change_password ? (
              <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive-subtle px-3 py-2.5 text-destructive">
                <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden />
                <span>
                  This account still uses the seeded password. Change it before
                  this deployment is reachable from the internet.
                </span>
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <p className="mt-6 text-center text-2xs text-muted-foreground">
        <a
          href="https://supabase.com/dashboard"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 underline underline-offset-2"
        >
          Supabase dashboard
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </p>
    </>
  )
}

function Row({
  label,
  value,
  hint,
}: {
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all sm:text-right">
        {value}
        {hint ? (
          <span className="mt-0.5 block text-2xs text-muted-foreground">{hint}</span>
        ) : null}
      </dd>
    </div>
  )
}
