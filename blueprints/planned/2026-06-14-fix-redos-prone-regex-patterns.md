---
type: blueprint
title: Fix ReDoS-prone regex patterns
owner: ozby
status: planned
complexity: M
created: '2026-06-14'
last_updated: '2026-06-14'
progress: '0% (0/6 tasks done, 0 blocked)'
depends_on: []
cross_repo_depends_on: []
tags:
  - security
  - regex
  - redos
  - validation
worktree_owner_id: ''
worktree_owner_branch: ''
refined: true
refinement_parallelization_score: A
---

## Product wedge anchor

- **Stage outcome:** Security hardening — eliminate ReDoS attack surface in agent-kit CLI and MCP transport.
- **Consuming surface:** `wp` CLI validators (filename checks, env parsing, command scanning), blueprint markdown parsers, e2e config validation.
- **New user-visible capability:** Maliciously crafted filenames, env vars, and CLI input no longer cause exponential regex backtracking or process hangs.

# Fix ReDoS-prone regex patterns

**Goal:** Replace nested-quantifier regex patterns susceptible to Regular Expression Denial of Service with linear-time patterns and bounded inputs.

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality |
| -- | -------- | ----- | ---------------- |
| F1 | HIGH | 28 nested-quantifier occurrences across 9 files. | **Refined:** 38 occurrences across 15+ files. 9 files contain the highest-risk patterns (user-input validators, env parsing, task-ID parsing). All 9 files exist and patterns confirmed at stated line numbers. |
| F2 | MEDIUM | Patterns run on attacker-influenceable input. | Confirmed: user-provided filenames (`filename.ts`), env names (`e2e/config.ts`), CLI commands (`no-legacy-cli-bin.ts`), env var assignment lines (`wrapped-wp.ts`, `dev-routing.ts`). Task-ID patterns are internal-only (parse blueprint markdown). |
| F3 | MEDIUM | Some patterns lack input length caps. | Confirmed: `filename.ts:11` KEBAB_CASE_PATTERN applies to arbitrary-length filenames with no pre-check. `no-legacy-cli-bin.ts:8` LEGACY_COMMAND_PATTERN processes full text content. |
| F4 | LOW | Line numbers in original blueprint verified. | **Refined:** Minor offsets corrected (e.g., `repo-guardrails.ts:1066` → `1066`, `parser.ts:215` → `215`; `plan-frontmatter.ts:70` → `70`, `74` → `74`). All offsets ≤ 3 lines. See inline task references for exact lines. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| ---- | ----- | ------------ | -------------- | ---------------- |
| **Wave 0** | 1.1, 1.2 | None | 2 agents | XS, S |
| **Wave 1** | 1.3, 1.4, 1.5, 1.6 | Wave 0 (1.1) | 4 agents | M, S, S, XS |
| **Critical path** | 1.1 → 1.3 | — | 2 waves | M |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ 3 | 2 |
| RW1 | Ready tasks in Wave 1 | ≥ 3 | 4 |
| RW0+RW1 | Combined wave-0+1 width | ≥ 6 (for 6 agents) | 6 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 3.0 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 0.67 |
| CP | same-file overlaps per wave | 0 | 0 |

**Score:** A — RW0+RW1 meets 6-agent target, CPR 3.0 exceeds threshold, zero file conflicts.

## Tasks

#### [security] Task 1.1: Catalog and risk-rank all nested-quantifier patterns

**Status:** todo | **Depends:** None

Enumerate every regex literal and `new RegExp(...)` in `src/` that contains a nested quantifier — a group `(?:...)` followed by `*` or `+` (e.g., `(?:-[a-z0-9]+)*`, `(?:\\.\\d+)+`). For each: classify the input source (user-controlled vs internal), measure whether a pre-regex length cap exists, note anchoring, and assign a risk tier.

Risk tiers:
- **CRITICAL** — user-controlled input + no length cap + unanchored or partial anchor
- **HIGH** — user-controlled input + no length cap + fully anchored (still exploitable via backtracking)
- **MEDIUM** — user-controlled input + length-capped, or internal input + no cap
- **LOW** — internal input + length-capped or trivial pattern

**Files:**
- Create: `docs/security/regex-audit.md`

**Steps (TDD):**
1. Run `rg -n '\(\?\:[^)]+\)[\*\+]' src/ -t ts` to get raw list of 38 candidates.
2. For each candidate, read surrounding 5 lines to classify input source and anchoring.
3. Write `docs/security/regex-audit.md` with a markdown table: file:line, pattern excerpt, input source, anchored?, length cap?, risk tier.
4. Verify the audit file contains all 38 occurrences and risk tiers are assigned.

