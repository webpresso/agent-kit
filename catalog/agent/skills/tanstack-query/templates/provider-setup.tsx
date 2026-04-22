// app/root.tsx
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Outlet } from 'react-router'

import { queryClient } from '#lib/query-client'

/**
 * Reuse the existing root/preset surface.
 * Do not create a second provider abstraction just to wrap QueryClientProvider.
 */
export function AppRoot() {
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  )
}
