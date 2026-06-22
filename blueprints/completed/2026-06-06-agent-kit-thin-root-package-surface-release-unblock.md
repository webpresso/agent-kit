---
type: blueprint
title: Agent-kit thin-root package-surface release unblock
owner: ozby
status: completed
completed_at: '2026-06-07'
complexity: M
created: '2026-06-06'
last_updated: '2026-06-07'
progress: '100% (thin-root pack surface shipped; public-readiness and package-surface pass on the staged tree; remote tag and npm registry confirm the hosted Release published @webpresso/agent-kit@0.29.3 without the old ERR_STRING_TOO_LONG blocker)'
depends_on: []
tags:
  - distribution
  - native-runtime
  - package-surface
  - release
  - npm
---

# Agent-kit thin-root package-surface release unblock

## Product wedge anchor

- **Stage outcome:** unblock `@webpresso/agent-kit` publish by converting the root tarball from the current hybrid/C surface to a thin-root Option B surface.
- **Consuming surface:** root package tarball (`package.json#files`, staged `bin/`, staged `dist/`), `scripts/public-readiness.ts`, and `src/audit/package-surface.ts`.
- **New user-visible capability:** `npm publish` / hosted `Release` can publish `@webpresso/agent-kit` without packing the runtime matrix into the root tarball, while the runtime packages remain the sole owners of native binaries.

## Planning Summary

The current `Release` blocker is no longer npm permissions; it is the oversized root tarball for
`@webpresso/agent-kit`. On the failed 2026-06-06 release attempt, the root package packed staged
runtime payloads from:

- `bin/runtime/**`
- `dist/runtime/**`
- `dist/runtime-packages/**`

and produced a root tarball large enough to fail publish with `ERR_STRING_TOO_LONG`.

This leak is **staged-state dependent**. A clean checkout can false-green because the denied paths
appear only after `vp run build:runtime-binaries` and `vp run stage:plugin-runtime` populate the
publishable `bin/` + `dist/` trees. All verification in this blueprint must therefore run against a
**staged runtime tree**, not an unstaged checkout.

The target contract is true thin-root Option B:

- root package keeps a real staged `bin/wp`
- root package may temporarily keep `bin/runtime-manifest.json` for compatibility during this release
  unblock
- runtime packages remain the only carriers of platform binaries
- packed root tarball must deny:
  - `bin/runtime/**`
  - `dist/runtime/**`
  - `dist/runtime-packages/**`

The planned hardening blueprint remains downstream residual work. The active in-progress runtime
blueprint stays the canonical upstream owner of the end-to-end native cutover, but its publish task
is blocked until this thin-root package-surface cutover lands.

> **Architecture note (2026-06-07).** This completed blueprint remains the canonical
> root-package thin-root decision: root `package.json#bin.wp` stays `bin/wp`, the
> root package keeps a real root launcher while native payload ownership stays
> externalized, and the root tarball must not repack runtime payload trees.
> Future launcher-policy cleanup belongs to
> `blueprints/completed/2026-06-07-root-launcher-contract-and-hook-ownership-alignment.md`;
> do not reopen or demote this completed release-unblock lane for that follow-up.

## Architecture Overview

```text
Before (hybrid/C)
  root files => bin/** + dist/**
            => captures staged runtime payloads
            => publish root tarball duplicates runtime matrix

After (thin-root B)
  root files => real bin/wp + root JS/assets + prepared manifest
            => runtime packages listed in optionalDependencies
            => no packed bin/runtime/**, dist/runtime/**, dist/runtime-packages/**
```

## Key Decisions

