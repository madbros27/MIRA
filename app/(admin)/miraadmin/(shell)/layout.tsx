import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

import { AdminShell } from '@/components/admin/admin-shell'
import { requirePlatformAdmin } from '@/lib/auth/session'

/**
 * The authenticated administrator shell.
 *
 * This is the second of the three checks that keep the portals apart
 * (middleware → this layout → RLS). It runs on the server for every admin
 * page, so a stale client bundle cannot render the shell on its own.
 */
export const dynamic = 'force-dynamic'

export default async function AdminShellLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = (await headers()).get('x-pathname') ?? undefined
  const { user, admin } = await requirePlatformAdmin(pathname)

  // The seeded administrator starts with a known password. Until it is
  // replaced, the only reachable page is the one that replaces it.
  // The `pathname &&` guard matters: if the header were ever missing, an
  // unconditional redirect would bounce the password page to itself.
  if (
    admin.must_change_password &&
    pathname &&
    !pathname.startsWith('/miraadmin/settings/password')
  ) {
    redirect('/miraadmin/settings/password')
  }

  return (
    <AdminShell
      admin={{ name: admin.name, email: admin.email, userId: user.id }}
    >
      {children}
    </AdminShell>
  )
}
