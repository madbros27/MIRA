import { AlertTriangle, ExternalLink, Terminal } from 'lucide-react'

import { Wordmark } from '@/components/layout/logo'
import { Card } from '@/components/ui/primitives'
import { isSupabaseConfigured } from '@/lib/supabase/env'

export const metadata = { title: 'Finish setting up MIRA' }

/**
 * Shown by the middleware when the Supabase environment variables are missing,
 * so a fresh clone explains itself instead of throwing.
 */
export default function SetupPage() {
  const configured = isSupabaseConfigured()

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <Card className="w-full max-w-2xl overflow-hidden shadow-md">
        <div className="border-b border-border p-6">
          <Wordmark />
          <div className="mt-5 flex items-start gap-3">
            <span
              className={
                configured
                  ? 'flex size-9 shrink-0 items-center justify-center rounded-xl bg-success-subtle text-success'
                  : 'flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning-subtle text-warning'
              }
            >
              <AlertTriangle className="size-4" />
            </span>
            <div>
              <h1 className="text-lg font-semibold">
                {configured
                  ? 'Supabase is configured — restart the dev server'
                  : 'Connect MIRA to your Supabase project'}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                MIRA reads its connection details from environment variables. Nothing is
                hardcoded, so the same build works against any Supabase project.
              </p>
            </div>
          </div>
        </div>

        <ol className="divide-y divide-border">
          <Step
            index={1}
            title="Create a Supabase project"
            body={
              <p>
                Sign in at{' '}
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  supabase.com/dashboard
                  <ExternalLink className="size-3" />
                </a>{' '}
                and create a project. Then open <strong>Project Settings → API</strong> to find
                the project URL and the two keys.
              </p>
            }
          />

          <Step
            index={2}
            title="Apply the database migrations"
            body={
              <>
                <p>
                  Run the SQL in <code className="rounded bg-muted px-1">supabase/schema.sql</code>{' '}
                  through the dashboard SQL editor, or push the migrations with the CLI:
                </p>
                <Code>{`supabase link --project-ref <your-project-ref>\nsupabase db push`}</Code>
              </>
            }
          />

          <Step
            index={3}
            title="Add the environment variables"
            body={
              <>
                <p>
                  Copy <code className="rounded bg-muted px-1">.env.example</code> to{' '}
                  <code className="rounded bg-muted px-1">.env.local</code> and fill in:
                </p>
                <Code>{`NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>\nSUPABASE_SERVICE_ROLE_KEY=<service role key>`}</Code>
                <p className="text-2xs text-muted-foreground">
                  The service-role key is server-side only — it is never sent to the browser.
                </p>
              </>
            }
          />

          <Step
            index={4}
            title="Restart and sign up"
            body={
              <>
                <p>
                  Next.js only reads <code className="rounded bg-muted px-1">.env.local</code> at
                  boot, so restart the dev server:
                </p>
                <Code>{`npm run dev`}</Code>
                <p>
                  Then create an account. Signing up seeds a workspace with a demo project so
                  the board is populated from the first load.
                </p>
              </>
            }
          />
        </ol>

        <div className="border-t border-border bg-surface-raised px-6 py-4">
          <p className="text-2xs text-muted-foreground">
            Detected so far: NEXT_PUBLIC_SUPABASE_URL{' '}
            <Status ok={Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)} /> ·
            NEXT_PUBLIC_SUPABASE_ANON_KEY{' '}
            <Status ok={Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)} /> ·
            SUPABASE_SERVICE_ROLE_KEY{' '}
            <Status ok={Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)} />
          </p>
        </div>
      </Card>
    </main>
  )
}

function Step({
  index,
  title,
  body,
}: {
  index: number
  title: string
  body: React.ReactNode
}) {
  return (
    <li className="flex gap-4 p-6">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-bold text-primary-subtle-foreground">
        {index}
      </span>
      <div className="min-w-0 space-y-2 text-sm">
        <h2 className="font-semibold">{title}</h2>
        <div className="space-y-2 text-muted-foreground">{body}</div>
      </div>
    </li>
  )
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-sidebar px-3 py-2.5 text-2xs leading-relaxed text-sidebar-foreground">
      <code className="flex items-start gap-2">
        <Terminal className="mt-0.5 size-3 shrink-0 opacity-60" />
        <span className="whitespace-pre">{children}</span>
      </code>
    </pre>
  )
}

function Status({ ok }: { ok: boolean }) {
  return (
    <span className={ok ? 'font-semibold text-success' : 'font-semibold text-destructive'}>
      {ok ? 'set' : 'missing'}
    </span>
  )
}
