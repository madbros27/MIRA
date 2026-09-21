/**
 * Seed the single System Administrator.
 *
 *   npm run seed:admin
 *
 * Idempotent by design — safe to re-run after every deploy, and safe to run
 * twice by accident:
 *
 *   · no auth user        -> create one, insert platform_admins
 *   · auth user, no row   -> insert platform_admins (adopts an existing login)
 *   · both already exist  -> report and change nothing, including the password
 *
 * It never resets a password that somebody has already changed. That matters:
 * the default credentials are published in .env.example and the README, so
 * silently restoring them on a redeploy would quietly reopen the front door.
 */

import { appUrl, findAuthUser, log, requireEnv, serviceClient } from './env.ts'

const DEFAULT_EMAIL = 'madbrostech27@gmail.com'
const DEFAULT_PASSWORD = 'Admin@1234567'

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? DEFAULT_EMAIL).trim().toLowerCase()
  const password = process.env.SEED_ADMIN_PASSWORD ?? DEFAULT_PASSWORD
  const name = process.env.SEED_ADMIN_NAME ?? 'System Administrator'

  requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  const supabase = serviceClient()

  console.log('\nMIRA — seeding the System Administrator')
  console.log(`  target: ${email}`)

  /* 1. Does the platform_admins row already exist? --------------------- */
  log.step('Checking for an existing administrator')

  const { data: existingAdmin, error: lookupError } = await supabase
    .from('platform_admins')
    .select('id, user_id, email, must_change_password, is_active')
    .ilike('email', email)
    .maybeSingle()

  if (lookupError && lookupError.code !== 'PGRST116') {
    log.fail(`Could not read platform_admins: ${lookupError.message}`)
    log.warn('Have the migrations been applied? Try: npm run db:push')
    process.exit(1)
  }

  if (existingAdmin) {
    log.skip(`${email} is already a system administrator — nothing to do`)
    if (existingAdmin.must_change_password) {
      log.warn('This account is still flagged must_change_password.')
      log.warn('It will be forced to choose a new password at next sign-in.')
    }
    if (!existingAdmin.is_active) {
      log.warn('The account is marked inactive and cannot sign in.')
    }
    printNextSteps(email, false)
    return
  }

  /* 2. Is there already an auth user for this address? ------------------ */
  log.step('Checking Supabase Auth')

  let userId: string
  let created = false

  const existingUser = await findAuthUser(supabase, email)

  if (existingUser) {
    userId = existingUser.id
    log.skip(`An auth user already exists for ${email} — adopting it`)
    log.warn('Its current password is left untouched.')

    // Make sure the JWT carries the routing hint the middleware reads.
    await supabase.auth.admin.updateUserById(userId, {
      app_metadata: { mira_role: 'system_admin' },
    })
  } else {
    if (password.length < 8) {
      log.fail('SEED_ADMIN_PASSWORD must be at least 8 characters')
      process.exit(1)
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
      // Read by `middleware.ts` to route the request without a database hit.
      // It is a hint only; `platform_admins` remains the authority.
      app_metadata: { mira_role: 'system_admin' },
    })

    if (error || !data.user) {
      log.fail(`Could not create the auth user: ${error?.message ?? 'unknown error'}`)
      process.exit(1)
    }

    userId = data.user.id
    created = true
    log.ok(`Created auth user ${userId}`)
  }

  /* 3. Profile mirror ---------------------------------------------------- */
  log.step('Writing the profile')

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: userId, email, full_name: name, is_active: true }, { onConflict: 'id' })

  if (profileError) {
    log.warn(`Profile upsert reported: ${profileError.message}`)
  } else {
    log.ok('Profile in place')
  }

  /* 4. The platform_admins row ------------------------------------------ */
  log.step('Granting system administrator')

  const { error: insertError } = await supabase.from('platform_admins').insert({
    user_id: userId,
    email,
    name,
    // Forces the password change screen at first sign-in.
    must_change_password: true,
    is_active: true,
  })

  if (insertError) {
    // A concurrent run got there first — that is a success, not a failure.
    if (/duplicate key/i.test(insertError.message)) {
      log.skip('Another run created the administrator first — nothing to do')
      printNextSteps(email, false)
      return
    }
    log.fail(`Could not insert platform_admins: ${insertError.message}`)
    process.exit(1)
  }

  log.ok(`${email} is now a system administrator`)
  printNextSteps(email, created)
}

function printNextSteps(email: string, showPassword: boolean) {
  const base = appUrl()

  console.log('\n' + '─'.repeat(64))
  console.log('  Sign in at:  ' + `${base}/miraadmin/login`)
  console.log('  Email:       ' + email)

  if (showPassword) {
    console.log(
      '  Password:    ' + (process.env.SEED_ADMIN_PASSWORD ?? DEFAULT_PASSWORD)
    )
    console.log('')
    console.log('  ⚠  CHANGE THIS PASSWORD BEFORE THE APP IS PUBLICLY REACHABLE.')
    console.log('     The default is published in .env.example and the README,')
    console.log('     so treat it as known to the world. MIRA forces a change at')
    console.log('     first sign-in, but do not rely on that alone.')
  }

  console.log('─'.repeat(64))
  console.log('\n  Next: create a workspace, then create an Owner and assign it.')
  console.log(`  ${base}/miraadmin/workspaces\n`)
}

main().catch((error) => {
  log.fail(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