| Decision | Rationale |
| --- | --- |
| All tarball proofs run against a staged runtime tree. | Unstaged pack checks can miss the real leak. |
| Deny `bin/runtime/**`, `dist/runtime/**`, and `dist/runtime-packages/**` from the root tarball. | These are the duplicated runtime payload classes that caused the publish failure. |
| Keep `bin/wp` as a **real file, not a symlink**. | Current launcher/package-surface policy depends on a real staged launcher in the root package. |
| Prove runtime optional dependencies against the **actual prepared/prepack manifest**, not only `createPackedManifest(...)`. | In-memory helper proof can false-green if the prepare/restore path regresses. |
| Re-anchor tarball-size budgets to measured staged thin-root output with ≤10% headroom. | Existing fat-tarball budgets would allow a false-green migration. |
| Do not create new audit surfaces. | Reuse `public-readiness`, `package-surface`, and package-manifest proof lanes already present in-repo. |

## Fact Check Findings

| ID | Severity | Claim | Verified reality | Blueprint fix |
| --- | --- | --- | --- | --- |
| F1 | CRITICAL | Root tarball leakage can be proven from a clean checkout. | False. Leak paths appear only after runtime build + stage populate `bin/`/`dist/`. | Make staged build+stage a prerequisite for every tarball proof in this blueprint. |
| F2 | CRITICAL | Current audits already reject all leaked runtime payload trees. | False. Current root proof lanes still positively require hybrid/C runtime paths and do not deny every leaked staged path class. | Replace positive root-runtime requirements with thin-root negative assertions. |
| F3 | CRITICAL | Runtime optional dependencies are already fully proven. | False. Current proof can stop at `createPackedManifest(...)` without proving the actual prepack rewrite. | Add prepared-manifest proof against the rewritten root `package.json`. |
| F4 | HIGH | Root tarball leakage is only `dist/runtime-packages/**`. | Incomplete. The staged leak classes also include `bin/runtime/**` and `dist/runtime/**`. | Explicitly list all denied path classes in tasks and acceptance. |
| F5 | HIGH | The release blocker is still package publish permission. | No longer true. Runtime package bootstrap/publisher access is fixed; current blocker is the oversized root tarball. | Focus this blueprint exclusively on root package-surface cutover. |
| F6 | MEDIUM | Source `package.json` already contains runtime optional dependencies. | False. Runtime packages are injected in the prepared/packed manifest path. | Verify prepared manifest content, not source manifest content. |

## Cross-references

- **Upstream:** `blueprints/completed/2026-06-01-agent-kit-global-distribution-mcp-runtime-fix.md`
  — owns the native runtime cutover, but Task 1.5 is blocked until this blueprint lands.
- **Downstream:** `blueprints/completed/2026-06-01-claude-plugin-native-runtime-hardening.md`
  — launcher-diagnostics / installed-plugin residual after publish is unblocked.

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| --- | --- | --- | --- | --- |
| Wave 0 | 1.0 | None | 1 agent | XS |
| Wave 1 | 1.1 | Wave 0 | 1 agent | M |
| Wave 2 | 1.2 | Wave 1 | 1 agent | M |
| Wave 3 | 1.3 | Wave 2 | 1 agent | S |
| Critical path | 1.0 → 1.1 → 1.2 → 1.3 | — | 4 waves | M |

### Phase 1: root tarball cutover [Complexity: M]

#### [plan] Task 1.0: Align active blueprint references with the thin-root blocker

**Status:** done

**Depends:** None

The active runtime blueprint and README must truthfully name this thin-root package-surface cutover
as the first blocker before publish/cutover proof.

**Files:**

- Modify: `blueprints/completed/2026-06-01-agent-kit-global-distribution-mcp-runtime-fix.md`
- Modify: `blueprints/completed/2026-06-01-claude-plugin-native-runtime-hardening.md`
- Modify: `blueprints/README.md`

**Acceptance:**

- [x] Active runtime blueprint explicitly blocks publish/cutover on this thin-root cutover.
- [x] Planned hardening blueprint is reframed as downstream residual, not competing root-tarball policy.
- [x] README truthfully names the thin-root blocker and the planned follow-on blueprint.

#### [packaging] Task 1.1: Remove staged runtime payloads from the root tarball

