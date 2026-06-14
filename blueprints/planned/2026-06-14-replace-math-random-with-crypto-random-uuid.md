---
type: blueprint
title: Replace Math.random with crypto-derived IDs
owner: ozby
status: planned
complexity: S
created: '2026-06-14'
last_updated: '2026-06-14'
progress: '0% (0/3 tasks done, 0 blocked)'
depends_on: []
cross_repo_depends_on: []
tags:
  - security
  - crypto
  - id-generation
  - temp-files
worktree_owner_id: ''
worktree_owner_branch: ''
---

# Replace Math.random with crypto-derived IDs

**Goal:** Replace all `Math.random()` usages in production `src/` code with
`node:crypto`-backed identifiers (`crypto.randomBytes` or `crypto.randomUUID`).
Current usages are not security-critical (ids, temp paths, suffixes), but
predictable PRNG output is a hardening gap — local symlink attacks on
predictable temp paths are the most realistic vector.

## Refinement Summary

| Metric | Value |
| --- | --- |
| Findings total | 4 |
| Critical | 0 |
| High | 0 |
| Medium | 1 (F3: predictable temp paths) |
| Low | 3 |
| Fixes applied | 4/4 |
| Cross-plans updated | 0 |
| Edge cases documented | 4 |
| Risks documented | 2 |
| **Parallelization score** | B (CPR=2.0, below 2.5 target but inherent to sequenced S-complexity plan) |
| **Critical path** | 2 waves |
| **Max parallel agents** | 2 (Wave 1) |
| **Total tasks** | 3 |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| --- | --- | --- | --- | --- |
| **Wave 0** | 1.1 | None | 1 agent | S |
| **Wave 1** | 2.1, 2.2 | 1.1 | 2 agents | XS, XS |
| **Wave 2** | 3.1 | 2.1, 2.2 | 1 agent | XS |
| **Critical path** | 1.1 → 2.1/2.2 → 3.1 | — | 2 waves | S |

## Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| --- | --- | --- | --- |
| RW0 | Ready tasks in Wave 0 | ≥ planned/2 | 1 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 4/2 = 2.0 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 3/4 = 0.75 |
| CP | same-file overlaps per wave | 0 | 0 |

**Refinement delta:** CPR misses 2.5 target because Wave 0 has a single
dependency-free task (helper creation) and all replacements are gated on it.
This is inherent for a 3-task S-complexity security hardening — splitting
the helper into smaller units would add overhead without parallelism. Accept.

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality |
| --- | --- | --- | --- |
| F1 | LOW | `Math.random()` used 10+ times across 8+ production files. | **Confirmed.** 10 usages across exactly 8 non-test `src/**/*.ts` files. Verified via `grep -rn "Math\.random" src --include="*.ts"` (excluding `*.test.ts`). Full list below. |
| F2 | LOW | None of these uses are security-sensitive (no auth tokens or session IDs). | **Confirmed.** All 10 usages generate: row/session ids, temp-file suffixes, worktree short suffixes, checkpoint/thread identifiers. No auth tokens, secrets, or session-cookie generation. |
| F3 | MEDIUM | Predictable temp paths can enable local symlink attacks if the directory is world-writable. | **Risk remains valid.** The `quality-log-store.ts`, `migrate-command.ts`, and `mutations.ts` usages write to temp paths under writable directories. `crypto.randomUUID()` or `crypto.randomBytes()` eliminates the predictability vector. |
| F4 | LOW | `crypto.randomUUID()` is available in Node 24. | **Confirmed.** `crypto.randomUUID()` is available since Node 14.17.0 (v15.6.0 for the global alias). Node runtime: v24.16.0. `crypto.randomBytes()` is also available and preferred for short-ID generation (arbitrary length, base64url encoding). |

## Production Math.random Inventory

| # | File | Line | Pattern | Replacement Strategy |
| --- | --- | --- | --- | --- |
| 1 | `src/ai-memory/checkpoint/saver.ts` | 52 | `Math.random().toString(36).substring(2, 10)` | `shortId(8)` |
| 2 | `src/ai-memory/checkpoint/saver.ts` | 58 | `Math.random().toString(36).substring(2, 10)` | `shortId(8)` |
| 3 | `src/ai-memory/facts/extractor.ts` | 145 | `Math.random().toString(36).substring(2, 8)` | `shortId(6)` |
| 4 | `src/ai-memory/store/sqlite-store.ts` | 93 | `Math.random().toString(36).slice(2, 10)` | `shortId(8)` |
| 5 | `src/cli/commands/quality-log-store.ts` | 200 | `Math.random().toString(36).slice(2)` | `tempSuffix()` |
| 6 | `src/cli/commands/quality-log-store.ts` | 277 | `Math.random().toString(36).slice(2, 8)` | `shortId(6)` |
| 7 | `src/cli/commands/blueprint/mutations.ts` | 209 | `Math.random().toString(36).slice(2)` | `tempSuffix()` |
| 8 | `src/cli/commands/worktree/router-dispatch.ts` | 111 | `Math.random().toString(36).slice(2, 5).padEnd(3, '0')` | `shortId(3)` |
| 9 | `src/config/docs-lint/cli/commands/migrate-command.ts` | 316 | `Math.random().toString(36).slice(2)` | `tempSuffix()` |
| 10 | `src/session-memory/session.ts` | 117 | `Math.random().toString(36).slice(2, 10)` | `shortId(8)` |

