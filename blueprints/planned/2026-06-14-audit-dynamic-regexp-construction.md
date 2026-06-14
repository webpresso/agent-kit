---
type: blueprint
title: Audit dynamic RegExp construction
owner: ozby
status: planned
complexity: M
created: '2026-06-14'
last_updated: '2026-06-14'
progress: '0% (0/4 tasks done, 0 blocked)'
depends_on: []
cross_repo_depends_on: []
tags:
  - security
  - regex
  - input-validation
worktree_owner_id: ''
worktree_owner_branch: ''
---

# Audit dynamic RegExp construction

**Goal:** Eliminate `new RegExp(userInput)` patterns that are not properly escaped or length-bounded, consolidate duplicated `escapeRegExp` helpers, and document the safe pattern for remaining dynamic cases.

## Quick Reference

| Key | Value |
| --- | ----- |
| Total `new RegExp` sites (non-test) | **50** |
| Dynamic-risk sites | **7** (4 MEDIUM, 1 HIGH, 2 LOW) |
| Static/trivial sites | **43** (constants, `String.raw`, source-reuse, or internal-only) |
| Duplicated `escapeRegExp` helpers | **6** copies across files |
| Canonical `escapeRegex` export | `src/blueprint/utils/string.ts:7` |
| Complexity | M (was S — raised after 50-site discovery) |

## Parallel Metrics Snapshot

| Metric | Count | Tool |
| ------ | ----- | ---- |
| `new RegExp` in `src/` (excl. tests) | 50 | `grep -rn 'new RegExp' src --include='*.ts' \| grep -v '\.test\.ts' \| wc -l` |
| Files with `new RegExp` (excl. tests) | 23 | `grep -rln 'new RegExp' src --include='*.ts' \| grep -v '\.test\.ts' \| wc -l` |
| Duplicated `escapeRegExp` definitions | 6 | `grep -rn 'function escapeRegE?xp' src --include='*.ts'` |
| `new RegExp(…).replace(…` glob sites | 1 | `validate-command.ts:109` |
| Sites using `task_id` / user input | 3 | `search-files.ts`, `blueprint-server.ts`, `mutations.ts` |
| Sites with `parts.join('')` anti-trigger | 1 | `secret-provider-quarantine.ts:25` |
| Files modified by this blueprint (est.) | 8 | create: 2, modify: 6 |

## Refinement Summary

### Corrections from original draft
- **Count**: Original claimed 17 sites; `grep` shows **50**. Complexity raised S → M.
- **secret-provider-quarantine.ts:25**: Not a risk — uses `String.raw` constants via `parts.join('')` to avoid self-triggering its own audit. The mechanism is dynamic but all content is literal strings. Retagged as LOW.
- **validate-command.ts:109**: Pattern comes from `IGNORE_PATTERNS` (hardcoded constants), not user input. Risk downgraded from MEDIUM to LOW. Still worth migrating for consistency.
- **`escapeRegex` already exists**: `src/blueprint/utils/string.ts:7` exports a canonical `escapeRegex`. Five other files have private copies. Task 1.2 reframed as **consolidation** not creation.
- **New HIGH-risk find**: `src/ai-tools/search-files.ts:187` passes raw user-provided regex pattern to `new RegExp()` — no escape, no length cap.

### Re-scoped tasks
1. Added consolidation task (1.2) before helper extension
2. Split migration into two tasks: high-risk (1.3) and low-risk (1.4) to allow staged rollout
3. Added `[security]` lane for the HIGH site, `[regex]` for others

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality |
| -- | -------- | ----- | ---------------- |
| F1 | LOW | 17 `new RegExp(...)` sites use non-literal arguments. | **50** sites total. 43 are safe (constants `String.raw`, source reuse, internal-only). 7 deserve attention. |
| F2 | LOW | `src/audit/secret-provider-quarantine.ts:25` uses `parts.join('')`. | Confirmed — but all parts are `String.raw` literals. Safe anti-self-trigger pattern. |
| F3 | MEDIUM | `src/config/docs-lint/cli/commands/validate-command.ts:109` does glob-to-regex. | Confirmed — but `pattern` comes from `IGNORE_PATTERNS` (hardcoded). Low risk. |
| F4 | HIGH | `src/ai-tools/search-files.ts:187` passes raw user regex. | **New find**: `new RegExp(pattern, caseSensitive ? '' : 'i')` with no escape. Direct user input. |
| F5 | MEDIUM | `src/mcp/blueprint-server.ts:1099` interpolates `task_id`. | Confirmed — only escapes dots (`\.`). Other metacharacters unhandled. |
| F6 | MEDIUM | `src/audit/package-surface.ts:1033` parses slash-delimited regex. | Confirmed — `source` from user config, passed raw. Caught by `try/catch` but not validated. |

## Tasks

#### [security] Task 1.1: Harden `search-files.ts` user-regex input [Complexity: S]

**Status:** todo | **Depends:** None

**Files:**
- Modify: `src/ai-tools/search-files.ts`

**Steps (TDD):**
1. Test → `vp run test --file src/ai-tools/search-files.test.ts` verify current behavior
2. Add length cap (4096 chars) + `escapeRegex` call on user-provided `pattern` before `new RegExp(...)`
3. Add validation: reject patterns containing `(?!`, `(?=`, `(?<=`, `(?<!` (lookarounds can cause ReDoS)
4. Verify existing tests still pass; add test for malicious input rejection
5. `vp run lint` + `vp run typecheck`

**Acceptance:**
- [ ] `new RegExp(pattern, ...)` replaced with `safeBuildRegex(pattern)` that escapes and caps
- [ ] Malicious `.*`, `(?:`, and lookaround patterns rejected or safely escaped
- [ ] `vp run test --file src/ai-tools/search-files.test.ts` passes

