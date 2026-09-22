'use client'

import { useQueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import * as React from 'react'

import { createSessionBus } from '@/lib/auth/session-bus'
import type { Portal } from '@/lib/supabase/portal'
import { getAdminSupabaseBrowserClient, getTenantSupabaseBrowserClient } from '@/lib/supabase/clients'
import type { Database } from '@/lib/types/database'

const IDLE_DEFAULT_MINUTES = 480
const WARNING_DEFAULT_SECONDS = 120
const ABSOLUTE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000

type LifecycleProps = { portal: Portal }

function getNumber(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function SessionLifecycle({ portal }: LifecycleProps) {
  const queryClient = useQueryClient()
  const client = portal === 'admin'
    ? getAdminSupabaseBrowserClient()
    : getTenantSupabaseBrowserClient()
  const lastActivity = React.useRef(Date.now())
  const signedInAt = React.useRef(
    typeof window !== 'undefined'
      ? Number(localStorage.getItem(`mira.${portal}.signed-in-at`)) || Date.now()
      : Date.now()
  )
  const leaderRef = React.useRef(false)
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshNow = React.useRef<(() => Promise<void>) | null>(null)
  const sessionExpiry = React.useRef<number | null>(null)
  const [warning, setWarning] = React.useState<number | null>(null)

  React.useEffect(() => {
    const bus = createSessionBus(portal, (message) => {
      if (message.type === 'DATA_INVALIDATED') {
        for (const queryKey of message.queryKeys ?? []) {
          queryClient.invalidateQueries({ queryKey })
        }
      }
      if (message.type === 'SIGNED_OUT' || message.type === 'SESSION_EXPIRED') {
        void teardown(client, queryClient, portal, message.reason)
      }
      if (message.type === 'SESSION_REFRESHED' || message.type === 'SIGNED_IN') {
        void client.auth.getSession()
      }
    })
    const authListener = client.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED') bus.post({ type: 'SESSION_REFRESHED' })
      if (event === 'SIGNED_IN') bus.post({ type: 'SIGNED_IN' })
    })
    let securityChannel: ReturnType<typeof client.channel> | undefined
    void client.auth.getUser().then(({ data }) => {
      if (portal !== 'tenant' || !data.user) return
      securityChannel = client
        .channel(`session-security:${data.user.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${data.user.id}` },
          (payload) => {
            if ((payload.new as { is_active?: boolean }).is_active === false) {
              bus.post({ type: 'SESSION_EXPIRED', reason: 'account_suspended' })
              void teardown(client, queryClient, portal, 'account_suspended')
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'workspace_members', filter: `user_id=eq.${data.user.id}` },
          (payload) => {
            if ((payload.new as { status?: string }).status === 'suspended') {
              bus.post({ type: 'SESSION_EXPIRED', reason: 'workspace_suspended' })
              void teardown(client, queryClient, portal, 'workspace_suspended')
            }
          }
        )
        .subscribe()
    })

    const idleMinutes = getNumber('NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MINUTES', IDLE_DEFAULT_MINUTES)
    const warningSeconds = getNumber('NEXT_PUBLIC_SESSION_WARNING_SECONDS', WARNING_DEFAULT_SECONDS)
    const idleMs = idleMinutes * 60_000

    const refresh = async () => {
      if (leaderRef.current) return
      const run = async () => {
        leaderRef.current = true
        try {
          const { data, error } = await client.auth.refreshSession()
          if (error) throw error
          if (data.session) {
            sessionExpiry.current = (data.session.expires_at ?? 0) * 1000
            localStorage.setItem(`mira.${portal}.signed-in-at`, String(signedInAt.current))
            bus.post({ type: 'SESSION_REFRESHED' })
          }
        } catch {
          bus.post({ type: 'SESSION_EXPIRED', reason: 'refresh_failed' })
          await teardown(client, queryClient, portal, 'refresh_failed')
        } finally {
          leaderRef.current = false
        }
      }

      if (navigator.locks?.request) {
        await navigator.locks.request(`mira-auth-refresh-${portal}`, { ifAvailable: true }, async (lock) => {
          if (lock) await run()
        })
        return
      }

      const key = `mira.auth.refresh.lock.${portal}`
      const now = Date.now()
      const current = Number(localStorage.getItem(key) ?? 0)
      if (current > now || !localStorage.setItem) return
      localStorage.setItem(key, String(now + 15_000))
      try {
        await run()
      } finally {
        if (localStorage.getItem(key) === String(now + 15_000)) localStorage.removeItem(key)
      }
    }

    const schedule = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      refreshTimer.current = setTimeout(async () => {
        const now = Date.now()
        const inactive = now - lastActivity.current >= idleMs
        const expired = now - signedInAt.current >= ABSOLUTE_TIMEOUT_MS
        const refreshDue = sessionExpiry.current !== null &&
          now >= sessionExpiry.current - 5 * 60_000
        if (expired || inactive) {
          bus.post({ type: 'SESSION_EXPIRED', reason: expired ? 'absolute_timeout' : 'idle_timeout' })
          await teardown(client, queryClient, portal, expired ? 'absolute_timeout' : 'idle_timeout')
        } else if (refreshDue) await refresh()
        schedule()
      }, Math.max(30_000, sessionExpiry.current
        ? Math.min(idleMs, Math.max(30_000, sessionExpiry.current - Date.now() - 5 * 60_000))
        : warningSeconds * 1000))
    }

    refreshNow.current = refresh

    const warningTimer = window.setInterval(() => {
      const remaining = Math.ceil((idleMs - (Date.now() - lastActivity.current)) / 1000)
      setWarning(remaining > 0 && remaining <= warningSeconds ? remaining : null)
    }, 1000)

    const markActivity = () => {
      lastActivity.current = Date.now()
    }
    const revalidate = () => {
      lastActivity.current = Date.now()
      void client.auth.getSession().then(({ data }) => {
        if (data.session) {
          sessionExpiry.current = (data.session.expires_at ?? 0) * 1000
          schedule()
        }
      })
    }

    window.addEventListener('pointerdown', markActivity)
    window.addEventListener('keydown', markActivity)
    window.addEventListener('visibilitychange', revalidate)
    window.addEventListener('online', revalidate)
    void client.auth.getSession().then(({ data }) => {
      if (data.session) {
        sessionExpiry.current = (data.session.expires_at ?? 0) * 1000
        schedule()
      }
    })

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      clearInterval(warningTimer)
      window.removeEventListener('pointerdown', markActivity)
      window.removeEventListener('keydown', markActivity)
      window.removeEventListener('visibilitychange', revalidate)
      window.removeEventListener('online', revalidate)
      authListener.data.subscription.unsubscribe()
      refreshNow.current = null
      if (securityChannel) void client.removeChannel(securityChannel)
      bus.close()
    }
  }, [client, portal, queryClient])

  if (warning === null) return null

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-warning/40 bg-warning-subtle px-4 py-3 text-sm text-warning shadow-lg">
      <span>Your session expires soon. Stay signed in?</span>
      <span className="font-mono tabular-nums">{formatCountdown(warning)}</span>
      <button
        type="button"
        className="rounded-md bg-warning px-3 py-1.5 font-medium text-warning-foreground"
        onClick={() => {
          lastActivity.current = Date.now()
          setWarning(null)
          void refreshNow.current?.()
        }}
      >
        Stay signed in
      </button>
    </div>
  )
}

function formatCountdown(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

async function teardown(
  client: SupabaseClient<Database>,
  queryClient: ReturnType<typeof useQueryClient>,
  portal: Portal,
  reason?: string
) {
  await client.auth.signOut({ scope: 'local' })
  queryClient.cancelQueries()
  queryClient.clear()
  if (typeof window !== 'undefined') {
    const prefix = `mira.${portal}.`
    for (const storage of [localStorage, sessionStorage]) {
      for (const key of Object.keys(storage)) {
        if (key.startsWith(prefix)) storage.removeItem(key)
      }
    }
    const loginPath = portal === 'admin'
      ? `/miraadmin/login${reason ? '?reason=expired' : ''}`
      : reason === 'workspace_suspended' || reason === 'account_suspended'
        ? '/login?reason=suspended'
        : '/login'
    window.location.assign(loginPath)
  }
}
