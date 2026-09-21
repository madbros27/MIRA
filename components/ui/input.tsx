'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

export const inputBaseClass =
  'flex w-full rounded-lg border border-input bg-surface px-3 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60'

export function Input({
  className,
  type = 'text',
  ...props
}: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        inputBaseClass,
        'h-9 file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-medium',
        className
      )}
      {...props}
    />
  )
}

export function Textarea({
  className,
  ...props
}: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(inputBaseClass, 'min-h-20 resize-y py-2 leading-relaxed', className)}
      {...props}
    />
  )
}

/** Field wrapper: label, optional hint and an error message in one place. */
export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
}: {
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
  required?: boolean
  htmlFor?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <label
          htmlFor={htmlFor}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
        >
          {label}
          {required ? (
            <span className="text-destructive" aria-hidden>
              *
            </span>
          ) : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
