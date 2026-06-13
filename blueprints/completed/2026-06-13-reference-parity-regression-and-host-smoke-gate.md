---
type: blueprint
title: Reference parity regression and host smoke gate
owner: ozby
status: completed
completed_at: '2026-06-13'
complexity: L
created: '2026-06-13'
last_updated: '2026-06-13'
progress: '100% (7/7 tasks done, 0 blocked, updated 2026-06-13)'
depends_on:
  - 2026-06-10-harness-regression-gate
  - 2026-06-10-harness-surface-manifest
  - 2026-06-13-session-continuity-and-resume-parity
  - 2026-06-13-sandboxed-knowledge-tool-surface-parity
  - 2026-06-13-multi-host-plugin-and-instruction-surface-expansion
cross_repo_depends_on: []
tags:
  - regression
  - benchmark
  - parity
  - qa
  - hosts
worktree_owner_id: owner-38f4c865435e
worktree_owner_branch: bp/2026-06-13-reference-parity-regression-and-host-smoke-gate
---

# Reference parity regression and host smoke gate

**Goal:** Make replacement claims provable by adding an explicit parity
checklist, host smoke coverage, and regression gates for lifecycle behavior,
tool surface, and operator flows.

## Planning Summary

- Goal input: `Prove the replacement claim instead of arguing it`
- Complexity: `L`
- Draft slug: `2026-06-13-reference-parity-regression-and-host-smoke-gate`
- Output path: `blueprints/in-progress/2026-06-13-reference-parity-regression-and-host-smoke-gate.md`
- Validation scope: capability matrix, host smoke fixtures, benchmark/regression thresholds, release claim audit
- Refinement status: paths, commands, dependency blueprint relationships, public-package safety, benchmark dry-run behavior, and parallel execution shape verified on 2026-06-13.

## Architecture Overview

```text
repo-owned parity matrix
  -> fixture-backed host smoke tests
  -> MCP/tool-surface smoke tests
  -> benchmark threshold report
  -> release/docs claim gate
```

## Fact-Check Findings

| ID | Severity | Claim / Assumption | Verified Reality | Fix Applied |
| -- | -------- | ------------------ | ---------------- | ----------- |
| F1 | HIGH | Focused tests can use `--files`. | `./bin/wp test --help` exposes singular repeatable `--file <path>`. | Use repeated `./bin/wp test --file ...` commands in tasks and gates. |
| F2 | HIGH | A bench source file is a runnable harness target. | `wp bench session-memory` is the repo-owned harness entrypoint; `src/cli/commands/bench/session-memory.test.ts` is the test target. | Gate with `./bin/wp bench session-memory --dry-run` plus `./bin/wp test --file src/cli/commands/bench/session-memory.test.ts`. |
| F3 | MEDIUM | Host smoke should be added only to generic init tests. | The repo already has `src/cli/commands/init/host-smoke.e2e.test.ts` with gated host smoke coverage. | Extend that file and add dedicated parity fixture helpers instead of overloading `init.e2e.test.ts`. |
| F4 | HIGH | Capability parity can be documented without the canonical source. | `src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.ts` and its tests own host lifecycle support claims; `docs/hook-matrix.md` mirrors it. | Add a matrix crosswalk task that updates source, tests, and docs together. |
| F5 | MEDIUM | Release claims are docs-only. | `README.md`, `CHANGELOG.md`, and public package surfaces are disclosure surfaces; repo rules require public-package safety checks. | Add claim audit and tarball/package-surface gates before parity language may ship. |
| F6 | MEDIUM | Sibling blueprints can be edited as part of this refinement. | This refinement owns only this blueprint file; dependency plan changes must be reported, not edited here. | Remove sibling-blueprint edits from task file lists and record cross-plan follow-ups instead. |
| F7 | MEDIUM | More retries or longer smoke-test budgets can stabilize host proof. | Repo policy says timeout failures are diagnostics, not fixes. | Tasks require bounded fixture proof and root-cause investigation rather than timeout increases. |
| F8 | LOW | OpenCode can be ignored while proving multi-host parity. | Existing host smoke and capability matrix include OpenCode alongside Claude, Codex, and Cursor. | Include OpenCode as a documented degraded/parity row where relevant; do not claim full support when capability rows are partial or unsupported. |
| F9 | HIGH | Passing threshold unit tests means the benchmark dry-run gate is ready. | Prior threshold tests could pass while `./bin/wp bench session-memory --dry-run` failed because `scripts/bench/manifest.lock.json` pinned plugin SHAs to `c90bc627...` while default capture read the current checkout HEAD. Updating the lock to the current commit would drift again on the next commit unless the dry-run path had a branch-stable manifest strategy. | Task 2.3 now uses an explicit dry-run current-checkout manifest mode: tool/version locks remain strict, plugin refs must be git SHAs, and live benchmark verification remains strict. |
| F10 | HIGH | `src/__integration__/reference-parity-bench.test.ts` proves the real benchmark path. | The old test injected a fully mocked `RunBenchSessionMemoryDeps` object with `vi.fn()` for manifest capture, scenario loading, workspace validation, run execution, and report writing. That was a unit-style contract test, not a real integration smoke; it could pass while the real `wp bench session-memory --dry-run` command failed. | Task 2.3 replaces it with `src/__integration__/reference-parity-bench.integration.test.ts`, which invokes the real CLI path with no injected benchmark runtime deps and exact dry-run output assertions. |

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Claim style | Checklist + measured evidence | “Feels close enough” is not shippable. |
| Source of truth | Repo-owned parity matrix plus existing capability matrix | Replacement claims must be traceable to concrete repo artifacts, not prose. |
| Host proof | Bounded smoke fixtures per host surface | Claude, Codex, Cursor, and OpenCode differ materially; degraded support must be visible. |
| CI proof mode | Fixture-backed host proof must run in normal CI; live host binaries stay optional behind explicit env flags | Prevent replacement smoke from degenerating into “all skipped except Claude.” |
| Benchmark scope | Continuity + search + hot-path latency | These are the user-visible replacement axes. |
| Benchmark readiness | Unit/integration threshold tests are necessary but not sufficient | The actual `wp bench session-memory --dry-run` command passes from a committed feature branch without chasing HEAD-only manifest drift. |
| Benchmark test shape | Mocked deps are only unit coverage | Any replacement-readiness claim needs a no-injected-deps command/runtime smoke, because users run `wp bench`, not `runBenchSessionMemoryCommand` with fake modules. |
| Release gate | Fail closed on unresolved parity gaps | Prevent stale docs/claims from outrunning shipped behavior. |
| Public package posture | Treat README, changelog, package manifest, bins, exports, docs, and catalog assets as disclosure surfaces | Public-package safety applies before any replacement claim is released. |
| Timeout posture | Do not raise test or hook timeouts to pass smoke | Slow/flaky smoke is a defect to localize, not a budget to enlarge. |

