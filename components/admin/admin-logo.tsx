import { cn } from '@/lib/utils'

/**
 * The administrator lockup.
 *
 * Deliberately different from the tenant logo: a square copper shield rather
 * than the rounded iris mark, and the words "System Administration" set
 * beside it. Nobody should be able to confuse the two portals at a glance.
 */
export function AdminLogo({
  className,
  compact = false,
  onDark = false,
}: {
  className?: string
  compact?: boolean
  onDark?: boolean
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        aria-hidden
        className="relative flex size-8 shrink-0 items-center justify-center rounded-[0.5rem] bg-primary text-primary-foreground shadow-sm"
      >
        <svg viewBox="0 0 24 24" className="size-[1.125rem]" fill="none">
          <path
            d="M12 2.75 4.5 5.9v5.35c0 4.4 3.06 8.5 7.5 9.99 4.44-1.49 7.5-5.59 7.5-9.99V5.9L12 2.75Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="m8.9 11.95 2.2 2.2 4-4.3"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      {!compact && (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              'text-[0.9375rem] font-semibold tracking-tight',
              onDark ? 'text-white' : 'text-foreground'
            )}
          >
            MIRA
          </span>
          <span
            className={cn(
              'mt-0.5 text-[0.625rem] font-medium uppercase tracking-[0.14em]',
              onDark ? 'text-sidebar-muted' : 'text-muted-foreground'
            )}
          >
            System Administration
          </span>
        </span>
      )}
    </span>
  )
}

/**
 * The loud badge carried in the admin shell header. It exists so that a
 * screenshot of any admin screen is self-identifying.
 */
export function SystemAdminBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md bg-primary px-2 py-1 text-[0.625rem] font-bold uppercase tracking-[0.12em] text-primary-foreground shadow-sm',
        className
      )}
    >
      <svg viewBox="0 0 24 24" className="size-3" fill="none" aria-hidden>
        <path
          d="M12 3 5 6v5c0 4 2.8 7.7 7 9 4.2-1.3 7-5 7-9V6l-7-3Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      System Admin
    </span>
  )
}
