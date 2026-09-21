# MIRA

A multi-tenant project management SaaS — a modern JIRA alternative — built on
Next.js (App Router) and Supabase.

MIRA is sold to companies. Three distinct tiers of people use it, and keeping
them apart is the single most important thing this codebase does:

| Tier | Who they are | Where they sign in | Scope |
| --- | --- | --- | --- |
| **System Administrator** | The product owner — the company that builds and sells MIRA | `<base>/miraadmin/login` | Platform-wide. Sees every tenant. |
| **Owner** | The customer who purchased MIRA for their company | `<base>/login` | One workspace (their company) only. |
| **User** | Employees of the Owner's company (Manager, HR, Developer, QA…) | `<base>/login` | Only the projects and capabilities the Owner grants them. |

A System Administrator creates a workspace for each client and creates an Owner
account assigned to that workspace. The Owner then runs their own company
inside that workspace: creating projects, defining positions, inviting users
and assigning work.

> **`<base>` is whatever you deploy to.** There is no hardcoded domain anywhere
> in MIRA. Set `NEXT_PUBLIC_APP_URL` and every generated link — invitations,
> auth redirects, the URLs the seed script prints — follows it. Locally that is
> `http://localhost:3000`, so the two portals are
> `http://localhost:3000/login` and `http://localhost:3000/miraadmin/login`.

---

## Contents

