---
name: tanstack-query
description: |
  Apply a canonical TanStack Query v5 contract: SDK-first query and mutation factories, suspense-first route data, QueryClient defaults with throwOnError, prefetch-aware loaders, infinite-query primitives, and generator-first CRUD guidance.

  Use when implementing or reviewing TanStack Query usage in a React app, especially when replacing ad-hoc hooks, wiring clientLoader prefetch, or standardizing query/mutation patterns.
user-invocable: true
upstream:
  source: null
  last_synced: "2026-04-22"
---

# TanStack Query hard-cut contract

Primary contract guide: `.agent/guides/tanstack-query-contract.md` (if present in your repo).

## What this skill is for

Use this skill when you need to:

- add or refactor TanStack Query usage in a React app
- replace ad-hoc query/mutation code with reusable factories
- wire route-critical data through RR7 `clientLoader` + suspense
- standardize optimistic updates, paginated feeds, or pending-state UX
- decide whether a new hand-written query layer is allowed at all

This skill is **not** the generic place for TanStack Query trivia. It encodes
one repository contract derived from a `tanstack-query-hardcut` blueprint.

## Canonical contract

### 1) Generated contracts own CRUD first

If the surface is YAML-backed or already expressible through generated CRUD
outputs, prefer generated frontend hooks/factories first.

Only add a hand-written query module when it is clearly one of these:

- custom non-CRUD business flow
- composition across multiple generated operations
- temporary bridge until generator support lands

If you still need a new hand-written YAML-backed module, document the D23
exception explicitly:

1. why generator expansion cannot own it yet
2. why the remaining layer is composition-only
3. how it will collapse later

### 2) Export factories, not reusable inline objects

Canonical shapes:

- `queryOptions(...)` for standard queries
- `mutationOptions(...)` for reusable mutations
- `infiniteQueryOptions(...)` for paginated / load-more feeds

Put the factory in a stable home such as `app/hooks/queries/<domain>.ts`, then
consume it from hooks, route loaders, prefetch helpers, and tests.

### 3) SDK-only GraphQL

App code talks to GraphQL through a generated SDK (e.g., `~/generated/graphql/graphql-sdk`).
If an operation is missing, add it to the codegen lane. Do not write inline
GraphQL strings in app code or skill examples.

### 4) Suspense-first route data

Route-critical data flow:

1. `queryClient.ensureQueryData(factory(...))` inside RR7 `clientLoader`
2. `useSuspenseQuery(factory(...))` inside the route/domain component
3. route-level `ErrorBoundary` export uses `RouteQueryErrorBoundary`

Do not branch on `data === undefined` or `isPending` for data that is required
before render.

### 5) Errors are boundary-owned by default

`createQueryClient()` should default to:

- queries: `throwOnError: true`, `staleTime: 30_000`, `gcTime: 5 * 60_000`, `retry: 1`
- mutations: `throwOnError: true`, `retry: 0`

Use RR7-native route error boundaries plus `QueryErrorResetBoundary` to expose
retry/reset UX.

### 6) Pending work is observable through TanStack primitives

For cross-component pending UI, prefer:

- `useMutationState(...)`
- `useIsMutating(...)`

Key these off a stable `mutationKey` exported by the mutation-options factory or
derived by the shared optimistic helper.

### 7) Infinite-query primitives own pagination

For load-more or cursor feeds, prefer:

- `infiniteQueryOptions(...)`
- `useSuspenseInfiniteQuery(...)`
- `usePrefetchInfiniteQuery(...)` for secondary panes before a suspense boundary

Do not hand-roll page accumulation when the TanStack primitive fits.

## Standard workflow

### Query workflow

1. Decide whether generation should own the surface.
2. Export a query-options factory backed by the generated SDK.
3. Prefetch route-critical data with `queryClient.ensureQueryData(...)`.
4. Render with `useSuspenseQuery(...)`.
5. Use `usePrefetchQuery(...)` only for secondary boundaries that benefit from render-time warming.

### Mutation workflow

1. Export `mutationOptions(...)` with a stable `mutationKey`.
2. Use `useMutation({ ...factory(), onSuccess, onSettled })` in the consuming component.
3. Invalidate or update the affected query factories.
4. Expose sibling pending state via `useMutationState(...)` / `useIsMutating(...)`.
5. For optimistic flows, use `createOptimisticMutation(...)` instead of open-coded cache choreography.

### Pagination workflow

1. Export `infiniteQueryOptions(...)` with `initialPageParam` and `getNextPageParam`.
2. Prefetch the first page in `clientLoader` when the feed is route-critical.
3. Render with `useSuspenseInfiniteQuery(...)`.
4. Warm secondary feeds with `usePrefetchInfiniteQuery(...)` when it shortens the waterfall.

## Hard bans

- No inline GraphQL strings in app code
- No new reusable inline `useQuery({ queryKey, queryFn })` contracts
- No `isLoading`-driven query examples in new code
- No second provider abstraction when the existing root/preset can own the shared client
- No bespoke mutation-loading stores when TanStack mutation-state hooks fit
- No medium-sized custom hooks that re-own generated CRUD semantics

## Escape hatches

Allowed only when justified in code comments / implementation notes:

- `useQuery(...)` instead of suspense for polling, optimistic local reconciliation, or truly optional background data
- per-mutation `throwOnError: false` for intentional inline form validation UX (see opt-out policy below)
- a hand-written query module over a YAML-backed surface only with a D23 exception note

### `throwOnError: false` opt-out policy

Opting out per-call is allowed only for **inline-error UX** — surfaces that render their own toast / inline message and must not bubble to the route boundary (e.g. action buttons, optimistic mutations, form validation).

When opting out:

- Add a one-line `// inline-error UX: ...` comment explaining the local error path (toast, inline banner, status field)
- Provide a local `onError` handler — silent failure is never acceptable
- For **queries** (vs mutations), prefer `meta: { skipGlobalError: true }` over `throwOnError: false` so the global `QueryCache.onError` can still log / report

Bare `throwOnError: false` without the comment + local handler is a code-review red flag.

## File guide

- Start with `templates/query-client-config.ts`
- Then use `templates/use-query-basic.tsx`, `templates/use-mutation-basic.tsx`, and `templates/use-infinite-query.tsx`
- Use `templates/custom-hooks-pattern.tsx` only for thin composition
- Use `templates/error-boundary.tsx` for the route fallback contract
- Use the reference docs for testing, errors, and typing details