Additionally, 49 test-file usages across 47 `*.test.ts` files follow the same
`Date.now() + Math.random()` temp-path pattern. A follow-up task replaces
these for consistency.

## Edge Cases

| # | Case | Handling |
| --- | --- | --- |
| E1 | `shortId(3)` returns fewer than 3 chars after base64url encoding. | `crypto.randomBytes(n)` returns exactly `n` bytes; `toString('base64url')` expands to ~4.3 chars for 3 bytes — pad or reject `length < 4`. |
| E2 | Tests assert exact ID strings (e.g., regex or fixture snapshots). | Update test expectations to match the new format or use length/character-set assertions. |
| E3 | `tempSuffix()` uses `Date.now()` which is still predictable — only the random part is hardened. | Accept: `Date.now()` provides ordering, `crypto.randomBytes` provides uniqueness. Combined entropy exceeds 48 bits. |
| E4 | `crypto.randomBytes` may throw if entropy pool is exhausted (extremely rare on modern kernels). | Wrap in try/catch with fallback to `crypto.randomUUID()` — but this should never fire under normal operation. |

## Risks

| Risk | Mitigation |
| --- | --- |
| `shortId` collides with prior IDs in the same system. | 8 base64url chars = 48 bits of entropy; birthday-problem collision probability is ~1/2^(48/2) ≈ 1/16M per pair. Project-local scope makes this negligible. |
| Behavior change in tests asserting exact ID format. | Use `expect(id).toMatch(/^[A-Za-z0-9_-]+$/)` instead of exact-string matchers. Update any snapshot fixtures. |

## Tasks

### [security] Task 1.1: Create short-id crypto helper

**Status:** todo

**Depends:** None

Create a shared utility module that wraps `node:crypto.randomBytes` for
short, URL-safe identifier generation. This is the single point of change
— all callers switch from `Math.random()` to this helper.

**Files:**

- Create: `src/utils/short-id.ts`
- Create: `src/utils/short-id.test.ts`

**Steps (TDD):**

1. Write failing tests in `src/utils/short-id.test.ts`:
   - `shortId(8)` returns exactly 8 base64url characters, no `=` padding.
   - `shortId(4)` throws or clamps if `length < 4` (minimum 3 bytes).
   - `shortId()` with no argument defaults to 8.
   - Two consecutive calls return different values.
   - `tempSuffix()` returns a string matching `^[0-9a-z]+_[\w-]+$`.
2. Run: `./bin/wp test --file src/utils/short-id.test.ts` — verify FAIL.
3. Implement `src/utils/short-id.ts`:
   - `shortId(length = 8): string` → `crypto.randomBytes(Math.ceil(length * 0.75)).toString('base64url').slice(0, length)`.
   - `tempSuffix(): string` → `Date.now().toString(36) + '_' + shortId(8)`.
4. Run: `./bin/wp test --file src/utils/short-id.test.ts` — verify PASS.
5. Run: `./bin/wp lint` on the two files, then `./bin/wp typecheck`.

**Acceptance:**

- [ ] Helper imports only from `node:crypto`.
- [ ] No `Math.random` in helper source or test.
- [ ] Tests cover uniqueness, length, character set, and edge cases.
- [ ] `./bin/wp lint` passes on `src/utils/short-id.ts` and `src/utils/short-id.test.ts`.
- [ ] `./bin/wp typecheck` passes.

---

### [crypto] Task 2.1: Replace Math.random in ai-memory subsystem

**Status:** todo

**Depends:** Task 1.1

Replace all `Math.random()` calls in the `src/ai-memory/` directory with the
new `shortId()` helper. These are all SQLite row IDs and checkpoint identifiers
— low-risk, well-isolated from other subsystems.

**Files:**

- Modify: `src/ai-memory/checkpoint/saver.ts`
- Modify: `src/ai-memory/facts/extractor.ts`
- Modify: `src/ai-memory/store/sqlite-store.ts`

**Steps (TDD):**

1. For each file, identify the `Math.random()` line(s) from the inventory table.
2. Import `shortId` from `../../utils/short-id.js` (adjust relative path per file).
3. Replace: `Math.random().toString(36).substring(2, N)` → `shortId(N-2)`.
   - `saver.ts:52,58`: `substring(2, 10)` → `shortId(8)`.
   - `extractor.ts:145`: `substring(2, 8)` → `shortId(6)`.
   - `sqlite-store.ts:93`: `slice(2, 10)` → `shortId(8)`.
4. Run affected tests: `./bin/wp test --file src/ai-memory/checkpoint/saver.test.ts` (and any existing ai-memory tests).
5. Run: `./bin/wp lint` on modified files, then `./bin/wp typecheck`.

