import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'

import { AppProviders } from '@/components/providers/app-providers'
import '@/styles/globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'MIRA — project & issue tracking',
    template: '%s · MIRA',
  },
  description:
    'MIRA is a fast, modern project tracker: Kanban boards, backlogs, sprints and reports, built on Next.js and Supabase.',
  applicationName: 'MIRA',
  appleWebApp: { capable: true, title: 'MIRA', statusBarStyle: 'default' },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f6fb' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1117' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