---

#### [regex] Task 1.2: Consolidate duplicate `escapeRegExp` helpers [Complexity: S]

**Status:** todo | **Depends:** None

**Files:**
- Modify: canonical `src/blueprint/utils/string.ts` (add `escapeRegExp` alias, export both)
- Modify: `src/config/internal-subpath-imports.ts` (remove private copy, import from canonical)
- Modify: `src/cli/package-scripts.ts` (remove private copy, import from canonical)
- Modify: `src/audit/architecture-drift.ts` (remove private copy, import from canonical)
- Modify: `src/audit/package-surface.ts` (remove private copy, import from canonical)
- Modify: `src/hooks/pretool-guard/validators/forbidden-commands.ts` (remove private copy, import from canonical)

**Steps (TDD):**
1. Ensure `src/blueprint/utils/string.ts` exports both `escapeRegex` and `escapeRegExp` (same function)
2. Replace all 5 private copies with imports from `src/blueprint/utils/string.ts`
3. Verify each file compiles and existing tests pass
4. `vp run lint` + `vp run typecheck`

**Acceptance:**
- [ ] Only one `escapeRegex`/`escapeRegExp` definition in `src/`
- [ ] All 6 call sites import from canonical location
- [ ] `vp run test` passes (no test regressions)

---

#### [regex] Task 1.3: Create `src/utils/safe-regexp.ts` with safe builders [Complexity: S]

**Status:** todo | **Depends:** Task 1.2

**Files:**
- Create: `src/utils/safe-regexp.ts`
- Create: `src/utils/safe-regexp.test.ts`

**Steps (TDD):**
1. Test → `vp run test --file src/utils/safe-regexp.test.ts` verify FAIL (file doesn't exist yet)
2. Implement `safeRegExpFromGlob(pattern: string): RegExp` that:
   - Escapes regex metacharacters via `escapeRegex` (imported from `src/blueprint/utils/string.ts`)
   - Substitutes `**` → `.*` and `*` → `[^/]*` (standard glob semantics)
   - Caps pattern length at 1024 chars
3. Implement `safeBuildRegex(source: string, flags?: string): RegExp`:
   - Wraps `escapeRegex` + `new RegExp` with length cap
   - Throws on empty/surrogate-only source
4. Tests for: glob `**`, `*`, literal dots, length cap, metacharacter escape, empty input, malicious input (`.*`, `(?:`, `a+`)

**Acceptance:**
- [ ] `safeRegExpFromGlob` escapes user-controlled metacharacters before regex insertion
- [ ] `safeBuildRegex` caps length and validates input
- [ ] `vp run test --file src/utils/safe-regexp.test.ts` passes

---

#### [regex] Task 1.4: Migrate risky sites to safe builders [Complexity: M]

**Status:** todo | **Depends:** Task 1.2, Task 1.3

**Files:**
- Modify: `src/config/docs-lint/cli/commands/validate-command.ts` (LOW — use `safeRegExpFromGlob`)
- Modify: `src/mcp/blueprint-server.ts` (MEDIUM — use `safeBuildRegex` for `task_id`)
- Modify: `src/cli/commands/blueprint/mutations.ts` (MEDIUM — use `safeBuildRegex` for `task_id`)
- Modify: `src/audit/package-surface.ts` (MEDIUM — validate `parseSlashRegex` output)
- Modify: `src/config/oxlint/graphql-conventions.ts` (LOW — `singular` is internal, document as safe)

**Steps (TDD):**
1. For each file, read surrounding context to understand the pattern argument source
2. `validate-command.ts:109`: Replace inline `.replace(/\*\*/g, ...)` with `safeRegExpFromGlob(pattern)`
3. `blueprint-server.ts:1099`: Replace `new RegExp('...' + task_id.replace(/\./g, '\\.'))` with `safeBuildRegex('...' + escapeRegex(task_id))`
4. `mutations.ts:260`: Replace `new RegExp('...' + escapedId)` with `safeBuildRegex('...' + escapeRegex(taskId))`
5. `package-surface.ts:1033`: Add `escapeRegex` on `source` (this parses slash-delimited user regex — source should be treated as regex, validate it)
6. `graphql-conventions.ts`: Document as safe (internal-only), no code change
7. `vp run lint --fix` + `vp run typecheck` per file

**Acceptance:**
- [ ] Each migrated site uses `safeRegExpFromGlob` or `safeBuildRegex`
- [ ] `vp run test` passes (no regressions)
- [ ] `secrets-policy` audit still passes (`vp run wp audit --kind secrets-policy`)
- [ ] GraphQL oxlint rules still fire correctly

---

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Type safety | `vp run typecheck` | Zero errors. |
| Unit tests | `vp run test --file src/utils/safe-regexp.test.ts` | All pass. |
| Integration tests | `vp run test --suite unit` | No regressions. |
| Lint | `vp run lint` on modified files | Zero violations. |
| Audit self-check | `vp run wp audit --kind secrets-policy` | Must still pass (quarantine preserved). |
| Audit self-check | `vp run wp audit --kind secrets-config` | Must still pass. |

## Non-goals

- Removing the ability to use dynamic regex entirely.
- Refactoring oxlint custom rules beyond documentation.
- Changing pattern matching semantics for legitimate uses.
- Rewriting `secret-provider-quarantine.ts:25` anti-self-trigger (it's already safe).

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Helper introduces escaping bug | Test every glob edge case + malicious inputs. |
| Existing tests assume non-escaped behavior | Update fixtures; document the change in commit. |
| Consolidation breaks a file with different `escapeRegExp` semantics | All 6 copies implement identical `value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` — verified. |
| `search-files.ts` hardening breaks legitimate regex uses | Add explicit opt-out flag or document the new escape semantics in `search-files` tool description. |