**Status:** done

**Depends:** Task 1.0

Update the root publish surface so the staged runtime matrix is no longer captured by the root
tarball. This task owns only the root files/staging boundary; it does **not** own audit/test-lane
changes.

**Files:**

- Modify: `package.json`
- Modify: `scripts/stage-plugin-runtime-artifacts.ts`

**Steps (TDD):**

1. Run `vp run build:runtime-binaries && vp run stage:plugin-runtime && npm pack --dry-run --json`
   and capture the staged leaking paths.
2. Update root `package.json#files` and/or runtime staging destinations so the root pack surface no
   longer captures:
   - `bin/runtime/<target>/wp|wp.exe`
   - `dist/runtime/<target>/wp|wp.exe`
   - `dist/runtime-packages/<pkg>/bin/wp|wp.exe`
   - `dist/runtime-packages/<pkg>/package.json`
3. Re-run `vp run build:runtime-binaries && vp run stage:plugin-runtime && npm pack --dry-run --json`
   and verify the denied prefixes are absent while `bin/wp` remains present as a real file.
4. Record the measured staged thin-root tarball size + unpacked size for Task 1.2 budget updates.

**Acceptance:**

- [x] Root `package.json#files` no longer captures runtime-package staging output.
- [x] Packed root tarball contains no `bin/runtime/**`, `dist/runtime/**`, or `dist/runtime-packages/**`.
- [x] Packed root tarball still contains `bin/wp` as a **real file**, not a symlink.
- [x] The measured staged tarball size / unpacked size baseline is recorded for policy updates.

#### [audit] Task 1.2: Re-scope proof lanes to the thin-root contract

**Status:** done

**Depends:** Task 1.1

Replace the current hybrid/C proof assumptions in public-readiness, package-surface, and package-manifest
with thin-root assertions, using the staged thin-root measurement from Task 1.1.

**Files:**

- Modify: `scripts/public-readiness.ts`
- Modify: `scripts/public-readiness.test.ts`
- Modify: `src/audit/package-surface.ts`
- Modify: `src/audit/package-surface.test.ts`
- Modify: `src/build/package-manifest.ts`
- Modify: `src/build/package-manifest.test.ts`
- Modify: `src/build/runtime-surface-policy.ts`

**Steps (TDD):**

1. Add failing tests/proofs that:
   - reject any packed `bin/runtime/**`, `dist/runtime/**`, or `dist/runtime-packages/**`
   - preserve positive checks for `bin/wp` as a real file
   - verify the actual prepared/prepack root `package.json` contains all 5 runtime optional dependencies
   - verify tarball-size assertions use the measured staged thin-root size/unpacked size plus ≤10% headroom
2. Run the scoped tests, including the tarball-size assertions in
   `scripts/public-readiness.test.ts` and `src/audit/package-surface.test.ts`:
   `wp test --file scripts/public-readiness.test.ts --file src/audit/package-surface.test.ts --file src/build/package-manifest.test.ts`
3. Implement only the proof-lane changes needed to pass.
4. Re-run:
   - `vp run build:runtime-binaries && vp run stage:plugin-runtime && wp test --file scripts/public-readiness.test.ts --file src/audit/package-surface.test.ts --file src/build/package-manifest.test.ts`
   - `vp run build:runtime-binaries && vp run stage:plugin-runtime && vp run public:readiness`
   - `vp run build:runtime-binaries && vp run stage:plugin-runtime && wp audit package-surface`

**Acceptance:**

- [x] Public-readiness and package-surface fail on any packed `bin/runtime/**`, `dist/runtime/**`, or `dist/runtime-packages/**`.
- [x] Positive root checks are limited to `bin/wp` and the explicit `bin/runtime-manifest.json` decision.
- [x] The actual prepared/prepack root `package.json` contains all 5 `@webpresso/agent-kit-runtime-*` optional dependencies.
- [x] Tarball-size budgets are anchored to the staged thin-root measurement, not the old fat-tarball constants.

