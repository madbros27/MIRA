import { redirect } from 'next/navigation'

/** `/` is the dashboard, which lives at its own addressable URL. */
export default function TenantIndex() {
  redirect('/dashboard')
}