## Technology and Public-Package Safety Notes

| Surface | Verified Existing Anchor | Safety / Refinement Rule |
| ------- | ------------------------ | ------------------------ |
| Test runner | `./bin/wp test --file <path>` | Use exact repo command; repeat `--file` for multiple files. |
| Lint | `./bin/wp lint [...files]` | Lint changed files directly; no nonexistent `--file` flag. |
| Typecheck | `./bin/wp typecheck` | Typecheck is repo-wide; do not document unsupported per-file typecheck. |
| Bench harness | `./bin/wp bench session-memory --dry-run` | Dry-run validates manifest/scenarios/env without API calls; live runs require explicit operator credentials and are not a default CI smoke. Task 2.3 made dry-run branch-stable with an explicit current-checkout manifest mode while keeping live verification strict. |
| Blueprint audit | `./bin/wp audit blueprint-lifecycle` | Use as the durable lifecycle format gate after implementation. |
| Package safety | `npm pack --dry-run --json`, `vp run lint:pkg`, `vp run public:readiness`, `vp run verify:secrets` | Required before release-facing parity claims ship because README/package surfaces are public disclosure boundaries. |
| Generated/runtime surfaces | `.agent/`, `.agents/`, `.omx/`, `.codex/`, `.claude/skills/`, `.omc/`, `.opencode/` are ignored/generated | Do not add replacement proof to generated agent surfaces; update catalog/source-of-truth files only. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| ---- | ----- | ------------ | -------------- | ---------------- |
| **Wave 0** | 1.1, 2.1, 2.2, 2.3 | Dependency blueprint outputs available enough to fixture | 4 agents | S-M |
| **Wave 1** | 1.2 | Task 1.1 | 1 agent | S |
| **Wave 2** | 3.1 | Tasks 1.1, 1.2, 2.1, 2.2, 2.3 | 1 agent | S |
| **Critical path** | 1.1 → 1.2 → 3.1 | -- | 3 waves | L |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ planned agents / 2 | 4 tasks |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 6 / 3 = 2.0 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 7 / 6 = 1.17 |
| CP | same-file overlaps per wave | 0 | 0 |

