# @webpresso/typescript-config

Shared TypeScript configuration package.

## Current Role

This package owns shared TypeScript config surfaces for the repo.

The older README mixed real package ownership with stale scorecards and config examples that may no longer match the current exported config set.

## Practical Rule

Use the package source, exported config files, and current consumers as the source of truth for:

- available shared tsconfig variants
- base compiler assumptions
- package boundaries around repo-wide TypeScript configuration

## Development

From the repo root:

```bash
just lint --file packages/foundation/typescript/README.md
just docs
```

Use package-scoped checks when ending a batch:

```bash
just test --package typescript
```
