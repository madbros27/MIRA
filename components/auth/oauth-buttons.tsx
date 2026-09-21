'use client'

import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { getAppUrl } from '@/lib/supabase/env'
import { errorMessage } from '@/lib/utils'

/** Inline Google mark — no external asset, so it works offline and in CSP. */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.61Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.71a5.41 5.41 0 0 1 0-3.42V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4 fill-current">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.88.51-1.08-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A7.995 7.995 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

export function OAuthButtons({ next }: { next?: string }) {
  const [pending, setPending] = React.useState<string | null>(null)

  async function signIn(provider: 'google' | 'github') {
    setPending(provider)
    const supabase = getSupabaseBrowserClient()
    const redirectTo = `${getAppUrl()}/auth/callback${
      next ? `?next=${encodeURIComponent(next)}` : ''
    }`

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    })

    if (error) {
      setPending(null)
      toast.error(
        errorMessage(
          error,
          `Could not start ${provider} sign-in. Enable the provider in Supabase → Authentication → Providers.`
        )
      )
    }
    // On success the browser is redirected, so the pending state stays set.
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Button
        type="button"
        variant="secondary"
        onClick={() => signIn('google')}
        loading={pending === 'google'}
      >
        <GoogleIcon />
        Google
      </Button>
      <Button
        type="button"
        variant="secondary"
        onClick={() => signIn('github')}
        loading={pending === 'github'}
      >
        <GitHubIcon />
        GitHub
      </Button>
    </div>
  )
}
