---
type: blueprint
title: "Fix agent-kit release finalization gating for GitHub releases and runtime assets"
owner: ozby
status: completed
complexity: M
created: '2026-06-11'
last_updated: '2026-06-11'
progress: '100% (completed)'
depends_on: []
cross_repo_depends_on: []
tags:
  - release
  - github-actions
  - runtime-binaries
---

# Fix agent-kit release finalization gating for GitHub releases and runtime assets

**Goal:** fix agent-kit release finalization gating for GitHub releases and runtime assets

## Planning Summary

- Root cause: `.github/workflows/release.yml` treated a one-shot `npm view` read as the source of truth for whether post-publish release finalization should run.
- Repair: gate all post-publish release/tag/compatibility-branch/runtime-asset steps on `steps.changesets.outputs.published == 'true'`, keep registry probing as bounded diagnostic-only evidence, and fail loudly if release finalization is incomplete after publish.
- Regression proof: strengthen `src/build/auth-preflight-packages.test.ts` so the workflow cannot regress to `publish_probe`-gated release finalization.

## Architecture Overview

```text
changesets/action publish output
        |
        v
post-publish release finalization
  - resolve version/tag metadata
  - create + verify v<version> tag
  - create/skip compatibility branch with explicit status
  - build 5 runtime binaries
  - create/update GitHub Release
  - verify uploaded assets
  - assert full release-finalization contract
```

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Publish-success gate | `steps.changesets.outputs.published` | Changesets owns the publish contract; npm registry visibility is eventually consistent. |
| Registry confirmation | bounded warning-only probe | Keeps diagnostics without allowing a false negative to suppress release finalization. |
| Failure mode | explicit post-publish assertion step | Prevents a green workflow when publish happened but tag/release/assets did not. |

## Quick Reference (Execution Waves)

| Wave              | Tasks | Dependencies | Parallelizable |
| ----------------- | ----- | ------------ | -------------- |
| **Wave 0**        | 1.1   | None         | 1 agent        |
| **Critical path** | 1.1   | --           | 1 wave         |

**Note:** Use t-shirt sizing (XS/S/M/L/XL) for individual task estimates, NOT day/week estimates.

**Lifecycle:** Blueprint frontmatter `status` is one of `draft`, `planned`, `parked`, `in-progress`, `completed`, `archived`. Use `parked` when the blueprint is intentionally paused but should remain distinct from active planning or abandoned work. There is no blueprint-level `blocked` status; when work waits on an external dependency, set the task **Status:** to `blocked` and add a non-empty **Blocked:** line with the reason.

> [!NOTE]
> This template reflects the current preferred blueprint structure. Repo-wide validity is determined by the live blueprint parser/audit rules, so older blueprints may still use a different-but-valid section mix.

### Phase 1: Release finalization gating repair [Complexity: M]

#### [infra] Task 1.1: Move release finalization ownership to Changesets publish output

> **Task header (current accepted form):** Use `#### [lane] Task X.Y:` when the task has a clear lane (`[schema]`, `[backend]`, `[ui]`, `[infra]`, `[docs]`, `[qa]`). `#### Task X.Y:` is still valid, but lane-prefixed headers are preferred in new blueprints.

**Status:** done

**Depends:** None

Replace the release workflow’s post-publish gate so the GitHub Release/tag/runtime
asset path runs whenever `changesets/action` says a publish occurred. Preserve the
existing runtime-binary architecture, keep any npm registry probe diagnostic-only,
and add a final assertion step that fails the workflow if publish succeeded but
release finalization did not produce the expected tag, compatibility branch status,
GitHub Release, and 5 runtime assets.

**Files:**

- Modify: `.github/workflows/release.yml`
- Modify: `src/build/auth-preflight-packages.test.ts`

**Steps (TDD):**

1. Strengthen the workflow contract test so it rejects `publish_probe` gating and expects `steps.changesets.outputs.published`.
2. Update `release.yml` to move every post-publish step to the Changesets output gate.
3. Add diagnostic-only bounded registry visibility probing.
4. Add explicit release verification and a final assertion step for loud failure semantics.
5. Re-run scoped tests and workflow linting.

**Acceptance:**

- [x] Post-publish steps gate on `steps.changesets.outputs.published == 'true'`
- [x] Registry probing is diagnostic-only
- [x] Workflow asserts tag/branch/release/assets after publish
- [x] Workflow contract tests and scoped lint pass

---

## Verification Gates

| Gate        | Command                            | Success Criteria |
| ----------- | ---------------------------------- | ---------------- |
| Lint        | `wp_lint` on `src/build/auth-preflight-packages.test.ts` | Zero violations |
| Tests       | `wp_test` on `src/build/auth-preflight-packages.test.ts`, `scripts/public-readiness.test.ts` | All pass |
| Workflow lint | `actionlint .github/workflows/release.yml` | Zero errors |

## Cross-Plan References

| Type       | Blueprint | Relationship |
| ---------- | --------- | ------------ |
| Upstream   | None      |              |
| Downstream | None      |              |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --------- | ---- | -------- | ---- |
| npm registry visibility lags publish | False negative suppresses release finalization | Keep probing as warning-only, never the primary gate | 1.1 |
| Release rerun after partial finalization | Duplicate branch/release mutations | Record explicit compatibility-branch status and use create-or-upload release logic | 1.1 |

## Non-goals

- Backfilling the missing `v0.31.0` GitHub Release manually
- Redesigning runtime packaging or changing the target matrix

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Final assertion becomes too strict for reruns | Legitimate rerun fails | Allow explicit compatibility-branch terminal states (`created`, `existing`, `skipped-no-dist`) and verify release assets idempotently. |

## Technology Choices

| Component | Technology | Version | Why |
| --------- | ---------- | ------- | --- |
| Workflow orchestration | GitHub Actions + `changesets/action` | current | Owns the publish contract and exposes the canonical `published` output. |

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
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/fix-agent-kit-release-finalization-gating-for-github-releases-and-runtime-assets.md |

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
