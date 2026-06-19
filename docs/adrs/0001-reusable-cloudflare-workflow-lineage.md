---
type: adr
last_updated: 2026-06-11
---

# ADR 0001: Reusable Cloudflare workflow lineage

- **Status:** accepted
- **Date:** 2026-06-11
- **Decision owners:** github-actions + consumer repo maintainers

## Context

`ingest-lens`, `edge-matte`, and `ozby-dev` already consume
`webpresso/github-actions/.github/workflows/cloudflare-preview.yml` and
`cloudflare-production.yml` by immutable commit SHA.

The downstream repos currently pin the lineage introduced at:

- **`317fc3aa5952f5dee0604413a0b9dd1e6d7635dd`** — `fix: harden reusable deploy bootstrap`

That lineage is now intentionally owned in `webpresso/github-actions`, which keeps the shared shell separate from Agent Kit package/runtime ownership.

## Decision

`webpresso/github-actions` is the authoritative owner of the shared Cloudflare reusable
workflow shell.

The authoritative lineage for the current consumer contract is the immutable
commit:

- **`317fc3aa5952f5dee0604413a0b9dd1e6d7635dd`**

Current-source `github-actions` must continue to carry that workflow family (or an
intentional successor), while Agent Kit docs may describe the caller contract without duplicating the workflow files.

Consumer repos may keep their existing SHA pins until they intentionally repin
to a later released lineage.

## Consequences

- Reusable workflow callers must keep using immutable SHAs, never floating refs.
- `github-actions` docs must name the reusable workflow shell as a first-class shared
  surface.
- If the shared shell changes, `github-actions` publishes the new lineage first and
  only then do consumers repin.
- `monorepo` and consumer docs must not describe the workflow shell or the
  shared `testing-philosophy` surface as purely local when `agent-kit` projects
  them by default.