- [How the tiers are enforced](#how-the-tiers-are-enforced)
- [Prerequisites](#prerequisites)
- [Setup, step by step](#setup-step-by-step)
  - [1. Clone and install](#1-clone-and-install)
  - [2. Create a Supabase project](#2-create-a-supabase-project)
  - [3. Configure `.env.local`](#3-configure-envlocal)
  - [4. Run the migrations](#4-run-the-migrations)
  - [5. Seed the System Administrator](#5-seed-the-system-administrator)
  - [6. Configure Supabase Auth](#6-configure-supabase-auth)
  - [7. Run it](#7-run-it)
- [Onboarding a new client, end to end](#onboarding-a-new-client-end-to-end)
- [Roles, positions and capabilities](#roles-positions-and-capabilities)
- [Routes](#routes)
- [Feature list](#feature-list)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Data model](#data-model)
- [Verifying tenant isolation yourself](#verifying-tenant-isolation-yourself)
- [Building for production](#building-for-production)
- [Deployment](#deployment)
- [Design system](#design-system)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Scripts](#scripts)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## How the tiers are enforced

Three independent checks, in this order. A bug in any one of them does not open
the door.

**1. Next.js middleware** (`middleware.ts` → `lib/supabase/middleware.ts`)
routes the request. A tenant user who reaches `/miraadmin/*` is sent to the
admin login with an explicit reason, never silently redirected. A System
Administrator who reaches the tenant app is sent back to their own portal.

**2. The shell layouts** re-check on the server.
`app/(admin)/miraadmin/(shell)/layout.tsx` calls `requirePlatformAdmin()`;
`app/(dashboard)/layout.tsx` calls `getTenantContext()`. A stale client bundle
cannot render either shell on its own.

**3. Postgres Row-Level Security** decides every single row. RLS is enabled on
every table in `public`; no table is publicly readable. The policies are in
`supabase/migrations/20250201000300_platform_rls.sql` and resolve through four
SECURITY DEFINER helpers:

| Function | Answers |
| --- | --- |
| `is_platform_admin(uid)` | Is this a System Administrator? Grants cross-tenant **read**. |
| `current_workspace_ids(uid)` | Which tenants may this person enter? Excludes suspended and deleted ones. |
| `has_capability(uid, workspace_id, capability)` | Does their position grant this? Owners are always true. |
| `can_read_project(project_id)` | Project-level scoping — a `project_members` row, or the `project.view_all` capability. |

Four consequences worth stating plainly, because they are the point of the
whole design:

- **A user in Workspace A reads zero rows from Workspace B.** Not fewer rows —
  zero. Asserted in `supabase/tests/tenant-isolation.sql`.
- **A Manager is confined to the projects they are assigned to**, even inside
  their own workspace. Workspace membership alone grants nothing at project
  level.
- **A System Administrator can read across tenants but cannot write into one.**
  They hold no capability in any workspace, so `has_capability()` returns false
  and every RLS write check fails — including during a support session, which
  is therefore read-only by construction rather than by UI choice.
- **An Owner cannot raise their own plan limits.** The `authenticated` role has
  no `UPDATE` privilege on the `plan`, `seat_limit`, `project_limit`, `status`,
  `starts_at` or `expires_at` columns of `workspaces`. This is a column-level
  grant, not a disabled input — the admin RPCs are SECURITY DEFINER and are the
  only route to those columns.

---

## Prerequisites

- **Node.js 20 or newer.** The seed scripts are TypeScript run through Node's
  native type stripping. On Node 22.6–23.5 that needs the
  `--experimental-strip-types` flag, which the npm scripts already pass; Node
  23.6+ and Node 24 need nothing. On Node 20 the flag is unavailable — see
  [Troubleshooting](#the-seed-script-wont-run-on-node-20).
- **npm** (or pnpm/yarn — the lockfile here is npm's).
- **A Supabase account.** The free tier is enough.
- Optionally the [Supabase CLI](https://supabase.com/docs/guides/cli), which
  makes applying migrations one command instead of copy-paste.

---

## Setup, step by step

### 1. Clone and install

```bash
git clone <your-repo-url> mira && cd mira && npm install
```

### 2. Create a Supabase project

Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New
project**. Pick a region near your users and save the database password
somewhere safe.

Then open **Project Settings → API** and copy three values:

| Dashboard label | Goes into |
| --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` / `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` / `secret` key | `SUPABASE_SERVICE_ROLE_KEY` |

The `service_role` key bypasses Row-Level Security entirely. It must never be
prefixed with `NEXT_PUBLIC_`, never imported into a Client Component and never
committed. MIRA uses it in exactly three places: the seed scripts, minting
credentials for a new Owner (`app/api/admin/owners/route.ts`) and triggering a
password reset (`app/api/admin/password-reset/route.ts`).

### 3. Configure `.env.local`

```bash
cp .env.example .env.local          # macOS / Linux
Copy-Item .env.example .env.local   # Windows PowerShell
```

```bash
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhb...
SUPABASE_SERVICE_ROLE_KEY=eyJhb...

# The base URL of THIS deployment. Every generated link is built from it.
NEXT_PUBLIC_APP_URL=http://localhost:3000

SEED_ADMIN_EMAIL=madbrostech27@gmail.com
SEED_ADMIN_PASSWORD=Admin@1234567

# false = /signup only accepts an invitation token. Recommended.
ALLOW_PUBLIC_SIGNUP=false
```

### 4. Run the migrations

**With the Supabase CLI** (recommended):

```bash
supabase link --project-ref <your-project-ref>
npm run db:push
```

**Or by hand** — paste `supabase/schema.sql` into the dashboard's SQL editor.
It is every migration concatenated in order, regenerated with
`npm run db:schema`. If you would rather run them individually, they live in
`supabase/migrations/` and the order matters:

| File | What it does |
| --- | --- |
| `20250101000000_init.sql` | Tables, enums, indexes |
| `20250101000100_functions.sql` | Triggers, issue numbering, activity log, notifications |
| `20250101000200_rls.sql` | First-pass RLS |
| `20250101000300_storage_realtime.sql` | Storage buckets and the Realtime publication |
| `20250101000400_seed_demo.sql` | Legacy demo helpers (superseded below) |
| `20250201000000_platform.sql` | **Platform tier**: `platform_admins`, `workspace_owners`, positions, capabilities, `project_members`, workspace lifecycle |
| `20250201000100_platform_functions.sql` | **Permission resolution** and the default-position seeding |
| `20250201000200_platform_rpc.sql` | **Admin RPCs**, all guarded and audited |
| `20250201000300_platform_rls.sql` | **Final RLS** — capability and project scoped |

Applying them is idempotent: every statement is `create or replace`,
`if not exists` or a guarded `do $$ … $$`. Re-running is safe.

### 5. Seed the System Administrator

```bash
npm run seed:admin
```

This creates **exactly one** System Administrator from `SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD`. It is idempotent — if the account already exists it
reports that and changes nothing, including the password. That matters: a
redeploy must never silently restore a published default.

Default credentials:

```
email:    madbrostech27@gmail.com
password: Admin@1234567
```

> ### ⚠️ Change this password before the app is reachable from the internet.
>
> The default is written in `.env.example` and in this README, which means it
> is public. Treat it as known to the world.
>
> MIRA does force the issue: the seeded account carries a
> `must_change_password` flag, and every page under `/miraadmin` redirects to
> the change-password screen until it is cleared. **Do not rely on that
> alone** — set a real `SEED_ADMIN_PASSWORD` before you deploy anywhere
> public, and change it again at first sign-in.

### 6. Configure Supabase Auth

**Authentication → URL Configuration**

- **Site URL**: the same value as `NEXT_PUBLIC_APP_URL`.
- **Redirect URLs**: add every origin you will use —
  `http://localhost:3000/**` and `https://your-domain.example/**`. Without
  these, invitation and password-reset links bounce.

**Authentication → Providers → Email**

- Turn **Confirm email** on for production.
- For local development, turning it off saves a round trip through your inbox.

Email delivery is optional. If SMTP is not configured, MIRA falls back
gracefully everywhere: the admin UI shows the invitation link and the password
reset link so you can pass them on yourself.

### 7. Run it

```bash
npm run dev
```

Two URLs, two different worlds:

| URL | Who |
| --- | --- |
| <http://localhost:3000/miraadmin/login> | System Administrator |
| <http://localhost:3000/login> | Owners and their teams |

Optionally, seed a realistic tenant to click around in:

```bash
npm run seed:demo
```

That creates **Acme Corp** with an Owner, a Manager, two engineers and an HR
account (all with the password `Demo@12345678`), two projects and a running
sprint. The Marketing project deliberately has only the Owner as a member, so
you can see for yourself that the Manager cannot reach it.

---

## Onboarding a new client, end to end

The whole flow, in the order you would actually do it:

1. **Admin signs in** at `<base>/miraadmin/login`.
2. **Creates the workspace** — *Workspaces → New workspace*. Name, slug, plan,
   seat limit, project limit, start date and renewal date. The plan presets
   pre-fill the limits; every field stays editable, because a negotiated
   contract rarely matches the list price.
3. **Creates the Owner and assigns it** — open the new workspace →
   *Assign an Owner*. Either email them an invitation link (they choose their
   own password) or set a temporary password to read out on a call. The
   workspace detail page warns loudly until this is done, because a workspace
   with no Owner cannot be used.
4. **Owner signs in** at `<base>/login` and lands in their workspace.
5. **Owner defines positions** — *Team → Positions*. Six are seeded
   automatically (Workspace Admin, Manager, HR, Team Lead, Member, Viewer).
   The Owner can rename them, re-tick their capabilities, or add their own
   (Scrum Master, Product Analyst, whatever they actually call people).
6. **Owner invites the team** — *Team → Invitations*. Each invitation carries a
   position. Seats are checked against the plan limit, including invitations
   that have not been accepted yet.
7. **Owner creates a project** — *Projects → New project*, then
   *Project settings → People* to add who should be able to see it.

Step 7 is the one people miss. **Project membership is access control, not a
convenience list.** A Manager or Member who is not in `project_members` cannot
see the project at all. Owners and Workspace Admins are the exception: their
position carries `project.view_all`.

---

## Roles, positions and capabilities

Outside any workspace there is one platform role: `system_admin`.

Inside a workspace there is the **Owner** (one per workspace, co-owners
allowed) plus whatever **positions** the Owner defines. Positions are not a
hardcoded enum — each one holds a checklist of capabilities, and that checklist
is what Postgres consults.

### The capability list

| Group | Capabilities |
| --- | --- |
| Projects | `project.create` `project.edit` `project.delete` `project.archive` `project.view_all` |
| Issues | `issue.create` `issue.edit_any` `issue.edit_own` `issue.delete` `issue.assign` `issue.transition` |
| Sprints | `sprint.create` `sprint.start` `sprint.complete` |
| People | `member.invite` `member.remove` `member.assign_position` `position.manage` |
| Insights | `report.view` `report.export` |
| Workspace | `workspace.settings` `billing.view` |

### Default grants

| | Owner | Workspace Admin | Manager | HR | Member | Viewer |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| Workspace settings | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Create / delete projects | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage assigned projects | ✅ | ✅ | ✅ *(assigned only)* | ❌ | ❌ | ❌ |
| Invite / remove members | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Manage positions | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Create / edit issues | ✅ | ✅ | ✅ | ❌ | ✅ *(own + assigned)* | ❌ |
| Run sprints | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| View reports | ✅ | ✅ | ✅ *(own projects)* | ✅ *(people only)* | ✅ *(own)* | ✅ |

The parenthesised scoping is not a separate mechanism — it falls out of
`can_read_project()`. A Manager holds `project.edit`, but only over projects
they are a member of, so "manage assigned projects" needs no special case. HR
holds no project capability at all, so their reports are inherently
people-only. `position.manage` is withheld from HR by default; an Owner can
tick it on if they want HR to own the capability checklists too.

Defaults live in two places that must agree: `seed_default_positions()` in
`supabase/migrations/20250201000100_platform_functions.sql`, and
`DEFAULT_POSITION_CAPABILITIES` in `lib/permissions/capabilities.ts`. The
database is authoritative; the TypeScript copy exists so the UI can render a
checklist before the query resolves, and so the "reset to defaults" button has
something to reset to.

### The UI mirrors, it does not decide

`lib/permissions/index.ts` exports a `can` object (`can.createProject(caps)`,
`can.manageSprints(caps)`, …) used throughout the tenant app to hide actions a
viewer cannot perform. It is deliberately **not** the security boundary. Every
one of those actions is refused again by RLS if it is ever attempted.

---

## Routes

### Admin portal — System Administrator only

| Route | Purpose |
| --- | --- |
| `/miraadmin/login` | "System Administrator Login" — visually distinct from the tenant login |
| `/miraadmin/dashboard` | Platform overview: tenants, owners, users, signups, storage, tenants near their limits |
| `/miraadmin/workspaces` | List, search and filter every tenant; create new ones |
| `/miraadmin/workspaces/:id` | Owners, people, projects, usage, activity and the lifecycle controls |
| `/miraadmin/owners` | Create and manage Owner accounts, assign workspaces, trigger password resets |
| `/miraadmin/users` | Every user across every tenant; global suspend |
| `/miraadmin/audit` | Platform-wide, append-only audit log with CSV export |
| `/miraadmin/settings` | Plans, deployment configuration, security posture |
| `/miraadmin/settings/password` | Forced on first sign-in |

### Tenant portal — Owners and Users

| Route | Purpose |
| --- | --- |
| `/login`, `/signup`, `/forgot-password`, `/reset-password` | Authentication |
| `/invite/:token` | Accept an invitation |
| `/dashboard` | Your work at a glance (`/` redirects here) |
| `/projects`, `/projects/:key` | Project list and overview |
| `/board/:projectKey`, `/backlog/:projectKey` | Short forms → `/projects/:key/board` and `/projects/:key/backlog` |
| `/sprints` | Every sprint across the projects you can reach |
| `/reports` | Workspace-wide reporting, with per-project filter and CSV export |
| `/issues/:issueKey` | A single issue, addressable and shareable |
| `/team` | Directory, positions and capability editor, invitations, org chart |
| `/settings` | Workspace settings, your profile |

**A note on `/board/:projectKey`.** The brief lists this as a top-level route.
The board is implemented at `/projects/:key/board`, inside a layout that
supplies the project context and the tab bar shared by the board, backlog,
reports and settings. Rather than duplicate that layout, `/board/:projectKey`
and `/backlog/:projectKey` resolve to the canonical URLs. Both addresses work;
the address bar settles on the project-scoped one.

---

## Feature list

### Platform administration
- Dashboard: tenant counts by status, owners, users, projects, issues, active
  sprints, attachment storage, 30-day signup trend, tenants nearing a plan
  limit, tenants renewing soon, recent activity
- Workspace lifecycle: create, edit, **suspend** (locked out), **archive**
  (read-only), **soft delete** (30-day retention, restorable), **hard delete**
  (type the name to confirm — checked again in Postgres)
- Owner management: create with an invitation link or a temporary password,
  assign to one or more workspaces, transfer ownership, deactivate, reset
  password
- Cross-tenant user list with search and a global suspend switch
- **Impersonation** — "View as Owner": a time-boxed, read-only, fully audited
  session into a client workspace, with a countdown banner across the top of
  the tenant app
- Immutable audit log: actor, action, target, metadata, IP, user agent. No
  client role holds `INSERT`, `UPDATE` or `DELETE` on it; rows arrive only
  through `log_platform_action()`

### Workspace administration (the Owner)
- Company profile: name, legal name, description, timezone, working days,
  issue key prefix
- Position editor with the full capability checklist and per-position member
  counts
- Invitations with seat-limit enforcement, revoke and copyable links
- Team directory: position, reporting line, seat status
- Org chart built from the reporting lines (cycle-safe)
- Read-only plan panel: seats and projects used against the limit, renewal date

### Project and issue tracking
- Projects with a unique key per workspace (`ENG`, `MKT`) producing issue IDs
  like `ENG-142`; lead, members, icon, colour, dates, archive
- Project membership with four project roles: lead, manager, member, viewer
- Issues: Epic / Story / Task / Bug / Sub-task, rich-text description, status,
  priority, assignee, reporter, labels, due date, story points, sprint, epic
  link, parent, watchers
- Full CRUD, bulk edit, clone, comments with `@mentions` and edit history,
  attachments in Supabase Storage, per-issue activity trail
- Kanban board with drag-and-drop, configurable columns, allowed transitions,
  WIP limits and quick filters
- Ranked backlog with drag-to-reorder, sprint planning with capacity vs.
  committed points, sprint lifecycle, retrospective notes
- Burndown and velocity charts computed from the activity log — no snapshot
  tables to drift
- Global search across issues, projects, comments and people; a filter builder;
  saved filters shareable by URL
- Notification centre with Supabase Realtime, so boards update live for
  everyone
- CSV export for issues and for the platform audit log

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router, React 19, TypeScript, strict) |
| Styling | Tailwind CSS with a token-based design system |
| Components | Radix UI primitives, composed locally in `components/ui` |
| Server state | TanStack Query v5 |
| Client state | Zustand for UI, React Context for session and workspace |
| Backend | Supabase — Postgres, Auth, Storage, Realtime, RLS |
| Drag & drop | dnd-kit (pointer, keyboard and touch sensors) |
| Charts | Recharts |
| Deploy | Vercel + Supabase Cloud |

---

## Project structure

```
mira/
├── app/
│   ├── (admin)/                      # <base>/miraadmin — System Administrator
│   │   ├── layout.tsx                #   stamps data-portal="admin" (copper theme)
│   │   └── miraadmin/
│   │       ├── login/                #   "System Administrator Login"
│   │       └── (shell)/              #   requirePlatformAdmin() gate
│   │           ├── dashboard/ workspaces/ owners/ users/ audit/ settings/
│   ├── (auth)/                       # login, signup, forgot/reset password
│   ├── (dashboard)/                  # <base>/… — Owners and Users
│   │   ├── dashboard/ projects/ board/ backlog/ sprints/ reports/
│   │   ├── issues/ search/ my-work/ notifications/ team/ settings/
│   ├── api/
│   │   ├── admin/                    # owners, password-reset, impersonate
│   │   └── invites/
│   ├── auth/                         # callback, signout
│   └── invite/[token]/
├── components/
│   ├── admin/                        # admin shell, workspace + owner management
│   ├── team/                         # directory, position editor, org chart
│   ├── board/ backlog/ issues/ sprints/ reports/ filters/ search/ notifications/
│   ├── layout/ projects/ providers/
│   └── ui/                           # the design system
├── lib/
│   ├── auth/                         # constants, server session, API guards
│   ├── permissions/                  # the capability model
│   ├── queries/                      # TanStack Query hooks, one file per domain
│   ├── supabase/                     # browser / server / service-role clients
│   ├── store/ types/ utils
├── supabase/
│   ├── migrations/                   # nine files, applied in order
│   └── tests/tenant-isolation.sql    # the assertions that prove the boundaries
├── scripts/
│   ├── seed-admin.ts                 # idempotent System Administrator seeding
│   └── seed-demo.ts                  # one demo tenant for local testing
├── middleware.ts
├── .env.example
└── README.md
```

### Three Supabase clients, three jobs

| Client | Runs as | Use for |
| --- | --- | --- |
| `getSupabaseBrowserClient()` | the signed-in user | Client Components. RLS applies. |
| `createSupabaseServerClient()` | the signed-in user | Server Components, Route Handlers, Server Actions. RLS applies. |
| `createSupabaseAdminClient()` | `service_role` | Seeding and minting credentials **only**. RLS bypassed. |

The admin API routes follow one order, every time: authenticate as the caller
with the anon key, confirm they are in `platform_admins`, and only then reach
for the service-role client. `lib/auth/api.ts` makes that the easy path.

---

## Data model

### Platform tier

```
platform_admins       (id, user_id → auth.users, name, email,
                       must_change_password, is_active, created_at, last_login_at)
platform_audit_log    (id, actor_id, actor_email, action, target_type, target_id,
                       metadata jsonb, ip, user_agent, created_at)
admin_impersonations  (id, admin_id, workspace_id, reason,
                       started_at, expires_at, ended_at)
```

### Tenants

```
workspaces            (id, name, slug, company_name, plan, seat_limit, project_limit,
                       status ['active','suspended','archived','deleted'],
                       starts_at, expires_at, created_by_admin_id,
                       timezone, working_days, issue_key_prefix,
                       created_at, deleted_at)
workspace_owners      (id, workspace_id, user_id, is_primary,
                       assigned_by_admin_id, assigned_at)
```

### People inside a tenant

```
profiles              (id → auth.users, full_name, avatar_url, phone, is_active, …)
capabilities          (key, label, description, group_name, position)
positions             (id, workspace_id, name, slug, description,
                       is_system_default, created_at)
position_permissions  (id, position_id, capability → capabilities, allowed)
workspace_members     (id, workspace_id, user_id, position_id, reports_to_user_id,
                       status ['invited','active','suspended'], joined_at, role*)
workspace_invites     (id, workspace_id, email, position_id, token,
                       invited_by, expires_at, accepted_at, status)
```

### Work

```
projects              (id, workspace_id, name, key, description, lead_id, icon,
                       status, start_date, target_date, created_by, is_archived)
project_members       (id, project_id, user_id,
                       project_role ['lead','manager','member','viewer'], added_at)
workflows             (id, project_id, name)
project_statuses      (id, project_id, workflow_id, name, category, position, wip_limit)
status_transitions    (id, project_id, from_status_id, to_status_id)
issues                (id, project_id, issue_number, type, title, description,
                       status_id, priority, assignee_id, reporter_id, epic_id,
                       parent_id, sprint_id, story_points, due_date,
                       board_position, backlog_position, resolved_at)
labels, issue_labels, sprints, comments, comment_revisions, attachments,
watchers, activity_log, notifications, saved_filters
```

### Where the names differ from the brief

Three deliberate deviations, all documented rather than silently applied:

1. **`workspace_invites` instead of `invitations`.** The table already existed
   with working triggers and policies. Duplicating it would have been worse
   engineering than keeping it, so a `security_invoker` view named
   `invitations` exposes the spec's name over the same rows — base-table RLS
   still applies.
2. **`project_statuses` instead of `workflow_statuses`.** Same reasoning. A
   real `workflows` table now exists (one row per project, created by trigger)
   and `project_statuses.workflow_id` points at it; the view
   `workflow_statuses` presents the spec's shape.
3. **`workspace_members.role` still exists.** It is the legacy four-value enum,
   kept in sync with `position_id` by the `sync_member_position` trigger so
   older queries keep working. **It is not what any policy consults** —
   `has_capability()` reads `position_permissions`.

`board_position` and `backlog_position` are the brief's `rank`, split in two
because a card's place on the board and its place in the backlog are
independent. Both are `double precision`, so reordering writes one row: the new
value is the midpoint of its neighbours.

---

## Verifying tenant isolation yourself

`supabase/tests/tenant-isolation.sql` builds two tenants, five accounts and
three projects, then asserts the boundaries hold. It runs inside a transaction
that is rolled back, so it leaves nothing behind.

```bash
supabase db reset                                     # apply every migration
psql "$DATABASE_URL" -f supabase/tests/tenant-isolation.sql
```

It proves, with an exception on any failure:

1. Owner A reads zero workspaces, projects, issues, members or positions from
   Workspace B
2. A Member cannot reach another project in their own workspace
3. A Manager can administer their assigned project and not the other one
4. An Owner is not a platform admin and cannot read the audit log or call the
   admin RPCs
5. Self-service workspace creation is closed to tenants
6. A System Administrator reads across tenants but cannot insert a tenant issue
7. A suspended workspace vanishes for its own Owner; an archived one is
   readable but frozen
8. An Owner holding `workspace.settings` still cannot change `seat_limit` or
   `status`, but can edit the company profile

Run it after any change to the policies or the helper functions.

---

## Building for production

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run build       # next build
npm start           # serve the build
```

---

## Deployment

### Frontend on Vercel

1. Push to GitHub and import the repository at
   [vercel.com/new](https://vercel.com/new). Next.js is detected
   automatically.
2. Add the environment variables under **Settings → Environment Variables**:

   | Variable | Environments | Notes |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | all | |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | all | |
   | `SUPABASE_SERVICE_ROLE_KEY` | all | **Secret.** Never `NEXT_PUBLIC_`. |
   | `NEXT_PUBLIC_APP_URL` | production | Your real domain. Leave unset on previews and `VERCEL_URL` is used. |
   | `ALLOW_PUBLIC_SIGNUP` | all | `false` unless you want open registration |
   | `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | — | Only needed where you run the seed script |

3. Add your custom domain under **Settings → Domains**.

**How `<base>/miraadmin/login` resolves.** It is an ordinary App Router route
in the `(admin)` route group, so no rewrite, no subdomain and no extra DNS is
involved. Point your domain at the Vercel project and both portals are served
from it: `https://your-domain.example/login` and
`https://your-domain.example/miraadmin/login`. Because the admin portal is a
path rather than a host, `middleware.ts` is what keeps the two apart — which is
why it runs on every document request.

If you would rather the admin portal were not publicly discoverable, put it
behind Vercel's IP allowlist or change `ADMIN_PREFIX` in
`lib/auth/constants.ts` to a path only you know. That is obscurity, not
security; the real protection is the three-layer check.

### Backend on Supabase Cloud

1. Apply the migrations against the production project
   (`supabase link` then `npm run db:push`).
2. Set **Site URL** and **Redirect URLs** to your production domain.
3. Configure SMTP under **Authentication → Email** so invitations and password
   resets actually send. Without it MIRA still works — the UI hands you the
   links to distribute.
4. Run `npm run seed:admin` once, with a real `SEED_ADMIN_PASSWORD`.
5. Sign in at `https://your-domain.example/miraadmin/login` and change the
   password when prompted.
6. Turn on **Point-in-Time Recovery** and set up backups before you have
   customers.

---

## Design system

Tokens live in `styles/globals.css` and are consumed through Tailwind
(`bg-surface`, `text-muted-foreground`, `ring-ring`). Components never hardcode
a hex value.

- **Tenant palette**: iris (`--primary: 245 68% 56%`) on a cool, slightly
  blue-shifted grey ramp.
- **Admin palette**: copper (`--primary: 22 88% 48%`) with near-black chrome,
  applied by `data-portal="admin"` on the admin route group. Component code is
  identical — only the tokens change, which is the point: one glance tells you
  which portal you are in. The admin shell also carries a **SYSTEM ADMIN**
  badge and a different logo lockup.
- Both palettes have a full dark theme, switched by `next-themes` with no
  flash.
- Layered, tinted shadows and a 0.625rem radius scale.

Mobile is not an afterthought:

- Kanban columns scroll horizontally with CSS scroll-snap and swipe between
  columns on a phone
- Navigation collapses to a bottom tab bar plus a drawer
- Modals become full-screen sheets
- Tables reflow into cards — one `columns` definition renders both, so they
  cannot drift apart
- Drag-and-drop works with touch (long-press to lift) and with the keyboard

Every list has an intentional empty state, a skeleton loader and an error state
with a retry.

---

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `c` | Create issue |
| `/` or `⌘K` / `Ctrl K` | Search / command palette |
| `g` `d` | Dashboard |
| `g` `b` | Board (current project, else the first you can reach) |
| `g` `l` | Backlog |
| `g` `p` | Projects |
| `g` `m` | My work |
| `g` `n` | Notifications |
| `g` `t` | Team |
| `g` `r` | Reports |
| `?` | Shortcut help |
| `Space` | Pick up / drop a card while focused |

Nothing fires while focus is in a field or while a dialog is open.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:push` | Apply migrations through the Supabase CLI |
| `npm run db:reset` | Drop and rebuild the local database |
| `npm run db:types` | Regenerate `lib/types/database.ts` from the live schema |
| `npm run db:test` | Reset, then run the tenant-isolation assertions |
| `npm run seed:admin` | Seed the System Administrator (idempotent) |
| `npm run seed:demo` | Seed a demo tenant for local testing |

---

## Troubleshooting

### "row-level security policy" errors

Almost always correct behaviour. Work through it in this order:

1. **Is the person in the workspace?** `workspace_members` with
   `status = 'active'`, or a row in `workspace_owners`.
2. **Does their position grant the capability?** *Team → Positions*, or
   directly: `select public.has_capability('<user-uuid>', '<workspace-uuid>', 'issue.create');`
3. **Are they in the project?** This is the one that catches people. A Manager
   or Member needs a `project_members` row, or `project.view_all`.
4. **Is the workspace writable?** Archived is read-only and suspended is
   invisible. `select public.workspace_is_writable('<workspace-uuid>');`

### The admin portal redirects me to the login screen in a loop

The account has a Supabase session but no row in `platform_admins`. Run
`npm run seed:admin`, or check directly:

```sql
select * from public.platform_admins where lower(email) = lower('you@example.com');
```

### "This account is not a system administrator"

You signed in at `/miraadmin/login` with a tenant account, or at `/login` with
an administrator account. That message is intentional — MIRA ends the session
rather than silently redirecting you to the other portal, so the mistake is
visible. Use the portal that matches the account.

### A newly created Owner cannot see anything

Creating an Owner account and assigning it to a workspace are two separate
steps. Open the workspace in the admin portal — if it warns "This workspace has
no Owner", assignment did not happen. Use *Assign an Owner*.

### A Manager cannot see a project

By design. Add them under *Project settings → People*, or give their position
`project.view_all` if they genuinely should see everything.

### "Seat limit reached"

The tenant is at its plan limit, counting pending invitations. Only a System
Administrator can raise it: *Workspaces → the tenant → Edit plan*. The Owner
physically cannot — there is no `UPDATE` privilege on that column for the
`authenticated` role.

### Invitation and password-reset links go nowhere

**Authentication → URL Configuration** in Supabase. **Site URL** must match
`NEXT_PUBLIC_APP_URL`, and **Redirect URLs** must include every origin you use,
with a wildcard: `http://localhost:3000/**`, `https://your-domain.example/**`.

### Emails are not being delivered

Supabase's built-in SMTP is heavily rate-limited and not for production.
Configure your own under **Authentication → Email**. Until then MIRA shows the
invitation and reset links in the UI so you can send them yourself — the
"emailed" flag in the response says which happened.

### Realtime is not firing

Check that the tables are in the publication:

```sql
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
```

`20250101000300_storage_realtime.sql` adds them. If the list is empty, that
migration did not run. Also confirm Realtime is enabled for the project under
**Database → Replication**, and remember that Realtime respects RLS: you only
receive changes to rows you could have read.

### `service_role` key misuse

If a page renders data it should not, check which client fetched it. The
service-role client bypasses RLS entirely and belongs only in
`scripts/` and the two admin API routes that mint credentials. Anything that
renders user data must use `createSupabaseServerClient()` or the browser
client. `lib/supabase/server.ts` documents the split; `lib/auth/api.ts`
enforces the ordering in the API routes.

### The seed script won't run on Node 20

Node's native TypeScript stripping arrived in 22.6. On Node 20 either upgrade,
or run the script through any TypeScript runner:

```bash
npx tsx scripts/seed-admin.ts
```

### Migrations fail with "type already exists"

You ran part of the SQL already. The files are written to be re-runnable, but
if you hand-edited something, `npm run db:reset` on a local stack is the
quickest way back to a known state. Never run `db:reset` against production.

---

## License

MIT.
