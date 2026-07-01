---
type: blueprint
title: Close test coverage gaps in security-critical modules
owner: ozby
status: completed
completed_at: "2026-07-01"
complexity: M
created: "2026-06-14"
last_updated: "2026-07-01"
progress: "100% (9/9 tasks done, 0 blocked; implementation verified locally 2026-07-01)"
depends_on: []
cross_repo_depends_on: []
tags:
  - testing
  - security
  - coverage
  - mcp
  - pretool-guard
approvals:
  - reviewer: deepseek
    verdict: approve
    rev: final
    evidence: reviews.md
  - reviewer: qwen
    verdict: approve
    rev: final
    evidence: reviews.md
worktree_owner_id: owner-d9cf178a3c31
worktree_owner_branch: bp/2026-06-14-close-test-coverage-gaps-security-modules
---

# Close test coverage gaps in security-critical modules

## Summary

Add focused unit coverage for nine security-critical source modules that still ship without direct sibling tests on current `origin/main` (`d818a6b954823835d9862ec8b5e10db710718821`). The original parked plan was stale because `src/runtime/secret-managers.test.ts` has since landed and now covers the secret-manager error-redaction surface, so this refreshed plan removes that completed task and keeps only the remaining pretool-guard and MCP test gaps.

## Product wedge anchor

- **Stage outcome:** webpresso public-extraction reliability — third-party consumers should get hook and MCP behavior guarded by regression tests before package/public release lanes depend on it.
- **Consuming surface:** `wp-pretool-guard` validators used on agent file writes, and the `wp mcp` / session-command surface consumed by Claude Code, Codex, and other MCP clients.
- **New user-visible capability:** CI catches regressions in skip/command-file/complexity/file-convention/UX guard handling and MCP command/tail-hint/server wiring before those failures appear in consumer repos.

## Candidate Gate Verdict

- verdict: `planned-eligible`
- verified-at: `2026-07-01T00:00:00Z`
- verified-head: `d818a6b954823835d9862ec8b5e10db710718821`
- open-pr-overlap: `none` for exact target files across PRs #343, #342, #339, #337, #165, #94
- supersession: `partial` — original `secret-managers.ts` coverage task is complete on main and removed; the nine remaining target tests are absent
- promotion-result: `wp blueprint promote 2026-06-14-close-test-coverage-gaps-security-modules planned` succeeded on 2026-07-01
- residual-unknowns: `None.`

## Refinement Delta

| Original item                                 | Current evidence                                                                                                                               | Refinement action                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `src/runtime/secret-managers.test.ts` missing | File exists and covers `formatFailure`/`parseJsonSecrets` redaction paths                                                                      | Remove original Task 1.1 from execution scope      |
| Ten target tests                              | Nine target test files remain absent                                                                                                           | Re-number remaining tasks under one execution wave |
| Parked reason said refresh needed             | Refresh completed against current source and open PRs                                                                                          | Promote after outside-model approvals              |
| Open-PR risk unknown                          | Live `gh pr list --state open --limit 100 --json number,title,headRefName,baseRefName,isDraft,files,url` captured 6 PRs; no exact file overlap | Mark overlap gate passing                          |

## Quick Reference (Execution Waves)

| Wave              | Tasks                                       | Dependencies | Parallelizable                          | Effort (T-shirt) |
| ----------------- | ------------------------------------------- | ------------ | --------------------------------------- | ---------------- |
| **Wave 0**        | 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9 | None         | 9 agents (file-disjoint test additions) | XS-S             |
| **Critical path** | any single task                             | —            | 1 wave                                  | M                |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target | Actual |
| ------ | ---------------------------------- | ------ | ------ |
| RW0    | Ready tasks in Wave 0              | ≥ 4    | 9      |
| CPR    | total_tasks / critical_path_length | ≥ 2.5  | 9.0    |
| DD     | dependency_edges / total_tasks     | ≤ 2.0  | 0.0    |
| CP     | same-file overlaps per wave        | 0      | 0      |