**Parallelization score:** B. The plan keeps four agents busy immediately and has no same-wave file conflicts, but the final release claim gate intentionally fans in after all proof lanes so CPR remains below 2.5. Refinement delta: the original three coarse tasks were split into six disjoint tasks, sibling-blueprint edits were removed, and existing repo command surfaces replaced guessed invocations.

## Phase 1: explicit parity checklist [Complexity: M]

#### [qa] Task 1.1: Create the repo-owned replacement parity matrix

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/audit/reference-parity-matrix.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-13T20:12:49.519Z"},{"agent":"codex","command":"./bin/wp lint docs/bench/reference-parity-matrix.md src/audit/reference-parity-matrix.ts src/audit/reference-parity-matrix.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-13T20:12:49.519Z"}]
```

**Depends:** None

Create a durable parity matrix that names every replacement claim, the required
proof artifact, the host applicability, and the current status. The matrix must
separate full support from degraded or unsupported behavior so release language
cannot imply parity where the capability matrix says otherwise. Define the row
schema explicitly in the document and tests: capability, host scope, support
level, proof artifact, required-for-release flag, and status. Open or missing
rows must block release-facing full-parity claims instead of being treated as
informational. (F4, F5, F8)

**Files:**

- Create: `docs/bench/reference-parity-matrix.md`
- Create: `src/audit/reference-parity-matrix.ts`
- Create: `src/audit/reference-parity-matrix.test.ts`

**Steps (TDD):**

1. Write failing tests in `src/audit/reference-parity-matrix.test.ts` that require the explicit row schema plus rows for lifecycle capture, resume injection, tool discovery, indexed search, host setup smoke, benchmark thresholds, and release claim gating.
2. Run: `./bin/wp test --file src/audit/reference-parity-matrix.test.ts` — verify FAIL.
3. Implement the smallest parser/checker in `src/audit/reference-parity-matrix.ts` and create `docs/bench/reference-parity-matrix.md` with explicit proof-artifact links and host applicability columns.
4. Run: `./bin/wp test --file src/audit/reference-parity-matrix.test.ts` — verify PASS.
5. Run: `./bin/wp lint docs/bench/reference-parity-matrix.md src/audit/reference-parity-matrix.ts src/audit/reference-parity-matrix.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [x] Every claimed parity capability is listed explicitly with status, host scope, proof artifact, and release criticality.
- [x] Degraded/unsupported host behavior is not counted as full replacement parity.
- [x] Matrix parser/checker fails closed when a required row or proof artifact is missing.
- [x] Open or blocked rows prevent full replacement claims from turning green in Task 3.1.
- [x] `./bin/wp test --file src/audit/reference-parity-matrix.test.ts` passes.
- [x] `./bin/wp lint docs/bench/reference-parity-matrix.md src/audit/reference-parity-matrix.ts src/audit/reference-parity-matrix.test.ts` passes.
- [x] `./bin/wp typecheck` passes.
#### [host] Task 1.2: Crosswalk replacement rows to the canonical host capability matrix

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-13T20:12:49.519Z"},{"agent":"codex","command":"./bin/wp lint src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.ts src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts docs/hook-matrix.md","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-13T20:12:49.519Z"}]
```

**Depends:** Task 1.1

Connect the new replacement matrix to the existing host lifecycle capability
source of truth. This task prevents docs from claiming host parity when
`CAPABILITY_MATRIX` marks a host/event as partial, unmapped, or unsupported.
(F4, F8)

**Files:**

- Modify: `src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts`
- Modify: `docs/hook-matrix.md`

**Steps (TDD):**

1. Add failing assertions in `src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts` that replacement-matrix lifecycle rows cannot claim full support unless the canonical host/event support level allows it.
2. Run: `./bin/wp test --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts` — verify FAIL.
3. Add minimal crosswalk metadata or helpers to `capability-matrix.ts` and update `docs/hook-matrix.md` to explain the replacement-claim relationship.
4. Run: `./bin/wp test --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts` — verify PASS.
5. Run: `./bin/wp lint src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.ts src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts docs/hook-matrix.md` and `./bin/wp typecheck`.

**Acceptance:**

- [x] Capability-matrix tests prevent unsupported host/event rows from becoming full replacement claims.
- [x] `docs/hook-matrix.md` points readers to the replacement parity matrix without duplicating unsupported claims.
- [x] No generated agent/runtime surface is edited.
- [x] `./bin/wp test --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts` passes.
- [x] `./bin/wp lint src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.ts src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts docs/hook-matrix.md` passes.
- [x] `./bin/wp typecheck` passes.

## Phase 2: host smoke + benchmark gates [Complexity: L]
#### [qa] Task 2.1: Add bounded host setup smoke fixtures for replacement-critical hosts

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/__integration__/reference-parity-host-smoke.test.ts --file src/cli/commands/init/host-smoke.e2e.test.ts","exit_code":0,"kind":"integration","result":"pass","target_files":["src/__integration__/reference-parity-host-smoke.test.ts","src/cli/commands/init/host-smoke.e2e.test.ts"],"ts":"2026-06-13T20:12:49.519Z"},{"agent":"codex","command":"./bin/wp lint src/__integration__/reference-parity-host-smoke.fixtures.ts src/__integration__/reference-parity-host-smoke.test.ts src/cli/commands/init/host-smoke.e2e.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-13T20:12:49.519Z"}]
```

