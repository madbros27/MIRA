import { ShieldCheck } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import * as React from 'react'

import { AdminLoginForm } from './admin-login-form'
import { AdminLogo } from '@/components/admin/admin-logo'
import { Skeleton } from '@/components/ui/primitives'

export const metadata: Metadata = {
  title: 'System Administrator Login',
}

export const dynamic = 'force-dynamic'

export default function AdminLoginPage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      {/* A warm, dark field — visually the opposite of the tenant login. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(24_28%_14%)_0%,hsl(24_26%_8%)_55%,hsl(24_24%_6%)_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]"
      />

      <div className="relative w-full max-w-[26rem]">
        <div className="mb-7 flex flex-col items-center gap-4 text-center">
          <AdminLogo onDark />
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight text-white">
              System Administrator Login
            </h1>
            <p className="text-xs leading-relaxed text-white/55">
              Platform-wide access to every MIRA workspace, owner and user.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-surface p-6 shadow-lg sm:p-7">
          <React.Suspense fallback={<LoginFormSkeleton />}>
            <AdminLoginForm />
          </React.Suspense>
        </div>

        <div className="mt-6 space-y-3 text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[0.6875rem] text-white/60">
            <ShieldCheck className="size-3.5" aria-hidden />
            Every action in this portal is recorded in the audit log
          </p>
          <p className="text-xs text-white/40">
            Not a system administrator?{' '}
            <Link
              href="/login"
              className="font-medium text-white/70 underline underline-offset-2 hover:text-white"
            >
              Sign in to your workspace
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}

function LoginFormSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-10 w-full" />
      </div>
      <Skeleton className="h-11 w-full" />
    </div>
  )
}
