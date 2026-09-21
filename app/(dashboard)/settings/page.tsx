import { redirect } from 'next/navigation'

/** `/settings` lands on the workspace tab; the sub-nav takes it from there. */
export default function SettingsIndex() {
  redirect('/settings/workspace')
}
