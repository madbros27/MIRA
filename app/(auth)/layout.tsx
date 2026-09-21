import { CheckCircle2 } from 'lucide-react'

import { Wordmark } from '@/components/layout/logo'

const HIGHLIGHTS = [
  'Kanban boards with drag-and-drop that updates live for everyone',
  'Backlogs, sprints, burndown and velocity out of the box',
  'Row-level security in Postgres — permissions are not just UI',
  'Built for a phone as carefully as for a desk',
]

/**
 * Split layout: the form on the left, the pitch on the right. The right panel
 * is hidden below `lg` so small screens get the form at full width.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col justify-center px-4 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Wordmark className="mb-8" />
          {children}
        </div>
      </div>

      <aside className="relative hidden overflow-hidden bg-sidebar px-12 py-16 lg:flex lg:flex-col lg:justify-center">
        {/* Soft brand glow, drawn with gradients rather than an image. */}
        <div
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full opacity-40 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, hsl(245 68% 56%) 0%, transparent 70%)',
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full opacity-30 blur-3xl"
          style={{
            background: 'radial-gradient(circle, hsl(190 80% 45%) 0%, transparent 70%)',
          }}
          aria-hidden
        />

        <div className="relative max-w-md">
          <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-sidebar-muted">
            Project &amp; issue tracking
          </p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight text-white">
            Everything a team needs to ship, without the ceremony.
          </h2>
          <ul className="mt-8 space-y-3">
            {HIGHLIGHTS.map((highlight) => (
              <li key={highlight} className="flex gap-3 text-sm text-sidebar-foreground">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                {highlight}
              </li>
            ))}
          </ul>

          <div className="mt-10 rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-4">
            <p className="font-mono text-2xs uppercase tracking-wide text-sidebar-muted">
              MIRA-101
            </p>
            <p className="mt-1 text-sm font-medium text-white">
              Drag-and-drop across board columns
            </p>
            <div className="mt-3 flex items-center gap-2 text-2xs text-sidebar-muted">
              <span className="rounded bg-[#2563EB]/20 px-1.5 py-0.5 text-[#93C5FD]">
                In Progress
              </span>
              <span>8 points</span>
              <span>· due Friday</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