Parallelization score: **A** — the plan is pure test-file addition with no same-file conflicts in Wave 0.

## Fact-Check Findings

| ID  | Severity | Claim                                                         | Verified Reality                                                                                                                                                         | Fix Applied                                                     |
| --- | -------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| F1  | HIGH     | `src/runtime/secret-managers.ts` is untested.                 | Superseded. `src/runtime/secret-managers.test.ts` exists and covers redacted failure formatting plus JSON parsing.                                                       | Removed secret-manager task.                                    |
| F2  | HIGH     | Several pretool-guard validators lack sibling tests.          | Confirmed absent on `d818a6b9`: `skip-result.test.ts`, `command-file.test.ts`, `complexity.test.ts`, `file-conventions.test.ts`, `logger.test.ts`, `ux-quality.test.ts`. | Keep Tasks 1.1-1.6.                                             |
| F3  | HIGH     | MCP command/server/tail-hint paths lack direct sibling tests. | Confirmed absent on `d818a6b9`: `src/mcp/tools/_session-command.test.ts`, `src/mcp/cli.test.ts`, `src/mcp/_tail-hints.test.ts`.                                          | Keep Tasks 1.7-1.9.                                             |
| F4  | MEDIUM   | Open PRs may conflict with implementation.                    | Live PR file audit found no exact overlap with the nine target files across #343, #342, #339, #337, #165, #94.                                                           | Gate passes; re-run before implementation PR.                   |
| F5  | MEDIUM   | Coverage counts from June are stale.                          | Current counts: 654 non-test source `.ts` files, 574 `src/**/*.test.ts`, 192 untested non-index source siblings, 12 pretool-guard tests, 70 MCP tests.                   | Updated dossier; do not use stale numeric claims as acceptance. |

## Tasks

#### [pretool-guard/testing] Task 1.1: Test `skip-result.ts`

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex-gpt-5.5","command":"./bin/wp test --file src/hooks/pretool-guard/validators/skip-result.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-07-01T15:44:04.234Z"}]
```

**Depends:** None

Add direct unit coverage for the pretool-guard skip-result helper so skipped validations keep their expected success shape and reason text.

**Files:**

- Create: `src/hooks/pretool-guard/validators/skip-result.test.ts`

**Steps (TDD):**

1. Write failing tests for `createSkipResult` default and custom reason output.
2. Run: `./bin/wp test --file src/hooks/pretool-guard/validators/skip-result.test.ts` — verify FAIL.
3. Implement only if the test reveals a real behavior gap; otherwise keep the test as regression coverage.
4. Run: `./bin/wp test --file src/hooks/pretool-guard/validators/skip-result.test.ts` — verify PASS.
5. Run: `./bin/wp lint --file src/hooks/pretool-guard/validators/skip-result.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [x] Default skip result preserves `{ passed: true, skipped: true }` shape.
- [x] Custom skip reason is preserved.
- [x] Targeted test, lint, and typecheck evidence is recorded.

#### [pretool-guard/testing] Task 1.2: Test `command-file.ts`

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex-gpt-5.5","command":"./bin/wp test --file src/hooks/pretool-guard/validators/command-file.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-07-01T15:44:04.234Z"}]
```

**Depends:** None

Cover command/skill file line-limit validation, pass-through behavior for unrelated paths, and skip-env bypass without touching generated command surfaces.

**Files:**

- Create: `src/hooks/pretool-guard/validators/command-file.test.ts`

**Steps (TDD):**

1. Write failing tests for command files over 600 lines and skill files over 400 lines.
2. Add pass cases for files under limits and outside `.claude/` command/skill paths.
3. Add the configured skip-env bypass case.
4. Run: `./bin/wp test --file src/hooks/pretool-guard/validators/command-file.test.ts` — verify FAIL.
5. Implement the smallest behavior fix only if needed.
6. Run: `./bin/wp test --file src/hooks/pretool-guard/validators/command-file.test.ts` — verify PASS.
7. Run: `./bin/wp lint --file src/hooks/pretool-guard/validators/command-file.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [x] Command and skill line-limit violations are covered.
- [x] Under-limit, unrelated-path, and skip-env pass cases are covered.
- [x] Targeted test, lint, and typecheck evidence is recorded.

