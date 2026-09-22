import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

import { setActiveWorkspace } from '@/app/actions'
import { Wordmark } from '@/components/layout/logo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/primitives'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'

/**
 * Invitation landing page.
 *
 * The heavy lifting is the `accept_invite` RPC, which verifies that the
 * invitation is pending, unexpired and addressed to the signed-in user's email
 * before adding the membership row.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createSupabaseServerClient('tenant')

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/invite/${token}/setup`)
  }

  const inviteSetupCookie = (await cookies()).get('mira-invite-setup')
  if (inviteSetupCookie?.value === '1') {
    redirect(`/invite/${token}/setup`)
  }

  const { data: workspaceId, error } = await supabase.rpc('accept_invite', {
    p_token: token,
  })

  if (error || !workspaceId) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas p-4">
        <Card className="w-full max-w-md p-6 text-center shadow-md">
          <Wordmark className="justify-center" />
          <h1 className="mt-5 text-lg font-semibold">This invitation cannot be used</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error?.message?.includes('different email')
              ? `The invitation was issued to a different email address. You are signed in as ${user.email}.`
              : 'It may have been revoked, already accepted, or expired. Ask whoever invited you to send a fresh one.'}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button asChild variant="primary">
              <Link href="/">Go to MIRA</Link>
            </Button>
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="ghost" size="sm" className="w-full">
                Sign in as someone else
              </Button>
            </form>
          </div>
        </Card>
      </main>
    )
  }

  await setActiveWorkspace(workspaceId as string)
  redirect('/')
}