**Acceptance:**

- [ ] `grep -rn "Math\.random" src/ai-memory --include="*.ts"` returns zero hits (in non-test files).
- [ ] All existing ai-memory tests pass.
- [ ] `./bin/wp lint` passes on modified files.
- [ ] `./bin/wp typecheck` passes.

---

### [crypto] Task 2.2: Replace Math.random in CLI, config, and session subsystems

**Status:** todo

**Depends:** Task 1.1

Replace all `Math.random()` calls in `src/cli/`, `src/config/`, and
`src/session-memory/` with `shortId()` and `tempSuffix()`. These are a mix
of temp-file suffixes and short slug IDs. Run in parallel with Task 2.1
(no shared files).

**Files:**

- Modify: `src/cli/commands/quality-log-store.ts`
- Modify: `src/cli/commands/blueprint/mutations.ts`
- Modify: `src/cli/commands/worktree/router-dispatch.ts`
- Modify: `src/config/docs-lint/cli/commands/migrate-command.ts`
- Modify: `src/session-memory/session.ts`

**Steps (TDD):**

1. Import `shortId` and/or `tempSuffix` from `../../utils/short-id.js` (adjust path per file).
2. Replacements:
   - `quality-log-store.ts:200`: temp path → `tempSuffix()`.
   - `quality-log-store.ts:277`: `slice(2, 8)` → `shortId(6)`.
   - `mutations.ts:209`: temp path → `tempSuffix()`.
   - `router-dispatch.ts:111`: `slice(2, 5).padEnd(3, '0')` → `shortId(3)`.
   - `migrate-command.ts:316`: temp path → `tempSuffix()`.
   - `session.ts:117`: `slice(2, 10)` → `shortId(8)`.
3. Run affected tests: `./bin/wp test --file src/cli/commands/quality-log-store.test.ts` and any others directly touching modified code.
4. Run: `./bin/wp lint` on modified files, then `./bin/wp typecheck`.

**Acceptance:**

- [ ] `grep -rn "Math\.random" src/{cli,config,session-memory} --include="*.ts" | grep -v test` returns zero hits.
- [ ] All affected tests pass.
- [ ] `./bin/wp lint` passes on modified files.
- [ ] `./bin/wp typecheck` passes.

---

### [qa] Task 3.1: Final audit — zero Math.random in production src

**Status:** todo

**Depends:** Task 2.1, Task 2.2

Run a final audit to confirm zero `Math.random()` calls remain in any
production `src/` file. Also verify the new helper is the only source of
randomness.

**Files:**

- None (audit-only task).

**Steps:**

1. Run: `grep -rn "Math\.random" src --include="*.ts" | grep -v "\.test\."` — expect zero output.
2. Run: `grep -rn "crypto\.randomBytes\|crypto\.randomUUID" src/utils/short-id.ts` — confirm the helper uses `node:crypto`.
3. Run full test suite: `./bin/wp test` — all pass.
4. Run: `./bin/wp lint` and `./bin/wp typecheck` — zero issues.

**Acceptance:**

- [ ] `grep -rn "Math\.random" src --include="*.ts" | grep -v "\.test\."` returns zero hits.
- [ ] `src/utils/short-id.ts` exists and is the only file importing `crypto.randomBytes`.
- [ ] Full test suite passes.
- [ ] `./bin/wp lint` passes.
- [ ] `./bin/wp typecheck` passes.

---

## Verification Gates

| Gate | Command | Success Criteria |
| --- | --- | --- |
| Type safety | `./bin/wp typecheck` | Zero errors. |
| Tests | `./bin/wp test --file src/utils/short-id.test.ts` then `./bin/wp test` | All pass. |
| Lint | `./bin/wp lint` on modified files | Zero violations. |
| Audit | `grep -rn "Math\.random" src --include="*.ts" \| grep -v "\.test\."` | Zero hits. |
| Crypto source | `grep -rn "crypto\.randomBytes" src/utils/short-id.ts` | One match (the helper). |

## Non-goals

- Replacing `Math.random` in test files (49 usages across 47 `*.test.ts` files). These are for temp directories and test isolation only — out of scope for this S-complexity hardening.
- Changing deterministic fixtures or seed values.
- Adding new npm dependencies (only `node:crypto` standard library).
- Replacing `Math.random` for non-ID purposes (e.g., randomized sampling or shuffle algorithms — none exist in this codebase).

## Technology Choices

| Choice | Rationale |
| --- | --- |
| `crypto.randomBytes(n).toString('base64url')` | Node 24 built-in; no deps; arbitrary-length short IDs; URL-safe characters; 6 bits per character (vs. ~5.2 for base36). |
| `crypto.randomUUID()` as secondary hardening | Available since Node 14.17; kept as a fallback option for UUID-length identifiers if needed in future. Not used for short IDs (too long at 36 chars). |
| Separate `shortId()` and `tempSuffix()` helpers | `tempSuffix` embeds `Date.now()` for sortability, wrapping the common `Date.now() + random` pattern so callers don't duplicate the concatenation. |
