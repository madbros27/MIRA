#!/usr/bin/env node
/**
 * Concatenates supabase/migrations/*.sql into supabase/schema.sql.
 *
 * The migrations are the source of truth; schema.sql is the convenience
 * artefact you can paste straight into the Supabase SQL editor when you would
 * rather not install the CLI. Regenerate it with `npm run db:schema` after
 * editing any migration.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(root, 'supabase', 'migrations')
const outputFile = join(root, 'supabase', 'schema.sql')

const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort()

if (!files.length) {
  console.error('No migrations found in supabase/migrations')
  process.exit(1)
}

const parts = [
  '-- ===========================================================================',
  '-- MIRA — complete schema',
  '--',
  '-- GENERATED FILE — do not edit by hand.',
  '-- Built from supabase/migrations by `npm run db:schema`.',
  '--',
  '-- Paste this whole file into the Supabase SQL editor, or prefer the CLI:',
  '--   supabase link --project-ref <ref> && supabase db push',
  '-- ===========================================================================',
  '',
]

for (const file of files) {
  const sql = await readFile(join(migrationsDir, file), 'utf8')
  parts.push(
    '',
    `-- >>> ${file} ${'-'.repeat(Math.max(0, 66 - file.length))}`,
    '',
    sql.trimEnd(),
    ''
  )
}

await writeFile(outputFile, `${parts.join('\n')}\n`, 'utf8')

console.log(`Wrote supabase/schema.sql from ${files.length} migrations:`)
for (const file of files) console.log(`  · ${file}`)
