'use client'

import { Building2, UserRound, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { PageHeader } from '@/components/layout/app-shell'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { can } from '@/lib/permissions'
import { cn } from '@/lib/utils'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { caps } = useWorkspaceContext()

  const tabs = [
    { href: '/settings/profile', label: 'Your profile', icon: UserRound, show: true },
    {
      href: '/settings/workspace',
      label: 'Workspace',
      icon: Building2,
      show: can.manageWorkspace(caps),
    },
    // People moved to its own top-level page; keep a signpost here so anyone
    // looking for members in Settings still finds them.
    { href: '/team', label: 'Team & positions', icon: Users, show: true },
  ].filter((tab) => tab.show)

  return (
    <>
      <PageHeader
        title="Settings"
        tabs={
          <nav aria-label="Settings sections">
            <ul className="flex min-w-max items-center gap-1">
              {tabs.map((tab) => {
                const active = pathname === tab.href
                return (
                  <li key={tab.href}>
                    <Link
                      href={tab.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'relative inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-2 text-sm font-medium transition-colors',
                        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <tab.icon className="size-4" />
                      {tab.label}
                      {active ? (
                        <span
                          className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-primary"
                          aria-hidden
                        />
                      ) : null}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
        }
      />
      {children}
    </>
  )
}
