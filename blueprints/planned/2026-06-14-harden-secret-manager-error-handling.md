---
type: blueprint
title: Harden secret manager error handling
owner: ozby
status: planned
complexity: S
created: '2026-06-14'
last_updated: '2026-06-14'
progress: '0% (0/3 tasks done, 0 blocked)'
depends_on:
  - 2026-06-14-close-test-coverage-gaps-security-modules
cross_repo_depends_on: []
tags:
  - security
  - secret-gate
  - error-handling
  - observability
worktree_owner_id: ''
worktree_owner_branch: ''
---

# Harden secret manager error handling

**Goal:** Stop leaking secret-manager output into error messages, log clearly identifiable failures, and add unit tests for the error paths.

## Product wedge anchor

Secret-manager CLI failures can leak parsed secret values into thrown `Error` messages because `formatFailure` concatenates both `stderr` **and** `stdout` into the error body. This is the `with-secrets` gate for `wp ci act` and local dev — any tool that calls `fetchSecretsForConfig`. A leaked `sk_live_` or `ghp_` token in an error log, CI output, or agent conversation is an unrecoverable credential compromise.

## Quick Reference

| Key | Value |
| --- | ----- |
| Complexity | S (3 tasks) |
| Dependency | `2026-06-14-close-test-coverage-gaps-security-modules` |
| Primary lane | `[secret-gate]` |
| Existing reuse | `src/mcp/tools/_shared/redact.ts` (`redactText`, already masks `sk_`, `ghp_`, `tok_`, `cf_`, base64-like) |
| Test runner | `./bin/wp test --file src/runtime/secret-managers.test.ts` |

## Parallel Metrics Snapshot

| Metric | Before | After (target) |
| ------ | ------ | -------------- |
| Error message max bytes | unbounded (stderr + stdout) | ≤512 bytes (first line of stderr only) |
| Secret-bearing stdout in errors | present (line 16-17 of `formatFailure`) | excluded |
| Unit test coverage for error paths | 0% | 100% of `formatFailure` + `parseJsonSecrets` |
| Redaction of CLI output in errors | none | via `src/mcp/tools/_shared/redact.ts` |
| JSDoc contract for maintainers | absent | present on `formatFailure` |

## Refinement Summary

| Refinement | Detail |
| ---------- | ------ |
| F1 — stdout leak | Confirmed. `formatFailure` joins both `result.stderr` and `result.stdout` on line 17 and feeds them into the thrown `Error`. If a CLI partially emits parsed secrets to stdout before failing, those values land in the error message. |
| F2 — missing tests | Confirmed. No `secret-managers.test.ts` exists. Test file creation will be in Task 2.2 after the `close-test-coverage-gaps-security-modules` blueprint establishes the pattern. |
| F3 — project ID in command | Confirmed. The error includes the full `command` string with `--project <projectId>` and optionally `--config <env>`. The project ID is not secret but reveals deployment topology; acceptable after truncation/redaction because the command string is useful for diagnosing CLI failures. |
| Redact helper reuse | Found. `src/mcp/tools/_shared/redact.ts` exports `redactText()` with patterns for `sk_`, `ghp_`, `tok_`, `cf_`, `AKIA`-adjacent prefixes, and long base64-like strings. Task 1.1 can import this directly — no new file needed. |
| Depends on | `2026-06-14-close-test-coverage-gaps-security-modules` — the `.test.ts` file needs the test scaffolding pattern established by that blueprint. |

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality |
| -- | -------- | ----- | ---------------- |
| F1 | MEDIUM | `formatFailure` in `src/runtime/secret-managers.ts:10-23` includes both stderr and stdout in the thrown error message. | Confirmed: lines 15-17 read `result.stderr` and `result.stdout`, join them, and include in the error. |
| F2 | MEDIUM | The function is in an untested module. | Confirmed: `src/runtime/secret-managers.ts` has no `.test.ts`. |
| F3 | LOW | Error messages include the full command line which may contain the project ID. | Confirmed: ``Unable to fetch secrets from ${provider} using \`${command}\`.\n${detail}`` includes CLI args (project ID, env). |

## Tasks

#### [secret-gate] Task 1.1: Truncate and redact secret-manager error output
**Status:** todo | **Depends:** Task 2.2 (from `close-test-coverage-gaps-security-modules` for test patterns)
**Files:** — Modify: `src/runtime/secret-managers.ts`
**Steps (TDD):**
1. In `formatFailure` (lines 10-23):
   - Keep only the first line of `result.stderr` (split on `\n`, take `[0]`).
   - Never include `result.stdout` in the error message.
   - Truncate the included fragment to 512 bytes.
   - Pipe through `redactText` from `src/mcp/tools/_shared/redact.ts` before inclusion.
2. Update `detail` construction to use only the truncated/redacted stderr line.
3. `./bin/wp typecheck` — verify the import compiles.
**Acceptance:**
- [ ] `result.stdout` is never included in the error message body (verified by grep of the compiled line).
- [ ] `result.stderr` is truncated to first line ≤512 bytes and redacted.
- [ ] Existing call sites (`fetchFromDoppler`, `fetchFromInfisical`) still throw informative errors.
- [ ] `./bin/wp lint src/runtime/secret-managers.ts` passes.

#### [secret-gate] Task 1.2: Add unit tests for `formatFailure` and `parseJsonSecrets`
**Status:** todo | **Depends:** Task 1.1
**Files:** — Create: `src/runtime/secret-managers.test.ts`
**Steps (TDD):**
1. Write tests that should fail before Task 1.1 is applied (verify FAIL):
   - `formatFailure` with stdout containing `sk_live_abc123def456…` → assert thrown error message does **not** contain `sk_live_`.
   - `formatFailure` with multi-line stderr → assert only the first line (≤512 bytes) is included.
   - `formatFailure` with empty stderr/stdout → assert message is `Unable to fetch secrets from <provider> using \`<command>\`.`
