/**
 * Seed one realistic tenant for local testing.
 *
 *   npm run seed:demo
 *
 * Produces exactly what the permission model needs exercising against:
 *
 *   Acme Corp (workspace, 25 seats, 10 projects)
 *     owner@acme.test     Owner            — sees everything
 *     manager@acme.test   Manager          — only the ENG project
 *     dev@acme.test       Member           — only the ENG project
 *     qa@acme.test        Member           — only the ENG project
 *     hr@acme.test        HR               — people, no project access at all
 *
 *   ENG  Engineering  — a board, a backlog, one active sprint, ~14 issues
 *   MKT  Marketing    — deliberately has ONLY the owner as a member, so you
 *                       can verify the manager genuinely cannot reach it
 *
 * Every account uses the password below. Idempotent: re-running updates the
 * existing rows rather than duplicating them.
 *
 * Local and staging only — it creates accounts with known passwords.
 */

import { findAuthUser, log, requireEnv, serviceClient } from './env.ts'

const PASSWORD = 'Demo@12345678'

const PEOPLE = [
  { key: 'owner', email: 'owner@acme.test', name: 'Priya Raman', position: null },
  { key: 'manager', email: 'manager@acme.test', name: 'Daniel Osei', position: 'manager' },
  { key: 'dev', email: 'dev@acme.test', name: 'Mira Kovač', position: 'member' },
  { key: 'qa', email: 'qa@acme.test', name: 'Tomás Alvarez', position: 'member' },
  { key: 'hr', email: 'hr@acme.test', name: 'Yuki Tanaka', position: 'hr' },
] as const

type PersonKey = (typeof PEOPLE)[number]['key']

