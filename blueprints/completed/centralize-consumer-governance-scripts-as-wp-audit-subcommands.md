---
type: blueprint
title: "centralize-consumer-governance-scripts-as-wp-audit-subcommands"
status: completed
complexity: M
owner: "ozby"
created: 2026-06-12
last_updated: 2026-06-13
---

## Product wedge anchor

- **Stage outcome:** agent-kit 0.34.x — consumer governance parity (Track A/B from extraction roadmap)
- **Consuming surface:** `wp audit secrets-policy`, `wp audit no-dev-vars`, `wp audit secret-provider-quarantine`, `wp audit secrets-config`, `wp test --affected` CLI verbs
- **New user-visible capability:** Consumer repos can delete their copied governance scripts and call `wp audit <kind>` instead; drift between consumers is eliminated at the source.

## Summary

Move the four per-repo governance scripts into `wp audit` subcommands in
`@webpresso/agent-kit`, then update all consumer repos to call the
centralized commands instead of copied scripts. Eliminates per-repo drift
by making the audit logic the single authoritative source in agent-kit.

**Scripts centralized:**

| Old per-repo script | New wp surface | Released in |
|---|---|---|
| `scripts/verify-secrets-policy.ts` | `wp audit secrets-policy` | 0.34.0 |
| `scripts/check-no-dev-vars.ts` | `wp audit no-dev-vars` | 0.34.0 |
| `scripts/audit-secret-provider-quarantine.ts` | `wp audit secret-provider-quarantine` | 0.34.0 |
| `scripts/sync-webpresso-config.ts --check-only` | `wp audit secrets-config` | 0.34.0 |
| `scripts/affected-mutation.ts` | `wp test --affected` | 0.34.0 |

**Patch fix:** 0.34.1/0.34.2 fixed `shouldScanGitFileForSecretValues` to
exclude `.test.*` / `.spec.*` files — `pk-lf-test` and `sk-lf-test`
Langfuse fixture keys were matching `SECRET_VALUE_PATTERN` and blocking
pre-commit in ingest-lens.

## Tasks

#### Task A-1: Add wp audit subcommands in agent-kit

**Status:** completed
**Wave:** 0
**Files:**
- `src/audit/lib/secrets-policy.ts` — shared types + `SECRET_VALUE_PATTERN`
- `src/audit/commands/secrets-policy.ts`
- `src/audit/commands/no-dev-vars.ts`
- `src/audit/commands/secret-provider-quarantine.ts`
- `src/audit/commands/secrets-config.ts`

**Acceptance:**
- [x] All four audit kinds registered in wp audit dispatch
- [x] Gate on `.webpresso/secrets.config.json` presence (graceful degradation)
- [x] Shared types extracted to `src/audit/lib/secrets-policy.ts`
- [x] Released as `@webpresso/agent-kit` 0.34.0

#### Task A-1b: Tests for new audit modules

**Status:** completed
**Wave:** 0
**Files:**
- `src/audit/secrets-policy.test.ts`
- `src/audit/no-dev-vars.test.ts`
- `src/audit/secret-provider-quarantine.test.ts`
- `src/audit/secrets-config.test.ts`

**Acceptance:**
- [x] Colocated vitest tests per module using `mkdtempSync` temp repos
- [x] Test-file exclusion regression test added in 0.34.1

#### Task A-2: wp test --affected for mutation runs

**Status:** completed
**Wave:** 0

**Acceptance:**
- [x] Workspace-aware detection (multi-pkg: apps/packages pattern; single-app: src/ fallback)
- [x] `GITHUB_BASE_REF` respected for base branch in CI

#### Task A-3: Update consumer repos

**Status:** completed
**Wave:** 1
**Repos:** ingest-lens, edge-matte, ozby-dev

**Acceptance:**
- [x] `@webpresso/agent-kit` bumped to `^0.34.2` in all three repos
- [x] Superseded scripts deleted from all three repos
- [x] Pre-commit hooks use `wp audit` commands exclusively
- [x] CI mutation jobs use `wp test --affected`
- [x] `wp audit secrets-policy` / `no-dev-vars` / `secret-provider-quarantine` all pass in all three repos

#### Task B-5/B-6: Governance parity — CI + security-scan

**Status:** completed
**Wave:** 1

**Acceptance:**
- [x] ozby-dev: `.github/workflows/ci.yml`, `security-scan.yml`, `architecture-drift.yml` added
- [x] edge-matte: `.github/workflows/security-scan.yml` added (gitleaks + OSV + secretlint)
- [x] Lore-commit validation in CI for all three repos
- [x] Mutation job in CI for all three repos

## Parity evidence

- `diff -ru` on deleted scripts: N/A (deletion — logic moved, not copied)
- `wp audit secret-provider-quarantine` exit 0 in all three repos: verified 2026-06-13
- `wp audit secrets-policy` exit 0 in all three repos: verified 2026-06-13 (0.34.2 test-file exclusion fix)

## Verification standard

Byte-identity not applicable (scripts deleted, not relocated). Behavioral
parity confirmed by the new tests in agent-kit and by all three consumer
repos passing their pre-commit `wp audit` gates.

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
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/centralize-consumer-governance-scripts-as-wp-audit-subcommands.md |

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
