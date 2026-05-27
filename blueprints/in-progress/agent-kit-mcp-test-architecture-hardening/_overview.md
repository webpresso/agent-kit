---
type: blueprint
title: Agent-Kit MCP test architecture hardening for deterministic, fast verification
status: in-progress
complexity: L
owner: agent
created: 2026-05-27
last_updated: 2026-05-27
---

## Product wedge anchor

- **Stage outcome:** MCP blueprint-server verification is deterministic and bounded by file-level Vitest parallelism.
- **Consuming surface:** `wp_test` / `wp_qa` verification for `src/mcp/blueprint-server*.test.ts`.
- **New user-visible capability:** Contributors can verify blueprint MCP contracts quickly without raising timeouts or weakening stale-read behavior.

## Summary

Harden the MCP blueprint-server test architecture by splitting monolithic coverage, sharing setup helpers, preserving missing-vs-stale projection contracts, and removing timestamp-order flakes in promote tests.

## Verification-performance contract

- Do **not** raise Vitest or handler timeouts to hide slow tests.
- Do **not** loosen global Vitest isolation defaults.
- Do **not** silently repair stale projections on read paths; stale list/get/context reads must return `next_action.kind: "reingest_project"`.
- Lazy projection creation is allowed only for missing DBs.
- Steady-state target: targeted blueprint-server verification should pass under a 45s wrapper cap; `<30s` remains the stretch regression target.

## Findings

- **F1 — CRITICAL:** The original blueprint-server suite was structurally too monolithic for Vitest’s default worker model.
- **F2 — HIGH:** `test.concurrent` alone is not a replacement for file splitting because it stays inside one worker.
- **F3 — HIGH:** Promote-path validation tests depended on same-ms filesystem timestamp ordering.
- **F4 — HIGH:** Missing projection DB and stale projection DB behavior must remain distinct.
- **F5 — MEDIUM:** Shared temp-repo/tool-registration/result parsing setup was duplicated across MCP test files.
- **F6 — MEDIUM:** The timeout problem is local to MCP/blueprint verification architecture; no global isolation policy change is needed.
- **F7 — HIGH:** In-test wall-clock assertions are deterministic flake sources under Vitest worker contention; timing should be measured by bounded `wp_test` batches, not by `Date.now()` assertions inside contract tests.

## Implementation notes

- Added `src/mcp/blueprint-server.test-harness.ts` for registrar/tool invocation, temp repo creation, fixture writing, lazy/no-projection setup, projection-backed setup, explicit validation timestamp seeding, and stale metadata seeding.
- Added `src/mcp/blueprint-server.test-architecture.test.ts` as an automated regression guard for split files, serial-size budgets, no `test.concurrent`, no old 120s timeout literals, and no production imports of the test harness.
- Split read/projection coverage into:
  - `src/mcp/blueprint-server.list-projection.test.ts`
  - `src/mcp/blueprint-server.get-projection.test.ts`
  - `src/mcp/blueprint-server.context-projection.test.ts`
- Split verify/idempotency coverage into `src/mcp/blueprint-server.verify-idempotency.test.ts`.
- Split platform-first mutation/read coverage into:
  - `src/mcp/blueprint-server.platform-first.task-advance.test.ts`
  - `src/mcp/blueprint-server.platform-first.lifecycle.test.ts`
  - `src/mcp/blueprint-server.platform-first.scaffold-read.test.ts`
- Added `src/mcp/blueprint-server.platform-first.test-harness.ts` so platform adapter wiring and fixture setup stay consistent across those files.
- Moved duplicated timeout guard assertions to `src/mcp/blueprint-server.platform-timeouts.test.ts`.
- Made promote tests deterministic by writing an explicit future validation timestamp after validation setup.
- Aligned adjacent registration/workflow tests with the hardened projection contract: registration is lightweight and never repairs projections; stale aggregate projects report `next_action.kind: "reingest_project"`; missing projection DBs may lazy-create.
- Removed brittle wall-clock assertions from MCP workflow/fixture tests and the blueprint DB migration bulk-insert test; those tests now assert behavior, while performance is guarded by external `wp_test` timing evidence.

## Timing evidence

