---
type: blueprint
title: MCP session command sandboxing
owner: ozby
status: completed
completed_at: '2026-06-21'
complexity: M
created: '2026-06-14'
last_updated: '2026-06-14'
progress: '100% (completed; tasks verified during plan-refine reconciliation)'
depends_on: []
cross_repo_depends_on: []
tags:
  - security
  - mcp
  - session-memory
  - command-injection
  - shell-sandboxing
worktree_owner_id: ''
worktree_owner_branch: ''
---

# MCP session command sandboxing

**Goal:** Remove arbitrary, unrestricted shell execution from MCP session tools by validating the command and working directory before `runSessionCommand` spawns `sh -c`. The command still runs through `sh -c` (so shell builtins and simple compound commands the existing tooling relies on keep working), but a denylist gate rejects dangerous top-level shell metacharacters and confines `cwd` to an independently-anchored project root before any spawn.

## Product wedge anchor

- **Stage outcome:** Hardens the agent-fabric session-memory surface that ships in `@webpresso/agent-kit`'s MCP server to Tier-1 consumer CLIs (Claude Code, Codex — see `catalog/agent/rules/supported-agent-clis.md`). The roadmap outcome is a session-memory toolset safe to expose to an agent whose command string is model-controlled, not human-reviewed.
- **Consuming surface:** The `wp_session_execute` and `wp_session_batch_execute` MCP verbs (`src/mcp/tools/_session-execute.ts`, `src/mcp/tools/_session-batch-execute.ts`), both of which funnel through `runSessionCommand` in `src/mcp/tools/_session-command.ts`.
- **New user-visible capability:** An agent running against the webpresso MCP server can call `wp_session_execute` / `wp_session_batch_execute` and have an injected payload (`; rm -rf /`, `$(…)`, a `cwd` outside the repo) rejected with a structured error *before* anything runs — instead of silently executing it.

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| ---- | ----- | ------------ | -------------- | ------ |
| **Wave 0** | 1.1 | None | 1 agent | S |
| **Wave 1** | 2.1 | Wave 0 | 1 agent | M |
| **Wave 2** | 3.1 | Wave 1 | 1 agent | S |
| **Critical path** | 1.1 → 2.1 → 3.1 | — | 3 waves | M |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ agents/2 | 1 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 1.0 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 0.67 |
| CP | same-file overlaps per wave | 0 | 0 |

**CPR note**: 1.0 (grade C) reflects the inherently sequential nature of security hardening: write failing validation tests → build the validation gate inside the single chokepoint → exercise the gate end-to-end through both tool handlers. Each step depends on the prior guard being in place. No artificial dependencies exist, and the chokepoint (`runSessionCommand`) is genuinely one file, so parallelism is not available.

