/**
 * Mentions are stored in the comment body as `@[Display Name](user-uuid)`.
 *
 * Keeping the user id in the text means the database trigger can raise the
 * notifications without the client being trusted to say who was mentioned, and
 * a renamed user still renders with their current name at read time.
 */

/**
 * Matches the exact UUID shape, identical to the regex in `notify_comment`, so
 * what the client renders as a mention is exactly what the trigger notifies.
 */
export const MENTION_PATTERN =
  /@\[([^\]]+)\]\(([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)/g

export type ParsedMention = { name: string; userId: string }

export function extractMentions(body: string): ParsedMention[] {
  const found = new Map<string, ParsedMention>()
  for (const match of body.matchAll(MENTION_PATTERN)) {
    found.set(match[2], { name: match[1], userId: match[2] })
  }
  return [...found.values()]
}

export function encodeMention(name: string, userId: string) {
  return `@[${name.replace(/[[\]()]/g, '')}](${userId})`
}

/** Replace the stored markup with plain `@Name` for previews and notifications. */
export function stripMentionMarkup(body: string) {
  return body.replace(MENTION_PATTERN, (_m, name) => `@${name}`)
}

/**
 * Turn the markup into markdown links that `react-markdown` renders. The
 * `mira:` scheme is intercepted by the renderer so it can draw a chip instead
 * of a plain anchor.
 */
export function mentionsToMarkdown(body: string) {
  return body.replace(MENTION_PATTERN, (_m, name, id) => `[@${name}](mira:user/${id})`)
}

/**
 * Find an in-progress `@query` immediately before the caret, so the composer
 * knows when to open the mention picker.
 */
export function activeMentionQuery(
  value: string,
  caret: number
): { query: string; from: number } | null {
  const upToCaret = value.slice(0, caret)
  const match = /(?:^|[\s(])@([\w.'-]{0,40})$/.exec(upToCaret)
  if (!match) return null
  return { query: match[1], from: caret - match[1].length - 1 }
}
