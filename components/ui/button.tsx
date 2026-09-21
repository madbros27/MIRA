'use client'

import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover',
        secondary:
          'border border-border bg-surface text-foreground shadow-xs hover:bg-muted',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        subtle: 'bg-muted text-foreground hover:bg-accent',
        destructive:
          'bg-destructive text-destructive-foreground shadow-xs hover:brightness-95',
        'destructive-ghost':
          'text-destructive hover:bg-destructive-subtle',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        xs: 'h-7 rounded-md px-2 text-xs [&_svg]:size-3.5',
        sm: 'h-8 px-2.5',
        md: 'h-9 px-3.5',
        lg: 'h-10 px-5 text-[0.9375rem]',
        'icon-xs': 'size-7 rounded-md [&_svg]:size-3.5',
        'icon-sm': 'size-8',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  }
)

export type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    loading?: boolean
  }

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      data-loading={loading || undefined}
      {...props}
    >
      {/* Slot accepts exactly one child, so `asChild` buttons skip the spinner. */}
      {loading && !asChild ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          <span className="sr-only">Working… </span>
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  )
}

export { buttonVariants }
