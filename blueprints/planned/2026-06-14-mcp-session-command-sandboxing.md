---
type: blueprint
title: MCP session command sandboxing
owner: ozby
status: planned
complexity: M
created: '2026-06-14'
last_updated: '2026-06-14'
progress: 'refined (0/5 tasks done, 0 blocked) — fact-checked, Blueprint-compliant'
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

**Goal:** Remove arbitrary shell execution from MCP session tools by validating or sandboxing the command and working directory before `runSessionCommand` spawns a shell.

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| ---- | ----- | ------------ | -------------- | ------ |
| **Wave 0** | 1.1, 1.2 | None | 2 agents | S |
| **Wave 1** | 2.1 | Wave 0 | 1 agent | M |
| **Wave 2** | 3.1, 3.2 | Wave 1 | 2 agents | S-M |
| **Critical path** | 1.1 → 2.1 → 3.1 | — | 3 waves | M |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ agents/2 | 2 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 1.67 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 0.8 |
| CP | same-file overlaps per wave | 0 | 0 |

**CPR note**: 1.67 (grade C) reflects the inherently sequential nature of security hardening: extract shared utility → build validation layer → apply structured execution. Each step depends on the prior guard being in place. No artificial dependencies exist.

---

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality | Fix Applied |
| -- | -------- | ----- | ---------------- | ----------- |
| F1 | HIGH | `runSessionCommand` passes user input to `spawn('sh', ['-c', command])`. | Confirmed at `src/mcp/tools/_session-command.ts:72`. `command` and `cwd` come from MCP tool input with only an `execute` boolean opt-in. | Fx1 — Add validation before spawn (Task 2.1). |
| F2 | HIGH | Both `wp_session_execute` and `wp_session_batch_execute` are affected. | Confirmed: `src/mcp/tools/_session-execute.ts:94` and `src/mcp/tools/_session-batch-execute.ts:141` call `runSessionCommand`. | Fx2 — Validation lives in `runSessionCommand` so all callers are protected (Task 2.1). |
| F3 | MEDIUM | Output is bounded to 1MB. | Confirmed via `MAX_CAPTURE_BYTES = 1024 * 1024` at `_session-command.ts:10`. | Fx3 — Preserve existing bounds; no change needed. |
| F4 | MEDIUM | Test files named `_session-execute.test.ts` and `_session-batch-execute.test.ts`. | Files are actually `src/mcp/tools/session-execute.test.ts` and `src/mcp/tools/session-batch-execute.test.ts` (no underscore prefix). Internal modules use `_` prefix; test files do not. | Fx4 — Corrected all file references. |
| F5 | MEDIUM | `normalizeRepoPath` can be reused from `session-execute-file.ts`. | `normalizeRepoPath` is a private (non-exported) function at `session-execute-file.ts:130`. It must be extracted to a shared module before reuse. | Fx5 — Added Task 1.1 to extract to `_shared/repo-path.ts`. |
| F6 | LOW | Test commands use `./bin/wp test --file <path>`. | The repo uses `vitest run <file>` directly. `wp_test` MCP tool accepts `files` as an array, not `--file` flags. | Fx6 — Use `npx vitest run <file>` in Steps (TDD). |

---

## Architecture Review (Adversarial)

### Shell Metacharacter Escape

The current `spawn('sh', ['-c', command])` interprets the full shell syntax including `;`, `$(...)`, backticks, `&&`, `||`, `>`, `<`, `|`. A command like `echo hello; cat /etc/passwd` would execute both statements. Solution: validation MUST run before spawn, rejecting commands containing shell metacharacters at the top level (not inside quoted strings).

### cwd Escape via Symlinks

An attacker could pass a cwd like `/tmp/worktree/repo/../../etc` to escape the project root. `session-execute-file.ts` already handles this with `realpathSync` normalization in `normalizeRepoPath`. The same technique (from extracted `_shared/repo-path.ts`) must be applied to cwd in `runSessionCommand`.

### Race Condition: cwd Validation vs. Spawn

There is a TOCTOU gap between cwd validation and spawn execution. A symlink could change between validation and spawn. Mitigation: validate immediately before spawn (same synchronous block), and rely on the process isolation inherent in `spawn` — the child process will fail or be contained if the path is altered.

### Error Cascade: Validation Failure

If validation rejects a command, the error must propagate through the same error-handling path that `runSessionCommand` already uses (the `catch` block in both `_session-execute.ts` and `_session-batch-execute.ts` already handles thrown errors). No new error handling infrastructure is needed.

### Legitimate Workflow Breakage

