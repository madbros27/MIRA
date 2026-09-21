'use client'

import { Check, Eye, EyeOff, MailCheck } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'

import { OAuthButtons } from '@/components/auth/oauth-buttons'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Separator, Skeleton } from '@/components/ui/primitives'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { allowPublicSignup, getAppUrl } from '@/lib/supabase/env'
import { cn, errorMessage } from '@/lib/utils'

const RULES = [
  { label: 'At least 8 characters', test: (value: string) => value.length >= 8 },
  { label: 'A letter', test: (value: string) => /[a-zA-Z]/.test(value) },
  { label: 'A number or symbol', test: (value: string) => /[\d\W]/.test(value) },
]

/**
 * Self-service registration.
 *
 * Under the three-tier model this is off by default (`ALLOW_PUBLIC_SIGNUP`).
 * Owners are provisioned by a System Administrator and Users arrive through
 * an invitation, so an open form would only create accounts that belong
 * nowhere.
 *
 * Even with it switched on, this page can never produce a System
 * Administrator or an unattached Owner: it calls `supabase.auth.signUp()`,
 * which creates a plain `auth.users` row. Platform admin status comes from a
 * `platform_admins` row that only the seed script and the service-role key
 * can write, and ownership comes from `workspace_owners`, which no tenant
 * role holds an INSERT privilege on.
 */
export default function SignupPage() {
  if (!allowPublicSignup()) return <SignupDisabled />

  return (
    <React.Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3 w-56" />
          <Skeleton className="mt-6 h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      }
    >
      <SignupForm />
    </React.Suspense>
  )
}

function SignupDisabled() {
  return (
    <>
      <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-primary-subtle text-primary-subtle-foreground">
        <MailCheck className="size-5" aria-hidden />
      </div>

      <h1 className="text-xl font-semibold">MIRA is invitation-only</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Accounts are not created from this page. How you get in depends on who
        you are:
      </p>

      <dl className="mt-5 space-y-3 text-sm">
        <div className="rounded-lg border border-border p-3">
          <dt className="font-medium">You bought MIRA for your company</dt>
          <dd className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Your MIRA representative creates your Owner account and emails you
            a link to set a password.
          </dd>
        </div>
        <div className="rounded-lg border border-border p-3">
          <dt className="font-medium">You work at a company that uses MIRA</dt>
          <dd className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Ask your workspace owner, an admin or HR to invite you. The
            invitation email contains a link that creates your account.
          </dd>
        </div>
      </dl>

      <p className="mt-6 text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </>
  )
}

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/'

  const [form, setForm] = React.useState({ name: '', email: '', password: '' })
  const [showPassword, setShowPassword] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const passed = RULES.map((rule) => rule.test(form.password))
  const valid = passed.every(Boolean)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!valid) {
      setError('Pick a password that satisfies all three rules.')
      return
    }

    setPending(true)
    try {
      const supabase = getSupabaseBrowserClient()
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: { full_name: form.name.trim() || form.email.trim().split('@')[0] },
          emailRedirectTo: `${getAppUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      })
      if (signUpError) throw signUpError

      // With email confirmation on, there is no session yet.
      if (data.session) {
        router.push(next)
        router.refresh()
      } else {
        router.push('/login?notice=check-email')
      }
    } catch (caught) {
      const message = errorMessage(caught, 'Could not create your account')
      setError(
        /already registered|already exists/i.test(message)
          ? 'An account with that email already exists — sign in instead.'
          : message
      )
      setPending(false)
    }
  }

  return (
    <>
      <h1 className="text-xl font-semibold">Create your MIRA account</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Already have one?{' '}
        <Link
          href={next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login'}
          className="font-medium text-primary hover:underline"
        >
          Sign in
        </Link>
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Field label="Your name" htmlFor="name">
          <Input
            id="name"
            autoComplete="name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Alex Okafor"
            maxLength={80}
            autoFocus
          />
        </Field>

        <Field label="Email" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            placeholder="you@company.com"
            required
          />
        </Field>

        <Field label="Password" htmlFor="password" required>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={form.password}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, password: event.target.value }))
              }
              placeholder="••••••••"
              required
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          </div>
        </Field>

        <ul className="space-y-1">
          {RULES.map((rule, index) => (
            <li
              key={rule.label}
              className={cn(
                'flex items-center gap-1.5 text-2xs transition-colors',
                passed[index] ? 'text-success' : 'text-muted-foreground'
              )}
            >
              <span
                className={cn(
                  'flex size-3.5 items-center justify-center rounded-full border',
                  passed[index] ? 'border-success bg-success text-white' : 'border-border'
                )}
              >
                {passed[index] ? <Check className="size-2.5" strokeWidth={3} /> : null}
              </span>
              {rule.label}
            </li>
          ))}
        </ul>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive-subtle px-3 py-2 text-xs font-medium text-destructive"
          >
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>
          Create account
        </Button>

        <p className="text-2xs leading-relaxed text-muted-foreground">
          Signing up creates a workspace with a demo project so you can see a populated board
          straight away. Rename it or start a fresh one at any time.
        </p>
      </form>

      <div className="my-6 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-2xs uppercase tracking-wide text-muted-foreground">or</span>
        <Separator className="flex-1" />
      </div>

      <OAuthButtons next={next} />
    </>
  )
}