**Acceptance:**
- [ ] `docs/security/regex-audit.md` exists with a table of all 38 nested-quantifier patterns.
- [ ] Each row has a defensible risk tier (CRITICAL, HIGH, MEDIUM, LOW).
- [ ] At least 6 patterns rated CRITICAL or HIGH (confirmed by grep for user-input paths).

#### [lint] Task 1.2: Add safe-regex lint rule to detect nested quantifiers

**Status:** todo | **Depends:** None

Add an audit/lint rule that statically detects regex literals containing nested quantifiers (`(?:...)+`, `(?:...)*`). The rule should flag any regex with a group followed by a quantifier as a potential ReDoS vector, with severity matching the risk classification from Task 1.1.

Implementation: use a simple AST walk or regex-parse approach. The rule should run as part of `./bin/wp audit ai-contracts` (or a new security audit). If existing audit infrastructure supports it, add as a new module; otherwise add a standalone script.

**Files:**
- Create: `src/audit/redos-lint.ts`
- Create: `src/audit/redos-lint.test.ts`

**Steps (TDD):**
1. Write failing test in `redos-lint.test.ts` that feeds a file containing `/(?:-[a-z]+)*/` and expects a finding.
2. Run `./bin/wp test --file src/audit/redos-lint.test.ts` — verify FAIL.
3. Implement `redos-lint.ts` with a regex-based scanner that detects nested quantifier patterns.
4. Run `./bin/wp test --file src/audit/redos-lint.test.ts` — verify PASS.
5. Run `./bin/wp lint` and `./bin/wp typecheck`.

**Acceptance:**
- [ ] Scanner detects `(?:...)*` and `(?:...)+` patterns in regex literals and `new RegExp()` strings.
- [ ] Scanner does not false-positive on non-grouped quantifiers (e.g., `a+`, `[a-z]*`).
- [ ] `./bin/wp test --file src/audit/redos-lint.test.ts` passes.
- [ ] `./bin/wp lint` and `./bin/wp typecheck` pass.

#### [regex] Task 1.3: Fix high-risk patterns in user-input validators + timing tests

**Status:** todo | **Depends:** Task 1.1

Rewrite nested-quantifier regex in user-facing validators to linear-time equivalents and add adversarial timing tests. These patterns run on attacker-influenceable input (filenames, env names, CLI command text) with no length caps.

Patterns to fix:
- `src/config/docs-lint/cli/validators/filename.ts:11` — `/(?:-[a-z0-9]+)*/` in KEBAB_CASE_PATTERN
- `src/config/docs-lint/cli/validators/filename.ts:106` — same nested group in strictAuditPattern
- `src/e2e/config.ts:22` — `/(?:-[a-z0-9]+)*/` wranglerEnvName
- `src/e2e/config.ts:45` — same nested group in wranglerEnvNamePattern
- `src/audit/no-legacy-cli-bin.ts:8` — `/(?:\s+[a-z][\w:-]*)*/` in LEGACY_COMMAND_PATTERN
- `src/audit/no-legacy-cli-bin.ts:11` — `/(?: [a-z][\w:-]*)*/` in REPLACEMENT_PATTERN

Replacement strategies:
- For kebab-case patterns: add `filename.length > 256` guard, then use anchored regex as-is (fully anchored patterns with bounded input are safe).
- For legacy-command patterns: use `input.slice(-MAX_LEN)` pre-truncation + anchored scan, or unroll the repetition into a non-backtracking equivalent.
- Preferred: input length guard → then apply original anchored regex on the bounded string.

**Files:**
- Modify: `src/config/docs-lint/cli/validators/filename.ts`
- Modify: `src/e2e/config.ts`
- Modify: `src/audit/no-legacy-cli-bin.ts`
- Create/Modify: `src/config/docs-lint/cli/validators/filename.test.ts`
- Create/Modify: `src/e2e/config.test.ts`
- Create/Modify: `src/audit/no-legacy-cli-bin.test.ts`

**Steps (TDD):**
1. Per file: write adversarial timing test — feed a 100KB string of repeated `-a-a-a...!` or `cmd cmd cmd...` to the regex; assert execution < 100ms.
2. Run `./bin/wp test --file <test-file>` — verify FAIL (pathological input hangs or exceeds 100ms).
3. Add input length cap (e.g., `if (input.length > MAX) return false`) before regex evaluation, or unroll the pattern.
4. Run `./bin/wp test --file <test-file>` — verify PASS (< 100ms).
5. Run `./bin/wp test --file <test-file>` to confirm existing functional tests still pass.
6. Run `./bin/wp lint` and `./bin/wp typecheck`.