---

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality | Fix Applied |
| -- | -------- | ----- | ---------------- | ----------- |
| F1 | HIGH | `runSessionCommand` passes user input to `spawn('sh', ['-c', command])`. | Confirmed at `src/mcp/tools/_session-command.ts:72`. `command` and `cwd` come from MCP tool input with only an `execute` boolean opt-in. | Fx1 — Add denylist validation before spawn (Task 2.1). |
| F2 | HIGH | Both `wp_session_execute` and `wp_session_batch_execute` are affected. | Confirmed: `src/mcp/tools/_session-execute.ts:94` and `src/mcp/tools/_session-batch-execute.ts:141` call `runSessionCommand`. | Fx2 — Validation lives in `runSessionCommand` so all callers are protected (Task 2.1). |
| F3 | MEDIUM | Output is bounded to 1MB. | Confirmed via `MAX_CAPTURE_BYTES = 1024 * 1024` at `_session-command.ts:10`. | Fx3 — Preserve existing bounds; no change needed. |
| F4 | MEDIUM | Test files named `_session-execute.test.ts` and `_session-batch-execute.test.ts`. | Files are actually `src/mcp/tools/session-execute.test.ts` and `src/mcp/tools/session-batch-execute.test.ts` (no underscore prefix). Internal modules use `_` prefix; test files do not. | Fx4 — Corrected all file references. |
| F5 | MEDIUM | A shared path-normalization helper is reusable from `session-execute-file.ts`. | `normalizeRepoPath` is a private (non-exported) function at `session-execute-file.ts:130`, **and it rejects absolute paths** (`if (path.startsWith('/') …) return null`, line 137) — so an absolute `cwd` cannot be passed through it directly. The repo already ships an exported project-root resolver at `src/mcp/tools/_shared/project-root.ts:70` (`resolveProjectRoot`). | Fx5 — Reuse the existing `resolveProjectRoot` for an independent root anchor; do **not** extract a new `repo-path.ts` (would be confusable with the existing `_shared/project-root.ts`). cwd containment uses `realpathSync` + prefix comparison directly in Task 2.1. |
| F6 | LOW | Test commands use `./bin/wp test --file <path>`. | The repo uses `vitest run <file>` directly via the `wp_test` MCP tool / `wp test`. `wp_test` accepts `files` as an array, not `--file` flags. | Fx6 — Use the `wp_test` MCP tool (or `wp test`) on the listed files in Steps (TDD). |
| F7 | CRITICAL | (Refinement-discovered) De-shelling to `spawn(file, args)` "preserves all existing behavior" / "existing tests pass unchanged". | **False.** `session-execute.test.ts:74` runs `printf "%s\n" "failure sentinel"; exit 42` (top-level `;` + the shell builtin `exit`) and `session-batch-execute.test.ts:74` runs `command: 'exit 42'`. Under a no-shell `spawn(file, args)`, `exit` is not an executable file (ENOENT) and the top-level `;` is rejected by the validator — both tests BREAK. | Fx7 — **Dropped the de-shelling task.** Keep `sh -c`; validate with a denylist gate only. The two shell-builtin tests are explicitly rewritten in Task 3.1 to use a non-zero-exit binary instead of `; exit 42`. Removed every "pass unchanged" claim that covered those two files. |
| F8 | HIGH | (Refinement-discovered) "cwd outside project root is rejected before spawn." | The proposed validator derived `projectRoot` from `resolveProjectRoot({ cwd })` — i.e. from the same attacker-supplied `cwd`. That prefix check is tautological (a value is always under its own resolved root) and rejects nothing. The callers compute `effectiveCwd = input.cwd ?? process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd()` (`_session-execute.ts:57`) and pass it straight through. | Fx8 — Anchor `projectRoot` **independently** of `input.cwd`, from `process.env['CLAUDE_PROJECT_DIR']` / `process.cwd()` at the handler boundary, then validate that `input.cwd` resolves to a prefix of that fixed root (Task 2.1). |

---

## Architecture Review (Adversarial)

### Shell Metacharacter Escape

The current `spawn('sh', ['-c', command])` interprets the full shell syntax including `;`, `$(...)`, backticks, `&&`, `||`, `>`, `<`, `|`. A command like `echo hello; cat /etc/passwd` would execute both statements. Solution: a denylist validator MUST run before spawn, rejecting commands that contain dangerous shell metacharacters at the top level (outside quoted strings). The command still executes through `sh -c` afterward — we are gating which commands reach the shell, not removing the shell.

### Why keep `sh -c` instead of de-shelling

A no-shell `spawn(file, args)` approach was considered and **rejected**: existing session tooling and tests legitimately rely on the shell — `session-execute.test.ts:74` uses the shell builtin `exit` and a top-level `;`. Under a no-shell spawn, `exit` is not an executable file and would fail with ENOENT, and the tokenizer would have to reimplement a shell. Keeping `sh -c` plus a denylist gate is the smaller, behavior-preserving change (KISS); the two tests that use a top-level `;`/`exit` are rewritten in Task 3.1 to exercise a non-zero exit via a real binary.

### cwd Escape via Symlinks

An attacker could pass a cwd like `/tmp/worktree/repo/../../etc` to escape the project root. The validator resolves cwd via `realpathSync` and compares it against an **independently-anchored** project root (from `CLAUDE_PROJECT_DIR` / `process.cwd()`, never from the cwd being validated — see F8). Containment is a prefix check on the real (symlink-resolved) paths, not exact equality, so legitimate sibling-worktree subdirectories still pass.

### Independent root anchoring (closes the real threat)

