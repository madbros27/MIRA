'use client'

import { AlertTriangle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { LOGIN_ERRORS, type LoginErrorCode } from '@/lib/auth/constants'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { errorMessage } from '@/lib/utils'

/**
 * System Administrator sign-in.
 *
 * The important behaviour is the rejection path. When the credentials are
 * valid but the account is not in `platform_admins`, the session is torn down
 * again immediately and the reason is stated plainly. Silently bouncing the
 * person to the tenant app would hide the fact that they used the wrong door.
 */
export function AdminLoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const supabase = getSupabaseBrowserClient()

  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // A reason passed by middleware, e.g. a tenant user who reached /miraadmin.
  React.useEffect(() => {
    const reason = params.get('reason') as LoginErrorCode | null
    if (reason && reason in LOGIN_ERRORS) setError(LOGIN_ERRORS[reason])
  }, [params])

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signInError) {
        setError(
          /invalid login/i.test(signInError.message)
            ? 'Incorrect email or password.'
            : signInError.message
        )
        return
      }

      const userId = data.user?.id
      if (!userId) {
        setError('Sign-in did not return a session. Try again.')
        return
      }

      // The authority is the table, never a client-side claim.
      const { data: admin, error: lookupError } = await supabase
        .from('platform_admins')
        .select('id, must_change_password, is_active')
        .eq('user_id', userId)
        .maybeSingle()

      if (lookupError) {
        await supabase.auth.signOut()
        setError(errorMessage(lookupError, 'Could not verify this account.'))
        return
      }

      if (!admin || !admin.is_active) {
        // Valid credentials, wrong portal. End the session so the tenant app
        // is not silently entered in another tab.
        await supabase.auth.signOut()
        setError(
          admin && !admin.is_active
            ? 'This system administrator account has been deactivated.'
            : LOGIN_ERRORS.notAdmin
        )
        return
      }

      await supabase.rpc('admin_record_login')

      const next = params.get('next')
      router.replace(
        admin.must_change_password
          ? '/miraadmin/settings/password'
          : next && next.startsWith('/miraadmin')
            ? next
            : '/miraadmin/dashboard'
      )
      router.refresh()
    } catch (caught) {
      setError(errorMessage(caught, 'Could not sign in.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive-subtle px-3.5 py-3 text-xs leading-relaxed text-destructive"
        >
          <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium">{error}</p>
            {error === LOGIN_ERRORS.notAdmin ? (
              <p className="text-destructive/80">
                Workspace owners and their teams sign in at{' '}
                <Link href="/login" className="font-semibold underline underline-offset-2">
                  the tenant portal
                </Link>
                .
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <Field label="Email" htmlFor="admin-email">
        <Input
          id="admin-email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="admin@yourcompany.com"
        />
      </Field>

      <Field label="Password" htmlFor="admin-password">
        <div className="relative">
          <Input
            id="admin-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="pr-10"
            placeholder="••••••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        disabled={pending}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {pending ? 'Verifying…' : 'Sign in to administration'}
      </Button>
    </form>
  )
}
