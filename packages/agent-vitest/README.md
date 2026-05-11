# @webpresso/agent-vitest

Shared Vitest configuration package.

## Current Role

This package owns shared Vitest config surfaces for the monorepo.

The older README mixed real package guidance with a large amount of performance and coverage prose that can drift faster than the shared configs themselves.

## Practical Rule

Use the package source, exported config entrypoints, and current consumers as the source of truth for:

- available shared configs
- supported runtime splits
- package-level testing integration expectations

## Development

From the repo root:

```bash
just lint --file packages/foundation/vitest/README.md
just docs
```

Use package-scoped checks when ending a batch:

```bash
just test --package vitest
```