Current tests use commands like `printf "%s\\n" "hello"; exit 42` which contains a top-level `;`. This is a legitimate test pattern. The validation must either:
1. Allow `;` when inside quoted strings (complex parsing), or
2. Provide an allowlist of known-safe command patterns.

**Decision**: Use approach (2) — an allowlist of shell operators that are permitted in specific contexts, with safe defaults for simple commands and explicit rejection of compound shell constructs. See Task 2.1 for details.

---

## Edge Cases

| # | Edge Case | Severity | Handling | Fix |
| -- | --------- | -------- | --------- | --- |
| E1 | cwd is a symlink outside project root | HIGH | Resolve with `realpathSync` before comparison | Fx5 (Task 1.1 + 2.1) |
| E2 | Command with semicolons inside quoted strings | HIGH | Allowlist-based parser distinguishes top-level vs. quoted metacharacters | Fx1 (Task 2.1) |
| E3 | cwd points to a deleted directory between validation and spawn | LOW | Spawn will fail with ENOENT; handled by existing error path | No change |
| E4 | Timeout fires during validation (slow realpath) | MEDIUM | Validation is synchronous; timeout starts at spawn, not before | Fx2 (Task 2.1) |
| E5 | win32 platform rejection path bypasses validation | LOW | `_session-execute.ts:75` rejects win32 before calling `runSessionCommand` | No change |

---

## Risks

| Risk | Severity | Mitigation | Fix |
| ---- | -------- | ---------- | --- |
| Breaking legitimate agent workflows that rely on shell pipelines | HIGH | Provide a small, reviewed allowlist and document it; existing tests guard against regression | Fx1 (Task 2.1, 3.2) |
| cwd validation blocks valid multi-worktree flows | MEDIUM | Resolve both paths via `realpathSync` and compare prefixes, not exact equality | Fx5 (Task 1.1) |
| `validateCommand` is bypassed by other code paths calling `runSessionCommand` | HIGH | Validation lives inside `runSessionCommand` itself, not in callers — all paths converge there | Fx2 (Task 2.1) |
| Extracting `normalizeRepoPath` breaks existing `session-execute-file.ts` behavior | MEDIUM | Refactor is a drop-in replacement with identical behavior; existing tests guard | Fx5 (Task 1.1) |

---

## Tasks

### [security] Task 1.1: Extract `normalizeRepoPath` to shared utility

**Status:** todo

**Depends:** None

Extract the private `normalizeRepoPath` function from `session-execute-file.ts:130` into a new shared module `src/mcp/tools/_shared/repo-path.ts`. Refactor `session-execute-file.ts` to import from the shared module. The extracted function must remain a drop-in replacement — identical behavior, return type, and error handling. Add unit tests for symlink escape, relative-path rejection, and null-byte rejection.

**Files:**
- Create: `src/mcp/tools/_shared/repo-path.ts`
- Create: `src/mcp/tools/_shared/repo-path.test.ts`
- Modify: `src/mcp/tools/session-execute-file.ts`

**Steps (TDD):**
1. Create `repo-path.test.ts` with tests for: (a) valid path within repo root returns normalized paths, (b) symlink escape via `realpathSync` returns null, (c) path with `..` traversal returns null, (d) missing repo root marker returns null, (e) null byte in path returns null
2. Run: `npx vitest run src/mcp/tools/_shared/repo-path.test.ts` — verify FAIL
3. Create `repo-path.ts` by extracting `normalizeRepoPath` from `session-execute-file.ts:130-159`, renaming the export
4. Run: `npx vitest run src/mcp/tools/_shared/repo-path.test.ts` — verify PASS
5. Refactor `session-execute-file.ts` to import `normalizeRepoPath` from `./_shared/repo-path.js` instead of defining it inline; remove the private definition
6. Run: `npx vitest run src/mcp/tools/session-execute-file.test.ts src/mcp/tools/_shared/repo-path.test.ts` — verify PASS
7. Run: `npx tsc --noEmit` — verify zero errors

**Acceptance:**
- [ ] `repo-path.ts` exports `normalizeRepoPath` with the same signature and behavior
- [ ] `session-execute-file.ts` imports from `_shared/repo-path.js`
- [ ] `session-execute-file.test.ts` (existing) passes unchanged
- [ ] `repo-path.test.ts` passes all cases
- [ ] `npx tsc --noEmit` passes

---

### [security] Task 1.2: Create unit test file for command/cwd validation

**Status:** todo

**Depends:** None

Create `src/mcp/tools/session-command.test.ts` with Vitest tests that exercise a `validateCommand` function (to be implemented in Task 2.1). Tests follow the TDD pattern: write tests first, they will fail until Task 2.1 ships the implementation. Follow existing test conventions from `session-execute.test.ts`: tmpdir-based fixtures, `beforeEach`/`afterEach` cleanup, and direct imports of internal modules.

