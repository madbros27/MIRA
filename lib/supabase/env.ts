/**
 * Environment access for the Supabase connection.
 *
 * Reading the variables in exactly one place means a missing value produces a
 * single, actionable error instead of an opaque "fetch failed" deep inside the
 * client.
 */

const MISSING = (name: string) =>
  `[MIRA] Missing environment variable ${name}. ` +
  `Copy .env.example to .env.local and fill in the values from ` +
  `Supabase Dashboard -> Project Settings -> API, then restart the dev server.`

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url || url.startsWith('<')) throw new Error(MISSING('NEXT_PUBLIC_SUPABASE_URL'))
  return url
}

export function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!key || key.startsWith('<')) throw new Error(MISSING('NEXT_PUBLIC_SUPABASE_ANON_KEY'))
  return key
}

/** Server-only. Bypasses RLS — never import this from a Client Component. */
export function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key || key.startsWith('<')) throw new Error(MISSING('SUPABASE_SERVICE_ROLE_KEY'))
  return key
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return Boolean(url && key && !url.startsWith('<') && !key.startsWith('<'))
}

/**
 * Absolute origin of this deployment — used for auth redirects, invitation
 * links and anything else that has to be a full URL.
 *
 * MIRA never hardcodes a domain. Whatever you deploy to *is* the base URL:
 * set `NEXT_PUBLIC_APP_URL` and every generated link follows it. The
 * fallbacks below exist so local development and Vercel previews work with no
 * configuration at all.
 *
 *   1. NEXT_PUBLIC_APP_URL    — set this in production
 *   2. NEXT_PUBLIC_SITE_URL   — older name, still honoured
 *   3. VERCEL_URL             — automatic on Vercel preview deployments
 *   4. window.location.origin — in the browser
 *   5. http://localhost:3000  — last resort
 */
export function getAppUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL
  if (explicit && !explicit.startsWith('<')) {
    return explicit.replace(/\/+$/, '')
  }

  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL ?? process.env.VERCEL_URL
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`

  if (typeof window !== 'undefined') return window.location.origin
  return 'http://localhost:3000'
}

/** @deprecated Kept for older call sites. Prefer {@link getAppUrl}. */
export const getSiteUrl = getAppUrl

/** Build an absolute URL on this deployment: absoluteUrl('/miraadmin/login'). */
export function absoluteUrl(path: string): string {
  return `${getAppUrl()}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Whether `/signup` accepts a self-service registration.
 *
 * Off by default: under the three-tier model an Owner is provisioned by a
 * System Administrator and a User arrives through an invitation. When this is
 * false the signup page only accepts an invitation token.
 */
export function allowPublicSignup(): boolean {
  // `ALLOW_PUBLIC_SIGNUP` is the documented name; next.config.mjs republishes
  // it under a NEXT_PUBLIC_ alias so the signup page can read it too.
  const value =
    process.env.ALLOW_PUBLIC_SIGNUP ?? process.env.NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP
  return value === 'true'
}