async function main() {
  requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  const supabase = serviceClient()

  console.log('\nMIRA — seeding the demo tenant')

  /* 1. People ------------------------------------------------------------ */
  log.step('Creating accounts')

  const ids = {} as Record<PersonKey, string>

  for (const person of PEOPLE) {
    const existing = await findAuthUser(supabase, person.email)

    if (existing) {
      ids[person.key] = existing.id
      log.skip(`${person.email} already exists`)
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: person.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: person.name },
      })
      if (error || !data.user) {
        log.fail(`${person.email}: ${error?.message ?? 'no user returned'}`)
        process.exit(1)
      }
      ids[person.key] = data.user.id
      log.ok(`${person.email}`)
    }

    await supabase
      .from('profiles')
      .upsert(
        { id: ids[person.key], email: person.email, full_name: person.name, is_active: true },
        { onConflict: 'id' }
      )
  }

  /* 2. Workspace --------------------------------------------------------- */
  log.step('Provisioning the workspace')

  const { data: existingWorkspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('slug', 'acme-demo')
    .maybeSingle()

  let workspaceId: string

  if (existingWorkspace) {
    workspaceId = existingWorkspace.id
    log.skip('Acme Corp already exists')
  } else {
    const { data, error } = await supabase
      .from('workspaces')
      .insert({
        name: 'Acme Corp',
        slug: 'acme-demo',
        company_name: 'Acme Corporation Ltd',
        description: 'Demo tenant for local development.',
        plan: 'growth',
        seat_limit: 25,
        project_limit: 10,
        status: 'active',
        expires_at: new Date(Date.now() + 365 * 86_400_000).toISOString(),
      })
      .select('id')
      .single()

    if (error || !data) {
      log.fail(`Could not create the workspace: ${error?.message}`)
      process.exit(1)
    }
    workspaceId = data.id
    log.ok('Acme Corp created (the trigger seeded its default positions)')
  }

  /* 3. Ownership and membership ------------------------------------------ */
  log.step('Assigning the owner and the team')

  await supabase
    .from('workspace_owners')
    .upsert(
      { workspace_id: workspaceId, user_id: ids.owner, is_primary: true },
      { onConflict: 'workspace_id,user_id' }
    )
  await supabase.from('workspaces').update({ owner_id: ids.owner }).eq('id', workspaceId)
  log.ok(`Owner: ${PEOPLE[0].email}`)

  const { data: positions } = await supabase
    .from('positions')
    .select('id, slug')
    .eq('workspace_id', workspaceId)

  const positionId = (slug: string) =>
    positions?.find((position) => position.slug === slug)?.id ?? null

  for (const person of PEOPLE) {
    const slug = person.position ?? 'admin'
    await supabase.from('workspace_members').upsert(
      {
        workspace_id: workspaceId,
        user_id: ids[person.key],
        position_id: positionId(slug),
        status: 'active',
      },
      { onConflict: 'workspace_id,user_id' }
    )
    log.ok(`${person.name} — ${slug}`)
  }

  // A reporting line, so the org chart has something to draw.
  await supabase
    .from('workspace_members')
    .update({ reports_to_user_id: ids.manager })
    .in('user_id', [ids.dev, ids.qa])
    .eq('workspace_id', workspaceId)

  /* 4. Projects ---------------------------------------------------------- */
  log.step('Creating projects')

  const engId = await ensureProject(supabase, {
    workspaceId,
    name: 'Engineering',
    key: 'ENG',
    description: 'Platform work: API, web app, infrastructure.',
    leadId: ids.manager,
    color: '#5B5BD6',
  })

  const mktId = await ensureProject(supabase, {
    workspaceId,
    name: 'Marketing',
    key: 'MKT',
    description: 'Campaigns and the website. Owner-only, on purpose.',
    leadId: ids.owner,
    color: '#DB2777',
  })

  // ENG: the manager runs it, the two engineers work in it.
  // MKT: nobody but the owner — this is what makes the isolation visible.
  await supabase.from('project_members').upsert(
    [
      { project_id: engId, user_id: ids.manager, project_role: 'manager' as const },
      { project_id: engId, user_id: ids.dev, project_role: 'member' as const },
      { project_id: engId, user_id: ids.qa, project_role: 'member' as const },
      { project_id: mktId, user_id: ids.owner, project_role: 'lead' as const },
    ],
    { onConflict: 'project_id,user_id' }
  )
  log.ok('ENG — manager, dev, qa')
  log.ok('MKT — owner only (the manager must not be able to see this one)')

  /* 5. Sprint and issues -------------------------------------------------- */
  log.step('Filling the Engineering backlog')

  const { data: statuses } = await supabase
    .from('project_statuses')
    .select('id, name, category')
    .eq('project_id', engId)
    .order('position')

  if (!statuses?.length) {
    log.warn('No statuses on ENG — skipping issues')
  } else {
    const statusId = (name: string) =>
      statuses.find((status) => status.name === name)?.id ?? statuses[0].id

    const { data: existingSprint } = await supabase
      .from('sprints')
      .select('id')
      .eq('project_id', engId)
      .eq('name', 'Sprint 12')
      .maybeSingle()

    let sprintId = existingSprint?.id
    if (!sprintId) {
      const { data } = await supabase
        .from('sprints')
        .insert({
          project_id: engId,
          name: 'Sprint 12',
          goal: 'Ship the new board filters and cut p95 latency below 400ms.',
          status: 'active',
          start_date: new Date(Date.now() - 5 * 86_400_000).toISOString(),
          end_date: new Date(Date.now() + 9 * 86_400_000).toISOString(),
        })
        .select('id')
        .single()
      sprintId = data?.id
      log.ok('Sprint 12 is running')
    } else {
      log.skip('Sprint 12 already exists')
    }

    const { count } = await supabase
      .from('issues')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', engId)

    if (count && count > 0) {
      log.skip(`ENG already has ${count} issues`)
    } else {
      const backlog = [
        ['Board filters persist across reloads', 'story', 'high', 'In Progress', 5, ids.dev],
        ['Drag-and-drop drops the card on touch', 'bug', 'highest', 'In Progress', 3, ids.dev],
        ['Sprint burndown ignores weekends', 'bug', 'medium', 'To Do', 2, ids.qa],
        ['Add WIP limits to board columns', 'story', 'medium', 'To Do', 8, null],
        ['p95 issue query above 400ms', 'task', 'high', 'In Review', 5, ids.dev],
        ['Keyboard shortcut help dialog', 'task', 'low', 'Done', 1, ids.qa],
        ['Empty states for the backlog', 'task', 'low', 'Done', 2, ids.dev],
        ['Bulk edit from the backlog', 'story', 'medium', 'To Do', 5, null],
        ['Attachment upload fails over 10MB', 'bug', 'high', 'To Do', 3, ids.qa],
        ['Saved filters shareable by URL', 'story', 'medium', 'In Review', 5, ids.dev],
        ['Realtime board updates drop on reconnect', 'bug', 'highest', 'To Do', 8, null],
        ['Velocity chart for the last 6 sprints', 'story', 'low', 'To Do', 3, null],
        ['Audit trail on issue transitions', 'task', 'medium', 'Done', 3, ids.dev],
        ['Mobile: columns should snap when swiping', 'story', 'high', 'In Progress', 5, ids.qa],
      ] as const

      const rows = backlog.map(([title, type, priority, status, points, assignee], index) => ({
        project_id: engId,
        title,
        type,
        priority,
        status_id: statusId(status),
        story_points: points,
        assignee_id: assignee,
        reporter_id: ids.manager,
        // The first eight are in the running sprint; the rest are backlog.
        sprint_id: index < 8 ? sprintId : null,
        backlog_position: index * 1024,
        board_position: index * 1024,
      }))

      const { error } = await supabase.from('issues').insert(rows)
      if (error) log.warn(`Issue seeding reported: ${error.message}`)
      else log.ok(`${rows.length} issues created`)
    }
  }

  /* Done ------------------------------------------------------------------ */
  console.log('\n' + '─'.repeat(64))
  console.log('  Demo tenant ready. Every account uses the same password.\n')
  for (const person of PEOPLE) {
    const label = person.position ?? 'owner'
    console.log(`    ${person.email.padEnd(22)} ${label.padEnd(9)} ${PASSWORD}`)
  }
  console.log('\n  Worth checking, in this order:')
  console.log('    1. Sign in as manager@acme.test — only ENG is listed.')
  console.log('    2. Open /projects/MKT/board directly — it is not found.')
  console.log('    3. Sign in as hr@acme.test — no projects at all, but Team works.')
  console.log('    4. Sign in as dev@acme.test — no project settings, no sprints.')
  console.log('─'.repeat(64) + '\n')
}

