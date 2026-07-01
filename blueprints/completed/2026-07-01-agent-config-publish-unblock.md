---
type: blueprint
owner: webpresso
title: "Agent config publish unblock"
status: completed
complexity: S
created: "2026-07-01"
last_updated: "2026-07-01"
progress: "100% (changeset and local release-package validation complete)"
depends_on: []
cross_repo_depends_on: []
tags:
  - release
  - agent-config
  - agent-core
  - consumer-dedupe
---

# Agent config publish unblock

## Problem

The consumer dedupe release PR bumped `@webpresso/agent-config`, but publish failed because `@webpresso/agent-config` builds its compatibility re-export modules against `@webpresso/agent-core/*` subpaths. The repo contains those agent-core subpath exports, but the currently published `@webpresso/agent-core@0.1.1` does not expose them.

## Scope

- Patch-release `@webpresso/agent-core` so its existing subpath exports are published.
- Patch-release `@webpresso/agent-config` together with it so the generated Version Packages PR rewrites the dependency to the new agent-core version and publishes a config version consumers can resolve.

## Tasks

#### Task 1.1: Patch-release agent-core and agent-config together

**Status:** done

**Files:**

- Add: `.changeset/agent-config-publish-unblock.md`

**Acceptance:**

- [x] `@webpresso/agent-core` and `@webpresso/agent-config` both have patch changesets.
- [x] `pnpm --filter @webpresso/agent-core run build` passes.
- [x] `pnpm --filter @webpresso/agent-config run build` passes.
- [x] Targeted package export/type tests pass.
- [x] Guardrails and TPH pass after blueprint/changelog metadata repair.

## Verification Gates

| Gate                   | Command                                                                                                                                                                 | Result |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Agent core build       | `pnpm --filter @webpresso/agent-core run build`                                                                                                                         | pass   |
| Agent config build     | `pnpm --filter @webpresso/agent-config run build`                                                                                                                       | pass   |
| Targeted package tests | `pnpm exec vitest run packages/agent-config/src/tsconfig/tsconfig-parity.test.ts packages/agent-config/src/export-isolation.test.ts src/build/package-manifest.test.ts` | pass   |
| Dependency freshness   | `pnpm run deps:freshness`                                                                                                                                               | pass   |
| Type safety            | `pnpm run typecheck`                                                                                                                                                    | pass   |
| Lint                   | `pnpm run lint`                                                                                                                                                         | pass   |

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-07-01T10:18:00Z
- verified-head: baa3bc990f44e62f3e96c221123c42f450b47412
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                                                 | Evidence                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| C1  | Published `@webpresso/agent-core@0.1.1` is insufficient for `@webpresso/agent-config` release publish.                                | repo:blueprints/completed/2026-07-01-agent-config-publish-unblock.md           |
| C2  | The repo-local agent-core package already declares the needed subpath exports.                                                        | repo:packages/agent-core/package.json                                          |
| C3  | Patching agent-core and agent-config together gives Changesets a release path that publishes the dependency before rebuilding config. | repo:packages/agent-config/CHANGELOG.md; repo:packages/agent-core/CHANGELOG.md |

### Material Decisions

| ID  | Decision          | Chosen option                                                     | Rejected alternatives                                            | Rationale                                                                      |
| --- | ----------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| D1  | Release fix shape | Patch both `@webpresso/agent-core` and `@webpresso/agent-config`. | Keep only the failed `@webpresso/agent-config@0.3.2` version PR. | Keeps consumers on public packages and avoids local/package-manager overrides. |

### Promotion Gates

| Gate        | Command                   | Expected outcome | Last result                  |
| ----------- | ------------------------- | ---------------- | ---------------------------- |
| Type safety | wp typecheck              | pass             | pass at 2026-07-01T10:18:00Z |
| Lint        | wp lint                   | pass             | pass at 2026-07-01T10:18:00Z |
| Guardrails  | ./bin/wp audit guardrails | pass             | pass at 2026-07-01T10:18:00Z |
| TPH         | ./bin/wp audit tph        | pass             | pass at 2026-07-01T10:18:00Z |

### Residual Unknowns

None.