2. Write `parseJsonSecrets` tests:
   - Empty string input → throws with `returned an empty response`.
   - Invalid JSON (`{broken`) → throws with `returned invalid JSON`.
   - Non-object JSON (`[1,2,3]`, `"string"`, `42`) → throws with `unexpected payload`.
   - Valid flat object → returns correct `Record<string, string>`.
   - Object with non-string values → skips them.
3. Test → `./bin/wp test --file src/runtime/secret-managers.test.ts` verify FAIL (if TDD), then implement fix, verify PASS.
4. `./bin/wp lint` + `./bin/wp typecheck`.
**Acceptance:**
- [ ] `./bin/wp test --file src/runtime/secret-managers.test.ts` passes.
- [ ] All `formatFailure` and `parseJsonSecrets` branches are covered.

#### [secret-gate] Task 1.3: Document error-handling contract in code comments
**Status:** todo | **Depends:** Task 1.1
**Files:** — Modify: `src/runtime/secret-managers.ts`
**Steps (TDD):**
1. Add a JSDoc block to `formatFailure` documenting:
   - `@remarks` stdout is excluded to prevent secret leakage.
   - `@remarks` stderr is truncated to first line ≤512 bytes and redacted via `redactText`.
   - `@remarks` the `command` string (including project ID) is preserved for diagnosability; it is not secret.
2. Add a concise comment above each `formatFailure` call site in `fetchFromDoppler` and `fetchFromInfisical` noting the contract.
3. `./bin/wp lint` + `./bin/wp typecheck`.
**Acceptance:**
- [ ] Future maintainers see the rationale in source (JSDoc renders in IDE hover).
- [ ] No lint violations from comment formatting.

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Type safety | `./bin/wp typecheck` | Zero errors. |
| Unit tests | `./bin/wp test --file src/runtime/secret-managers.test.ts` | All pass. |
| Lint | `./bin/wp lint src/runtime/secret-managers.ts` | Zero violations. |
| Audit: secrets-policy | `./bin/wp audit --kind secrets-policy` | Passes (redact import is not a new secret carrier). |

## Non-goals

- Replacing `spawnSync` with `spawn` and streaming output.
- Adding structured logging.
- Changing the secrets-config schema.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Truncating stderr hides useful error context | First-line heuristic covers most CLI tools' error format; "see raw logs" hint not needed since `spawnSync` error is synthetic. Add a test for multi-line stderr to confirm truncation is intentional. |
| Redaction rules miss a token format | Reuse `src/mcp/tools/_shared/redact.ts` patterns; add tests for `sk_`, `ghp_`, and base64-like tokens in stderr. Extend `TOKEN_PATTERNS` in that module if gaps found. |
| Test file creation before dependency blueprint completes | Task 1.2 depends on Task 1.1; the dependency on `close-test-coverage-gaps-security-modules` ensures test infrastructure patterns are established — wait for that blueprint to complete before creating the test file. |
