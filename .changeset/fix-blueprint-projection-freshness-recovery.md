---
"@webpresso/agent-kit": patch
---

fix(blueprint): `wp blueprint db build` and CLI mutations now refresh the projection freshness stamp

The blueprint projection's freshness gate refuses cached MCP reads when git HEAD
has moved since ingest. The documented recovery — `wp blueprint db build` — did
not clear it: `dbBuild` and the CLI mutation reingest hand-rolled the ingest
sequence and omitted `recordProjectionMetadata`, so the freshness sidecar HEAD
was never refreshed and the projection stayed permanently stale after any commit.

Both now delegate to `reIngestProjection`, the single owner of the persistent
reingest sequence (prune → write-lock → ingest → record metadata), which now
returns the ingest counts. This removes the duplication that let the copies
diverge and makes `wp blueprint db build` a true recovery for a stale
(`reingest_project`) projection.

Release claims remain gated by `docs/bench/reference-parity-matrix.md`,
`src/__integration__/reference-parity-host-smoke.integration.test.ts`,
`src/__integration__/reference-parity-tool-surface.integration.test.ts`, and
`docs/bench/session-memory-methodology.md`.
