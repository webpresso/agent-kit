---
type: blueprint
title: Main CI and release follow-ups after consumer Changesets rollout
status: completed
historical_zero_task_waiver: true
historical_zero_task_rationale: 'Historical completed record created before strict task-block requirements; preserved as an audited zero-task completion note.'
complexity: M
owner: agent-kit
created: '2026-06-17'
last_updated: '2026-06-17'
progress: '100% (completed 2026-06-17)'
tags:
  - ci
  - release
  - changesets
  - package-surface
  - scaffolding
completed_at: '2026-06-17'
---

# Main CI and release follow-ups after consumer Changesets rollout

## Summary

Repair the post-merge regressions uncovered after the consumer Changesets
rollout: keep the scaffolded reusable workflow pin aligned with the merged
public host SHA, reduce GitHub-hosted Release billing by running only on real
release-surface changes, and keep the packed public tarball installable by
rewriting local workspace package specifiers while stripping devDependencies
from the published manifest.

## Acceptance

- [x] The shared base-kit release workflow template pins the merged public
      reusable workflow SHA.
- [x] The main Release workflow avoids GitHub-hosted starts on ordinary
      non-release pushes.
- [x] Packed manifests resolve publishable internal workspace package versions.
- [x] Packed public tarballs omit devDependencies from the install surface.

## Verification

- `./bin/wp lint --file src/build/package-manifest.ts --file src/build/package-manifest.test.ts --file src/build/auth-preflight-packages.test.ts --file src/cli/commands/init/scaffold-base-kit.test.ts --file .github/workflows/release.yml --file package.contract.integration.test.ts --file src/cli/commands/init/init.integration.test.ts`
- `./bin/wp typecheck`
- `pnpm install --frozen-lockfile`
- `pnpm exec vitest run src/build/package-manifest.test.ts src/build/auth-preflight-packages.test.ts src/cli/commands/init/scaffold-base-kit.test.ts package.contract.integration.test.ts src/cli/commands/init/init.integration.test.ts`

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
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-17-main-ci-release-followups.md |

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
