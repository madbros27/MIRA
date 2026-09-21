'use client'

import { IssueDetail } from './issue-detail'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useUiStore } from '@/lib/store/ui-store'

/**
 * Opening an issue from a board or backlog keeps you in place: the detail view
 * is the same component the full page renders, just hosted in a dialog.
 */
export function IssueDetailDialog() {
  const issueId = useUiStore((state) => state.issueDialogId)
  const close = useUiStore((state) => state.closeIssueDialog)

  return (
    <Dialog open={Boolean(issueId)} onOpenChange={(open) => (open ? null : close())}>
      <DialogContent
        size="full"
        showClose={false}
        className="h-[92vh] p-0 sm:h-[86vh]"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Issue detail</DialogTitle>
        {issueId ? <IssueDetail issueId={issueId} mode="dialog" onClose={close} /> : null}
      </DialogContent>
    </Dialog>
  )
}
