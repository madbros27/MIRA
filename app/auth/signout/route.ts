import { NextResponse, type NextRequest } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient('tenant')
  await supabase.auth.signOut()

  // A form post (no-JS fallback) expects a redirect; fetch callers ignore it.
  return NextResponse.redirect(new URL('/login', request.nextUrl.origin), {
    status: 303,
  })
}