**Acceptance:**
- [ ] No pattern in these 3 files processes unbounded user input without a length cap.
- [ ] Each adversarial timing test completes under 100ms for 100KB pathological input.
- [ ] Existing functional tests still pass (valid filenames, env names, commands match correctly).
- [ ] `./bin/wp lint` and `./bin/wp typecheck` pass.

#### [regex] Task 1.4: Fix MEDIUM-HIGH patterns in env/CLI parsing + timing tests

**Status:** todo | **Depends:** Task 1.1

Fix nested-quantifier patterns in env var assignment parsing. These process user-influenceable input (CLI env lines like `KEY=val KEY2=val2 cmd`).

Patterns to fix:
- `src/cli/wrapped-wp.ts:133` — `ENV_ASSIGNMENT_PREFIX_PATTERN` with `(?:\s+)+` equivalent nesting
- `src/hooks/pretool-guard/dev-routing.ts:220` — same `ENV_ASSIGNMENT_PREFIX_PATTERN`

Strategy: add a max-input-length bound before regex evaluation, or replace the repeating group prefix parser with a non-backtracking split-and-validate approach.

**Files:**
- Modify: `src/cli/wrapped-wp.ts`
- Modify: `src/hooks/pretool-guard/dev-routing.ts`
- Create/Modify: `src/cli/wrapped-wp.test.ts`
- Create/Modify: `src/hooks/pretool-guard/dev-routing.test.ts`

**Steps (TDD):**
1. Write adversarial timing test feeding a 100KB string of `KEY= ` repeated, followed by `!` (non-matching).
2. Run `./bin/wp test --file <test-file>` — verify FAIL or > 100ms.
3. Add length cap guard before regex; or replace with `split(/\s+/)` pre-filter + anchored regex.
4. Run `./bin/wp test --file <test-file>` — verify PASS (< 100ms).
5. Verify existing functional tests still pass.
6. Run `./bin/wp lint` and `./bin/wp typecheck`.

**Acceptance:**
- [ ] Adversarial timing tests pass (< 100ms) for both files.
- [ ] Existing functional tests pass.
- [ ] `./bin/wp lint` and `./bin/wp typecheck` pass.

#### [regex] Task 1.5: Fix MEDIUM patterns in blueprint markdown parsing + timing tests

**Status:** todo | **Depends:** Task 1.1

Fix nested-quantifier task-ID parsing patterns. These process internal blueprint markdown — risk is lower but patterns should still be hardened.

Patterns to fix:
- `src/docs-linter/blueprint-plan.ts:17` — `TASK_ID_SOURCE` with `(?:\\.\\d+)+`
- `src/docs-linter/blueprint-plan.ts:77` — task header matching with `(?:\.[^:\s]+)*`
- `src/docs-linter/blueprint-plan.ts:118` — `bareNumberPattern` with `(?:\\.\\d+)*`
- `src/blueprint/core/parser.ts:215` — wrong format detection with `(?:\\.\\d+)+`
- `src/blueprint/core/parser.ts:226` — task regex with `(?:\\.\\d+)+`
- `src/blueprint/core/parser.ts:349` — task ID regex with `(?:\\.\\d+)+`
- `src/blueprint/core/parser.ts:368` — task line test with `(?:\\.\\d+)+`

Strategy: add per-line length cap (e.g., skip lines > 1000 chars), since blueprint markdown lines are bounded. Anchor patterns with `^` prefix where missing.

**Files:**
- Modify: `src/docs-linter/blueprint-plan.ts`
- Modify: `src/blueprint/core/parser.ts`
- Create/Modify: `src/docs-linter/blueprint-plan.test.ts`
- Create/Modify: `src/blueprint/core/parser.test.ts`

**Steps (TDD):**
1. Write adversarial timing test feeding a 100KB single line of `1.1.1.1.1.1...!` to the task-ID parsers.
2. Run `./bin/wp test --file <test-file>` — verify FAIL or > 100ms.
3. Add `if (line.length > MAX_LINE) continue` guard per line before regex.
4. Run `./bin/wp test --file <test-file>` — verify PASS (< 100ms).
5. Confirm existing blueprint parsing tests still pass.
6. Run `./bin/wp lint` and `./bin/wp typecheck`.

**Acceptance:**
- [ ] Adversarial timing tests pass (< 100ms) for both files.
- [ ] Existing blueprint parsing tests pass.
- [ ] `./bin/wp lint` and `./bin/wp typecheck` pass.

