# Testing guidance

This skill follows an integration-first testing posture.

## What to test

### Query client contract

Use a real `QueryClientProvider` when testing:

- `createQueryClient()` defaults
- query error propagation with `throwOnError: true`
- retry/reset behavior through the route error boundary

### Query factories

Test that the same exported factory works for:

- `ensureQueryData(...)`
- suspense hooks
- invalidation/reset keyed to the same query key

### Optimistic updates

Test optimistic success + rollback against a real query cache. Avoid mocking the
cache choreography itself.

## What not to optimize for

- no prose/template snapshot tests are required for this task
- do not default to mock-heavy tests when a real QueryClient + router boundary proves the behavior more directly
- do not write tests that only prove a hook was called; prove the visible or cache behavior

## Suggested harness pieces

- real `QueryClientProvider`
- RR7 route `ErrorBoundary` using `RouteQueryErrorBoundary`
- fake local async functions for success/failure cases
- cache assertions through `queryClient.getQueryData(...)`

## Validation mindset

The testing-philosophy skill still applies: prefer behavior locks, real
providers, and visible outcomes over shallow mocks.
