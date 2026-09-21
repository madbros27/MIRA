'use client'

import * as React from 'react'

/**
 * Delay a rapidly changing value — search boxes, mostly — so the query layer
 * is not asked to refetch on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = React.useState(value)

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
