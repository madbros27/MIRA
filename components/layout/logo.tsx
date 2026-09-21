import { cn } from '@/lib/utils'

export function Logo({
  className,
  size = 28,
}: {
  className?: string
  size?: number
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground',
        className
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 32 32" width={size * 0.66} height={size * 0.66} fill="none">
        <path
          d="M8 23V9.5h3.3L16 17l4.7-7.5H24V23h-3.1v-8.2L16.9 21h-1.8l-4-6.2V23H8Z"
          fill="currentColor"
        />
      </svg>
    </span>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <Logo />
      <span className="text-[0.9375rem] font-semibold tracking-tight">MIRA</span>
    </span>
  )
}