#### [pretool-guard/testing] Task 1.3: Test `complexity.ts`

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex-gpt-5.5","command":"./bin/wp test --file src/hooks/pretool-guard/validators/complexity.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-07-01T15:44:04.234Z"}]
```

**Depends:** None

Cover file-length warning behavior and non-applicable inputs for the complexity validator.

**Files:**

- Create: `src/hooks/pretool-guard/validators/complexity.test.ts`

**Steps (TDD):**

1. Write failing tests for file content exceeding `MAX_FILE_LINES` and for under-limit content.
2. Cover extension filtering, skip-env bypass, null content, and null file path.
3. Run: `./bin/wp test --file src/hooks/pretool-guard/validators/complexity.test.ts` — verify FAIL.
4. Implement the smallest behavior fix only if needed.
5. Run: `./bin/wp test --file src/hooks/pretool-guard/validators/complexity.test.ts` — verify PASS.
6. Run: `./bin/wp lint --file src/hooks/pretool-guard/validators/complexity.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [x] Line-limit warning and clean pass cases are covered.
- [x] Extension filtering, skip, and null-input paths are covered.
- [x] Targeted test, lint, and typecheck evidence is recorded.

#### [pretool-guard/testing] Task 1.4: Test `file-conventions.ts`

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex-gpt-5.5","command":"./bin/wp test --file src/hooks/pretool-guard/validators/file-conventions.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-07-01T15:44:04.234Z"}]
```

**Depends:** None

Cover system-path blocking and blueprint/path-contract delegation in the file-conventions validator.

**Files:**

- Create: `src/hooks/pretool-guard/validators/file-conventions.test.ts`

**Steps (TDD):**

1. Write failing tests for blocked writes to `/etc/`, `/usr/`, `/bin/`, `/sbin/`, `/var/`, `/sys/`, `/proc/`, and `/dev/`.
2. Add pass cases for non-system paths.
3. Add blueprint-path and non-canonical planning path violations using the existing helper behavior.
4. Cover skip-env bypass and null `filePath`.
5. Run: `./bin/wp test --file src/hooks/pretool-guard/validators/file-conventions.test.ts` — verify FAIL.
6. Implement the smallest behavior fix only if needed.
7. Run: `./bin/wp test --file src/hooks/pretool-guard/validators/file-conventions.test.ts` — verify PASS.
8. Run: `./bin/wp lint --file src/hooks/pretool-guard/validators/file-conventions.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [x] System path blocking is covered.
- [x] Blueprint/path-contract delegation is covered.
- [x] Targeted test, lint, and typecheck evidence is recorded.

#### [pretool-guard/testing] Task 1.5: Test `logger.ts`

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex-gpt-5.5","command":"./bin/wp test --file src/hooks/pretool-guard/logger.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-07-01T15:44:04.234Z"}]
```

**Depends:** None

Add isolated filesystem tests for the pretool-guard JSONL logger without touching real home or worktree log files.

**Files:**

- Create: `src/hooks/pretool-guard/logger.test.ts`

**Steps (TDD):**

1. Write failing tests using a temp directory for JSONL write shape, status/tool fields, and parse behavior.
2. Cover log rotation when `maxLines` is exceeded.
3. Cover disabled logger behavior and missing/invalid log parsing.
4. Run: `./bin/wp test --file src/hooks/pretool-guard/logger.test.ts` — verify FAIL.
5. Implement the smallest behavior fix only if needed.
6. Run: `./bin/wp test --file src/hooks/pretool-guard/logger.test.ts` — verify PASS.
7. Run: `./bin/wp lint --file src/hooks/pretool-guard/logger.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [x] Write, rotation, disabled, missing-file, and invalid-file paths are covered.
- [x] Tests use temp directories only.
- [x] Targeted test, lint, and typecheck evidence is recorded.

