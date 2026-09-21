import type { Metadata } from 'next'

/**
 * Everything under `<base>/miraadmin` lives in this route group.
 *
 * The single job of this layout is to stamp `data-portal="admin"`, which
 * swaps the design tokens to the copper administrator ramp (see
 * `styles/globals.css`). Component code below this point is identical to the
 * tenant app — only the palette and the chrome differ, which is exactly the
 * point: one glance tells you which portal you are in.
 */

export const metadata: Metadata = {
  title: {
    default: 'MIRA System Administration',
    template: '%s · MIRA Admin',
  },
  description: 'Platform administration for MIRA.',
  robots: { index: false, follow: false },
}

export default function AdminPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div data-portal="admin" className="min-h-dvh bg-canvas text-foreground">
      {children}
    </div>
  )
}
