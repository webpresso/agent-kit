# Common patterns

## 1. Route-critical list data

- export `organizationsListOptions(filters)`
- prefetch it in `clientLoader`
- read it with `useSuspenseQuery(...)`
- export a route `ErrorBoundary` using `RouteQueryErrorBoundary`

## 2. Secondary pane prefetch

When a drawer/tab/detail panel sits behind its own suspense boundary, fire
`usePrefetchQuery(...)` or `usePrefetchInfiniteQuery(...)` in the parent render
so the secondary boundary does less waiting once mounted.

## 3. Mutation with sibling pending UI

- export `mutationOptions(...)` with a stable `mutationKey`
- use `useMutation(...)` in the owning component
- use `useMutationState(...)` or `useIsMutating(...)` in siblings for badges,
  disabled states, or inline saving indicators

## 4. Optimistic mutation

- use `createOptimisticMutation(...)`
- point it at the canonical query key
- let the helper own snapshot/rollback choreography
- reconcile with invalidate/reset behavior after settle

## 5. Feed / load-more surface

- export `infiniteQueryOptions(...)`
- require `initialPageParam`
- use `useSuspenseInfiniteQuery(...)`
- use `fetchNextPage()` / `hasNextPage` / `isFetchingNextPage` in the UI

## 6. Composition-only custom hook

Acceptable: a hook that reshapes generated query data for a dropdown or view
model.

Not acceptable: a hand-written hook that becomes a second home for CRUD data,
query keys, transport logic, and loading/error ownership.