#### [pretool-guard/testing] Task 1.6: Test `ux-quality.ts`

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex-gpt-5.5","command":"./bin/wp test --file src/hooks/pretool-guard/validators/ux-quality.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-07-01T15:44:04.234Z"}]
```

**Depends:** None

Cover the UX-quality validator checks that block disruptive browser alerts, swallowed catch-console-only patterns, and TanStack Query destructuring anti-patterns.

**Files:**

- Create: `src/hooks/pretool-guard/validators/ux-quality.test.ts`

**Steps (TDD):**

1. Write failing tests for `alert()` / `window.alert()` detection.
2. Add tests for `catch { console.error(...) }` swallowed-error detection.
3. Add tests for `useQuery` destructure and assignment anti-patterns.
4. Add clean-content and skip-env pass cases.
5. Run: `./bin/wp test --file src/hooks/pretool-guard/validators/ux-quality.test.ts` — verify FAIL.
6. Implement the smallest behavior fix only if needed.
7. Run: `./bin/wp test --file src/hooks/pretool-guard/validators/ux-quality.test.ts` — verify PASS.
8. Run: `./bin/wp lint --file src/hooks/pretool-guard/validators/ux-quality.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [x] Alert, swallowed catch-console, and TanStack Query anti-patterns are covered.
- [x] Clean-content and skip-env pass cases are covered.
- [x] Targeted test, lint, and typecheck evidence is recorded.

#### [mcp/testing] Task 1.7: Test `_session-command.ts`

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex-gpt-5.5","command":"./bin/wp test --file src/mcp/tools/_session-command.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-07-01T15:44:04.234Z"}]
```

**Depends:** None

Cover the session command execution helper at the module boundary, including spawn/capture, truncation, search, timeout, and safety validation. Prefer real short-lived commands for low-risk paths and mocks only for timeout/destructive control.

**Files:**

- Create: `src/mcp/tools/_session-command.test.ts`

**Steps (TDD):**

1. Write failing tests for `runSessionCommand` success output summary and exit code.
2. Cover `MAX_CAPTURE_BYTES` truncation and redaction/elision behavior where exposed.
3. Cover `searchSessionCommandOutput` BM25-ranked hits.
4. Cover timeout behavior without leaving child processes running.
5. Run: `./bin/wp test --file src/mcp/tools/_session-command.test.ts` — verify FAIL.
6. Implement the smallest behavior fix only if needed.
7. Run: `./bin/wp test --file src/mcp/tools/_session-command.test.ts` — verify PASS.
8. Run: `./bin/wp lint --file src/mcp/tools/_session-command.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [x] Spawn, output capture, truncation, search, timeout, and validation paths are covered.
- [x] Timeout tests clean up child processes deterministically.
- [x] Targeted test, lint, and typecheck evidence is recorded.

#### [mcp/testing] Task 1.8: Test `cli.ts`

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex-gpt-5.5","command":"./bin/wp test --file src/mcp/cli.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-07-01T15:44:04.234Z"}]
```

**Depends:** None

Cover `wp mcp` stdio server wiring without re-testing imported direct-entrypoint or sentinel helper internals.

**Files:**

- Create: `src/mcp/cli.test.ts`

**Steps (TDD):**

1. Write failing tests that mock `createServer`, `StdioServerTransport`, and sentinel helpers.
2. Assert `runStdioServer` connects the server to stdio transport and writes the sentinel after connect.
3. Assert shutdown paths close transport/server and delete the sentinel on stdin close and transport close.
4. Assert importing the module does not run the server unless `isDirectEntrypoint` returns true.
5. Run: `./bin/wp test --file src/mcp/cli.test.ts` — verify FAIL.
6. Implement the smallest behavior fix only if needed.
7. Run: `./bin/wp test --file src/mcp/cli.test.ts` — verify PASS.
8. Run: `./bin/wp lint --file src/mcp/cli.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [x] Server connect, sentinel write/delete, and shutdown wiring are covered.
- [x] Import-side-effect guard is covered by mocks, not by spawning the real MCP server.
- [x] Targeted test, lint, and typecheck evidence is recorded.