The threat is MCP-supplied `cwd` escaping the repo. Deriving `projectRoot` from that same `cwd` is tautological. The validator therefore computes the trusted root once, before accepting `input.cwd`, from `process.env['CLAUDE_PROJECT_DIR']` (falling back to `process.cwd()`), and rejects any `input.cwd` whose resolved real path is not a prefix of that trusted root. Note `normalizeRepoPath` in `session-execute-file.ts` is *not* reused here because it rejects absolute paths (line 137) and an MCP `cwd` is absolute.

### Race Condition: cwd Validation vs. Spawn

There is a TOCTOU gap between cwd validation and spawn execution. A symlink could change between validation and spawn. Mitigation: validate immediately before spawn (same synchronous block), and rely on the process isolation inherent in `spawn` — the child process will fail or be contained if the path is altered.

### Error Cascade: Validation Failure

If validation rejects a command, the error must propagate through the same error-handling path that `runSessionCommand` already uses (the `catch` block in both `_session-execute.ts` and `_session-batch-execute.ts` already handles thrown errors). No new error handling infrastructure is needed.

### Legitimate Workflow Breakage

Current tests use commands like `printf "%s\n" "hello"; exit 42` which contains a top-level `;` and a shell builtin. The denylist validator rejects top-level `;`, so:
1. The metacharacter denylist allows `;`, `$(…)`, etc. when they appear inside single- or double-quoted strings (quote-aware scan).
2. Tests that genuinely need a non-zero exit via a top-level `;`/`exit` builtin are rewritten in Task 3.1 to invoke a real binary that exits non-zero (e.g. a small `node -e 'process.exit(42)'` or a dedicated fixture), so the validated command needs no top-level `;`.

**Decision**: Denylist gate over `sh -c` (not de-shelling), with quote-aware scanning for simple commands and explicit rejection of compound shell constructs at the top level. See Task 2.1 for details.

---

## Edge Cases

| # | Edge Case | Severity | Handling | Fix |
| -- | --------- | -------- | --------- | --- |
| E1 | cwd is a symlink outside project root | HIGH | Resolve with `realpathSync` and prefix-compare against the independently-anchored root | Fx8 (Task 2.1) |
| E2 | Command with semicolons inside quoted strings | HIGH | Quote-aware scan distinguishes top-level vs. quoted metacharacters; quoted ones are allowed | Fx1 (Task 2.1) |
| E3 | cwd points to a deleted directory between validation and spawn | LOW | Spawn will fail with ENOENT; handled by existing error path | No change |
| E4 | Timeout fires during validation (slow realpath) | MEDIUM | Validation is synchronous; timeout starts at spawn, not before | Fx2 (Task 2.1) |
| E5 | win32 platform rejection path bypasses validation | LOW | `_session-execute.ts:75` rejects win32 before calling `runSessionCommand` | No change |
| E6 | Legitimate command relied on a top-level `;`/`exit` builtin | MEDIUM | Rewrite the two affected tests to exit non-zero via a real binary; the denylist intentionally rejects top-level `;` | Fx7 (Task 3.1) |

---

## Risks

| Risk | Severity | Mitigation | Fix |
| ---- | -------- | ---------- | --- |
| Breaking legitimate agent workflows that rely on top-level shell operators | HIGH | Quote-aware scan permits metacharacters inside quotes; the two known tests that used a top-level `;`/`exit` are rewritten, not silently broken | Fx7 (Task 2.1, 3.1) |
| cwd validation blocks valid multi-worktree flows | MEDIUM | Resolve both paths via `realpathSync` and compare prefixes, not exact equality | Fx8 (Task 2.1) |
| `validateCommand` is bypassed by other code paths calling `runSessionCommand` | HIGH | Validation lives inside `runSessionCommand` itself, not in callers — all paths converge there | Fx2 (Task 2.1) |
| projectRoot derived from attacker-supplied cwd makes the check tautological | HIGH | Anchor projectRoot from `CLAUDE_PROJECT_DIR`/`process.cwd()` independently of `input.cwd`; never from the value being validated | Fx8 (Task 2.1) |

---

## Tasks

