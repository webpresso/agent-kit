---
type: blueprint
title: Blueprint transition frontmatter scan
owner: agent-kit
status: completed
complexity: S
created: '2026-06-21'
last_updated: '2026-06-21'
progress: '100% (completed)'
depends_on: []
cross_repo_depends_on: []
tags: ['audit', 'blueprint-lifecycle', 'regression']
---

# Blueprint transition frontmatter scan

**Goal:** Prevent `wp audit blueprint-lifecycle` from treating body `status:` lines in markdown patches as lifecycle frontmatter transitions.

## Planning Summary

- Trigger: Claude review of PR #228 flagged that raw `git log -p` scanning could misread fenced code/body `status:` lines.
- Outcome: Confirmed with a regression fixture, then constrained patch status extraction to the leading YAML frontmatter line range.
- Scope: `src/audit/blueprint-lifecycle-sql.ts` and its focused test harness.

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Parse by hunk line range | Track `@@ -old +new @@` positions and only accept `status:` changes within the current document's leading frontmatter range. | Restores frontmatter-aware behavior without returning to per-revision `git show` subprocesses. |
| Keep time budget advisory | No change. | Repo policy requires bounded, degradable discovery paths rather than raising timeouts or hard-failing slow history scans. |
| Leave org cache as process-local | No change. | Cache is keyed by git root, covered by tests, and intended for short-lived CLI/bulk parser runs. |
| Make fake git tests sequential | Mark the lifecycle suite and tests sequential while keeping the fast fake git wrapper. | The helper mutates `PATH`; sequential tests remove cross-test interference without raising timeouts. |

## Phase 1: Frontmatter-only transition extraction [Complexity: S]

#### [qa] Task 1.1: Reproduce body `status:` false positive

**Status:** done

**Depends:** None

Add a lifecycle audit regression where the current blueprint has `status: in-progress` in frontmatter and a fenced body `status: in-progress` snippet, while fake `git log -p` reports only a body hunk changing `status: archived` to `status: in-progress`.

**Files:**

- Modify: `src/audit/blueprint-lifecycle-sql.test.ts`

**Acceptance:**

- [x] Regression would fail before the parser fix.
- [x] Existing legal and illegal frontmatter transition fixtures remain meaningful.

#### [backend] Task 1.2: Scope patch status parsing to frontmatter

**Status:** done

**Depends:** Task 1.1

Track patch hunk old/new line numbers and ignore `status:` additions/removals outside the leading YAML frontmatter range of the current markdown file.

**Files:**

- Modify: `src/audit/blueprint-lifecycle-sql.ts`

**Acceptance:**

- [x] Body status-looking hunks are ignored.
- [x] Frontmatter lifecycle history still rejects illegal transitions.
- [x] Frontmatter lifecycle history still allows legal transitions.


#### [qa] Task 1.3: Remove fake git cross-test interference

**Status:** done

**Depends:** Task 1.1

Make the stateful lifecycle test file sequential because its fake git helper intentionally mutates process-level `PATH` for bounded subprocess simulation.

**Files:**

- Modify: `src/audit/blueprint-lifecycle-sql.test.ts`

**Acceptance:**

- [x] Full lifecycle/parser slice passes without raising timeouts.
- [x] Fake git helper preflights `rev-parse`, `log -1`, and custom patch output before running audit assertions.

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Focused regression | `./node_modules/.bin/vitest run src/audit/blueprint-lifecycle-sql.test.ts -t 'ignores body status-looking patch lines' --reporter=verbose` | Body `status:` fixture passes. |
| Transition history slice | `./node_modules/.bin/vitest run src/audit/blueprint-lifecycle-sql.test.ts -t 'flags an illegal lifecycle transition|allows a legal lifecycle transition|allows planned blueprints to complete directly|rejects direct planned-to-completed|ignores body status-looking patch lines' --reporter=verbose` | Legal/illegal transition behavior preserved. |
| Blueprint lifecycle | `./bin/wp audit blueprint-lifecycle` | Blueprint and audit remain valid. |
| Blueprint coverage | `./bin/wp audit blueprint-pr-coverage` | Non-doc PR is covered by this blueprint. |
| Type safety | `./bin/wp typecheck` | Zero errors. |
| Lint | `./bin/wp lint` | Zero violations. |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --------- | ---- | -------- | ---- |
| Body fenced YAML includes `status:` | False illegal transition blocks CI. | Ignore patch status lines outside frontmatter hunk line range. | 1.1, 1.2 |
| Hunk line metadata unavailable | Could miss a transition in unexpected diff format. | Preserve previous permissive behavior only when no hunk position is available. | 1.2 |
| Slow git history scan | CI hang or timeout. | Keep existing advisory time budget behavior. | Non-goal |

## Non-goals

- Reworking the transition-history time budget policy.
- Changing or replacing process-local organization caching.

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Over-filtering real frontmatter transitions | Illegal lifecycle moves could be missed. | Keep existing illegal/legal transition tests and line-number-aware fake patches. |
| Patch line counting drift | Hunk parsing could misclassify lines. | Count old/new hunk positions for removed, added, and context lines. |
| Fake git PATH leakage | Full-file tests can observe the wrong git shim. | Mark stateful lifecycle tests sequential and keep helper preflights. |

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
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-21-blueprint-transition-frontmatter-scan.md |

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