#### [mcp/testing] Task 1.9: Test `_tail-hints.ts`

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex-gpt-5.5","command":"./bin/wp test --file src/mcp/_tail-hints.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-07-01T15:44:04.234Z"}]
```

**Depends:** None

Cover tail-hint deduplication, TTL expiry, persistence, and static hint selection while isolating filesystem state in temp directories.

**Files:**

- Create: `src/mcp/_tail-hints.test.ts`

**Steps (TDD):**

1. Write failing tests for `shouldShowHint` true on first hint and false after recording.
2. Cover 7-day TTL expiry and JSONL persistence.
3. Cover `maybeHint` / `TAIL_HINTS` static strings for every `TailHintId`.
4. Cover not-in-git-repo graceful behavior with an isolated temp directory.
5. Run: `./bin/wp test --file src/mcp/_tail-hints.test.ts` — verify FAIL.
6. Implement the smallest behavior fix only if needed.
7. Run: `./bin/wp test --file src/mcp/_tail-hints.test.ts` — verify PASS.
8. Run: `./bin/wp lint --file src/mcp/_tail-hints.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [x] Deduplication, TTL, persistence, and all static hint entries are covered.
- [x] Tests do not touch real `.agent` or home-directory state.
- [x] Targeted test, lint, and typecheck evidence is recorded.

## Verification Gates

| Gate                | Command                                                       | Success Criteria                          | Last result                                                                                                             |
| ------------------- | ------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Blueprint audit     | `./bin/wp blueprint audit --all --strict`                     | Blueprint lifecycle/parser audit passes   | PASS 2026-07-01                                                                                                         |
| Targeted tests      | `./bin/wp test --file <new-test-file>` for each task          | Each new test passes after implementation | PASS 2026-07-01                                                                                                         |
| Pretool-guard suite | enumerated `./bin/wp test --file src/hooks/pretool-guard/...` | Existing + new pretool tests pass         | PASS 2026-07-01                                                                                                         |
| MCP suite           | enumerated `./bin/wp test --file src/mcp/...`                 | Existing + new MCP tests pass             | PASS once 2026-07-01; later rerun hit unrelated platform-first promotion timeouts that reproduce on clean `origin/main` |
| Type safety         | `./bin/wp typecheck`                                          | Zero errors                               | PASS 2026-07-01                                                                                                         |
| Lint/format         | `./bin/wp lint` and `./bin/wp format --check`                 | Zero violations                           | PASS 2026-07-01                                                                                                         |

## Cross-Plan References

| Type            | Blueprint / PR                                                                         | Relationship                                                                                  |
| --------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Supersedes task | `harden-secret-manager-error-handling` / current `src/runtime/secret-managers.test.ts` | Secret-manager coverage is already implemented; this blueprint no longer owns it.             |
| Open PR audit   | PRs #343, #342, #339, #337, #165, #94                                                  | No exact target-file overlap as of the 2026-07-01 live audit; re-check before implementation. |

## Non-goals

- Reaching 100% line coverage.
- Retesting `src/runtime/secret-managers.ts`; that coverage exists on current main.
- Changing hook or MCP behavior except where a newly written regression test exposes an actual bug.
- Adding dependencies.
- Touching generated agent/plugin surfaces.

## Risks