**Depends:** None

Extend existing host setup smoke coverage with replacement-critical assertions:
setup must emit valid managed configuration, lifecycle hook output must remain
machine-readable for the host, and host-specific optional checks must skip or
fail according to explicit environment flags. Do not increase timeout budgets to
hide flakiness; failures must name the broken host surface. Normal CI must still
exercise fixture-backed expectations for every named host even when live host
binaries are unavailable. (F3, F7, F8)

**Files:**

- Modify: `src/cli/commands/init/host-smoke.e2e.test.ts`
- Create: `src/__integration__/reference-parity-host-smoke.fixtures.ts`
- Create: `src/__integration__/reference-parity-host-smoke.test.ts`

**Steps (TDD):**

1. Add failing smoke tests for Claude, Codex, Cursor, and OpenCode setup/config expectations using fixture helpers from `reference-parity-host-smoke.fixtures.ts`, with fixture-backed checks that run in default CI and any live-host probes gated separately by env.
2. Run: `./bin/wp test --file src/__integration__/reference-parity-host-smoke.test.ts --file src/cli/commands/init/host-smoke.e2e.test.ts` — verify FAIL.
3. Implement bounded fixture helpers and tighten `host-smoke.e2e.test.ts` assertions so skipped optional hosts are explicit and required hosts fail closed.
4. Run: `./bin/wp test --file src/__integration__/reference-parity-host-smoke.test.ts --file src/cli/commands/init/host-smoke.e2e.test.ts` — verify PASS.
5. Run: `./bin/wp lint src/__integration__/reference-parity-host-smoke.fixtures.ts src/__integration__/reference-parity-host-smoke.test.ts src/cli/commands/init/host-smoke.e2e.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [x] Host smoke covers install/config, lifecycle output shape, and tool discoverability where the host supports it.
- [x] Claude, Codex, Cursor, and OpenCode are represented with full/degraded/unsupported distinctions.
- [x] Smoke skips are controlled by explicit environment flags, not silent absence.
- [x] Default CI still runs fixture-backed parity assertions for every named host even when live host binaries are absent.
- [x] No timeout increase is used as the fix for slow or flaky smoke.
- [x] `./bin/wp test --file src/__integration__/reference-parity-host-smoke.test.ts --file src/cli/commands/init/host-smoke.e2e.test.ts` passes.
- [x] `./bin/wp lint src/__integration__/reference-parity-host-smoke.fixtures.ts src/__integration__/reference-parity-host-smoke.test.ts src/cli/commands/init/host-smoke.e2e.test.ts` passes.
- [x] `./bin/wp typecheck` passes.
#### [mcp] Task 2.2: Add tool-surface smoke for replacement-critical MCP discovery

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/__integration__/reference-parity-tool-surface.test.ts --file src/mcp/server.integration.test.ts","exit_code":0,"kind":"integration","result":"pass","target_files":["src/__integration__/reference-parity-tool-surface.test.ts","src/mcp/server.integration.test.ts"],"ts":"2026-06-13T20:12:49.519Z"},{"agent":"codex","command":"./bin/wp lint src/__integration__/reference-parity-tool-surface.test.ts src/mcp/server.integration.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-13T20:12:49.519Z"}]
```

**Depends:** None

Add integration coverage that proves the server exposes the replacement-critical
tool surface expected by the parity matrix: file/session execution, indexing,
fetch-and-index, restore/search, stats/purge/doctor/upgrade/insight, and audit
entrypoints where those dependency blueprints have landed. Missing dependency-owned tools
must show as pending matrix gaps, not as implied success. (F4, F6)

**Files:**

- Modify: `src/mcp/server.integration.test.ts`
- Create: `src/__integration__/reference-parity-tool-surface.test.ts`

**Steps (TDD):**

