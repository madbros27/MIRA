import { redirect } from 'next/navigation'

/**
 * People management moved out of Settings and onto its own top-level page
 * when positions replaced the four fixed roles — it grew a directory, a
 * capability editor and an org chart, which is more than a settings tab.
 *
 * This redirect keeps old links and bookmarks working.
 */
export default function MembersSettingsRedirect() {
  redirect('/team')
}
