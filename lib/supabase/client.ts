'use client'

/**
 * The browser Supabase client.
 *
 * Every Client Component goes through `getSupabaseBrowserClient()`; nothing
 * else in the app calls `createBrowserClient` directly. The instance is
 * memoised so that a single Realtime websocket is shared across the app.
 */

import { createBrowserClient } from '@supabase/ssr'

import { getSupabaseAnonKey, getSupabaseUrl } from './env'
import type { Database } from '@/lib/types/database'

export type SupabaseBrowserClient = ReturnType<typeof createClient>

function createClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  })
}

let browserClient: SupabaseBrowserClient | undefined

export function getSupabaseBrowserClient(): SupabaseBrowserClient {
  if (!browserClient) browserClient = createClient()
  return browserClient
}