#### Task 1.1: Create unit test file for command/cwd validation

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/mcp/tools/session-command.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-21T15:21:53.508Z"},{"agent":"codex","command":"./bin/wp test --file src/mcp/tools/session-execute.test.ts -- --testNamePattern reject/non-zero/safe focused subset && ./bin/wp test --file src/mcp/tools/session-batch-execute.test.ts -- --testNamePattern reject/non-zero/safe focused subset","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-21T15:21:53.508Z"}]
```

**Depends:** None

Create `src/mcp/tools/session-command.test.ts` with Vitest tests that exercise a `validateCommand` function (to be implemented in Task 2.1). Tests follow the TDD pattern: write tests first, they will fail until Task 2.1 ships the implementation. Follow existing test conventions from `session-execute.test.ts`: tmpdir-based fixtures, `beforeEach`/`afterEach` cleanup, and direct imports of internal modules.

The cwd tests must construct the trusted root explicitly (a tmpdir treated as `CLAUDE_PROJECT_DIR`) and pass an `input.cwd` that is inside vs. outside that root — never derive the root from the cwd under test (see F8).

**Files:**
- Create: `src/mcp/tools/session-command.test.ts`

**Steps (TDD):**
1. Create `session-command.test.ts` importing from `./_session-command.js` (the import of `validateCommand` will fail until Task 2.1 adds the export — tests are red at this stage)
2. Write test cases for: (a) safe command (`echo hello`) passes validation, (b) shell metacharacter `; rm -rf /` at top level is rejected, (c) command substitution `$(cat /etc/passwd)` is rejected, (d) backtick injection is rejected, (e) pipe `|` at top level is rejected, (f) redirection `> /etc/hosts` is rejected, (g) safe commands with quoted semicolons pass (`printf "%s\n" "hello; world"`), (h) `input.cwd` outside the trusted root is rejected, (i) `input.cwd` that is a symlink escaping the trusted root is rejected
3. Run the `wp_test` MCP tool (or `wp test`) on `src/mcp/tools/session-command.test.ts` — verify FAIL (tests fail because `validateCommand` doesn't exist yet)
4. Note: tests remain failing until Task 2.1 implements `validateCommand`

**Acceptance:**
- [x] Test file exists at `src/mcp/tools/session-command.test.ts`
- [x] Tests cover command injection, shell metacharacters, and cwd escape vectors
- [x] cwd tests anchor the trusted root independently of the cwd under test
- [x] Tests follow existing conventions (Vitest, tmpdir cleanup, direct internal imports)
- [x] All tests fail (Task 2.1 will make them pass)

---
#### Task 2.1: Implement command and cwd validation in `runSessionCommand`

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/mcp/tools/session-command.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-21T15:21:53.508Z"},{"agent":"codex","command":"./bin/wp test --file src/mcp/tools/session-execute.test.ts -- --testNamePattern reject/non-zero/safe focused subset && ./bin/wp test --file src/mcp/tools/session-batch-execute.test.ts -- --testNamePattern reject/non-zero/safe focused subset","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-21T15:21:53.508Z"}]
```

**Depends:** Task 1.1

Add a `validateCommand(command: string, cwd: string, projectRoot: string)` validation function inside `_session-command.ts` and call it at the top of `runSessionCommand`, before any `mkdirSync` or `spawn`. This is the security gate — all session command execution flows through this single function. The shell is **not** removed; `runSessionCommand` still ends with `spawn('sh', ['-c', command])`, but only validated commands reach it.

