'use client'

import {
  Boxes,
  Compass,
  Cpu,
  Database,
  Globe,
  Hammer,
  Layers,
  LineChart,
  Palette,
  Rocket,
  Shield,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'

const ICONS: Record<string, LucideIcon> = {
  Rocket,
  Palette,
  Layers,
  Boxes,
  Compass,
  Cpu,
  Database,
  Globe,
  Hammer,
  LineChart,
  Shield,
  Sparkles,
}

const SIZES = {
  sm: 'size-5 rounded-md [&_svg]:size-3',
  md: 'size-7 rounded-lg [&_svg]:size-4',
  lg: 'size-10 rounded-xl [&_svg]:size-5',
} as const

export function ProjectIcon({
  icon,
  color,
  size = 'md',
  className,
}: {
  icon?: string | null
  color?: string | null
  size?: keyof typeof SIZES
  className?: string
}) {
  const Icon = ICONS[icon ?? 'Rocket'] ?? Rocket
  const tint = color ?? '#5B5BD6'

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center text-white',
        SIZES[size],
        className
      )}
      style={{ backgroundColor: tint }}
      aria-hidden
    >
      <Icon strokeWidth={2.2} />
    </span>
  )
}

export { ICONS as PROJECT_ICON_MAP }
