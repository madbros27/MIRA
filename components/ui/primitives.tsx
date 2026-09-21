'use client'

/**
 * Small presentational primitives that do not need Radix: badges, cards,
 * avatars, skeletons, separators, empty states and the keyboard-shortcut hint.
 */

import { cva, type VariantProps } from 'class-variance-authority'
import Image from 'next/image'
import * as React from 'react'

import { avatarTint, cn, initials } from '@/lib/utils'

/* -------------------------------------------------------------------------- */
/* Badge                                                                      */
/* -------------------------------------------------------------------------- */

const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-md font-medium leading-none',
  {
    variants: {
      variant: {
        neutral: 'bg-muted text-muted-foreground',
        outline: 'border border-border text-muted-foreground',
        primary: 'bg-primary-subtle text-primary-subtle-foreground',
        success: 'bg-success-subtle text-success',
        warning: 'bg-warning-subtle text-warning',
        danger: 'bg-destructive-subtle text-destructive',
        info: 'bg-info-subtle text-info',
      },
      size: {
        sm: 'px-1.5 py-0.5 text-2xs',
        md: 'px-2 py-1 text-xs',
      },
    },
    defaultVariants: { variant: 'neutral', size: 'sm' },
  }
)

export type BadgeProps = React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />
}

/* -------------------------------------------------------------------------- */
/* Card                                                                       */
/* -------------------------------------------------------------------------- */

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-surface shadow-xs',
        className
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 p-4 sm:p-5', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return <h3 className={cn('text-sm font-semibold', className)} {...props} />
}

export function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('text-xs text-muted-foreground', className)} {...props} />
}

export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('p-4 pt-0 sm:p-5 sm:pt-0', className)} {...props} />
}

export function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex items-center gap-2 border-t border-border p-4 sm:px-5', className)}
      {...props}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Avatar                                                                     */
/* -------------------------------------------------------------------------- */

const AVATAR_SIZES = {
  xs: 'size-5 text-[0.5rem]',
  sm: 'size-6 text-[0.625rem]',
  md: 'size-8 text-xs',
  lg: 'size-10 text-sm',
  xl: 'size-16 text-lg',
} as const

export function Avatar({
  name,
  src,
  id,
  size = 'md',
  className,
  ring = false,
}: {
  name?: string | null
  src?: string | null
  id?: string
  size?: keyof typeof AVATAR_SIZES
  className?: string
  ring?: boolean
}) {
  const [failed, setFailed] = React.useState(false)
  const label = name?.trim() || 'Unassigned'
  const showImage = Boolean(src) && !failed
  const pixels = { xs: 20, sm: 24, md: 32, lg: 40, xl: 64 }[size]

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold uppercase',
        AVATAR_SIZES[size],
        !showImage && (id ? avatarTint(id) : 'bg-muted text-muted-foreground'),
        ring && 'ring-2 ring-surface',
        className
      )}
      title={label}
    >
      {showImage ? (
        <Image
          src={src as string}
          alt={label}
          width={pixels}
          height={pixels}
          className="size-full object-cover"
          onError={() => setFailed(true)}
          unoptimized
        />
      ) : (
        <span aria-hidden>{initials(name, '–')}</span>
      )}
      <span className="sr-only">{label}</span>
    </span>
  )
}

/** Overlapping avatar row used for watchers and workload lists. */
export function AvatarStack({
  people,
  max = 4,
  size = 'sm',
}: {
  people: { id: string; full_name?: string | null; avatar_url?: string | null }[]
  max?: number
  size?: keyof typeof AVATAR_SIZES
}) {
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  return (
    <div className="flex items-center">
      {shown.map((person, index) => (
        <Avatar
          key={person.id}
          id={person.id}
          name={person.full_name}
          src={person.avatar_url}
          size={size}
          ring
          className={index > 0 ? '-ml-1.5' : undefined}
        />
      ))}
      {extra > 0 ? (
        <span className="-ml-1.5 inline-flex size-6 items-center justify-center rounded-full bg-muted text-2xs font-semibold text-muted-foreground ring-2 ring-surface">
          +{extra}
        </span>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Skeleton, separator                                                        */
/* -------------------------------------------------------------------------- */

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('shimmer rounded-md', className)} {...props} />
}

export function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: React.ComponentProps<'div'> & { orientation?: 'horizontal' | 'vertical' }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className
      )}
      {...props}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Empty & error states                                                       */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/50 text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
        className
      )}
    >
      {icon ? (
        <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground [&_svg]:size-5">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  className,
}: {
  title?: string
  description?: React.ReactNode
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive-subtle px-6 py-10 text-center',
        className
      )}
    >
      <div className="space-y-1">
        <p className="text-sm font-semibold text-destructive">{title}</p>
        {description ? (
          <p className="mx-auto max-w-md text-xs leading-relaxed text-destructive/85">
            {description}
          </p>
        ) : null}
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-destructive/40 bg-surface px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          Try again
        </button>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Keyboard hint                                                              */
/* -------------------------------------------------------------------------- */

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-sunken px-1.5 font-mono text-[0.625rem] font-medium text-muted-foreground',
        className
      )}
    >
      {children}
    </kbd>
  )
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                   */
/* -------------------------------------------------------------------------- */

export function ProgressBar({
  value,
  max = 100,
  className,
  barClassName,
  label,
}: {
  value: number
  max?: number
  className?: string
  barClassName?: string
  label?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className={cn('h-full rounded-full bg-primary transition-[width] duration-500', barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
