'use client'

import { AlertTriangle } from 'lucide-react'
import * as React from 'react'

import { Button } from './button'
import { Input } from './input'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog'

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  confirmation,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
  confirmation?: {
    expected: string
    value: string
    onChange: (value: string) => void
    label?: string
    placeholder?: string
  }
  onConfirm: () => void | Promise<void>
}) {
  const [busy, setBusy] = React.useState(false)
  const confirmationValid = !confirmation || confirmation.value === confirmation.expected

  async function handleConfirm() {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" showClose={false}>
        <DialogHeader className="pr-5">
          <DialogTitle className="flex items-center gap-2">
            {destructive ? (
              <span className="flex size-7 items-center justify-center rounded-lg bg-destructive-subtle text-destructive">
                <AlertTriangle className="size-4" />
              </span>
            ) : null}
            {title}
          </DialogTitle>
        </DialogHeader>
        {description ? (
          <DialogBody className="py-3">
            <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
              {description}
            </DialogDescription>
          </DialogBody>
        ) : null}
          {confirmation ? (
            <div className="px-5 pb-3">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {confirmation.label ?? 'Confirmation'}
              </label>
              <Input
                value={confirmation.value}
                onChange={(event) => confirmation.onChange(event.target.value)}
                placeholder={confirmation.placeholder}
                autoComplete="off"
              />
            </div>
          ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            onClick={handleConfirm}
            loading={busy || loading}
            disabled={!confirmationValid}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
