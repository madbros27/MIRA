'use client'

import {
  Building2,
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import * as React from 'react'

import { AdminLogo, SystemAdminBadge } from './admin-logo'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { Avatar } from '@/components/ui/primitives'
import { getAdminSupabaseBrowserClient } from '@/lib/supabase/clients'
import { broadcastSessionMessage } from '@/lib/auth/session-bus'
import { cn } from '@/lib/utils'

type NavItem = {
  href: string
  label: string
  icon: React.ElementType
  description: string
}

const NAV: NavItem[] = [
  {
    href: '/miraadmin/dashboard',
    label: 'Overview',
    icon: LayoutDashboard,
    description: 'Platform health at a glance',
  },
  {
    href: '/miraadmin/workspaces',
    label: 'Workspaces',
    icon: Building2,
    description: 'Every tenant on the platform',
  },
  {
    href: '/miraadmin/owners',
    label: 'Owners',
    icon: UserCog,
    description: 'Customer accounts and assignments',
  },
  {
    href: '/miraadmin/users',
    label: 'Users',
    icon: Users,
    description: 'Everyone, across every tenant',
  },
  {
    href: '/miraadmin/audit',
    label: 'Audit log',
    icon: ClipboardList,
    description: 'Immutable record of admin actions',
  },
  {
    href: '/miraadmin/settings',
    label: 'Settings',
    icon: Settings,
    description: 'Plans, limits and platform config',
  },
]

export function AdminShell({
  admin,
  children,
}: {
  admin: { name: string | null; email: string; userId: string }
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = React.useState(false)

  // Close the drawer whenever navigation happens.
  React.useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <div className="flex min-h-dvh">
      {/* Desktop rail --------------------------------------------------- */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-14 items-center border-b border-sidebar-border px-4">
          <Link href="/miraadmin/dashboard" className="rounded-lg">
            <AdminLogo onDark />
          </Link>
        </div>
        <SidebarNav pathname={pathname} />
        <SidebarFooter admin={admin} />
      </aside>

      {/* Mobile drawer -------------------------------------------------- */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[17rem] flex-col bg-sidebar shadow-lg">
            <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
              <AdminLogo onDark />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setMobileOpen(false)}
                className="text-sidebar-muted hover:bg-sidebar-accent hover:text-white"
                aria-label="Close navigation"
              >
                <X />
              </Button>
            </div>
            <SidebarNav pathname={pathname} />
            <SidebarFooter admin={admin} />
          </aside>
        </div>
      ) : null}

      {/* Main ----------------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/85 px-4 backdrop-blur-md sm:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </Button>

          <div className="lg:hidden">
            <AdminLogo compact />
          </div>

          <SystemAdminBadge />

          <p className="hidden truncate text-xs text-muted-foreground sm:block">
            You are operating across <strong className="font-semibold">all tenants</strong>.
            Every action is logged.
          </p>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}

function SidebarNav({ pathname }: { pathname: string }) {
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
      {NAV.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
              active
                ? 'bg-sidebar-accent font-medium text-white'
                : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white'
            )}
          >
            <Icon
              className={cn(
                'mt-px size-4 shrink-0',
                active ? 'text-primary' : 'text-sidebar-muted group-hover:text-sidebar-foreground'
              )}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{item.label}</span>
              <span className="mt-0.5 block truncate text-[0.6875rem] leading-tight text-sidebar-muted">
                {item.description}
              </span>
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

function SidebarFooter({
  admin,
}: {
  admin: { name: string | null; email: string; userId: string }
}) {
  const router = useRouter()
  const [signingOut, setSigningOut] = React.useState(false)

  async function signOut() {
    setSigningOut(true)
    await getAdminSupabaseBrowserClient().auth.signOut()
    broadcastSessionMessage('admin', { type: 'SIGNED_OUT' })
    router.replace('/miraadmin/login')
    router.refresh()
  }

  return (
    <div className="border-t border-sidebar-border p-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-accent"
          >
            <Avatar
              id={admin.userId}
              name={admin.name ?? admin.email}
              size="sm"
              className="bg-primary text-primary-foreground"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-white">
                {admin.name ?? 'System Administrator'}
              </span>
              <span className="block truncate text-[0.6875rem] text-sidebar-muted">
                {admin.email}
              </span>
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-sidebar-muted" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56">
          <DropdownMenuLabel>System Administrator</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/miraadmin/settings/password">Change password</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/miraadmin/audit">My recent actions</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault()
              void signOut()
            }}
            disabled={signingOut}
          >
            <LogOut className="size-4" aria-hidden />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