1. Add failing integration assertions that compare the advertised MCP tool names to the replacement parity matrix rows.
2. Run: `./bin/wp test --file src/__integration__/reference-parity-tool-surface.test.ts --file src/mcp/server.integration.test.ts` — verify FAIL.
3. Implement the smallest test helpers/assertions needed; if a dependency-owned tool is not yet implemented, mark the matrix row as blocked/open rather than editing dependency-owned code in this task.
4. Run: `./bin/wp test --file src/__integration__/reference-parity-tool-surface.test.ts --file src/mcp/server.integration.test.ts` — verify PASS.
5. Run: `./bin/wp lint src/__integration__/reference-parity-tool-surface.test.ts src/mcp/server.integration.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [x] Tool-surface smoke checks advertised tools against explicit parity rows.
- [x] Missing dependency-owned tools produce actionable open gaps, not green false positives.
- [x] The test names the exact missing or misadvertised MCP surface.
- [x] `./bin/wp test --file src/__integration__/reference-parity-tool-surface.test.ts --file src/mcp/server.integration.test.ts` passes.
- [x] `./bin/wp lint src/__integration__/reference-parity-tool-surface.test.ts src/mcp/server.integration.test.ts` passes.
- [x] `./bin/wp typecheck` passes.
#### [bench] Task 2.3: Add dry-run regression thresholds for continuity latency and search quality

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file scripts/bench/lib/manifest.test.ts --file src/cli/commands/bench/session-memory.test.ts --file src/__integration__/reference-parity-bench.integration.test.ts","exit_code":0,"kind":"integration","result":"pass","target_files":["scripts/bench/lib/manifest.test.ts","src/cli/commands/bench/session-memory.test.ts","src/__integration__/reference-parity-bench.integration.test.ts"],"ts":"2026-06-13T20:12:49.519Z"},{"agent":"codex","command":"./bin/wp bench session-memory --dry-run","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-13T20:12:49.519Z"}]
```

**Depends:** None

Use the existing session-memory bench command as the harness entrypoint and add
threshold reporting that can gate regressions without requiring live API calls
by default. Live benchmark runs may remain operator-triggered, but dry-run must
validate scenarios, manifests, threshold schema, and report shape from a normal
committed feature branch. Do not count unit tests alone as readiness: the real
`wp bench session-memory --dry-run` command must pass without requiring a
manifest lock that changes every time HEAD changes. Mocked dependency tests
belong in `session-memory.test.ts`; replacement readiness needs at least one
command/runtime integration smoke with no injected benchmark runtime deps.
(F1, F2, F7, F9, F10)

**Files:**

- Modify: `src/cli/commands/bench/session-memory.ts`
- Modify: `src/cli/commands/bench/session-memory.test.ts`
- Modify: `scripts/bench/lib/manifest.ts`
- Verify unchanged: `scripts/bench/manifest.lock.json`
- Modify: `docs/bench/session-memory-methodology.md`
- Rename/modify: `src/__integration__/reference-parity-bench.test.ts` -> `src/__integration__/reference-parity-bench.integration.test.ts`

**Steps (TDD):**

1. Add failing unit tests in `src/cli/commands/bench/session-memory.test.ts` for threshold schema/report fields covering post-tool capture latency, pre-compaction snapshot latency, startup/resume injection, and search quality, plus a manifest-drift regression that proves dry-run does not require chasing the current feature-branch HEAD for all plugin SHA fields.
2. Add a failing integration smoke in `src/__integration__/reference-parity-bench.integration.test.ts` that uses the real benchmark runtime path or shells through `./bin/wp bench session-memory --dry-run`; it must not inject a fake `RunBenchSessionMemoryDeps` object. Assert exact output/report fields for `runId`, `dryRun`, cell count, and all threshold axis ids/statuses.
3. Run: `./bin/wp test --file src/cli/commands/bench/session-memory.test.ts --file src/__integration__/reference-parity-bench.integration.test.ts` — verify FAIL before implementation when the real dry-run path still reports manifest drift.
4. Implement minimal threshold/report handling in `session-memory.ts` and a branch-stable manifest strategy in `scripts/bench/lib/manifest.ts`. Acceptable fixes include a documented pinned fixture/plugin-dir contract or a dry-run-only manifest validation mode that verifies lock shape and explicit plugin refs without comparing every default plugin path to the mutable current checkout HEAD. Do not add a broad "skip manifest" bypass.
5. Run: `./bin/wp test --file src/cli/commands/bench/session-memory.test.ts --file src/__integration__/reference-parity-bench.integration.test.ts` — verify PASS.
6. Run: `./bin/wp bench session-memory --dry-run` to verify real manifest/scenario/report wiring.
7. Document threshold semantics and manifest/repin semantics in `docs/bench/session-memory-methodology.md`.
8. Run: `./bin/wp lint src/cli/commands/bench/session-memory.ts src/cli/commands/bench/session-memory.test.ts scripts/bench/lib/manifest.ts scripts/bench/lib/manifest.test.ts src/__integration__/reference-parity-bench.integration.test.ts docs/bench/session-memory-methodology.md` and `./bin/wp typecheck`.