**Files:**
- Create: `src/mcp/tools/session-command.test.ts`

**Steps (TDD):**
1. Create `session-command.test.ts` importing from `./_session-command.js` (the import will fail until Task 2.1 adds the export — tests are placeholders at this stage)
2. Write test cases for: (a) safe command (`echo hello`) passes validation, (b) shell metacharacter `; rm -rf /` at top level is rejected, (c) command substitution `$(cat /etc/passwd)` is rejected, (d) backtick injection is rejected, (e) pipe `|` at top level is rejected, (f) redirection `> /etc/hosts` is rejected, (g) safe commands with quoted semicolons pass (`printf "%s\n" "hello; world"`), (h) cwd outside project root is rejected, (i) cwd with symlink escape is rejected
3. Run: `npx vitest run src/mcp/tools/session-command.test.ts` — verify FAIL (tests fail because `validateCommand` doesn't exist yet)
4. Note: tests remain failing until Task 2.1 implements `validateCommand`

**Acceptance:**
- [ ] Test file exists at `src/mcp/tools/session-command.test.ts`
- [ ] Tests cover command injection, shell metacharacters, and cwd escape vectors
- [ ] Tests follow existing conventions (Vitest, tmpdir cleanup, direct internal imports)
- [ ] All tests fail (Task 2.1 will make them pass)

---

### [security] Task 2.1: Implement command and cwd validation in `runSessionCommand`

**Status:** todo

**Depends:** Task 1.1, Task 1.2

Add a `validateCommand(command: string, cwd: string, projectRoot: string)` validation function inside `_session-command.ts` and call it at the top of `runSessionCommand`, before any `mkdirSync` or `spawn`. This is the security gate — all session command execution flows through this single function.

The validator:
1. Resolves `cwd` via `realpathSync` and compares against `projectRoot` using the shared path utility from Task 1.1 (prefix comparison, not exact match).
2. Parses the command string to distinguish top-level shell metacharacters from those inside quoted strings (`"..."` and `'...'`).
3. Rejects commands with any of these at the top level: `;`, `&`, `|`, `$(` , `${` (unquoted), `` ` `` (backtick), `>`, `<`, `!` (when followed by non-space).
4. Allows these metacharacters inside single- or double-quoted strings.

Wire `projectRoot` resolution: add an optional `projectRoot` parameter to `RunSessionCommandOptions`, defaulting to `resolveProjectRoot({ cwd })`. Update both callers (`_session-execute.ts` and `_session-batch-execute.ts`) to pass or let it default.

**Files:**
- Modify: `src/mcp/tools/_session-command.ts`

**Steps (TDD):**
1. Implement `validateCommand` as an exported function in `_session-command.ts`
2. Run: `npx vitest run src/mcp/tools/session-command.test.ts` — verify PASS for all validation-rejection tests
3. Add the `projectRoot` option to `RunSessionCommandOptions`, defaulting via `resolveProjectRoot`
4. Call `validateCommand` at the top of `runSessionCommand` before `mkdirSync`/`spawn`
5. Run: `npx vitest run src/mcp/tools/session-execute.test.ts src/mcp/tools/session-batch-execute.test.ts` — verify PASS (existing tests use safe commands)
6. Run: `npx vitest run src/mcp/tools/session-command.test.ts` — verify ALL tests PASS
7. Run: `npx tsc --noEmit` — verify zero errors

**Acceptance:**
- [ ] `validateCommand` is exported and rejects shell metacharacters at top level
- [ ] cwd outside project root is rejected before spawn
- [ ] Existing tests for `wp_session_execute` and `wp_session_batch_execute` pass unchanged
- [ ] `session-command.test.ts` passes all cases
- [ ] `npx tsc --noEmit` passes

---

### [mcp] Task 3.1: Replace raw shell spawn with structured execution

**Status:** todo

**Depends:** Task 2.1

Replace `spawn('sh', ['-c', command])` at `_session-command.ts:72` with a structured approach that does not invoke a full shell interpreter. After Task 2.1, the command has already been validated — no shell metacharacters at the top level. The command can be split into `[file, ...args]` using a simple tokenizer that respects quotes (no shell expansions needed since metacharacters are banned). Then use `spawn(file, args, { cwd, ... })` directly.

Preserve all existing behavior: timeout, output bounding (`MAX_CAPTURE_BYTES`), stdout/stderr capture, indexing, and the `timedOut` signal.

**Files:**
- Modify: `src/mcp/tools/_session-command.ts`

**Steps (TDD):**
1. Implement a `tokenizeCommand(command: string): string[]` helper that splits into argv respecting single and double quotes (reuse the same quote-aware logic from `validateCommand` in Task 2.1)
2. Replace `spawn('sh', ['-c', command], ...)` with `spawn(file, args, ...)` where `[file, ...args] = tokenizeCommand(command)`
3. Run: `npx vitest run src/mcp/tools/session-execute.test.ts src/mcp/tools/session-batch-execute.test.ts` — verify PASS (no regressions)
4. Run: `npx vitest run src/mcp/tools/session-command.test.ts` — verify PASS
5. Verify: `grep -n "spawn('sh'" src/mcp/tools/_session-command.ts` returns no matches
6. Run: `npx tsc --noEmit` — verify zero errors

**Acceptance:**
- [ ] No `spawn('sh', ['-c', command])` remains in `_session-command.ts`
- [ ] All existing session command tests pass
- [ ] `tokenizeCommand` handles single quotes, double quotes, and escaped characters
- [ ] Timeout, output bounding, indexing, and exit code behavior preserved
- [ ] `grep` confirms no shell spawn in session tools

---

### [integration] Task 3.2: Add malicious-input integration tests to existing test files

**Status:** todo

**Depends:** Task 2.1

Add command injection and cwd escape tests to `session-execute.test.ts` and `session-batch-execute.test.ts` that exercise the full MCP tool handler path (through `wp_session_execute` and `wp_session_batch_execute` handlers). These tests invoke the tool handlers with malicious input and assert that the handler returns an error without executing the payload.

**Files:**
- Modify: `src/mcp/tools/session-execute.test.ts`
- Modify: `src/mcp/tools/session-batch-execute.test.ts`

**Steps (TDD):**
1. Add tests to `session-execute.test.ts`:
   - `it('rejects shell metacharacters and returns error before spawn')` — pass a command with `; rm -rf /` and assert `result.isError === true`
   - `it('rejects cwd outside project root')` — pass cwd pointing to `/tmp` and assert `result.isError === true`
2. Add tests to `session-batch-execute.test.ts`:
   - `it('rejects batch containing metacharacter commands')` — pass commands array with one malicious entry and assert `result.isError === true`
   - `it('rejects batch with cwd outside project root')` — pass cwd outside and assert `result.isError === true`
3. Run: `npx vitest run src/mcp/tools/session-execute.test.ts` — verify PASS
4. Run: `npx vitest run src/mcp/tools/session-batch-execute.test.ts` — verify PASS

**Acceptance:**
- [ ] Injection payloads in `wp_session_execute` handler fail before spawn
- [ ] Injection payloads in `wp_session_batch_execute` handler fail before spawn
- [ ] cwd escape attempts via both handlers fail before spawn
- [ ] Safe commands continue to work (existing tests still pass)
- [ ] `npx vitest run src/mcp/tools/session-execute.test.ts src/mcp/tools/session-batch-execute.test.ts` passes

---

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Unit tests (repo-path) | `npx vitest run src/mcp/tools/_shared/repo-path.test.ts` | Pass |
| Unit tests (validation) | `npx vitest run src/mcp/tools/session-command.test.ts` | Pass |
| Existing tests (no regression) | `npx vitest run src/mcp/tools/session-execute.test.ts src/mcp/tools/session-batch-execute.test.ts src/mcp/tools/session-execute-file.test.ts` | Pass (including new injection tests) |
| No shell spawn | `grep -rn "spawn('sh'" src/mcp/tools/` | Zero matches |
| Type safety | `npx tsc --noEmit` | Zero errors |
| Lint | `npx oxlint --rules src/mcp/tools/_shared/repo-path.ts src/mcp/tools/_session-command.ts src/mcp/tools/session-execute-file.ts` | Zero violations |

## Non-goals

- Broad MCP authorization redesign.
- Changing the `execute` opt-in contract.
- Persisting command output to a different store.
- Implementing a full shell parser (the allowlist + quote-aware tokenizer is sufficient for validated commands).

---

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 6 |
| Critical | 0 |
| High | 3 (F1, F2, E1/E2 risk) |
| Medium | 10 (F3-F5, E4, risks) |
| Low | 2 (F6, E3/E5) |
| Fixes applied | 6/6 |
| Cross-plans updated | 0 (no cross-plan deps) |
| Edge cases documented | 5 |
| Risks documented | 4 |
| **Parallelization score** | C (CPR 1.67 — inherent to security layering) |
| **Critical path** | 3 waves (1.1 → 2.1 → 3.1) |
| **Max parallel agents** | 2 |
| **Total tasks** | 5 |
| **Blueprint compliant** | 5/5 |
