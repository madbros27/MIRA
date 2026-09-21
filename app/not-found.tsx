import { Compass } from 'lucide-react'
import Link from 'next/link'

import { Wordmark } from '@/components/layout/logo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/primitives'

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <Card className="w-full max-w-md p-6 text-center shadow-md">
        <Wordmark className="justify-center" />
        <span className="mx-auto mt-6 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Compass className="size-5" />
        </span>
        <h1 className="mt-4 text-lg font-semibold">That page does not exist</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The link may be out of date, or the project or issue it pointed at has been deleted.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild variant="primary">
            <Link href="/">Back to home</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/search">Search issues</Link>
          </Button>
        </div>
      </Card>
    </main>
  )
}
