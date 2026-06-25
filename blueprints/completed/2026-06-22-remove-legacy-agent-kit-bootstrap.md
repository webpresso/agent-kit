---
type: blueprint
title: "Remove legacy agent-kit bootstrap templates"
status: completed
complexity: S
owner: agent-kit
created: 2026-06-22
last_updated: 2026-06-22
completed_at: 2026-06-22
---

## Product wedge anchor

- **Stage outcome:** New base-kit consumers get release-safe global `wp` bootstrap without consumer-local agent-kit ownership.
- **Consuming surface:** `wp setup` base-kit scaffold, docs, and runtime repair guidance.
- **New user-visible capability:** Consumers see and generate `vp install -g @webpresso/agent-kit` guidance instead of stale npm/local resolver bootstrap paths.

## Summary

Remove obsolete generated `setup-webpresso` and `resolve-webpresso-cli-versions` base-kit surfaces. Pin base-kit CI's global agent-kit install through `vp`, and align docs/runtime diagnostics with the `wp > vp > pnpm` command contract.

## Tasks

#### Task 1.1: Remove obsolete generated bootstrap surfaces

**Status:** done
**Wave:** 0
**Files:**

- `catalog/base-kit/.github/actions/setup-webpresso/action.yml.tmpl`
- `catalog/base-kit/scripts/resolve-webpresso-cli-versions.cjs.tmpl`
- `src/cli/commands/init/scaffold-base-kit.ts`

**Acceptance:**

- [x] Base-kit no longer contains a local `setup-webpresso` action template.
- [x] Base-kit no longer emits `scripts/resolve-webpresso-cli-versions.cjs`.
- [x] Init e2e tests assert the retired resolver is absent.

#### Task 1.2: Align global install guidance with vp

**Status:** done
**Wave:** 0
**Files:**

- `README.md`
- `docs/README.md`
- `docs/getting-started.md`
- `src/cli/auto-update/detect-pm.ts`
- `src/cli/auto-update/version-skew.ts`
- `src/hooks/doctor.ts`

**Acceptance:**

- [x] Public docs recommend `vp install -g @webpresso/agent-kit`.
- [x] Runtime diagnostics recommend `vp install -g`, not `npm install -g`.
- [x] Tests assert the new guidance.

#### Task 1.3: Keep generated CI deterministic

**Status:** done
**Wave:** 0
**Files:**

- `catalog/base-kit/.github/workflows/ci.yml.tmpl`

**Acceptance:**

- [x] Base-kit CI installs global agent-kit through `vp install -g @webpresso/agent-kit@2.3.2`.
- [x] No base-kit install path uses `agent-kit@latest`.

## Verification

- [x] `wp test --file src/cli/commands/init/scaffold-base-kit.test.ts --file src/cli/commands/init/init.e2e.test.ts --file src/cli/auto-update/detect-pm.test.ts --file src/cli/auto-update/version-skew.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/index.test.ts --file src/audit/consumer-agent-kit-dependency.test.ts`
- [x] `wp sync --check`
- [x] `wp lint`
- [x] `wp typecheck`
- [x] `wp audit secret-provider-quarantine`
- [x] `wp audit cloudflare-deploy-contract`
- [x] `git diff --check`

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                                  |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-22-remove-legacy-agent-kit-bootstrap.md |

### Material Decisions

| ID  | Decision                                                                   | Chosen option                          | Rejected alternatives                                      | Rationale                                                                       |
| --- | -------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| D1  | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate      | Command                      | Expected outcome | Last result                      |
| --------- | ---------------------------- | ---------------- | -------------------------------- |
| lifecycle | wp audit blueprint-lifecycle | pass             | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

None.
