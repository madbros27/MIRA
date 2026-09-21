'use client'

import {
  Building2,
  Eye,
  KeyRound,
  LogIn,
  RotateCcw,
  UserCog,
  Trash2,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'

import { Badge } from '@/components/ui/primitives'
import { formatRelative } from '@/lib/format'
import type { AuditEntry } from '@/lib/types/admin'
import { cn } from '@/lib/utils'

/**
 * Human wording for each audit action.
 *
 * The log stores machine keys (`workspace.soft_deleted`); this table turns
 * them into a sentence, because an audit trail nobody can read is not much of
 * an audit trail.
 */
const ACTION_META: Record<
  string,
  { label: string; icon: LucideIcon; tone: 'neutral' | 'primary' | 'warning' | 'danger' | 'success' }
> = {
  'admin.login': { label: 'signed in', icon: LogIn, tone: 'neutral' },
  'admin.password_changed': { label: 'changed their password', icon: KeyRound, tone: 'neutral' },
  'workspace.created': { label: 'created workspace', icon: Building2, tone: 'success' },
  'workspace.updated': { label: 'updated workspace', icon: Building2, tone: 'neutral' },
  'workspace.status_changed': { label: 'changed the status of', icon: Building2, tone: 'warning' },
  'workspace.soft_deleted': { label: 'soft-deleted workspace', icon: Trash2, tone: 'danger' },
  'workspace.hard_deleted': { label: 'permanently deleted workspace', icon: Trash2, tone: 'danger' },
  'workspace.restored': { label: 'restored workspace', icon: RotateCcw, tone: 'success' },
  'workspace.transferred': { label: 'transferred ownership of', icon: UserCog, tone: 'warning' },
  'owner.assigned': { label: 'assigned an owner to', icon: UserPlus, tone: 'success' },
  'owner.removed': { label: 'removed an owner from', icon: UserMinus, tone: 'warning' },
  'owner.created': { label: 'created owner account', icon: UserCog, tone: 'success' },
  'owner.password_reset': { label: 'sent a password reset to', icon: KeyRound, tone: 'neutral' },
  'user.suspended': { label: 'suspended user', icon: UserMinus, tone: 'danger' },
  'user.reactivated': { label: 'reactivated user', icon: UserPlus, tone: 'success' },
  'impersonation.started': { label: 'started a support session in', icon: Eye, tone: 'warning' },
  'impersonation.ended': { label: 'ended a support session in', icon: Eye, tone: 'neutral' },
}

export function describeAction(action: string) {
  return ACTION_META[action] ?? { label: action, icon: Building2, tone: 'neutral' as const }
}

export function AuditRowList({
  entries,
  className,
}: {
  entries: AuditEntry[]
  className?: string
}) {
  return (
    <ol className={cn('space-y-3', className)}>
      {entries.map((entry) => (
        <AuditRow key={entry.id} entry={entry} />
      ))}
    </ol>
  )
}

export function AuditRow({ entry }: { entry: AuditEntry }) {
  const meta = describeAction(entry.action)
  const Icon = meta.icon
  const subject = auditSubject(entry)

  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-3.5',
          meta.tone === 'success' && 'bg-success-subtle text-success',
          meta.tone === 'warning' && 'bg-warning-subtle text-warning',
          meta.tone === 'danger' && 'bg-destructive-subtle text-destructive',
          meta.tone === 'primary' && 'bg-primary-subtle text-primary-subtle-foreground',
          meta.tone === 'neutral' && 'bg-muted text-muted-foreground'
        )}
      >
        <Icon />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-xs leading-relaxed">
          <span className="font-medium">{entry.actor_email ?? 'System'}</span>{' '}
          <span className="text-muted-foreground">{meta.label}</span>{' '}
          {subject ? (
            entry.target_type === 'workspace' && entry.target_id ? (
              <Link
                href={`/miraadmin/workspaces/${entry.target_id}`}
                className="font-medium underline decoration-border underline-offset-2 hover:decoration-foreground"
              >
                {subject}
              </Link>
            ) : (
              <span className="font-medium">{subject}</span>
            )
          ) : null}
        </p>
        <p className="mt-0.5 text-2xs text-muted-foreground">
          {formatRelative(entry.created_at)}
          {entry.ip ? ` · ${entry.ip}` : ''}
        </p>
        <AuditDetail entry={entry} />
      </div>
    </li>
  )
}

/** Best available human name for whatever the action targeted. */
function auditSubject(entry: AuditEntry): string | null {
  const metadata = entry.metadata ?? {}
  const name = metadata.name ?? metadata.workspace_name
  if (typeof name === 'string') return name
  if (entry.target_type === 'workspace') return 'a workspace'
  if (entry.target_type === 'user') return 'a user'
  return null
}

/** The one or two fields worth showing inline for a given action. */
function AuditDetail({ entry }: { entry: AuditEntry }) {
  const metadata = (entry.metadata ?? {}) as Record<string, unknown>

  if (entry.action === 'workspace.status_changed') {
    return (
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs">
        <Badge variant="outline">{String(metadata.from ?? '?')}</Badge>
        <span aria-hidden className="text-muted-foreground">
          →
        </span>
        <Badge variant="warning">{String(metadata.to ?? '?')}</Badge>
        {metadata.reason ? (
          <span className="text-muted-foreground">“{String(metadata.reason)}”</span>
        ) : null}
      </p>
    )
  }

  if (entry.action === 'impersonation.started') {
    return (
      <p className="mt-1 text-2xs text-muted-foreground">
        {metadata.minutes ? `${String(metadata.minutes)} minute window` : null}
        {metadata.reason ? ` · “${String(metadata.reason)}”` : null}
      </p>
    )
  }

  if (entry.action === 'impersonation.ended' && metadata.duration_seconds) {
    const seconds = Number(metadata.duration_seconds)
    return (
      <p className="mt-1 text-2xs text-muted-foreground">
        Lasted {seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)} min`}
      </p>
    )
  }

  if (entry.action === 'workspace.updated' && metadata.before && metadata.after) {
    const before = metadata.before as Record<string, unknown>
    const after = metadata.after as Record<string, unknown>
    const changed = Object.keys(after).filter(
      (key) => String(before[key]) !== String(after[key])
    )
    if (!changed.length) return null
    return (
      <p className="mt-1 text-2xs text-muted-foreground">
        {changed
          .map((key) => `${key}: ${String(before[key] ?? '—')} → ${String(after[key] ?? '—')}`)
          .join(' · ')}
      </p>
    )
  }

  if (typeof metadata.reason === 'string' && metadata.reason) {
    return (
      <p className="mt-1 text-2xs text-muted-foreground">“{metadata.reason}”</p>
    )
  }

  return null
}