**Acceptance:**

- [x] Continuity and search thresholds are represented in bench output, not only prose.
- [x] Dry-run validates threshold schema/report shape without API credentials.
- [x] Benchmark readiness has at least one no-injected-deps integration smoke; mocked dependency tests alone are not accepted as proof.
- [x] Integration assertions check exact output/report fields, not only `exitCode === 0` or truthy status.
- [x] Dry-run manifest validation is branch-stable and does not require repinning to the mutable current checkout HEAD after every commit.
- [x] Manifest mismatch failures remain fail-closed for real version/tool drift; no broad skip-manifest bypass is introduced.
- [x] Live benchmark requirements are documented separately from default CI smoke.
- [x] No timeout budget is raised to mask benchmark slowness.
- [x] `./bin/wp test --file src/cli/commands/bench/session-memory.test.ts --file src/__integration__/reference-parity-bench.integration.test.ts` passes.
- [x] `./bin/wp bench session-memory --dry-run` passes.
- [x] `./bin/wp lint src/cli/commands/bench/session-memory.ts src/cli/commands/bench/session-memory.test.ts scripts/bench/lib/manifest.ts scripts/bench/lib/manifest.test.ts src/__integration__/reference-parity-bench.integration.test.ts docs/bench/session-memory-methodology.md` passes.
- [x] `./bin/wp typecheck` passes.

## Phase 3: release and claim gate [Complexity: S]
#### [release] Task 3.1: Tie public replacement claims to green parity proofs

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/audit/ai-contracts.test.ts --file src/audit/reference-parity-claims.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-13T20:12:49.519Z"},{"agent":"codex","audit_kind":"public-package-safety","command":"npm pack --dry-run --json && vp run lint:pkg && vp run public:readiness && vp run verify:secrets","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-13T20:12:49.519Z"}]
```

**Depends:** Task 1.1, Task 1.2, Task 2.1, Task 2.2, Task 2.3

No README, changelog, or package-facing release note should claim full
replacement parity until the matrix rows, host smoke, tool-surface smoke, and
bench gates are green. Add an explicit release-facing rule and audit coverage
that fail closed on unsupported or unproven full-parity wording. (F5, F6)

**Files:**

- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `src/audit/ai-contracts.ts`
- Modify: `src/audit/ai-contracts.test.ts`
- Create: `src/audit/reference-parity-claims.test.ts`

**Steps (TDD):**

1. Add failing claim-audit tests that seed unsupported replacement/full-parity language and require a link to green proof artifacts before allowing it.
2. Run: `./bin/wp test --file src/audit/ai-contracts.test.ts --file src/audit/reference-parity-claims.test.ts` — verify FAIL.
3. Implement the smallest audit rule in `src/audit/ai-contracts.ts` and update README/CHANGELOG wording to evidence-backed language that points to the parity matrix.
4. Run: `./bin/wp test --file src/audit/ai-contracts.test.ts --file src/audit/reference-parity-claims.test.ts` — verify PASS.
5. Run: `npm pack --dry-run --json`, `vp run lint:pkg`, `vp run public:readiness`, and `vp run verify:secrets` to verify public package safety.
6. Run: `./bin/wp lint README.md CHANGELOG.md src/audit/ai-contracts.ts src/audit/ai-contracts.test.ts src/audit/reference-parity-claims.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [x] Public docs cannot claim full replacement before proof artifacts exist and pass.
- [x] The claim gate points to checklist, host smoke, tool-surface smoke, and bench evidence.
- [x] README/CHANGELOG language distinguishes proven support from open/degraded gaps.
- [x] Public package dry-run and package-surface checks pass with no denied content.
- [x] `./bin/wp test --file src/audit/ai-contracts.test.ts --file src/audit/reference-parity-claims.test.ts` passes.
- [x] `npm pack --dry-run --json`, `vp run lint:pkg`, `vp run public:readiness`, and `vp run verify:secrets` pass.
- [x] `./bin/wp lint README.md CHANGELOG.md src/audit/ai-contracts.ts src/audit/ai-contracts.test.ts src/audit/reference-parity-claims.test.ts` passes.
- [x] `./bin/wp typecheck` passes.

