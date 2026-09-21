'use client'

/**
 * Local UI state that several distant components need to agree on: the global
 * dialogs, the command palette and the sidebar. Server data never lives here —
 * that is React Query's job.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type UiState = {
  /** Issue create dialog, optionally pre-seeded from the current view. */
  createIssue: {
    open: boolean
    projectId?: string
    statusId?: string
    sprintId?: string | null
    parentId?: string | null
    epicId?: string | null
    type?: 'epic' | 'story' | 'task' | 'bug' | 'subtask'
  }
  openCreateIssue: (seed?: Omit<UiState['createIssue'], 'open'>) => void
  closeCreateIssue: () => void

  /** Issue detail opens as a dialog over the board and as a page elsewhere. */
  issueDialogId: string | null
  openIssueDialog: (issueId: string) => void
  closeIssueDialog: () => void

  commandOpen: boolean
  setCommandOpen: (open: boolean) => void

  shortcutsOpen: boolean
  setShortcutsOpen: (open: boolean) => void

  createProjectOpen: boolean
  setCreateProjectOpen: (open: boolean) => void

  sidebarCollapsed: boolean
  toggleSidebar: () => void

  mobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      createIssue: { open: false },
      openCreateIssue: (seed) => set({ createIssue: { ...seed, open: true } }),
      closeCreateIssue: () => set({ createIssue: { open: false } }),

      issueDialogId: null,
      openIssueDialog: (issueId) => set({ issueDialogId: issueId }),
      closeIssueDialog: () => set({ issueDialogId: null }),

      commandOpen: false,
      setCommandOpen: (open) => set({ commandOpen: open }),

      shortcutsOpen: false,
      setShortcutsOpen: (open) => set({ shortcutsOpen: open }),

      createProjectOpen: false,
      setCreateProjectOpen: (open) => set({ createProjectOpen: open }),

      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      mobileNavOpen: false,
      setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
    }),
    {
      name: 'mira-ui',
      // Only the durable preference is persisted; dialogs must not reopen on
      // reload.
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    }
  )
)
