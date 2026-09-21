'use client'

import { Building2, LogOut, Mail, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { Wordmark } from '@/components/layout/logo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/primitives'

/**
 * Shown when the signed-in account belongs to no workspace.
 *
 * Under the three-tier model there is deliberately no "create a workspace"
 * button here: a workspace is provisioned by a MIRA System Administrator and
 * a User joins one by invitation. Offering a button that the database would
 * refuse would be worse than explaining what actually has to happen.
 */
export function NoWorkspace({ email }: { email: string }) {
  const router = useRouter()
  const [checking, setChecking] = React.useState(false)

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <Card className="w-full max-w-md p-6 shadow-md">
        <Wordmark />

        <div className="mt-5 flex size-11 items-center justify-center rounded-xl bg-primary-subtle text-primary-subtle-foreground">
          <Building2 className="size-5" aria-hidden />
        </div>

        <h1 className="mt-4 text-lg font-semibold">No workspace yet</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          You are signed in as{' '}
          <span className="font-medium text-foreground">{email}</span>, but this
          account does not belong to a workspace.
        </p>

        <dl className="mt-5 space-y-3 text-sm">
          <div className="rounded-lg border border-border p-3">
            <dt className="flex items-center gap-1.5 font-medium">
              <Mail className="size-3.5 text-muted-foreground" aria-hidden />
              Waiting on an invitation?
            </dt>
            <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Ask your workspace owner, an admin or HR to invite this exact
              address. Invitations are matched by email, so it is claimed the
              moment you refresh.
            </dd>
          </div>

          <div className="rounded-lg border border-border p-3">
            <dt className="font-medium">Bought MIRA for your company?</dt>
            <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Your MIRA representative provisions the workspace and attaches
              your Owner account to it. Get in touch with them if this is
              taking longer than expected.
            </dd>
          </div>
        </dl>

        <Button
          variant="secondary"
          className="mt-5 w-full"
          loading={checking}
          onClick={() => {
            setChecking(true)
            router.refresh()
            // The refresh is a server round trip; let the spinner settle
            // rather than flashing for a frame.
            setTimeout(() => setChecking(false), 1200)
          }}
        >
          <RefreshCw aria-hidden />
          Check again
        </Button>

        <form action="/auth/signout" method="post" className="mt-2">
          <Button type="submit" variant="ghost" size="sm" className="w-full">
            <LogOut />
            Sign out
          </Button>
        </form>
      </Card>
    </main>
  )
}
