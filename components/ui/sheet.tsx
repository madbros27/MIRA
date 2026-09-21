'use client'

/** Side sheet — the mobile navigation drawer and the filter panel. */

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

const SIDES = {
  left: 'inset-y-0 left-0 h-full w-[min(19rem,86vw)] border-r data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left',
  right:
    'inset-y-0 right-0 h-full w-[min(24rem,90vw)] border-l data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
  bottom:
    'inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl border-t data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
} as const

export function SheetContent({
  className,
  children,
  side = 'right',
  showClose = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  side?: keyof typeof SIDES
  showClose?: boolean
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[hsl(226_30%_8%/0.55)] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 flex flex-col gap-0 overflow-hidden border-border bg-surface shadow-lg outline-none transition ease-out data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:duration-200 data-[state=open]:duration-300',
          SIDES[side],
          className
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            className="absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col gap-1 border-b border-border px-4 py-3.5 pr-12',
        className
      )}
      {...props}
    />
  )
}

export function SheetBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto p-4', className)} {...props} />
}

export function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex shrink-0 gap-2 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]',
        className
      )}
      {...props}
    />
  )
}

export function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-base font-semibold leading-tight', className)}
      {...props}
    />
  )
}

export function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-xs text-muted-foreground', className)}
      {...props}
    />
  )
}
