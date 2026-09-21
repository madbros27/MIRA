'use client'

import { AlertOctagon, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'

import { Wordmark } from '@/components/layout/logo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/primitives'
import { errorMessage } from '@/lib/utils'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    // Surface the real cause in the console; the UI stays readable.
    console.error('[MIRA] Unhandled error:', error)
  }, [error])

  const message = errorMessage(error, 'Something went wrong rendering this page.')
  const looksLikeConfig = /Missing environment variable|Cannot reach Supabase/i.test(message)

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <Card className="w-full max-w-lg p-6 shadow-md">
        <Wordmark />
        <span className="mt-6 flex size-11 items-center justify-center rounded-xl bg-destructive-subtle text-destructive">
          <AlertOctagon className="size-5" />
        </span>
        <h1 className="mt-4 text-lg font-semibold">This page hit an error</h1>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>

        {looksLikeConfig ? (
          <p className="mt-3 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-xs text-warning">
            This looks like a configuration problem rather than a bug. Check your{' '}
            <code>.env.local</code> against <code>.env.example</code>, then restart the dev
            server.
          </p>
        ) : null}

        {error.digest ? (
          <p className="mt-3 font-mono text-2xs text-muted-foreground">
            Digest: {error.digest}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button variant="primary" onClick={reset}>
            <RefreshCw />
            Try again
          </Button>
          <Button asChild variant="secondary">
            <Link href="/">Back to home</Link>
          </Button>
          {looksLikeConfig ? (
            <Button asChild variant="ghost">
              <Link href="/setup">Setup guide</Link>
            </Button>
          ) : null}
        </div>
      </Card>
    </main>
  )
}
