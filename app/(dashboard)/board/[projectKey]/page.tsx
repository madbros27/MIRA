import { redirect } from 'next/navigation'

/**
 * `/board/ENG` — the short form from the product brief.
 *
 * The board itself lives under `/projects/ENG/board`, inside the project
 * layout that supplies the project context and the tab bar shared by the
 * board, the backlog, reports and settings. Rather than duplicate that
 * layout, this route resolves to the canonical URL.
 */
export default async function BoardShortcut({
  params,
}: {
  params: Promise<{ projectKey: string }>
}) {
  const { projectKey } = await params
  redirect(`/projects/${projectKey.toUpperCase()}/board`)
}
