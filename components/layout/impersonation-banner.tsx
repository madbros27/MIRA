'use client'

import { Eye, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'

/**
 * Shown across the top of the tenant app while a System Administrator is
 * looking at a customer's workspace.
 *
 * It is the loudest thing on the page on purpose: an admin should never be
 * unsure whose data they are reading. The countdown is real — when it hits
 * zero the session stops resolving and the app falls back to the admin
 * portal on the next request.
 */
export function ImpersonationBanner({
  workspaceName,
  expiresAt,
}: {
  workspaceName: string
  expiresAt: string
}) {
  const router = useRouter()
  const [remaining, setRemaining] = React.useState(() => msRemaining(expiresAt))
  const [ending, setEnding] = React.useState(false)

  React.useEffect(() => {
    const timer = setInterval(() => {
      const next = msRemaining(expiresAt)
      setRemaining(next)
      // Expired: bounce back rather than leave a dead read-only shell open.
      if (next <= 0) router.replace('/miraadmin/dashboard')
    }, 1000)
    return () => clearInterval(timer)
  }, [expiresAt, router])

  async function end() {
    setEnding(true)
    await fetch('/api/admin/impersonate', { method: 'DELETE' })
    router.replace('/miraadmin/dashboard')
    router.refresh()
  }

  return (
    // Deliberately not sticky: the tenant shell already has a `sticky top-0`
    // topbar, and two of them fight. It does not need to follow the scroll —
    // the admin holds no write capability here, so every action that would
    // change something is absent from the page anyway.
    <div
      role="status"
      className="relative z-50 flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-[hsl(22_88%_44%)] px-4 py-2 text-white"
    >
      <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.1em]">
        <Eye className="size-3.5" aria-hidden />
        Support session
      </span>

      <p className="min-w-0 flex-1 text-xs leading-snug">
        You are viewing <strong className="font-semibold">{workspaceName}</strong> as a
        system administrator. Everything is read-only, and this session is in
        the audit log.
      </p>

      <span className="font-mono text-xs tabular-nums" aria-label="Time remaining">
        {formatRemaining(remaining)}
      </span>

      <button
        type="button"
        onClick={() => void end()}
        disabled={ending}
        className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-white/25 disabled:opacity-60"
      >
        <LogOut className="size-3.5" aria-hidden />
        {ending ? 'Ending…' : 'End session'}
      </button>
    </div>
  )
}

function msRemaining(expiresAt: string) {
  return Math.max(0, new Date(expiresAt).getTime() - Date.now())
}

function formatRemaining(ms: number) {
  const total = Math.floor(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
