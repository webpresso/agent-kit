---
"@webpresso/agent-kit": minor
---

feat(audit): config-driven runtime exemptions for toolchain-isolation

`wp audit toolchain-isolation` now honors a per-repo allowlist:
`.webpressorc.json` → `audit.toolchainIsolation.allowDependencies: string[]`.
Dependency names listed there are exempt from the forbidden-toolchain check
because they are legitimate **app-specific runtimes**, not generic toolchain —
e.g. `tsx` for a Pulumi program's TS loader (`Pulumi.yaml` `--import tsx`), or
`@playwright/test` imported directly by e2e specs.

Mechanism lives in agent-kit; the data lives in each consumer's
`.webpressorc.json` (same split as `guard.scriptRoutes`). Without this, a strict
"no toolchain deps" policy mis-classified required runtimes and broke real
consumers (ingest-lens `pulumi preview` → `ERR_MODULE_NOT_FOUND: tsx`).