- `wp_test` on list/get/context projection split with `timeoutMs: 45000`: **pass, 17.97s**; verify rerun **pass, 16.40s**.
- `wp_test` on the 7-file blueprint-server target batch with `timeoutMs: 45000`: **pass, 35.19s**; verify rerun **pass, 31.40s**.
- `wp_test` on `src/mcp/blueprint-server.test.ts` with `timeoutMs: 120000`: **pass, 12.76s** (measurement only; not a target cap).
- `wp_test` on split platform-first files + architecture guard (`task-advance`, `lifecycle`, `scaffold-read`, `test-architecture`) with `timeoutMs: 45000`: **pass, 15.89s**.
- `wp_test` on `src/mcp/blueprint-server.verify-idempotency.test.ts` with `timeoutMs: 45000`: **pass, 5.60s**; verify rerun **pass, 5.13s**.
- `wp_test` on `src/mcp/blueprint-server.platform-timeouts.test.ts` with `timeoutMs: 45000`: **pass, 4.05s**; verify rerun **pass, 4.41s**.
- `wp_typecheck`: **pass**; verify rerun **pass**.
- `wp_qa` targeted batch 1 (`blueprint-server.test`, list/get/context projection): **pass, 22.52s**; verify rerun **pass, 24.92s**.
- `wp_qa` targeted batch 2a (verify + platform-timeouts): **pass, 9.95s**.
- `wp_qa` targeted batch 2b (platform-first + harness): **pass, 21.99s**.
- `wp_audit kind=blueprint-lifecycle`: **pass**; verify rerun **pass**.
- `wp_audit kind=agents`: **pass**.
- Future-proofing rerun: `wp_test` on the 7-file target with `timeoutMs: 45000`: **pass, 36.30s**.
- Automated guard evidence: `wp_test` on `src/mcp/blueprint-server.test-architecture.test.ts`: **pass, 0.65s**.
- Post-guard target batch: `wp_test` on the 8-file target with `timeoutMs: 45000`: **pass, 27.96s**.
- Future-proofing audit: `wp_lint` on touched MCP TS files: **pass**; `wp_audit kind=tph`: **pass**; `git diff --check`: **pass**.
- Adjacent contract fix: `wp_test` on `src/mcp/blueprint-server.registration.test.ts` + `src/mcp/blueprint-workflow.integration.test.ts` with `timeoutMs: 45000`: **pass, 16.10s**.
- Adjacent MCP batch after removing in-test wall-clock flakes: `wp_test` on registration/workflow/projects/project-resolver/validation/fixture tests with `timeoutMs: 45000`: **pass, 27.23s**.
- Adjacent timing-risk cleanup: `wp_test` on registration/workflow/fixture/migrations tests with `timeoutMs: 45000`: **pass, 33.94s**.
- Current final checks: `wp_lint` on adjacent touched files: **pass**; `wp_typecheck`: **pass**; `wp_qa` on adjacent touched files: **pass, 19.42s**.
- Full split-batch proof: `wp_test` on the 10-file blueprint-server target (`test`, split platform-first files, timeouts, list/get/context, verify-idempotency, architecture) with `timeoutMs: 45000`: **pass, 34.83s**.
- Guard hardening: architecture test now forbids in-test wall-clock assertion patterns across `blueprint-server*.test.ts`, preventing flaky local-budget reintroduction.

## Tasks

#### Task 1.1: Freeze the verification-performance contract

**Status:** done

**Acceptance:**
- [x] The blueprint records explicit timeout and behavior invariants.
- [x] Later tasks cannot “fix” this by raising limits or weakening read contracts.

#### Task 1.2: Extract a shared MCP blueprint test harness

**Status:** done

**Acceptance:**
- [x] Boilerplate is removed from blueprint-server test files.
- [x] Tests can opt into lazy/no-projection or projection-backed setup.

#### Task 1.3: Harden missing-vs-stale projection behavior

**Status:** done

**Acceptance:**
- [x] Missing DB paths create projections lazily.
- [x] Stale DB paths still return `next_action: reingest_project`.
- [x] No handler silently re-ingests stale projections on read.

#### Task 1.4: Remove timestamp-ordering nondeterminism

**Status:** done

**Acceptance:**
- [x] Promote-path tests no longer depend on same-ms filesystem timing.
- [x] Repeated runs do not depend on validation freshness races.

#### Task 2.1: Move platform-first mutation coverage into dedicated files

**Status:** done

**Acceptance:**
- [x] Platform mutation tests live outside the main read/contract file.
- [x] File-level worker parallelism is available for this surface.

#### Task 2.2: Move read/projection contract coverage into dedicated files

**Status:** done

**Acceptance:**
- [x] Read-path contract coverage is isolated from mutation coverage.
- [x] Missing-vs-stale behavior is explicit and easy to verify.

#### Task 2.3: Move verify/idempotency coverage into dedicated files

**Status:** done

**Acceptance:**
- [x] Verify-path coverage no longer pays unrelated platform/read setup cost.
- [x] Idempotency scenarios remain covered.

#### Task 3.1: Re-measure the split suite and identify remaining heavy files

**Status:** done

**Acceptance:**
- [x] Per-file/batch timing evidence is recorded in the blueprint.
- [x] No single measured file remains a 60s+ serial bottleneck.

#### Task 3.2: Apply safe second-order optimizations only where isolated

**Status:** done

**Acceptance:**
- [x] No speculative `test.concurrent` was added to shared-state tests.
- [x] Redundant timeout assertions were kept in the timeout-specific file.

#### Task 3.3: Align nearby MCP tests that share the same root cause

**Status:** done

**Acceptance:**
- [x] Nearby split blueprint-server suites use the shared harness where touched.
- [x] Adjacent registration/workflow tests no longer assert old eager-reingest or missing-DB-failure contracts.
- [x] Adjacent MCP/blueprint timing assertions no longer depend on local wall-clock thresholds inside contract tests.
- [x] Scope stayed bounded to shared root-cause cleanup.

#### Task 4.1: Prove the formerly timing-out verification batch is stable

**Status:** done

**Acceptance:**
- [x] The targeted blueprint-server batch passes under a 45s wrapper cap.
- [x] No tool-level timeout occurs in the old failure path.

#### Task 4.2: Run targeted type/QA validation for touched surfaces

**Status:** done

**Acceptance:**
- [x] Typecheck passes.
- [x] Targeted QA passes in two bounded batches.
- [x] No projection contract regressions are introduced.

#### Task 5.1: Record final timing evidence and lock the regression guard

**Status:** done

**Acceptance:**
- [x] Final measured suite timing is recorded.
- [x] The blueprint documents the accepted steady-state target.
- [x] Future regressions can be compared against a known baseline.
- [x] Automated architecture guard prevents silent re-monolithing, speculative `test.concurrent`, old 120s timeout literals, and production imports of the test harness.
