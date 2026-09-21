'use client'

/**
 * ⌘K / "/" palette. Three things in one place: global search across issues,
 * projects and comments; jump-to navigation; and the create actions.
 */

import { Command } from 'cmdk'
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarRange,
  FolderKanban,
  Home,
  Inbox,
  LayoutDashboard,
  ListOrdered,
  type LucideIcon,
  MessageSquare,
  Plus,
  Search,
  Settings,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { ProjectIcon } from '@/components/layout/project-icon'
import { useWorkspaceContext } from '@/components/providers/workspace-provider'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/primitives'
import { can } from '@/lib/permissions'
import { useProjects } from '@/lib/queries/projects'
import { useGlobalSearch } from '@/lib/queries/search'
import { useUiStore } from '@/lib/store/ui-store'
import { cn, debounce, truncate } from '@/lib/utils'

export function CommandPalette() {
  const router = useRouter()
  const open = useUiStore((state) => state.commandOpen)
  const setOpen = useUiStore((state) => state.setCommandOpen)
  const openCreateIssue = useUiStore((state) => state.openCreateIssue)
  const setCreateProjectOpen = useUiStore((state) => state.setCreateProjectOpen)
  const openIssueDialog = useUiStore((state) => state.openIssueDialog)

  const { workspaceId, caps } = useWorkspaceContext()
  const { data: projects } = useProjects(workspaceId)

  const [input, setInput] = React.useState('')
  const [term, setTerm] = React.useState('')

  const pushTerm = React.useMemo(() => debounce((value: string) => setTerm(value), 220), [])
  const { data: results, isFetching } = useGlobalSearch(workspaceId, term)

  React.useEffect(() => {
    if (!open) {
      setInput('')
      setTerm('')
    }
  }, [open])

  function run(action: () => void) {
    setOpen(false)
    // Let the dialog finish closing before navigating or opening another one.
    requestAnimationFrame(action)
  }

  const searching = input.trim().length >= 2

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        size="lg"
        showClose={false}
        className="max-h-[80vh] p-0 sm:top-[12%] sm:translate-y-0"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Search and commands</DialogTitle>

        <Command shouldFilter={!searching} loop className="flex min-h-0 flex-col">
          <div className="flex items-center gap-2 border-b border-border px-3.5 py-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Command.Input
              value={input}
              onValueChange={(value) => {
                setInput(value)
                pushTerm(value)
              }}
              placeholder="Search issues, or jump to a project…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {isFetching && searching ? (
              <span className="text-2xs text-muted-foreground">searching…</span>
            ) : (
              <Kbd>esc</Kbd>
            )}
          </div>

          <Command.List className="min-h-0 max-h-[60vh] overflow-y-auto overscroll-contain p-1.5">
            <Command.Empty className="px-3 py-8 text-center text-xs text-muted-foreground">
              {searching
                ? `Nothing matches “${input}”.`
                : 'Type at least two characters to search.'}
            </Command.Empty>

            {searching && results?.length ? (
              <>
                <Group heading="Issues">
                  {results
                    .filter((result) => result.kind === 'issue')
                    .map((result) => (
                      <Item
                        key={`issue-${result.id}`}
                        value={`issue-${result.id}-${result.title}`}
                        onSelect={() => run(() => openIssueDialog(result.id))}
                      >
                        <span className="font-mono text-2xs text-muted-foreground">
                          {result.project_key}-{result.issue_number}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{result.title}</span>
                      </Item>
                    ))}
                </Group>

                <Group heading="Comments">
                  {results
                    .filter((result) => result.kind === 'comment')
                    .map((result) => (
                      <Item
                        key={`comment-${result.id}`}
                        value={`comment-${result.id}`}
                        icon={MessageSquare}
                        onSelect={() =>
                          run(() =>
                            router.push(
                              `/issues/${result.project_key}-${result.issue_number}`
                            )
                          )
                        }
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {truncate(result.snippet ?? '', 70)}
                        </span>
                        <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                          {result.project_key}-{result.issue_number}
                        </span>
                      </Item>
                    ))}
                </Group>

                <Group heading="Projects">
                  {results
                    .filter((result) => result.kind === 'project')
                    .map((result) => (
                      <Item
                        key={`project-${result.id}`}
                        value={`project-${result.id}`}
                        icon={FolderKanban}
                        onSelect={() =>
                          run(() => router.push(`/projects/${result.project_key}/board`))
                        }
                      >
                        {result.title}
                      </Item>
                    ))}
                </Group>

                <Group heading="">
                  <Item
                    value="see-all-results"
                    icon={ArrowRight}
                    onSelect={() =>
                      run(() => router.push(`/search?q=${encodeURIComponent(input)}`))
                    }
                  >
                    See all results for “{truncate(input, 40)}”
                  </Item>
                </Group>
              </>
            ) : null}

            {!searching ? (
              <>
                <Group heading="Create">
                  {can.writeIssues(caps) ? (
                    <Item
                      value="create issue new"
                      icon={Plus}
                      shortcut="c"
                      onSelect={() => run(() => openCreateIssue())}
                    >
                      Create issue
                    </Item>
                  ) : null}
                  {can.createProject(caps) ? (
                    <Item
                      value="create project new"
                      icon={FolderKanban}
                      onSelect={() => run(() => setCreateProjectOpen(true))}
                    >
                      Create project
                    </Item>
                  ) : null}
                </Group>

                <Group heading="Go to">
                  <Item value="home dashboard" icon={Home} shortcut="g d" onSelect={() => run(() => router.push('/dashboard'))}>
                    Dashboard
                  </Item>
                  <Item value="my work assigned" icon={Inbox} shortcut="g m" onSelect={() => run(() => router.push('/my-work'))}>
                    My work
                  </Item>
                  <Item value="notifications" icon={Bell} shortcut="g n" onSelect={() => run(() => router.push('/notifications'))}>
                    Notifications
                  </Item>
                  <Item value="projects list" icon={FolderKanban} shortcut="g p" onSelect={() => run(() => router.push('/projects'))}>
                    All projects
                  </Item>
                  <Item value="search issues advanced" icon={Search} onSelect={() => run(() => router.push('/search'))}>
                    Advanced search
                  </Item>
                  <Item value="team members positions invites directory" icon={Users} shortcut="g t" onSelect={() => run(() => router.push('/team'))}>
                    Team &amp; positions
                  </Item>
                  {can.viewReports(caps) ? (
                    <Item value="reports insights charts" icon={BarChart3} shortcut="g r" onSelect={() => run(() => router.push('/reports'))}>
                      Reports
                    </Item>
                  ) : null}
                  <Item value="sprints active planned" icon={CalendarRange} onSelect={() => run(() => router.push('/sprints'))}>
                    Sprints
                  </Item>
                  <Item value="settings profile account" icon={Settings} onSelect={() => run(() => router.push('/settings/profile'))}>
                    Your profile
                  </Item>
                </Group>

                {projects?.length ? (
                  <Group heading="Projects">
                    {projects.map((project) => (
                      <React.Fragment key={project.id}>
                        <Item
                          value={`${project.name} ${project.key} board`}
                          onSelect={() =>
                            run(() => router.push(`/projects/${project.key}/board`))
                          }
                        >
                          <ProjectIcon icon={project.icon} color={project.color} size="sm" />
                          <span className="min-w-0 flex-1 truncate">{project.name}</span>
                          <span className="shrink-0 text-2xs text-muted-foreground">Board</span>
                        </Item>
                        <Item
                          value={`${project.name} ${project.key} backlog`}
                          icon={ListOrdered}
                          onSelect={() =>
                            run(() => router.push(`/projects/${project.key}/backlog`))
                          }
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {project.name} backlog
                          </span>
                        </Item>
                        <Item
                          value={`${project.name} ${project.key} reports`}
                          icon={TrendingUp}
                          onSelect={() =>
                            run(() => router.push(`/projects/${project.key}/reports`))
                          }
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {project.name} reports
                          </span>
                        </Item>
                        <Item
                          value={`${project.name} ${project.key} overview`}
                          icon={LayoutDashboard}
                          onSelect={() => run(() => router.push(`/projects/${project.key}`))}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {project.name} overview
                          </span>
                        </Item>
                      </React.Fragment>
                    ))}
                  </Group>
                ) : null}
              </>
            ) : null}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  const hasChildren = React.Children.toArray(children).some(Boolean)
  if (!hasChildren) return null

  return (
    <Command.Group
      heading={heading || undefined}
      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
    >
      {children}
    </Command.Group>
  )
}

function Item({
  value,
  onSelect,
  icon: Icon,
  shortcut,
  children,
}: {
  value: string
  onSelect: () => void
  icon?: LucideIcon
  shortcut?: string
  children: React.ReactNode
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm outline-none',
        'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground'
      )}
    >
      {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
      {children}
      {shortcut ? (
        <span className="ml-auto flex shrink-0 gap-1">
          {shortcut.split(' ').map((token) => (
            <Kbd key={token}>{token}</Kbd>
          ))}
        </span>
      ) : null}
    </Command.Item>
  )
}
