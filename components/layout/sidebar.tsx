'use client'

import {
  BarChart3,
  Bell,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Home,
  Inbox,
  Plus,
  Search,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as React from 'react'

import { Logo } from '@/components/layout/logo'
import { ProjectIcon } from '@/components/layout/project-icon'
import { UserMenu } from '@/components/layout/user-menu'
import { WorkspaceSwitcher } from '@/components/layout/workspace-switcher'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Tooltip } from '@/components/ui/controls'
import { Kbd, Skeleton } from '@/components/ui/primitives'
import { can } from '@/lib/permissions'
import { useUnreadCount } from '@/lib/queries/notifications'
import { useProjects } from '@/lib/queries/projects'
import { useUiStore } from '@/lib/store/ui-store'
import { cn } from '@/lib/utils'

export function Sidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed)
  const toggle = useUiStore((state) => state.toggleSidebar)

  return (
    <aside
      className={cn(
        'relative hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex',
        collapsed ? 'w-sidebar-collapsed' : 'w-sidebar'
      )}
      aria-label="Primary"
    >
      <div className="flex items-center gap-2 px-3 py-3">
        {collapsed ? (
          <Link href="/" className="mx-auto" aria-label="MIRA home">
            <Logo />
          </Link>
        ) : (
          <WorkspaceSwitcher />
        )}
      </div>

      <SidebarNav collapsed={collapsed} />

      <div className="mt-auto border-t border-sidebar-border p-2">
        {collapsed ? null : <UserMenu />}
        {collapsed ? (
          <Tooltip content="Expand sidebar" side="right">
            <button
              type="button"
              onClick={toggle}
              className="mx-auto flex size-8 items-center justify-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              aria-label="Expand sidebar"
            >
              <ChevronRight className="size-4" />
            </button>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={toggle}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-2xs font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <ChevronLeft className="size-3.5" />
            Collapse
          </button>
        )}
      </div>
    </aside>
  )
}

function SidebarNav({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname()
  const { workspaceId, caps } = useWorkspaceContext()
  const { data: projects, isLoading } = useProjects(workspaceId)
  const unread = useUnreadCount(workspaceId)
  const setCommandOpen = useUiStore((state) => state.setCommandOpen)
  const setCreateProjectOpen = useUiStore((state) => state.setCreateProjectOpen)

  // `report.view` gates the two insight destinations; everything else is
  // visible to anybody in the workspace.
  const primary = [
    { href: '/dashboard', label: 'Dashboard', icon: Home },
    { href: '/my-work', label: 'My work', icon: Inbox },
    { href: '/notifications', label: 'Notifications', icon: Bell, badge: unread },
    { href: '/projects', label: 'Projects', icon: FolderKanban },
    { href: '/sprints', label: 'Sprints', icon: CalendarRange },
    ...(can.viewReports(caps)
      ? [{ href: '/reports', label: 'Reports', icon: BarChart3 }]
      : []),
    { href: '/team', label: 'Team', icon: Users },
  ]

  return (
    <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      <SidebarButton
        collapsed={collapsed}
        icon={Search}
        label="Search"
        onClick={() => setCommandOpen(true)}
        trailing={
          collapsed ? null : (
            <Kbd className="border-sidebar-border bg-sidebar-accent text-sidebar-muted">/</Kbd>
          )
        }
      />

      <ul className="mt-1 space-y-0.5">
        {primary.map((item) => {
          const active =
            item.href === '/dashboard'
              ? pathname === '/dashboard' || pathname === '/'
              : pathname.startsWith(item.href)
          return (
            <li key={item.href}>
              <SidebarLink
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={active}
                collapsed={collapsed}
                badge={item.badge}
              />
            </li>
          )
        })}
      </ul>

      <div className="mt-5">
        <div
          className={cn(
            'flex items-center justify-between px-2 pb-1',
            collapsed && 'justify-center'
          )}
        >
          {collapsed ? (
            <span className="h-px w-6 bg-sidebar-border" />
          ) : (
            <>
              <span className="text-2xs font-semibold uppercase tracking-wide text-sidebar-muted">
                Projects
              </span>
              {can.createProject(caps) ? (
                <Tooltip content="New project" side="right">
                  <button
                    type="button"
                    onClick={() => setCreateProjectOpen(true)}
                    className="flex size-5 items-center justify-center rounded text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    aria-label="New project"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </Tooltip>
              ) : null}
            </>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-1 px-2 py-1">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-7 w-full bg-sidebar-accent" />
            ))}
          </div>
        ) : projects?.length ? (
          <ul className="space-y-0.5">
            {projects.map((project) => {
              const href = `/projects/${project.key}/board`
              const active = pathname.startsWith(`/projects/${project.key}`)
              return (
                <li key={project.id}>
                  <SidebarLink
                    href={href}
                    label={project.name}
                    active={active}
                    collapsed={collapsed}
                    leading={
                      <ProjectIcon icon={project.icon} color={project.color} size="sm" />
                    }
                    meta={project.key}
                  />
                </li>
              )
            })}
          </ul>
        ) : collapsed ? null : (
          <p className="px-2 py-2 text-2xs leading-relaxed text-sidebar-muted">
            {can.createProject(caps)
              ? 'No projects yet. Create the first one to get a board.'
              : 'No projects have been shared with you yet.'}
          </p>
        )}
      </div>
    </nav>
  )
}

const itemClass =
  'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors'

function SidebarLink({
  href,
  label,
  icon: Icon,
  leading,
  active,
  collapsed,
  badge,
  meta,
}: {
  href: string
  label: string
  icon?: React.ElementType
  leading?: React.ReactNode
  active?: boolean
  collapsed: boolean
  badge?: number
  meta?: string
}) {
  const content = (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        itemClass,
        collapsed && 'justify-center px-0',
        active
          ? 'bg-sidebar-accent text-white'
          : 'text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-white'
      )}
    >
      {leading ?? (Icon ? <Icon className="size-4 shrink-0" /> : null)}
      {collapsed ? null : (
        <>
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {badge ? (
            <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-2xs font-bold text-primary-foreground">
              {badge > 99 ? '99+' : badge}
            </span>
          ) : meta ? (
            <span className="shrink-0 font-mono text-2xs text-sidebar-muted">{meta}</span>
          ) : null}
        </>
      )}
    </Link>
  )

  if (!collapsed) return content
  return (
    <Tooltip content={label} side="right">
      {content}
    </Tooltip>
  )
}

function SidebarButton({
  icon: Icon,
  label,
  onClick,
  collapsed,
  trailing,
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
  collapsed: boolean
  trailing?: React.ReactNode
}) {
  const content = (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        itemClass,
        'text-sidebar-muted hover:bg-sidebar-accent/70 hover:text-sidebar-foreground',
        collapsed && 'justify-center px-0'
      )}
    >
      <Icon className="size-4 shrink-0" />
      {collapsed ? null : (
        <>
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          {trailing}
        </>
      )}
    </button>
  )

  if (!collapsed) return content
  return (
    <Tooltip content={label} side="right">
      {content}
    </Tooltip>
  )
}
