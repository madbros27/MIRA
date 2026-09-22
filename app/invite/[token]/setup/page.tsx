'use client'

import { Check, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import * as React from 'react'

import { finishInvitePasswordSetup } from './actions'
import { Wordmark } from '@/components/layout/logo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/primitives'
import { Field, Input } from '@/components/ui/input'
import { getTenantSupabaseBrowserClient } from '@/lib/supabase/clients'
import { cn, errorMessage } from '@/lib/utils'

const RULES = [
  { label: 'At least 8 characters', test: (value: string) => value.length >= 8 },
  { label: 'A letter', test: (value: string) => /[a-zA-Z]/.test(value) },
  { label: 'A number or symbol', test: (value: string) => /[\d\W]/.test(value) },
]

export default function InvitePasswordSetupPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const token = params.token
  const [email, setEmail] = React.useState<string | null>(null)
  const [password, setPassword] = React.useState('')
  const [confirmation, setConfirmation] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [showConfirmation, setShowConfirmation] = React.useState(false)
  const [status, setStatus] = React.useState<'checking' | 'ready' | 'no-session' | 'success'>('checking')
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  React.useEffect(() => {
    getTenantSupabaseBrowserClient().auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null)
      setStatus(data.user ? 'ready' : 'no-session')
    })
  }, [])

  const passed = RULES.map((rule) => rule.test(password))

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!passed.every(Boolean)) return setError('Pick a password that satisfies all three rules.')
    if (password !== confirmation) return setError('Passwords do not match.')

    setPending(true)
    try {
      const { error: updateError } = await getTenantSupabaseBrowserClient().auth.updateUser({ password })
      if (updateError) throw updateError

      const result = await finishInvitePasswordSetup()
      if (result.error) throw new Error(result.error)
      setStatus('success')
      setTimeout(() => router.push(`/invite/${token}`), 500)
    } catch (caught) {
      setError(errorMessage(caught, 'Could not create your password'))
      setPending(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <Card className="w-full max-w-md p-6 shadow-md sm:p-8">
        <Wordmark />
        {status === 'checking' ? (
          <div className="mt-8 space-y-3">
            <div className="shimmer h-6 w-56 rounded" />
            <div className="shimmer h-4 w-full rounded" />
          </div>
        ) : status === 'no-session' ? (
          <>
            <h1 className="mt-8 text-xl font-semibold">You&apos;re invited to MIRA</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Sign in to your existing MIRA account to join this workspace.
            </p>
            <Button asChild variant="primary" size="lg" className="mt-6 w-full">
              <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in to join</Link>
            </Button>
          </>
        ) : status === 'success' ? (
          <>
            <h1 className="mt-8 text-xl font-semibold">Password created successfully.</h1>
            <p className="mt-2 text-sm text-muted-foreground">Joining your workspace...</p>
          </>
        ) : (
          <>
            <h1 className="mt-8 text-xl font-semibold">You&apos;re invited to MIRA</h1>
            <p className="mt-2 text-sm text-muted-foreground">Set your password to activate your account.</p>
            <p className="mt-4 text-sm"><span className="font-medium">Email:</span> {email}</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <PasswordField id="password" label="Password" value={password} onChange={setPassword} shown={showPassword} onToggle={() => setShowPassword((value) => !value)} />
              <PasswordField id="confirm-password" label="Confirm password" value={confirmation} onChange={setConfirmation} shown={showConfirmation} onToggle={() => setShowConfirmation((value) => !value)} />
              <ul className="space-y-1">
                {RULES.map((rule, index) => (
                  <li key={rule.label} className={cn('flex items-center gap-1.5 text-2xs', passed[index] ? 'text-success' : 'text-muted-foreground')}>
                    <span className={cn('flex size-3.5 items-center justify-center rounded-full border', passed[index] ? 'border-success bg-success text-white' : 'border-border')}>
                      {passed[index] ? <Check className="size-2.5" strokeWidth={3} /> : null}
                    </span>
                    {rule.label}
                  </li>
                ))}
              </ul>
              {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive-subtle px-3 py-2 text-xs font-medium text-destructive">{error}</p> : null}
              <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>
                Set password and join workspace
              </Button>
            </form>
          </>
        )}
      </Card>
    </main>
  )
}

function PasswordField({ id, label, value, onChange, shown, onToggle }: { id: string; label: string; value: string; onChange: (value: string) => void; shown: boolean; onToggle: () => void }) {
  return (
    <Field label={label} htmlFor={id} required>
      <div className="relative">
        <Input id={id} type={shown ? 'text' : 'password'} autoComplete="new-password" value={value} onChange={(event) => onChange(event.target.value)} placeholder="••••••••" required className="pr-9" />
        <button type="button" onClick={onToggle} className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}>
          {shown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
      </div>
    </Field>
  )
}