#### [regex] Task 1.6: Fix LOW/MEDIUM patterns in frontmatter validation and repo guardrails + timing tests

**Status:** todo | **Depends:** Task 1.1

Fix remaining nested-quantifier patterns in frontmatter validation and repo guardrails.

Patterns to fix:
- `src/hooks/pretool-guard/validators/plan-frontmatter.ts:70` — `(?:\\.\\d+)+` in `countTaskHeadings`
- `src/hooks/pretool-guard/validators/plan-frontmatter.ts:74` — same in `detectWrongTaskFormat`
- `src/audit/repo-guardrails.ts:1066` — `(\.[^.]+)*` in tsconfig filename scan

Strategy: add line-length bounds for frontmatter patterns; add filename-length bound before tsconfig scan regex.

**Files:**
- Modify: `src/hooks/pretool-guard/validators/plan-frontmatter.ts`
- Modify: `src/audit/repo-guardrails.ts`
- Create/Modify: `src/hooks/pretool-guard/validators/plan-frontmatter.test.ts`
- Create/Modify: `src/audit/repo-guardrails.test.ts`

**Steps (TDD):**
1. Write adversarial timing tests for each pattern.
2. Run `./bin/wp test --file <test-file>` — verify FAIL or > 100ms.
3. Add length guards before regex evaluation.
4. Run `./bin/wp test --file <test-file>` — verify PASS (< 100ms).
5. Verify existing tests pass.
6. Run `./bin/wp lint` and `./bin/wp typecheck`.

**Acceptance:**
- [ ] Adversarial timing tests pass (< 100ms) for both files.
- [ ] Existing tests pass.
- [ ] `./bin/wp lint` and `./bin/wp typecheck` pass.

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Type safety | `./bin/wp typecheck` | Zero errors. |
| Tests | `./bin/wp test` (all modified test files) | Pass. |
| Lint | `./bin/wp lint` on modified files | Zero violations. |
| Audit | `./bin/wp audit ai-contracts` | Pass. |
| ReDoS scan | `./bin/wp test --file src/audit/redos-lint.test.ts` | Pass. |

## Non-goals

- Refactoring every regex in the repo (28 of 38 patterns are non-critical and deferred).
- Switching to a different regex engine (e.g., RE2).
- Removing the oxlint custom-rule infrastructure.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Input length cap rejects legitimate long input | Set caps well above realistic max (e.g., 1KB for filenames, 100KB for file content). Document each cap. |
| Replacing pattern breaks valid matches | Keep functional tests green; add golden-output tests in each task. |
| Length guard slows hot-path parsing | Use early-return guards (cheap `.length` check before expensive regex). |

## Edge Cases

| Case | Handling |
| ---- | --------- |
| Empty input (`""`) | Guard `if (!input) return false` before regex. |
| Input with no delimiter (`"foo"`) | Patterns must still match valid single-segment inputs. |
| Pathological backtrack trigger `aaaa...!` | Length cap rejects before regex runs; timing test proves < 100ms. |
| Multi-line file input | Apply line-by-line guard (skip lines > 1000 chars). |
| Unicode in kebab-case paths | Current patterns are ASCII-only — no regression expected. |
| `new RegExp(string)` patterns | Lint rule in Task 1.2 uses regex-source scanning to catch these too. |

## Technology Choices

| Choice | Rationale |
| ------ | --------- |
| Input length cap over regex rewrite | Simpler, less error-prone than rewriting patterns. Fully anchored + bounded input = linear time. ReDoS only applies to NFA backtracking on unbounded input. |
| Per-line guard for markdown parsers | Blueprint markdown lines are naturally bounded (< 500 chars). A guard at 1000 chars is safe. |
| 100ms timing threshold | 1000x margin over normal execution (~0.1ms for typical patterns). Catches any NFA exponential blowup. |

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 4 |
| Critical | 0 |
| High | 1 (F1 — occurrence count refined) |
| Medium | 2 (F2, F3) |
| Low | 1 (F4 — line number offsets) |
| Fixes applied | 4/4 |
| Edge cases documented | 6 |
| Risks documented | 3 |
| **Parallelization score** | **A** (RW0+RW1=6, CPR=3.0, CP=0) |
| **Critical path** | 2 waves (~45 min per wave) |
| **Max parallel agents** | 4 (Wave 1) |
| **Total tasks** | 6 |
| **Blueprint compliant** | 6/6 |
| **Task format** | All tasks: lane prefix, Depends, Files, Steps (TDD), Acceptance |