### Phase 4: Lifecycle closeout [Complexity: XS]

#### [lifecycle] Task 4.1: Promote to completed after the in-progress transition lands

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","audit_kind":"blueprint-lifecycle","command":"./bin/wp audit blueprint-lifecycle","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-13T20:50:00Z"},{"agent":"codex","audit_kind":"blueprint-readme-drift","command":"./bin/wp audit blueprint-readme-drift --fix","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-13T20:50:00Z"}]
```

**Depends:** Task 3.1

This branch implements and verifies the blueprint work, but the repository
lifecycle audit compares the PR against its merge-base. Because the merge-base
still contains this blueprint under `planned/`, this PR can only legally move it
to `in-progress/`; the final `completed/` promotion must happen in a follow-up
after the legal intermediate state exists on the base branch.

**Files:**

- Move: `blueprints/in-progress/2026-06-13-reference-parity-regression-and-host-smoke-gate.md` → `blueprints/completed/2026-06-13-reference-parity-regression-and-host-smoke-gate.md`
- Modify: `blueprints/README.md`

**Steps:**

1. After this PR lands, run `./bin/wp blueprint finalize 2026-06-13-reference-parity-regression-and-host-smoke-gate`.
2. Run `./bin/wp audit blueprint-lifecycle` and `./bin/wp audit blueprint-readme-drift --fix`.
3. Commit the lifecycle-only closeout.

**Acceptance:**

- [x] The final closeout PR moves this blueprint from `in-progress/` to `completed/`.
- [x] `./bin/wp audit blueprint-lifecycle` passes on the closeout PR.
- [x] `blueprints/README.md` is in sync after the final lifecycle move.

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Blueprint lifecycle | `./bin/wp audit blueprint-lifecycle` | Target blueprint remains lifecycle-valid. |
| Type safety | `./bin/wp typecheck` | Zero errors. |
| Lint | `./bin/wp lint docs/bench/reference-parity-matrix.md docs/bench/session-memory-methodology.md docs/hook-matrix.md src/audit/reference-parity-matrix.ts src/audit/reference-parity-matrix.test.ts src/audit/ai-contracts.ts src/audit/ai-contracts.test.ts src/audit/reference-parity-claims.test.ts src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.ts src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts src/cli/commands/init/host-smoke.e2e.test.ts src/cli/commands/bench/session-memory.ts src/cli/commands/bench/session-memory.test.ts scripts/bench/lib/manifest.ts src/__integration__/reference-parity-host-smoke.fixtures.ts src/__integration__/reference-parity-host-smoke.test.ts src/__integration__/reference-parity-tool-surface.test.ts src/__integration__/reference-parity-bench.integration.test.ts src/mcp/server.integration.test.ts README.md CHANGELOG.md` | Zero violations. |
| Focused tests | `./bin/wp test --file src/audit/reference-parity-matrix.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts --file src/__integration__/reference-parity-host-smoke.test.ts --file src/cli/commands/init/host-smoke.e2e.test.ts --file src/__integration__/reference-parity-tool-surface.test.ts --file src/mcp/server.integration.test.ts --file src/cli/commands/bench/session-memory.test.ts --file src/__integration__/reference-parity-bench.integration.test.ts --file src/audit/ai-contracts.test.ts --file src/audit/reference-parity-claims.test.ts` | All pass. |
| Bench dry-run | `./bin/wp bench session-memory --dry-run` | Manifest, scenarios, threshold schema, and report wiring validate without API calls. |
| Public package safety | `npm pack --dry-run --json && vp run lint:pkg && vp run public:readiness && vp run verify:secrets` | Public tarball/package surface includes only intentional files and no denied content. |
| Repo QA | `vp run qa` | Full build/typecheck/lint/format/test/package/audit pipeline passes before release claim lands. |

## Cross-Plan References

| Type | Blueprint | Relationship | Refinement Note |
| ---- | --------- | ------------ | --------------- |
| Dependency | `2026-06-10-harness-regression-gate` | Reuse harness gating infrastructure. | Do not edit from this blueprint; if benchmark threshold fields need harness-gate integration, record a follow-up in that plan. |
| Dependency | `2026-06-10-harness-surface-manifest` | Reuse manifest/reporting surface. | Parity matrix should link to manifest rows once the manifest exists. |
| Dependency | `2026-06-13-session-continuity-and-resume-parity` | Supplies lifecycle parity. | Replacement rows for capture/resume stay blocked until that plan lands. |
| Dependency | `2026-06-13-sandboxed-knowledge-tool-surface-parity` | Supplies tool-surface parity. | Tool smoke must distinguish missing dependency-owned tools from local regression. |
| Dependency | `2026-06-13-multi-host-plugin-and-instruction-surface-expansion` | Supplies packaged host parity. | Host smoke covers only supported/degraded claims surfaced by that plan. |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task / Finding |
| --------- | ---- | -------- | -------------- |
| A capability exists but lacks proof | False-positive parity claim | Checklist row remains open until a test/bench artifact exists. | 1.1, 3.1 / F4, F5 |
| Host smoke becomes flaky | Loss of trust in the gate | Keep smoke bounded and fixture-driven; investigate root cause instead of raising timeouts. | 2.1 / F7 |
| Optional host binary is absent locally | False red local run or silent false green | Use explicit env flags to choose skip vs required-fail behavior. | 2.1 / F3 |
| Benchmark noise masks regressions | Noisy release block or silent failure | Validate threshold schema in dry-run and reserve live thresholds for measured operator runs. | 2.3 / F2, F7 |
| Manifest lock follows mutable feature-branch HEAD | `wp bench session-memory --dry-run` cannot stay green after commits, so the benchmark gate is not operationally usable. | Add a branch-stable manifest/repin contract and keep mismatch failures for real tool/version drift. | 2.3 / F9 |
| Mocked "integration" test gives false confidence | Tests pass while the real CLI fails for manifest/runtime wiring. | Keep dependency-injected tests as unit coverage and add a no-injected-deps command/runtime integration smoke with exact output assertions. | 2.3 / F10 |
| Degraded host support is marketed as full parity | Misleading public claim | Crosswalk replacement rows to canonical capability support levels. | 1.2, 3.1 / F4, F8 |
| Dependency-owned tool or lifecycle plans are not landed | Local tests fail for missing dependencies | Mark matrix rows blocked/open and avoid editing sibling blueprints from this plan. | 2.2 / F6 |
| Public package tarball includes private proof artifacts | Public disclosure leak | Run dry tarball/package-surface/secret checks before release-facing claims ship. | 3.1 / F5 |

## Non-goals

- Re-implementing the continuity/tool/host work inside this blueprint.
- Editing sibling blueprints during this blueprint's execution.
- Adding subjective UX reviews as the release gate.
- Treating docs-only equivalence as sufficient proof.
- Adding new dependencies or speculative framework layers for parity reporting.
- Raising test, hook, or benchmark timeouts to make smoke pass.

## Risks

| Risk | Impact | Mitigation | Task / Finding |
| ---- | ------ | ---------- | -------------- |
| The checklist grows faster than implementation | Permanent red gate | Keep rows actionable, statused, and tied to concrete dependency blueprints. | 1.1 / F4 |
| Bench harness becomes too expensive for routine use | Gate avoidance | Keep default gate to dry-run/schema/report validation; require explicit operator action for live API runs. | 2.3 / F2 |
| Bench dry-run remains tied to HEAD-only manifest pins | CI/local operators ignore the gate because it fails after every legitimate commit. | Task 2.3 must prove branch-stable dry-run behavior while keeping manifest drift fail-closed. | 2.3 / F9 |
| Benchmark tests assert the mock, not the product | Release gate claims readiness even though no user-invoked path was exercised. | Require the real `wp bench` dry-run path plus exact threshold/report assertions before Task 2.3 can complete. | 2.3 / F10 |
| Release docs drift from implementation | Overclaiming | Add claim audit coverage and public package safety gates. | 3.1 / F5 |
| Same-file conflicts block parallel execution | Slower `/pll` execution or merge conflicts | Keep Wave 0 tasks disjoint; fan in only at release claim gate. | All tasks |
| Dependency plans expose different file names or tool names when implemented | Broken references in parity smoke | Tests should read actual registry/matrix outputs and fail with exact missing surface names. | 2.1, 2.2 / F6 |
| Host ecosystem behavior changes after the matrix lands | Stale capability claims | Treat capability-matrix updates as required when host smoke or official behavior changes. | 1.2, 2.1 / F4, F8 |

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 10 |
| Critical | 0 |
| High | 5 |
| Medium | 4 |
| Low | 1 |
| Fixes applied | 10/10 |
| Cross-plans updated | 0 (out of scope for this owned-file refinement) |
| Edge cases documented | 9 |
| Risks documented | 8 |
| Parallelization score | B |
| Critical path | 3 waves |
| Max parallel agents | 4 |
| Total tasks | 7 |
| Blueprint compliant | 7/7 |