'use client'

/**
 * Mobile chrome: a bottom tab bar for the top-level destinations and a drawer
 * for the full navigation tree, including the project list.
 */

import {
  BarChart3,
  Bell,
  Building2,
  CalendarRange,
  FolderKanban,
  Home,
  Inbox,
  Plus,
  Search,
  Settings,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import * as React from 'react'

import { ProjectIcon } from '@/components/layout/project-icon'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { WorkspaceSwitcher } from '@/components/layout/workspace-switcher'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Sheet, SheetBody, SheetContent, SheetHeader } from '@/components/ui/sheet'
import { Avatar, Separator } from '@/components/ui/primitives'
import { can } from '@/lib/permissions'
import { useUnreadCount } from '@/lib/queries/notifications'
import { useProjects } from '@/lib/queries/projects'
import { useUiStore } from '@/lib/store/ui-store'
import { cn, displayName } from '@/lib/utils'

export function MobileBottomNav() {
  const pathname = usePathname()
  const { workspaceId, caps } = useWorkspaceContext()
  const unread = useUnreadCount(workspaceId)
  const openCreateIssue = useUiStore((state) => state.openCreateIssue)
  const setCommandOpen = useUiStore((state) => state.setCommandOpen)

  const tabs = [
    {
      href: '/dashboard',
      label: 'Home',
      icon: Home,
      match: (p: string) => p === '/dashboard' || p === '/',
    },
    {
      href: '/projects',
      label: 'Projects',
      icon: FolderKanban,
      match: (p: string) => p.startsWith('/projects') || p.startsWith('/board'),
    },
    null, // slot for the centre action
    {
      href: '/notifications',
      label: 'Alerts',
      icon: Bell,
      badge: unread,
      match: (p: string) => p.startsWith('/notifications'),
    },
    {
      href: '/my-work',
      label: 'My work',
      icon: Inbox,
      match: (p: string) => p.startsWith('/my-work'),
    },
  ]

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex h-bottom-nav items-stretch border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      aria-label="Primary"
    >
      {tabs.map((tab, index) =>
        tab ? (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.match(pathname) ? 'page' : undefined}
            className={cn(
              'relative flex flex-1 flex-col items-center justify-center gap-0.5 text-2xs font-medium transition-colors',
              tab.match(pathname) ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <tab.icon className="size-5" />
            {tab.label}
            {tab.badge ? (
              <span className="absolute right-[max(1rem,22%)] top-2 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.5625rem] font-bold text-destructive-foreground">
                {tab.badge > 9 ? '9+' : tab.badge}
              </span>
            ) : null}
          </Link>
        ) : (
          <div key={`action-${index}`} className="flex flex-1 items-center justify-center">
            <button
              type="button"
              onClick={() => (can.writeIssues(caps) ? openCreateIssue() : setCommandOpen(true))}
              className="-mt-5 inline-flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform active:scale-95"
              aria-label={can.writeIssues(caps) ? 'Create issue' : 'Search'}
            >
              {can.writeIssues(caps) ? (
                <Plus className="size-6" />
              ) : (
                <Search className="size-5" />
              )}
            </button>
          </div>
        )
      )}
    </nav>
  )
}

export function MobileNavDrawer() {
  const router = useRouter()
  const pathname = usePathname()
  const open = useUiStore((state) => state.mobileNavOpen)
  const setOpen = useUiStore((state) => state.setMobileNavOpen)
  const { profile, userId, workspaceId, caps } = useWorkspaceContext()
  const { data: projects } = useProjects(workspaceId)

  // Close the drawer whenever navigation happens.
  React.useEffect(() => setOpen(false), [pathname, setOpen])

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" showClose={false} className="w-[min(20rem,88vw)]">
        <SheetHeader className="pr-4">
          <WorkspaceSwitcher variant="plain" />
        </SheetHeader>
        <SheetBody className="space-y-4">
          <ul className="space-y-0.5">
            <DrawerItem icon={Home} label="Dashboard" onClick={() => go('/dashboard')} />
            <DrawerItem icon={Inbox} label="My work" onClick={() => go('/my-work')} />
            <DrawerItem icon={Bell} label="Notifications" onClick={() => go('/notifications')} />
            <DrawerItem
              icon={FolderKanban}
              label="All projects"
              onClick={() => go('/projects')}
            />
            <DrawerItem icon={CalendarRange} label="Sprints" onClick={() => go('/sprints')} />
            {can.viewReports(caps) ? (
              <DrawerItem icon={BarChart3} label="Reports" onClick={() => go('/reports')} />
            ) : null}
            <DrawerItem icon={Users} label="Team" onClick={() => go('/team')} />
          </ul>

          <div>
            <p className="px-2 pb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              Projects
            </p>
            {projects?.length ? (
              <ul className="space-y-0.5">
                {projects.map((project) => (
                  <li key={project.id}>
                    <button
                      type="button"
                      onClick={() => go(`/projects/${project.key}/board`)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm font-medium transition-colors hover:bg-muted"
                    >
                      <ProjectIcon icon={project.icon} color={project.color} size="sm" />
                      <span className="min-w-0 flex-1 truncate">{project.name}</span>
                      <span className="font-mono text-2xs text-muted-foreground">
                        {project.key}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-2 py-2 text-xs text-muted-foreground">No projects yet.</p>
            )}
          </div>

          <Separator />

          <ul className="space-y-0.5">
            {can.manageWorkspace(caps) ? (
              <DrawerItem
                icon={Building2}
                label="Workspace settings"
                onClick={() => go('/settings/workspace')}
              />
            ) : null}
            <DrawerItem
              icon={Settings}
              label="Your profile"
              onClick={() => go('/settings/profile')}
            />
          </ul>

          <div className="flex items-center justify-between rounded-lg border border-border bg-surface-raised p-2">
            <button
              type="button"
              onClick={() => go('/settings/profile')}
              className="flex min-w-0 items-center gap-2 text-left"
            >
              <Avatar
                id={userId}
                name={profile?.full_name ?? profile?.email}
                src={profile?.avatar_url}
                size="md"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {displayName(profile)}
                </span>
                <span className="block truncate text-2xs text-muted-foreground">
                  {profile?.email}
                </span>
              </span>
            </button>
            <ThemeToggle />
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

function DrawerItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm font-medium transition-colors hover:bg-muted"
      >
        <Icon className="size-4 text-muted-foreground" />
        {label}
      </button>
    </li>
  )
}
