'use client'

import { createBrowserClient } from '@supabase/ssr'

import { getSupabaseAnonKey, getSupabaseUrl } from './env'
export {
  ADMIN_COOKIE,
  ADMIN_STORAGE_KEY,
  TENANT_COOKIE,
  TENANT_STORAGE_KEY,
} from './portal'
import {
  ADMIN_COOKIE,
  ADMIN_STORAGE_KEY,
  TENANT_COOKIE,
  TENANT_STORAGE_KEY,
} from './portal'
import type { Database } from '@/lib/types/database'

import type { Portal } from './portal'
export type { Portal } from './portal'

type BrowserClient = ReturnType<typeof createBrowserClient<Database>>

function createPortalClient(portal: Portal): BrowserClient {
  const admin = portal === 'admin'
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      // SessionLifecycle coordinates refreshes through one portal-scoped
      // leader so rotating refresh tokens are never raced by every tab.
      autoRefreshToken: false,
      persistSession: true,
      storageKey: admin ? ADMIN_STORAGE_KEY : TENANT_STORAGE_KEY,
    },
    cookieOptions: {
      name: admin ? ADMIN_COOKIE : TENANT_COOKIE,
      path: admin ? '/miraadmin' : '/',
      sameSite: 'lax',
      secure: true,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  })
}

let adminClient: BrowserClient | undefined
let tenantClient: BrowserClient | undefined

export function getAdminSupabaseBrowserClient(): BrowserClient {
  adminClient ??= createPortalClient('admin')
  return adminClient
}

export function getTenantSupabaseBrowserClient(): BrowserClient {
  tenantClient ??= createPortalClient('tenant')
  return tenantClient
}
