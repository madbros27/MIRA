'use client'

import { Check, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { cn, errorMessage } from '@/lib/utils'

const RULES = [
  { label: 'At least 8 characters', test: (value: string) => value.length >= 8 },
  { label: 'A letter', test: (value: string) => /[a-zA-Z]/.test(value) },
  { label: 'A number or symbol', test: (value: string) => /[\d\W]/.test(value) },
]

/**
 * Reached from the emailed recovery link, which lands on /auth/callback and is
 * redirected here with a session already established.
 */
export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [status, setStatus] = React.useState<'checking' | 'ready' | 'no-session'>('checking')
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  React.useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    supabase.auth.getSession().then(({ data }) => {
      setStatus(data.session ? 'ready' : 'no-session')
    })
  }, [])

  const passed = RULES.map((rule) => rule.test(password))
  const valid = passed.every(Boolean)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!valid) return setError('Pick a password that satisfies all three rules.')

    setPending(true)
    try {
      const supabase = getSupabaseBrowserClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      await supabase.auth.signOut()
      router.push('/login?notice=password-updated')
    } catch (caught) {
      setError(errorMessage(caught, 'Could not update your password'))
      setPending(false)
    }
  }

  if (status === 'checking') {
    return (
      <>
        <div className="shimmer h-6 w-48 rounded" />
        <div className="shimmer mt-3 h-3 w-full rounded" />
        <div className="shimmer mt-8 h-9 w-full rounded-lg" />
      </>
    )
  }

  if (status === 'no-session') {
    return (
      <>
        <h1 className="text-xl font-semibold">This link is no longer valid</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Password reset links can only be used once and expire after an hour. Request a fresh
          one and try again.
        </p>
        <Button asChild variant="primary" className="mt-6 w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </>
    )
  }

  return (
    <>
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        You will be signed out everywhere and can sign back in with the new password.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Field label="New password" htmlFor="password" required>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
              autoFocus
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
                'flex items-center gap-1.5 text-2xs',
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
          Update password
        </Button>
      </form>
    </>
  )
}
