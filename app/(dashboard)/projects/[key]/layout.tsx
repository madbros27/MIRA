import { ProjectProvider } from '@/components/projects/project-provider'

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ key: string }>
}) {
  const { key } = await params
  return <ProjectProvider projectKey={key}>{children}</ProjectProvider>
}
