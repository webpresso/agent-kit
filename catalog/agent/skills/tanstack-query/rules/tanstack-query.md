# TanStack Query rules

These are the non-negotiable rules for new or touched TanStack Query code.

## Query contract

- Export a reusable `queryOptions(...)` factory for any query shape that needs to be reused.
- Prefer `useSuspenseQuery(...)` for route-critical data.
- Prefetch required route data in RR7 `clientLoader` with `queryClient.ensureQueryData(...)`.
- Use the generated GraphQL SDK; do not write inline GraphQL in app code.

## Mutation contract

- Export reusable `mutationOptions(...)` factories with stable `mutationKey` values.
- Use `createOptimisticMutation(...)` for optimistic updates.
- Observe sibling pending work with `useMutationState(...)` or `useIsMutating(...)`.

## Pagination contract

- Use `infiniteQueryOptions(...)` and `useSuspenseInfiniteQuery(...)` for touched load-more or cursor feeds.
- Use `usePrefetchInfiniteQuery(...)` only to warm a secondary suspense boundary or pane.

## Error/loading contract

- Query defaults assume `throwOnError: true`; let the route error boundary own the failure path.
- Do not introduce `isLoading` checks in new query code.
- If suspense is not appropriate, use `isPending` and `isFetching` deliberately and comment why the escape hatch is needed.

## Generator-first contract

- Prefer generated CRUD outputs over new hand-written wrappers.
- Keep hand-written query files small, obvious, and composition-only.
- Do not create a new YAML-backed hand-written query ownership layer without a written D23 exception note.

## Review checklist

- Is the data contract reusable as an options factory?
- Could generation own this instead?
- Is the GraphQL call going through the generated SDK?
- Is the route data prefetched before suspense renders?
- Does pending UI rely on TanStack primitives instead of custom stores?
