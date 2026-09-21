import { redirect } from 'next/navigation'

/**
 * `/backlog/ENG` — the short form from the product brief. See the note in
 * `board/[projectKey]/page.tsx`; the backlog lives inside the project layout.
 */
export default async function BacklogShortcut({
  params,
}: {
  params: Promise<{ projectKey: string }>
}) {
  const { projectKey } = await params
  redirect(`/projects/${projectKey.toUpperCase()}/backlog`)
}
