# Best practices for the TanStack Query contract

## The short version

- generated CRUD first
- SDK-only GraphQL
- reusable options factories everywhere
- suspense-first for route data
- `clientLoader + ensureQueryData(...)` for route-critical prefetch
- `throwOnError: true` by default
- optimistic updates through the shared helper
- mutation-state primitives for cross-component pending UI
- infinite-query primitives for feeds/pagination

## Query factories

A reusable query should live in one exported factory so the same contract can be
consumed by:

- `useSuspenseQuery(...)`
- `queryClient.ensureQueryData(...)`
- `queryClient.prefetchQuery(...)`
- tests
- invalidation / cache-updates keyed to one source of truth

## Generator-first is a quality rule, not a nice-to-have

If the operation is YAML-backed CRUD, ask these questions before writing a new
module:

1. can schema/frontend generation own it?
2. can an existing generated hook/factory already cover it?
3. is the remaining work only orchestration/composition?

If the answer to (1) or (2) is yes, do that instead of inventing a new custom
hook.

## Suspense-first route data

Use suspense when the route cannot render meaningfully without the data.
Prefetch with `ensureQueryData(...)`, then let the component read through
`useSuspenseQuery(...)`.

Only skip suspense when the data is genuinely optional, polling-driven, or part
of an intentional background/optimistic flow.

## Prefetch deliberately

Use:

- `ensureQueryData(...)` for required route data
- `prefetchQuery(...)` / `prefetchInfiniteQuery(...)` for event-driven warming
- `usePrefetchQuery(...)` / `usePrefetchInfiniteQuery(...)` to flatten a nested suspense waterfall

Do not prefetch just because the API exists.

## Keep hand-written code small

The preferred shape is:

`generated primitives -> thin app composition -> UI`

If your hand-written query layer starts feeling clever, it is probably too big.
