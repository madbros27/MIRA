import { NextResponse, type NextRequest } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * OAuth and email-link landing point.
 *
 * Supabase sends the browser here with either a PKCE `code` (OAuth, magic
 * link) or a `token_hash` + `type` pair (email confirmation, recovery). Both
 * are exchanged for a cookie session before redirecting on.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/'

  // Providers report failures as query parameters rather than an HTTP error.
  const providerError = searchParams.get('error_description') ?? searchParams.get('error')
  if (providerError) {
    return NextResponse.redirect(
      `${origin}/login?notice=auth-error&message=${encodeURIComponent(providerError)}`
    )
  }

  const portal = next === '/miraadmin' || next.startsWith('/miraadmin/') ? 'admin' : 'tenant'
  const supabase = await createSupabaseServerClient(portal)

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?notice=auth-error&message=${encodeURIComponent(error.message)}`
      )
    }
    return NextResponse.redirect(`${origin}${safeNext(next)}`)
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as 'signup' | 'recovery' | 'invite' | 'email_change' | 'magiclink' | 'email',
      token_hash: tokenHash,
    })
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?notice=auth-error&message=${encodeURIComponent(error.message)}`
      )
    }
    const response = NextResponse.redirect(
      `${origin}${type === 'recovery' ? '/reset-password' : safeNext(next)}`
    )
    if (type === 'invite') {
      response.cookies.set('mira-invite-setup', '1', {
        httpOnly: true,
        maxAge: 60 * 60,
        path: '/invite',
        sameSite: 'lax',
        secure: true,
      })
    }
    return response
  }

  return NextResponse.redirect(`${origin}/login?notice=auth-error`)
}

/** Only allow same-origin relative paths as a redirect target. */
function safeNext(next: string) {
  if (!next.startsWith('/') || next.startsWith('//')) return '/'
  return next
}
