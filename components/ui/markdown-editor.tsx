'use client'

/**
 * Markdown composer with a formatting toolbar, a live preview and @mention
 * autocomplete.
 *
 * Rich text is markdown rather than a WYSIWYG document tree: it round-trips
 * through Postgres as plain text, stays diffable in the comment edit history,
 * and keeps the client bundle small.
 */

import {
  AtSign,
  Bold,
  Code,
  Eye,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pencil,
  Quote,
} from 'lucide-react'
import * as React from 'react'

import { Button } from './button'
import { Markdown } from './markdown'
import { Avatar } from './primitives'
import { Textarea } from './input'
import { activeMentionQuery, encodeMention } from '@/lib/mentions'
import type { Profile } from '@/lib/types/app'
import { cn, displayName } from '@/lib/utils'

type MentionCandidate = Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'email'>

export function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Write something…',
  people = [],
  rows = 4,
  autoFocus,
  className,
  onSubmitShortcut,
  id,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  people?: MentionCandidate[]
  rows?: number
  autoFocus?: boolean
  className?: string
  /** Fired on Cmd/Ctrl+Enter. */
  onSubmitShortcut?: () => void
  id?: string
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const [tab, setTab] = React.useState<'write' | 'preview'>('write')
  const [mention, setMention] = React.useState<{ query: string; from: number } | null>(null)
  const [highlighted, setHighlighted] = React.useState(0)

  const candidates = React.useMemo(() => {
    if (!mention) return []
    const query = mention.query.toLowerCase()
    return people
      .filter((person) => {
        if (!query) return true
        return `${person.full_name ?? ''} ${person.email ?? ''}`.toLowerCase().includes(query)
      })
      .slice(0, 6)
  }, [mention, people])

  React.useEffect(() => setHighlighted(0), [mention?.query])

  function syncMentionState(nextValue: string, caret: number) {
    setMention(people.length ? activeMentionQuery(nextValue, caret) : null)
  }

  function wrapSelection(before: string, after = before, placeholderText = 'text') {
    const el = textareaRef.current
    if (!el) return
    const { selectionStart, selectionEnd } = el
    const selected = value.slice(selectionStart, selectionEnd) || placeholderText
    const next =
      value.slice(0, selectionStart) + before + selected + after + value.slice(selectionEnd)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(
        selectionStart + before.length,
        selectionStart + before.length + selected.length
      )
    })
  }

  function prefixLines(prefix: string | ((index: number) => string)) {
    const el = textareaRef.current
    if (!el) return
    const { selectionStart, selectionEnd } = el
    const start = value.lastIndexOf('\n', selectionStart - 1) + 1
    const end = value.indexOf('\n', selectionEnd)
    const sliceEnd = end === -1 ? value.length : end
    const block = value.slice(start, sliceEnd) || 'item'
    const updated = block
      .split('\n')
      .map((line, index) => `${typeof prefix === 'string' ? prefix : prefix(index)}${line}`)
      .join('\n')
    onChange(value.slice(0, start) + updated + value.slice(sliceEnd))
    requestAnimationFrame(() => el.focus())
  }

  function insertMention(person: MentionCandidate) {
    const el = textareaRef.current
    if (!el || !mention) return
    const markup = encodeMention(displayName(person), person.id)
    const caret = el.selectionStart
    const next = `${value.slice(0, mention.from)}${markup} ${value.slice(caret)}`
    onChange(next)
    setMention(null)
    requestAnimationFrame(() => {
      el.focus()
      const position = mention.from + markup.length + 1
      el.setSelectionRange(position, position)
    })
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && candidates.length) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHighlighted((index) => (index + 1) % candidates.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlighted((index) => (index - 1 + candidates.length) % candidates.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        insertMention(candidates[highlighted])
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setMention(null)
        return
      }
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      onSubmitShortcut?.()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
      event.preventDefault()
      wrapSelection('**')
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'i') {
      event.preventDefault()
      wrapSelection('_')
    }
  }

  const toolbarButton = (
    label: string,
    icon: React.ReactNode,
    action: () => void
  ) => (
    <button
      key={label}
      type="button"
      onClick={action}
      title={label}
      aria-label={label}
      className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-3.5"
    >
      {icon}
    </button>
  )

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-input bg-surface shadow-xs focus-within:border-primary',
        className
      )}
    >
      <div className="flex items-center gap-0.5 border-b border-border bg-surface-raised px-1.5 py-1">
        {tab === 'write' ? (
          <>
            {toolbarButton('Bold', <Bold />, () => wrapSelection('**'))}
            {toolbarButton('Italic', <Italic />, () => wrapSelection('_'))}
            {toolbarButton('Inline code', <Code />, () => wrapSelection('`'))}
            {toolbarButton('Link', <Link2 />, () => wrapSelection('[', '](https://)', 'label'))}
            {toolbarButton('Bulleted list', <List />, () => prefixLines('- '))}
            {toolbarButton('Numbered list', <ListOrdered />, () =>
              prefixLines((index) => `${index + 1}. `)
            )}
            {toolbarButton('Quote', <Quote />, () => prefixLines('> '))}
            {people.length
              ? toolbarButton('Mention someone', <AtSign />, () => {
                  const el = textareaRef.current
                  if (!el) return
                  const caret = el.selectionStart
                  const next = `${value.slice(0, caret)}@${value.slice(caret)}`
                  onChange(next)
                  requestAnimationFrame(() => {
                    el.focus()
                    el.setSelectionRange(caret + 1, caret + 1)
                    syncMentionState(next, caret + 1)
                  })
                })
              : null}
          </>
        ) : (
          <span className="px-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            Preview
          </span>
        )}
        <div className="ml-auto">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setTab(tab === 'write' ? 'preview' : 'write')}
          >
            {tab === 'write' ? <Eye /> : <Pencil />}
            {tab === 'write' ? 'Preview' : 'Write'}
          </Button>
        </div>
      </div>

      {tab === 'write' ? (
        <div className="relative">
          <Textarea
            id={id}
            ref={textareaRef}
            value={value}
            rows={rows}
            autoFocus={autoFocus}
            placeholder={placeholder}
            onChange={(event) => {
              onChange(event.target.value)
              syncMentionState(event.target.value, event.target.selectionStart)
            }}
            onClick={(event) =>
              syncMentionState(value, (event.target as HTMLTextAreaElement).selectionStart)
            }
            onBlur={() => setTimeout(() => setMention(null), 150)}
            onKeyDown={handleKeyDown}
            className="rounded-none border-0 shadow-none focus-visible:border-0"
          />

          {mention && candidates.length ? (
            <ul
              role="listbox"
              aria-label="Mention a teammate"
              className="absolute inset-x-2 bottom-2 z-20 max-h-52 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg"
            >
              {candidates.map((person, index) => (
                <li key={person.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === highlighted}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      insertMention(person)
                    }}
                    onMouseEnter={() => setHighlighted(index)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm',
                      index === highlighted ? 'bg-accent' : 'hover:bg-accent/60'
                    )}
                  >
                    <Avatar
                      id={person.id}
                      name={person.full_name}
                      src={person.avatar_url}
                      size="sm"
                    />
                    <span className="truncate font-medium">{displayName(person)}</span>
                    <span className="ml-auto truncate text-2xs text-muted-foreground">
                      {person.email}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="min-h-24 px-3 py-2.5">
          {value.trim() ? (
            <Markdown>{value}</Markdown>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
