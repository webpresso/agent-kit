// app/lib/query-client.ts
import { QueryClient } from '@tanstack/react-query'

/**
 * Canonical QueryClient defaults for the hard-cut contract.
 *
 * Keep structural sharing and TanStack's render optimizations at their defaults.
 * Do not add custom structuralSharing/select placeholders here without evidence.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        throwOnError: true,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
      },
      mutations: {
        throwOnError: true,
        retry: 0,
      },
    },
  })
}

/**
 * Each app should expose a shared singleton so the root route and RR7
 * `clientLoader` functions talk to the same cache.
 */
export const queryClient = createQueryClient()

/**
 * Example route-critical prefetch shape.
 *
 * import { organizationsListOptions } from '#app/hooks/queries/organizations'
 * import { sdk } from '#lib/graphql-client'
 *
 * export async function clientLoader() {
 *   await queryClient.ensureQueryData(organizationsListOptions(sdk, { first: 20 }))
 *   return null
 * }
 */
