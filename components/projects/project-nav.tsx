'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

/** Underlined tab strip for the project sub-navigation. */
export function ProjectNav({
  projectKey,
  canManage,
}: {
  projectKey: string
  canManage: boolean
}) {
  const pathname = usePathname()
  const base = `/projects/${projectKey}`

  const tabs = [
    { href: base, label: 'Overview' },
    { href: `${base}/board`, label: 'Board' },
    { href: `${base}/backlog`, label: 'Backlog' },
    { href: `${base}/reports`, label: 'Reports' },
    ...(canManage ? [{ href: `${base}/settings`, label: 'Settings' }] : []),
  ]

  return (
    <nav aria-label="Project sections">
      <ul className="flex min-w-max items-center gap-1">
        {tabs.map((tab) => {
          const active = pathname === tab.href
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative inline-flex items-center whitespace-nowrap px-2.5 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
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
  )
}
