'use client'

import { KeyRound, TriangleAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

import { PageHeader } from './admin-ui'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/primitives'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { errorMessage } from '@/lib/utils'

const MIN_LENGTH = 12

/** Rough strength signal — length first, then variety. */
function assess(password: string) {
  const checks = [
    password.length >= MIN_LENGTH,
    password.length >= 16,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ]
  const score = checks.filter(Boolean).length
  const label = ['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'][score]
  return { score, label }
}

export function ChangePasswordForm({ mustChange }: { mustChange: boolean }) {
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const strength = assess(password)
  const mismatch = confirm.length > 0 && password !== confirm
  const valid = password.length >= MIN_LENGTH && password === confirm

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid) return

    setPending(true)
    setError(null)

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message)
        return
      }

      // Clears `must_change_password` and writes the audit row.
      const { error: rpcError } = await supabase.rpc('admin_mark_password_changed')
      if (rpcError) {
        setError(rpcError.message)
        return
      }

      toast.success('Password changed')
      router.replace('/miraadmin/dashboard')
      router.refresh()
    } catch (caught) {
      setError(errorMessage(caught, 'Could not change the password'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title={mustChange ? 'Choose a new password' : 'Change password'}
        description={
          mustChange
            ? 'This account still uses the password from the seed script. Pick a new one to continue.'
            : 'Replace the password for your system administrator account.'
        }
      />

      {mustChange ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-subtle px-4 py-3 text-xs leading-relaxed text-warning">
          <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden />
          <p>
            The seeded credentials are in <code className="font-mono">.env.example</code>{' '}
            and in the README, which means they are effectively public. Nothing
            else in the admin portal is reachable until this is done.
          </p>
        </div>
      ) : null}

      <Card>
        <CardContent className="pt-5 sm:pt-5">
          <form onSubmit={onSubmit} className="space-y-4">
            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive-subtle px-3.5 py-2.5 text-xs font-medium text-destructive"
              >
                {error}
              </p>
            ) : null}

            <Field
              label="New password"
              htmlFor="new-password"
              required
              hint={`At least ${MIN_LENGTH} characters.`}
            >
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
                minLength={MIN_LENGTH}
                autoFocus
              />
            </Field>

            {password ? (
              <div className="space-y-1.5">
                <div className="flex gap-1" aria-hidden>
                  {Array.from({ length: 5 }).map((_, index) => (
                    <span
                      key={index}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        index < strength.score
                          ? strength.score <= 2
                            ? 'bg-destructive'
                            : strength.score <= 3
                              ? 'bg-warning'
                              : 'bg-success'
                          : 'bg-muted'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-2xs text-muted-foreground">
                  Strength: <span className="font-medium">{strength.label}</span>
                </p>
              </div>
            ) : null}

            <Field
              label="Confirm new password"
              htmlFor="confirm-password"
              required
              error={mismatch ? 'The two passwords do not match.' : undefined}
            >
              <Input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                required
                aria-invalid={mismatch}
              />
            </Field>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={pending}
              disabled={!valid}
            >
              <KeyRound aria-hidden />
              Set new password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
