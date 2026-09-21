'use client'

import * as React from 'react'

import { MobileBottomNav, MobileNavDrawer } from '@/components/layout/mobile-nav'
import { ShortcutLayer } from '@/components/layout/shortcuts'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { CreateIssueDialog } from '@/components/issues/create-issue-dialog'
import { IssueDetailDialog } from '@/components/issues/issue-detail-dialog'
import { CreateProjectDialog } from '@/components/projects/create-project-dialog'
import { CommandPalette } from '@/components/search/command-palette'

/**
 * The dashboard frame. Everything global lives here exactly once: the sidebar,
 * the mobile chrome, the keyboard layer and the four global dialogs.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-canvas">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        {/* Bottom padding clears the mobile tab bar. */}
        <main className="min-w-0 flex-1 pb-bottom-nav md:pb-0">{children}</main>
      </div>

      <MobileBottomNav />
      <MobileNavDrawer />

      <CommandPalette />
      <CreateIssueDialog />
      <CreateProjectDialog />
      <IssueDetailDialog />
      <ShortcutLayer />
    </div>
  )
}

/** Consistent page heading used by every route under the shell. */
export function PageHeader({
  title,
  description,
  actions,
  tabs,
  breadcrumb,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  tabs?: React.ReactNode
  breadcrumb?: React.ReactNode
  className?: string
}) {
  return (
    <header
      className={['border-b border-border bg-background px-3 pt-4 sm:px-4', className]
        .filter(Boolean)
        .join(' ')}
    >
      {breadcrumb ? <div className="mb-2">{breadcrumb}</div> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold sm:text-xl">{title}</h1>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {tabs ? <div className="mt-3 -mb-px overflow-x-auto">{tabs}</div> : <div className="h-4" />}
    </header>
  )
}
