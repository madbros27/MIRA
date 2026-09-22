'use client'

import { Check, Eye, EyeOff } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { cn, errorMessage } from '@/lib/utils'

const RULES = [
  { label: 'At least 8 characters', test: (value: string) => value.length >= 8 },
  { label: 'A letter', test: (value: string) => /[a-zA-Z]/.test(value) },
  { label: 'A number or symbol', test: (value: string) => /[\d\W]/.test(value) },
]

export default function ChangePasswordPage() {
  return (
    <React.Suspense fallback={<div className="shimmer h-40 rounded-lg" />}>
      <ChangePasswordForm />
    </React.Suspense>
  )
}

function ChangePasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/dashboard'
  const [password, setPassword] = React.useState('')
  const [confirmation, setConfirmation] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [showConfirmation, setShowConfirmation] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const passed = RULES.map((rule) => rule.test(password))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!passed.every(Boolean)) return setError('Pick a password that satisfies all three rules.')
    if (password !== confirmation) return setError('Passwords do not match.')

    setPending(true)
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok || result.error) throw new Error(result.error ?? 'Could not finish password setup')
      router.push(next)
      router.refresh()
    } catch (caught) {
      setError(errorMessage(caught, 'Could not update your password'))
      setPending(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="text-xl font-semibold">Change your password</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose a password you will use to sign in to MIRA.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <PasswordField id="password" label="New password" value={password} shown={showPassword} onChange={setPassword} onToggle={() => setShowPassword((value) => !value)} />
        <PasswordField id="confirm-password" label="Confirm password" value={confirmation} shown={showConfirmation} onChange={setConfirmation} onToggle={() => setShowConfirmation((value) => !value)} />
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
          Change password
        </Button>
      </form>
    </div>
  )
}

function PasswordField({ id, label, value, shown, onChange, onToggle }: { id: string; label: string; value: string; shown: boolean; onChange: (value: string) => void; onToggle: () => void }) {
  return (
    <Field label={label} htmlFor={id} required>
      <div className="relative">
        <Input id={id} type={shown ? 'text' : 'password'} autoComplete="new-password" value={value} onChange={(event) => onChange(event.target.value)} required className="pr-9" />
        <button type="button" onClick={onToggle} className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}>
          {shown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
      </div>
    </Field>
  )
}