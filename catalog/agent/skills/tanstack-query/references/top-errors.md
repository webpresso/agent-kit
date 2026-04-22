# Common contract violations and fixes

| Violation | Why it is wrong here | Fix |
| --- | --- | --- |
| Inline GraphQL in app code | bypasses generated SDK and recreates transport drift | add/update the generated operation and call it through the SDK |
| Reusable inline `useQuery({ queryKey, queryFn })` | makes prefetch/testing/invalidation harder to share | export a `queryOptions(...)` factory |
| `isLoading` in new query code | wrong semantic shortcut for this hard cut | suspense-first, or use `isPending` / `isFetching` intentionally |
| Route component fetches required data without prefetch | creates waterfalls and ambiguous loading ownership | prefetch in `clientLoader` with `ensureQueryData(...)` |
| Hand-rolled optimistic cache choreography | duplicates rollback logic and mutation-key conventions | use `createOptimisticMutation(...)` |
| Custom loading store for mutations | duplicates built-in mutation cache state | use `useMutationState(...)` / `useIsMutating(...)` |
| New hand-written YAML-backed CRUD hook | undermines generator-first ownership | expand generation or document a D23 exception |
| Manual page accumulation for feeds | bypasses TanStack infinite-query primitives | use `infiniteQueryOptions(...)` + `useSuspenseInfiniteQuery(...)` |

## Quick review prompts

- Could this be generated instead?
- Is there a shared options factory yet?
- Does the route prefetch before render?
- Can the pending indicator observe `mutationKey` instead of local state?
