'use client'

import { Check, ChevronsUpDown, Settings } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { setActiveWorkspace } from '@/app/actions'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { Badge } from '@/components/ui/primitives'
import { ROLE_META } from '@/lib/constants'
import { cn, initials } from '@/lib/utils'

export function WorkspaceSwitcher({ variant = 'sidebar' }: { variant?: 'sidebar' | 'plain' }) {
  const router = useRouter()
  const { workspace, workspaces } = useWorkspaceContext()
  const [pending, setPending] = React.useState(false)

  async function switchTo(workspaceId: string) {
    if (workspaceId === workspace?.id) return
    setPending(true)
    try {
      await setActiveWorkspace(workspaceId)
      router.push('/dashboard')
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  const dark = variant === 'sidebar'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={pending}
            className={cn(
              'group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
              dark
                ? 'text-sidebar-foreground hover:bg-sidebar-accent'
                : 'border border-border bg-surface hover:bg-muted'
            )}
          >
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-md text-2xs font-bold uppercase',
                dark ? 'bg-primary text-primary-foreground' : 'bg-primary-subtle text-primary-subtle-foreground'
              )}
            >
              {initials(workspace?.name, 'W')}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {workspace?.name ?? 'No workspace'}
              </span>
              <span
                className={cn(
                  'block truncate text-2xs',
                  dark ? 'text-sidebar-muted' : 'text-muted-foreground'
                )}
              >
                {workspace ? ROLE_META[workspace.role].label : 'Create one to start'}
              </span>
            </span>
            <ChevronsUpDown
              className={cn(
                'size-3.5 shrink-0 opacity-60 transition-opacity group-hover:opacity-100'
              )}
            />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {workspaces.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onSelect={() => switchTo(item.id)}
              className="gap-2.5"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-2xs font-bold uppercase text-primary-subtle-foreground">
                {initials(item.name, 'W')}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <Badge variant="outline" className="shrink-0">
                {item.isOwner ? 'Owner' : (item.position?.name ?? ROLE_META[item.role].label)}
              </Badge>
              {item.id === workspace?.id ? (
                <Check className="size-3.5 !text-primary" />
              ) : null}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          {workspace ? (
            <DropdownMenuItem onSelect={() => router.push('/settings/workspace')}>
              <Settings />
              Workspace settings
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
