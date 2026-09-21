'use client'

import { ArrowLeft, MailCheck } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { getAppUrl } from '@/lib/supabase/env'
import { errorMessage } from '@/lib/utils'

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState('')
  const [sent, setSent] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setPending(true)

    try {
      const supabase = getSupabaseBrowserClient()
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${getAppUrl()}/auth/callback?next=/reset-password`,
      })
      if (resetError) throw resetError
      setSent(true)
    } catch (caught) {
      setError(errorMessage(caught, 'Could not send the reset email'))
    } finally {
      setPending(false)
    }
  }

  if (sent) {
    return (
      <>
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-success-subtle text-success">
          <MailCheck className="size-5" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">Check your inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          If an account exists for <span className="font-medium text-foreground">{email}</span>,
          a password reset link is on its way. The link expires in an hour.
        </p>
        <Button asChild variant="secondary" className="mt-6 w-full">
          <Link href="/login">
            <ArrowLeft />
            Back to sign in
          </Link>
        </Button>
      </>
    )
  }

  return (
    <>
      <h1 className="text-xl font-semibold">Reset your password</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        We will email you a link that signs you in so you can set a new password.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Field label="Email" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            required
            autoFocus
          />
        </Field>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive-subtle px-3 py-2 text-xs font-medium text-destructive"
          >
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>
          Send reset link
        </Button>
        <Button asChild variant="ghost" size="sm" className="w-full">
          <Link href="/login">
            <ArrowLeft />
            Back to sign in
          </Link>
        </Button>
      </form>
    </>
  )
}
