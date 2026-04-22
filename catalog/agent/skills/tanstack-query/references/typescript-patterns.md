# TypeScript patterns

## Query factory typing

Keep the factory as the single type source.

- derive the `queryKey` from a small helper when it improves reuse
- let `queryOptions(...)` preserve the query result type for suspense, prefetch, and tests
- avoid re-declaring result types in every consumer

## Mutation factory typing

Give reusable mutations a stable `mutationKey` and typed variables payload.
That keeps `useMutationState(...)` selectors predictable.

## Mutation-state selectors

A good selector returns a simple UI-facing value, for example:

- pending entity ids
- pending display labels
- a boolean derived through `useIsMutating(...)`

Keep the selector narrow so sibling components do not need to understand the
whole mutation object.

## Composition hooks

Type composition hooks around returned view models, not around raw transport
concerns. The data contract should stay in the generated or factory layer.

## Error typing

Treat query/mutation errors as boundary-owned by default. Only specialize error
types when the component truly owns inline handling for an intentional escape
hatch.
