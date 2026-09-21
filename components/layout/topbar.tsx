'use client'

import { Menu, Plus, Search } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'

import { Logo } from '@/components/layout/logo'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/controls'
import { Avatar, Kbd } from '@/components/ui/primitives'
import { can } from '@/lib/permissions'
import { useUiStore } from '@/lib/store/ui-store'
import { displayName } from '@/lib/utils'

export function Topbar() {
  const { profile, userId, workspace, caps } = useWorkspaceContext()
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen)
  const setCommandOpen = useUiStore((state) => state.setCommandOpen)
  const openCreateIssue = useUiStore((state) => state.openCreateIssue)

  return (
    <header className="sticky top-0 z-30 flex h-topbar shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md sm:px-4">
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        className="-ml-1 inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </button>

      <Link href="/" className="flex items-center gap-2 md:hidden" aria-label="MIRA home">
        <Logo size={24} />
        <span className="max-w-32 truncate text-sm font-semibold">
          {workspace?.name ?? 'MIRA'}
        </span>
      </Link>

      {/* Desktop search entry point — the sidebar one disappears when collapsed. */}
      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="hidden h-8 max-w-sm flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-left text-sm text-muted-foreground shadow-xs transition-colors hover:bg-muted md:flex"
      >
        <Search className="size-3.5 shrink-0" />
        <span className="flex-1 truncate">Search issues, projects, comments…</span>
        <Kbd>/</Kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
          aria-label="Search"
        >
          <Search className="size-5" />
        </button>

        <NotificationBell />

        {can.writeIssues(caps) ? (
          <Tooltip content={<span className="flex items-center gap-1.5">Create issue <Kbd className="border-background/30 bg-background/15 text-background">c</Kbd></span>}>
            <Button
              variant="primary"
              size="sm"
              onClick={() => openCreateIssue()}
              className="hidden sm:inline-flex"
            >
              <Plus />
              Create
            </Button>
          </Tooltip>
        ) : null}

        <Link
          href="/settings/profile"
          className="ml-0.5 rounded-full md:hidden"
          aria-label={`${displayName(profile)} — profile`}
        >
          <Avatar
            id={userId}
            name={profile?.full_name ?? profile?.email}
            src={profile?.avatar_url}
            size="sm"
          />
        </Link>
      </div>
    </header>
  )
}
