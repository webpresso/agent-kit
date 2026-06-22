---
type: blueprint
title: "secret orchestration schema, provider registry, and sink contracts"
owner: codex
status: completed
complexity: M
created: '2026-06-19'
last_updated: '2026-06-19'
progress: '100% (schema/provider/sink contract slice shipped and verified)'
depends_on: []
cross_repo_depends_on: []
tags:
  - secrets
  - agent-kit
  - schema
  - providers
  - sinks
---

# secret orchestration schema, provider registry, and sink contracts

## Summary

Shipped the first Agent Kit secret-orchestration foundation slice: a pinned
`schemaVersion: 1` secrets schema, explicit built-in provider registry metadata,
provider-neutral sink vocabulary, one `resolveSecretSink(...)` choke point, and
redaction-focused tests for schema diagnostics.

This blueprint records the repo-local execution evidence for Task 1.1 of the
larger cross-repo secret-orchestration ultragoal.

## Tasks

#### [schema] Task 1.1: Add schema, provider registry, and sink planner primitives

**Status:** done

**Depends:** None

Added the first `src/secrets/` contract surface so later CLI/provider/workflow
tasks can build on explicit provider metadata and provider-neutral sink plans
instead of expanding the legacy runtime config shape ad hoc.

**Files:**

- Create: `src/secrets/config/schema.ts`
- Create: `src/secrets/config/schema.test.ts`
- Create: `src/secrets/providers/types.ts`
- Create: `src/secrets/providers/registry.ts`
- Create: `src/secrets/providers/registry.test.ts`
- Create: `src/secrets/sinks/types.ts`
- Create: `src/secrets/sinks/planner.ts`
- Create: `src/secrets/sinks/planner.test.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`

**Acceptance:**

- [x] The pinned `schemaVersion: 1` Doppler fixture validates.
- [x] An Infisical fixture validates.
- [x] Unknown providers and unsupported sinks/ops fail fast.
- [x] Redaction tests cover canary secret values.
- [x] `resolveSecretSink(...)` is the single provider-neutral choke point for this slice.

## Verification

- `./bin/wp lint --file src/secrets`
- `./bin/wp test --file src/secrets/config/schema.test.ts --file src/secrets/providers/registry.test.ts --file src/secrets/sinks/planner.test.ts`
- `./bin/wp typecheck`

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| -- | ----- | -------- |
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-19-secret-orchestration-schema-provider-sink-contracts.md |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| -- | -------- | ------------- | --------------------- | --------- |
| D1 | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| ---- | ------- | ---------------- | ----------- |
| lifecycle | wp audit blueprint-lifecycle | pass | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

None.
