'use client'

import { Keyboard, LogOut, Settings, User, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { Avatar } from '@/components/ui/primitives'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { can } from '@/lib/permissions'
import { useUiStore } from '@/lib/store/ui-store'
import { cn, displayName } from '@/lib/utils'

export function UserMenu({ variant = 'sidebar' }: { variant?: 'sidebar' | 'plain' }) {
  const router = useRouter()
  const { profile, userId, caps } = useWorkspaceContext()
  const setShortcutsOpen = useUiStore((state) => state.setShortcutsOpen)
  const [signingOut, setSigningOut] = React.useState(false)

  async function signOut() {
    setSigningOut(true)
    await fetch('/auth/signout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const dark = variant === 'sidebar'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
            dark
              ? 'text-sidebar-foreground hover:bg-sidebar-accent'
              : 'hover:bg-muted'
          )}
        >
          <Avatar
            id={userId}
            name={profile?.full_name ?? profile?.email}
            src={profile?.avatar_url}
            size="md"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{displayName(profile)}</span>
            <span
              className={cn(
                'block truncate text-2xs',
                dark ? 'text-sidebar-muted' : 'text-muted-foreground'
              )}
            >
              {profile?.email}
            </span>
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" side="top" className="w-60">
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            Theme
          </span>
          <ThemeToggle />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/settings/profile')}>
          <User />
          Your profile
        </DropdownMenuItem>
        {can.manageWorkspace(caps) ? (
          <DropdownMenuItem onSelect={() => router.push('/settings/workspace')}>
            <Settings />
            Workspace settings
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => router.push('/team')}>
          <Users />
          Team &amp; positions
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
          <Keyboard />
          Keyboard shortcuts
          <DropdownMenuShortcut>?</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive disabled={signingOut} onSelect={signOut}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