| Risk                                                      | Impact                                | Mitigation                                                                                                  |
| --------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Tests accidentally touch real agent state                 | Developer machine pollution or flakes | Use temp dirs and stub env/home paths in logger and tail-hint tests.                                        |
| `_session-command` timeout test leaves a process alive    | Flaky CI / resource leak              | Use a bounded child, explicit kill assertion, and after-test cleanup.                                       |
| MCP CLI test over-mocks implementation                    | False confidence                      | Assert public wiring and lifecycle effects only; keep imported helper internals covered by their own tests. |
| Open PRs change target files before implementation starts | Merge conflict                        | Re-run `gh pr list --state open --limit 100 --json ...files...` at implementation start.                    |

## Technology Choices

| Component            | Technology                                          | Version    | Why                                                            |
| -------------------- | --------------------------------------------------- | ---------- | -------------------------------------------------------------- |
| Test runner          | Vitest via repo `./bin/wp test --file` facade       | repo-owned | Matches existing TypeScript test conventions.                  |
| Filesystem isolation | `node:fs` + temp directories                        | built-in   | No new dependencies; avoids real state.                        |
| Process isolation    | short-lived Node/Bun subprocesses or targeted mocks | built-in   | Keeps command behavior realistic while bounding timeout tests. |

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-07-01T00:00:00Z
- verified-head: d818a6b954823835d9862ec8b5e10db710718821
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                               | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | The original secret-manager task is superseded.     | repo:src/runtime/secret-managers.test.ts                                                                                                                                                                                                                                                                                                                                                                                       |
| C2  | Nine target test files remain absent.               | repo:blueprints/completed/2026-06-14-close-test-coverage-gaps-security-modules/\_overview.md; repo:blueprints/completed/2026-06-14-close-test-coverage-gaps-security-modules/reviews.md                                                                                                                                                                                                                                        |
| C3  | Target source exports exist for the planned tests.  | repo:src/hooks/pretool-guard/validators/skip-result.ts; repo:src/hooks/pretool-guard/validators/command-file.ts; repo:src/hooks/pretool-guard/validators/complexity.ts; repo:src/hooks/pretool-guard/validators/file-conventions.ts; repo:src/hooks/pretool-guard/logger.ts; repo:src/hooks/pretool-guard/validators/ux-quality.ts; repo:src/mcp/tools/\_session-command.ts; repo:src/mcp/cli.ts; repo:src/mcp/\_tail-hints.ts |
| C4  | No live open PR edits any exact target file.        | repo:blueprints/completed/2026-06-14-close-test-coverage-gaps-security-modules/reviews.md                                                                                                                                                                                                                                                                                                                                      |
| C5  | The blueprint is execution-ready and file-disjoint. | derived:C2,C3,C4                                                                                                                                                                                                                                                                                                                                                                                                               |

### Material Decisions

| ID  | Decision                 | Chosen option                                                                      | Rejected alternatives                                              | Rationale                                                                                  |
| --- | ------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| D1  | Scope after refresh      | Remove the already-implemented `secret-managers.test.ts` task.                     | Keep stale task for historical completeness.                       | Planned state must reflect current executable work, not stale backlog.                     |
| D2  | Test-only implementation | Add focused sibling tests first; behavior changes only if tests reveal a bug.      | Bundle refactors into the coverage PR.                             | Reduces blast radius and keeps the implementation PR reviewable.                           |
| D3  | Execution shape          | One implementation PR for this blueprint, with all nine test files parallelizable. | Split into nine micro PRs or combine with unrelated coverage work. | Files are disjoint but semantically one coverage gate; one PR keeps verification coherent. |

### Promotion Gates

| Gate                | Command                      | Expected outcome                                                                    | Last result     |
| ------------------- | ---------------------------- | ----------------------------------------------------------------------------------- | --------------- |
| Blueprint trust     | wp audit blueprint-trust     | Planned blueprint has valid Trust Dossier evidence, decisions, gates, and approvals | PASS 2026-07-01 |
| Blueprint lifecycle | wp audit blueprint-lifecycle | Planned lifecycle status and approval evidence are valid                            | PASS 2026-07-01 |
| Format              | wp format --check            | Markdown formatting is stable                                                       | PASS 2026-07-01 |

### Residual Unknowns

None.
