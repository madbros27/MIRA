'use client'

import Link from 'next/link'
import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { mentionsToMarkdown } from '@/lib/mentions'
import { cn } from '@/lib/utils'

/**
 * MIRA stores rich text as GitHub-flavoured markdown. Mentions are rewritten
 * into `mira:user/<id>` links before parsing so they can render as chips.
 */
const SAFE_SCHEMES = /^(https?:|mailto:|tel:|mira:|#|\/|\.)/i

function urlTransform(url: string) {
  return SAFE_SCHEMES.test(url) ? url : ''
}

export function Markdown({
  children,
  className,
}: {
  children: string | null | undefined
  className?: string
}) {
  const source = React.useMemo(() => mentionsToMarkdown(children ?? ''), [children])

  if (!children?.trim()) return null

  return (
    <div className={cn('prose-mira', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={urlTransform}
        components={{
          a({ href, children: content, ...props }) {
            if (href?.startsWith('mira:user/')) {
              return (
                <span className="rounded bg-primary-subtle px-1 py-0.5 text-[0.8125rem] font-medium text-primary-subtle-foreground">
                  {content}
                </span>
              )
            }
            const isInternal = href?.startsWith('/')
            if (isInternal) {
              return (
                <Link href={href!} {...props}>
                  {content}
                </Link>
              )
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow" {...props}>
                {content}
              </a>
            )
          },
          // Task lists come from remark-gfm; keep them read-only.
          input({ ...props }) {
            return <input {...props} disabled readOnly />
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
