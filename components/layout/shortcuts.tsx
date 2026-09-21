'use client'

/**
 * Global keyboard layer.
 *
 * Nothing fires while focus is in a field or while a dialog has focus, so
 * typing "c" in a comment box never opens the create dialog.
 */

import { usePathname, useRouter } from 'next/navigation'
import * as React from 'react'

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/primitives'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { can } from '@/lib/permissions'
import { useProjects } from '@/lib/queries/projects'
import { useUiStore } from '@/lib/store/ui-store'

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['c'], label: 'Create issue' },
  { keys: ['/'], label: 'Search' },
  { keys: ['⌘', 'K'], label: 'Command palette' },
  { keys: ['g', 'd'], label: 'Go to dashboard' },
  { keys: ['g', 'b'], label: 'Go to board' },
  { keys: ['g', 'l'], label: 'Go to backlog' },
  { keys: ['g', 'm'], label: 'Go to my work' },
  { keys: ['g', 'n'], label: 'Go to notifications' },
  { keys: ['g', 'p'], label: 'Go to projects' },
  { keys: ['g', 't'], label: 'Go to team' },
  { keys: ['?'], label: 'This help' },
  { keys: ['Esc'], label: 'Close dialogs' },
  { keys: ['Space'], label: 'Pick up / drop a card (while focused)' },
]

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable ||
    target.getAttribute('role') === 'textbox'
  )
}

export function ShortcutLayer() {
  const router = useRouter()
  const pathname = usePathname()
  const { caps, workspaceId } = useWorkspaceContext()
  const { data: projects } = useProjects(workspaceId)
  const openCreateIssue = useUiStore((state) => state.openCreateIssue)
  const setCommandOpen = useUiStore((state) => state.setCommandOpen)
  const shortcutsOpen = useUiStore((state) => state.shortcutsOpen)
  const setShortcutsOpen = useUiStore((state) => state.setShortcutsOpen)

  // "g" then a letter — a leader sequence, cleared after a second.
  const leader = React.useRef<number | null>(null)

  // Read from a ref inside the handler so changing route does not have to
  // tear down and re-attach the keydown listener.
  const currentProjectKey = React.useRef<string | null>(null)
  currentProjectKey.current = pathname.match(/^\/projects\/([A-Z0-9]+)/i)?.[1] ?? null

  const firstProjectKey = projects?.[0]?.key ?? null

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey

      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen(true)
        return
      }

      if (isTypingTarget(event.target) || event.altKey) return

      // A Radix dialog marks the rest of the page inert; skip while one is up.
      if (document.body.hasAttribute('data-scroll-locked')) return

      const key = event.key

      if (leader.current && Date.now() - leader.current < 1000) {
        // `g b` and `g l` need a project. Prefer the one already open, else
        // the first the viewer can reach — they are ordered by name.
        const contextKey = currentProjectKey.current ?? firstProjectKey

        const destinations: Record<string, string | undefined> = {
          d: '/dashboard',
          h: '/dashboard',
          b: contextKey ? `/projects/${contextKey}/board` : '/projects',
          l: contextKey ? `/projects/${contextKey}/backlog` : '/projects',
          m: '/my-work',
          n: '/notifications',
          p: '/projects',
          r: '/reports',
          s: '/search',
          t: '/team',
        }
        const href = destinations[key.toLowerCase()]
        leader.current = null
        if (href) {
          event.preventDefault()
          router.push(href)
          return
        }
      }

      if (key.toLowerCase() === 'g' && !meta) {
        leader.current = Date.now()
        return
      }

      if (key === '/' && !meta) {
        event.preventDefault()
        setCommandOpen(true)
        return
      }

      if (key === '?') {
        event.preventDefault()
        setShortcutsOpen(true)
        return
      }

      if (key.toLowerCase() === 'c' && !meta && can.writeIssues(caps)) {
        event.preventDefault()
        openCreateIssue()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [caps, firstProjectKey, openCreateIssue, router, setCommandOpen, setShortcutsOpen])

  return (
    <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Shortcuts are ignored while you are typing in a field.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <dl className="divide-y divide-border">
            {SHORTCUTS.map((shortcut) => (
              <div
                key={shortcut.label}
                className="flex items-center justify-between gap-4 py-2"
              >
                <dt className="text-sm">{shortcut.label}</dt>
                <dd className="flex shrink-0 gap-1">
                  {shortcut.keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
