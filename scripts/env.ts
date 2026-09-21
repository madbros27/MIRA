/**
 * Shared bootstrap for the seed scripts.
 *
 * Loads `.env.local` the same way `next dev` does (via `@next/env`, which
 * ships with Next), then hands back a service-role Supabase client.
 *
 * The service-role key bypasses Row-Level Security completely. That is the
 * point here — creating the very first System Administrator has to happen
 * before any policy could authorise it — but it is also why these scripts run
 * from a terminal and never from the app.
 */

import { createRequire } from 'node:module'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '../lib/types/database.ts'

// `@next/env` is CommonJS, so a named ESM import does not resolve. Going
// through createRequire keeps the exact same .env.local precedence that
// `next dev` uses, without adding dotenv as a dependency.
const require = createRequire(import.meta.url)
const { loadEnvConfig } = require('@next/env') as {
  loadEnvConfig: (dir: string) => void
}

loadEnvConfig(process.cwd())

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.startsWith('<')) {
    console.error(
      `\n  Missing ${name}.\n\n` +
        `  Copy .env.example to .env.local and fill it in from\n` +
        `  Supabase Dashboard -> Project Settings -> API.\n`
    )
    process.exit(1)
  }
  return value
}

export function serviceClient(): SupabaseClient<Database> {
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    'http://localhost:3000'
  ).replace(/\/+$/, '')
}

/* Small console helpers so the scripts read clearly in a terminal. */
export const log = {
  step: (message: string) => console.log(`\n▸ ${message}`),
  ok: (message: string) => console.log(`  ✓ ${message}`),
  skip: (message: string) => console.log(`  · ${message}`),
  warn: (message: string) => console.warn(`  ! ${message}`),
  fail: (message: string) => console.error(`  ✗ ${message}`),
}

/**
 * Find an auth user by email.
 *
 * `auth.admin` has no "get by email", so this pages through the list. Fine at
 * seeding scale; it is not a hot path.
 */
export async function findAuthUser(
  supabase: SupabaseClient<Database>,
  email: string
): Promise<{ id: string; email: string } | null> {
  const needle = email.toLowerCase()

  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error

    const found = data.users.find((user) => user.email?.toLowerCase() === needle)
    if (found) return { id: found.id, email: found.email ?? email }
    if (data.users.length < 200) break
  }

  return null
}