#### [release] Task 1.3: Prove the thin-root surface locally and rerun hosted Release

**Status:** done
**Done (2026-06-07):** local staged proof remained green, `bun scripts/public-readiness.ts` passed,
and read-only release evidence now exists: remote tag `v0.29.3` plus npm registry `latest=0.29.3`
for `@webpresso/agent-kit` confirm the hosted Release completed without reintroducing the old
root-tarball failure mode.

**Depends:** Task 1.2

Use the staged thin-root proof lane locally, then rerun the hosted `Release` workflow to verify the
publish blocker is actually gone.

**Files:**

- Modify: none (verification-only)

**Steps (TDD):**

1. Run the staged local proof lane:
   - staged launcher presence: `bin/wp` real file
   - thin-root payload exclusion: no packed `bin/runtime/**`, `dist/runtime/**`, `dist/runtime-packages/**`
2. Trigger hosted `Release` on `main` after the thin-root changes merge.
3. Confirm the root package publish step completes without `ERR_STRING_TOO_LONG` or a new
   package-surface / tarball-size failure.

**Acceptance:**

- [x] All tarball proofs run against a staged runtime tree, not an unstaged checkout.
- [x] Hosted `Release` completed publish of `@webpresso/agent-kit@0.29.3` on `main`; the root package no longer failed with `ERR_STRING_TOO_LONG` or a new package-surface/tarball-size error.

## Verification Gates

| Gate | Command | Success Criteria |
| --- | --- | --- |
| Staged pack surface | `vp run build:runtime-binaries && vp run stage:plugin-runtime && npm pack --dry-run --json` | No packed `bin/runtime/**`, `dist/runtime/**`, or `dist/runtime-packages/**`; `bin/wp` present |
| Scoped tests | `wp test --file scripts/public-readiness.test.ts --file src/audit/package-surface.test.ts --file src/build/package-manifest.test.ts` | All targeted tests pass |
| Public readiness | `vp run build:runtime-binaries && vp run stage:plugin-runtime && vp run public:readiness` | Thin-root readiness passes on staged tree |
| Package surface | `vp run build:runtime-binaries && vp run stage:plugin-runtime && wp audit package-surface` | Thin-root package-surface audit passes on staged tree |
| Hosted release | `gh run rerun <release-run-id>` | Root package publish completes without tarball/package-surface failure |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --- | --- | --- | --- |
| Running proofs on an unstaged checkout | False-green leak detection | Require build+stage before every pack/readiness/package-surface proof | 1.1, 1.2, 1.3 |
| Windows runtime filenames use `wp.exe` | Partial deny-path coverage | Define payload classes as `wp|wp.exe` in tasks/tests | 1.1, 1.2 |
| Prepared manifest path regresses while helper output still passes | Missing runtime optional deps at publish time | Verify the actual prepared/prepack root manifest, not only helper output | 1.2 |
| Stale blueprint gating path in `public-readiness.ts` | Readiness points at obsolete plan | Repoint readiness to the active thin-root/canonical blueprint set | 1.2 |

## Non-goals

- Redesigning the runtime-package matrix itself
- Replacing the current `bin/wp` launcher contract
- Changing user-facing package names or the Claude plugin MCP server name

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| `bin/runtime-manifest.json` is removed too early | Could break current diagnostics/launcher assumptions | Keep the manifest decision explicit in Task 1.2; preserve it for this unblock unless proof shows it is unnecessary |
| Root staging still writes into publishable trees after `files` changes | Root tarball can still bloat on future releases | Task 1.1 owns both `files` and staging destination decisions |
| Hosted release fails for a different post-packaging reason | Tarball fix alone may not finish the ship lane | Keep Task 1.3 acceptance specific to root publish completion and fold any new blocker back into the canonical runtime blueprint |

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
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-06-agent-kit-thin-root-package-surface-release-unblock.md |

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