async function ensureProject(
  supabase: ReturnType<typeof serviceClient>,
  input: {
    workspaceId: string
    name: string
    key: string
    description: string
    leadId: string
    color: string
  }
): Promise<string> {
  const { data: existing } = await supabase
    .from('projects')
    .select('id')
    .eq('workspace_id', input.workspaceId)
    .eq('key', input.key)
    .maybeSingle()

  if (existing) {
    log.skip(`${input.key} already exists`)
    return existing.id
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      workspace_id: input.workspaceId,
      name: input.name,
      key: input.key,
      description: input.description,
      lead_id: input.leadId,
      created_by: input.leadId,
      color: input.color,
    })
    .select('id')
    .single()

  if (error || !data) {
    log.fail(`Could not create ${input.key}: ${error?.message}`)
    process.exit(1)
  }

  // The `projects_bootstrap` trigger created the workflow row; the default
  // statuses come from create_project(), which we bypassed, so add them here.
  await supabase.from('project_statuses').insert([
    { project_id: data.id, name: 'To Do', category: 'todo' as const, color: '#64748B', position: 0 },
    { project_id: data.id, name: 'In Progress', category: 'in_progress' as const, color: '#2563EB', position: 1 },
    { project_id: data.id, name: 'In Review', category: 'in_progress' as const, color: '#A855F7', position: 2 },
    { project_id: data.id, name: 'Done', category: 'done' as const, color: '#059669', position: 3 },
  ])

  log.ok(`${input.key} — ${input.name}`)
  return data.id
}

main().catch((error) => {
  log.fail(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