The validator:
1. Resolves `cwd` via `realpathSync` and confirms it is a prefix of the **independently-anchored** `projectRoot` (prefix comparison on real paths, not exact match). The `projectRoot` is supplied by the caller/handler boundary, derived from `process.env['CLAUDE_PROJECT_DIR']` (falling back to `process.cwd()`) — never from `input.cwd`. Reuse the existing exported `resolveProjectRoot` from `src/mcp/tools/_shared/project-root.ts` to compute that trusted root from the env/cwd anchor; do not create a new `repo-path.ts`, and do not route the absolute `cwd` through `session-execute-file.ts`'s `normalizeRepoPath` (it rejects absolute paths, line 137).
2. Scans the command string with a quote-aware pass to distinguish top-level shell metacharacters from those inside quoted strings (`"..."` and `'...'`).
3. Rejects commands with any of these at the top level: `;`, `&`, `|`, `$(`, `${` (unquoted), `` ` `` (backtick), `>`, `<`, `!` (when followed by non-space).
4. Allows these metacharacters inside single- or double-quoted strings.

Wire `projectRoot` resolution at the handler boundary: in each caller, resolve the trusted root from `process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd()` (via `resolveProjectRoot`) **before** accepting `input.cwd`, add a `projectRoot` field to `RunSessionCommandOptions`, and pass that fixed root in. Do not default `projectRoot` to `resolveProjectRoot({ cwd })` — that would re-derive it from the value being validated (F8).

**Files:**
- Modify: `src/mcp/tools/_session-command.ts`
- Modify: `src/mcp/tools/_session-execute.ts`
- Modify: `src/mcp/tools/_session-batch-execute.ts`

**Steps (TDD):**
1. Implement `validateCommand` as an exported function in `_session-command.ts` (quote-aware top-level metacharacter scan + cwd prefix check against the passed-in `projectRoot`)
2. Add a required `projectRoot` field to `RunSessionCommandOptions`; resolve it in `_session-execute.ts` and `_session-batch-execute.ts` from `process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd()` via `resolveProjectRoot`, independent of `input.cwd`
3. Call `validateCommand(command, cwd, projectRoot)` at the top of `runSessionCommand` before `mkdirSync`/`spawn`
4. Run the `wp_test` MCP tool (or `wp test`) on `src/mcp/tools/session-command.test.ts` — verify PASS for all validation-rejection tests
5. Run the `wp_test` MCP tool on `src/mcp/tools/session-execute.test.ts` and `src/mcp/tools/session-batch-execute.test.ts` — most existing cases (safe commands) pass; the two cases at `session-execute.test.ts:74` and `session-batch-execute.test.ts:74` that use a top-level `;`/`exit` builtin are expected to fail here and are rewritten in Task 3.1. Do NOT claim these two pass unchanged.
6. Run `wp typecheck` (or the `wp_typecheck` MCP tool) — verify zero errors

**Acceptance:**
- [x] `validateCommand` is exported and rejects shell metacharacters at the top level
- [x] `input.cwd` outside the independently-anchored project root is rejected before spawn
- [x] `projectRoot` is derived from `CLAUDE_PROJECT_DIR`/`process.cwd()`, never from `input.cwd`
- [x] `runSessionCommand` still uses `spawn('sh', ['-c', command])` for validated commands
- [x] `session-command.test.ts` passes all cases
- [x] `wp typecheck` passes
- [x] Existing safe-command tests in `session-execute.test.ts` / `session-batch-execute.test.ts` still pass (the two top-level-`;`/`exit` cases are rewritten in Task 3.1, not here)

---
#### Task 3.1: Add malicious-input integration tests and rewrite the two shell-builtin tests

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/mcp/tools/session-command.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-21T15:21:53.508Z"},{"agent":"codex","command":"./bin/wp test --file src/mcp/tools/session-execute.test.ts -- --testNamePattern reject/non-zero/safe focused subset && ./bin/wp test --file src/mcp/tools/session-batch-execute.test.ts -- --testNamePattern reject/non-zero/safe focused subset","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-21T15:21:53.508Z"}]
```

**Depends:** Task 2.1

Add command-injection and cwd-escape tests to `session-execute.test.ts` and `session-batch-execute.test.ts` that exercise the full MCP tool handler path (through `wp_session_execute` and `wp_session_batch_execute` handlers). These tests invoke the tool handlers with malicious input and assert that the handler returns an error without executing the payload.

This task ALSO rewrites the two existing tests that relied on a top-level `;`/`exit` builtin so they exercise a non-zero exit without a banned top-level metacharacter:
- `session-execute.test.ts:74` (`printf "%s\n" "failure sentinel"; exit 42`) → invoke a real binary that exits non-zero (e.g. `node -e "process.stdout.write('failure sentinel'); process.exit(42)"`), preserving the sentinel-stdout + exit-42 assertions.
- `session-batch-execute.test.ts:74` (`command: 'exit 42'`) → `command: 'node -e "process.exit(42)"'` (or equivalent real-binary non-zero exit), preserving the exit-code assertion.

**Files:**
- Modify: `src/mcp/tools/session-execute.test.ts`
- Modify: `src/mcp/tools/session-batch-execute.test.ts`

