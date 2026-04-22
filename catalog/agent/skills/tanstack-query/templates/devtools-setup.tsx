import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

/**
 * Keep devtools simple and colocated with the shared QueryClientProvider.
 * The most useful checks during this hard cut are:
 *
 * - are route-critical queries already in cache before the route renders?
 * - did the shared `mutationKey` show up for sibling pending-state observers?
 * - did optimistic updates reconcile back to the canonical query key?
 */
export function QueryDevtools() {
  return import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null
}
