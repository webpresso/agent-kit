# @webpresso/stryker-config

Shared Stryker configuration package.

## Current Role

Use this package for the repo-owned mutation-testing configuration surfaces that are actually exported by the current package.

## Development

From the repo root:

```bash
just lint --file packages/foundation/stryker/README.md
just docs
```

Use package-scoped checks when ending a batch:

```bash
just test --package stryker
```
