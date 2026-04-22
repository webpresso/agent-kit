# TanStack Query hard-cut contract

**Status:** canonical as of 2026-04-21  
**Scope:** React apps using `@tanstack/react-query` v5 with React Router v7 SPA-mode apps.

This skill was pruned and rewritten for the TanStack Query hard-cut blueprint.
It is no longer a generic "React Query tips" bundle. It now teaches one repo
contract:

- use **generated SDK / generated CRUD outputs first**
- export reusable **`queryOptions` / `mutationOptions` / `infiniteQueryOptions` factories**
- prefer **`useSuspenseQuery` / `useSuspenseInfiniteQuery`** for route data
- prefetch route-critical data with **`queryClient.ensureQueryData(...)`** in RR7 `clientLoader`
- default query/mutation failures to **`throwOnError: true`** and let the route error boundary own the failure path
- use **`useMutationState` / `useIsMutating`** for cross-component pending UI
- keep hand-written query modules as **thin composition layers only**

## Hard rules

1. **No inline GraphQL in app code.** Use a generated SDK (e.g., `~/generated/graphql/graphql-sdk`).
2. **No ad-hoc reusable `useQuery({ queryKey, queryFn })` objects.** Export an options factory.
3. **No `isLoading` in new query examples.** Suspense-first; otherwise use `isPending`/`isFetching` intentionally.
4. **No bespoke optimistic-update dances.** Use the shared `createOptimisticMutation(...)` helper.
5. **No new hand-written YAML-backed CRUD ownership layer** without a written D23 exception.

## Quick adoption order

1. Check whether the surface is already generator-owned.
2. If not, export a query/mutation/infinite-options factory in `app/hooks/queries/<domain>.ts`.
3. Prefetch route-critical data in `clientLoader` with the app-local `queryClient` singleton.
4. Consume the factory with suspense hooks in route/domain components.
5. Add route-level error handling with `RouteQueryErrorBoundary`.
6. Use mutation-state primitives for sibling pending indicators.

## Template map

- `templates/query-client-config.ts` — canonical `createQueryClient()` defaults and app-local singleton usage
- `templates/provider-setup.tsx` — root/preset wiring without creating a second provider abstraction
- `templates/use-query-basic.tsx` — SDK-backed query factory + `clientLoader` + suspense + render-time prefetch
- `templates/use-mutation-basic.tsx` — `mutationOptions(...)` factory + invalidation + pending-state observers
- `templates/use-mutation-optimistic.tsx` — `createOptimisticMutation(...)` pattern
- `templates/use-infinite-query.tsx` — `infiniteQueryOptions(...)` + `useSuspenseInfiniteQuery(...)` + `usePrefetchInfiniteQuery(...)`
- `templates/custom-hooks-pattern.tsx` — composition-only wrappers around generated outputs
- `templates/error-boundary.tsx` — RR7-native query error boundary pattern
- `templates/devtools-setup.tsx` — minimal devtools wiring for the shared client

## References

- `rules/tanstack-query.md` — non-negotiable repo rules
- `references/best-practices.md` — canonical decisions and guardrails
- `references/common-patterns.md` — copy-ready usage shapes
- `references/testing.md` — integration-first testing guidance
- `references/top-errors.md` — common contract violations and fixes
- `references/typescript-patterns.md` — typing patterns for factories and mutation-state selectors

## Intentionally removed

Legacy migration-first and placeholder content was pruned. This skill now favors
current repo conventions over generic v4→v5 upgrade advice.
