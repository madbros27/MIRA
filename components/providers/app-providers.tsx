'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider, useTheme } from 'next-themes'
import * as React from 'react'
import { Toaster } from 'sonner'

import { TooltipProvider } from '@/components/ui/controls'
import { errorMessage } from '@/lib/utils'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          // Permission and validation failures will not succeed on a retry.
          const message = errorMessage(error, '')
          if (/permission|row-level security|JWT|not authenticated/i.test(message)) return false
          return failureCount < 2
        },
        refetchOnWindowFocus: true,
      },
      mutations: { retry: 0 },
    },
  })
}

let browserQueryClient: QueryClient | undefined

function getQueryClient() {
  if (typeof window === 'undefined') return makeQueryClient()
  browserQueryClient ??= makeQueryClient()
  return browserQueryClient
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme()
  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'rounded-xl border border-border bg-surface text-foreground shadow-lg text-sm',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground rounded-md',
        },
      }}
    />
  )
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient()

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300} skipDelayDuration={200}>
          {children}
          <ThemedToaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
