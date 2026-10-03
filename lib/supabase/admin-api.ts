'use client'

import { getAdminSupabaseBrowserClient } from './clients'

export async function fetchAdminApi(input: RequestInfo | URL, init: RequestInit = {}) {
  const { data: { session }, error } =
    await getAdminSupabaseBrowserClient().auth.getSession()
  if (error) throw error
  if (!session?.access_token) throw new Error('Not authenticated')

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${session.access_token}`)

  return fetch(input, { ...init, headers })
}