**Steps (TDD):**
1. Rewrite the two existing non-zero-exit cases (`session-execute.test.ts:74`, `session-batch-execute.test.ts:74`) to use a real binary exiting non-zero rather than a top-level `;`/`exit` builtin; keep the stdout-sentinel and exit-code assertions intact
2. Add tests to `session-execute.test.ts`:
   - `it('rejects shell metacharacters and returns error before spawn')` — pass a command with `; rm -rf /` and assert `result.isError === true`
   - `it('rejects cwd outside project root')` — pass cwd pointing to `/tmp` and assert `result.isError === true`
3. Add tests to `session-batch-execute.test.ts`:
   - `it('rejects batch containing metacharacter commands')` — pass a commands array with one malicious entry and assert `result.isError === true`
   - `it('rejects batch with cwd outside project root')` — pass cwd outside and assert `result.isError === true`
4. Run the `wp_test` MCP tool (or `wp test`) on `src/mcp/tools/session-execute.test.ts` — verify PASS (rewritten + new tests)
5. Run the `wp_test` MCP tool on `src/mcp/tools/session-batch-execute.test.ts` — verify PASS

**Acceptance:**
- [x] Injection payloads in `wp_session_execute` handler fail before spawn
- [x] Injection payloads in `wp_session_batch_execute` handler fail before spawn
- [x] cwd escape attempts via both handlers fail before spawn
- [x] The two non-zero-exit tests are rewritten to use a real binary (no top-level `;`/`exit`) and keep their original assertions
- [x] Safe commands continue to work
- [x] `wp_test` on `session-execute.test.ts` and `session-batch-execute.test.ts` passes

---

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Unit tests (validation) | `wp test` (or `wp_test`) on `src/mcp/tools/session-command.test.ts` | Pass |
| Existing + injection tests | `wp test` on `src/mcp/tools/session-execute.test.ts src/mcp/tools/session-batch-execute.test.ts` | Pass (including rewritten non-zero-exit tests and new injection tests) |
| Shell still gated, not removed | `grep -n "spawn('sh'" src/mcp/tools/_session-command.ts` | Exactly one match (the validated `sh -c` call), reached only after `validateCommand` |
| Independent root anchor | `grep -n "resolveProjectRoot" src/mcp/tools/_session-execute.ts src/mcp/tools/_session-batch-execute.ts` | At least one match per file (root derived at handler boundary) |
| Type safety | `wp typecheck` (or `wp_typecheck`) | Zero errors |
| Lint | `wp lint --file src/mcp/tools/_session-command.ts --file src/mcp/tools/_session-execute.ts --file src/mcp/tools/_session-batch-execute.ts` | Zero violations |

## Non-goals

- Broad MCP authorization redesign.
- Changing the `execute` opt-in contract.
- Persisting command output to a different store.
- **De-shelling** `runSessionCommand` to `spawn(file, args)` — explicitly rejected (F7): existing tooling and tests rely on `sh -c` (shell builtins like `exit`). The denylist gate over `sh -c` is the chosen, behavior-preserving approach.
- Extracting `normalizeRepoPath` to a new `_shared/repo-path.ts` — the existing `_shared/project-root.ts` (`resolveProjectRoot`) is reused instead (Fx5).

---

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 8 |
| Critical | 1 (F7 — de-shelling breaks existing tests) |
| High | 4 (F1, F2, F8, + alignment: missing product-wedge anchor) |
| Medium | 2 (F3, F4, F5) |
| Low | 1 (F6) |
| Fixes applied | 8/8 |
| Cross-plans updated | 0 (no cross-plan deps) |
| Edge cases documented | 6 |
| Risks documented | 4 |
| **Corrections applied** | Dropped de-shelling task (F7); dropped `normalizeRepoPath` extraction, reuse `resolveProjectRoot` (F5); fixed cwd threat model to anchor projectRoot independently (F8); removed false "pass unchanged" claims for the two shell-builtin tests; added Product wedge anchor; task count 5 → 3 |
| **Parallelization score** | C (CPR 1.0 — inherent to security layering through a single chokepoint) |
| **Critical path** | 3 waves (1.1 → 2.1 → 3.1) |
| **Max parallel agents** | 1 |
| **Total tasks** | 3 |
| **Blueprint compliant** | 3/3 |
</content>
</invoke>

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
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-14-mcp-session-command-sandboxing.md |

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
