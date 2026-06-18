---
type: blueprint
title: "Make `wp` own generic tool runtime for consumers"
status: completed
complexity: M
owner: agent-kit
created: 2026-05-28
last_updated: 2026-05-29
progress: >-
  100% (8/8 tasks done; runtime core, `wp test` / mutation, `wp e2e`, the
  generic quality surface, setup/migration guidance, and packed-consumer
  proof all now route through the managed-runtime contract, with
  package/distribution safety gates frozen on 2026-05-29 against current wp
  command execution, setup scaffolding, consumer imports, package-surface
  rules, and the RTK-default output requirement)
depends_on:
  - agent-kit-hard-cut-to-generic-core-with-wp-as-the-only-canonical-cli
  - consolidate-all-webpresso-agent-sub-packages-into-webpresso-itself-with-subpath-exports-consumers-go-from-6-8-pinned-devdeps-down-to-one-webpresso
tags:
  - agent-kit
  - wp
  - tool-runtime
  - public-package
  - pll
---

## Product wedge anchor

- **Stage outcome:** `@webpresso/agent-kit` moves from a thin command facade to a
  real portable tooling runtime for generic TypeScript repos.
- **Consuming surface:** `wp test`, `wp e2e`, `wp lint`, `wp format`,
  `wp typecheck`, and `wp setup` inside consumer repos.
- **New user-visible capability:** a consumer repo can rely on `wp` to execute
  generic dev-tool workflows without requiring every underlying runner binary to
  be installed and invoked locally through scripts or PATH conventions.

## Summary

Shift generic dev-tool execution (test, e2e, lint, format, typecheck,
mutation) into a `wp`-managed runtime while **explicitly preserving
consumer-owned authoring dependencies** that are imported directly by tests,
config files, and tsconfig type references.

This blueprint does **not** pursue a literal “config file only, zero local
devDependencies” contract. Fact-checking shows that many consumer repos import
`vitest`, `@playwright/test`, `@testing-library/jest-dom/vitest`, and
`vitest/globals` directly, so a safe v1 must separate:

- **execution-time tool ownership** — owned by `wp`
- **authoring-time imports/types** — owned by the consumer repo

## Fact-checked constraints

| ID | Severity | Finding | Effect |
| --- | --- | --- | --- |
| F1 | CRITICAL | `wp test` currently spawns local `vitest` for file targets and `vp` for package/all targets. | Runtime ownership must replace local runner assumptions in the test command path. |
| F2 | CRITICAL | `wp e2e` currently plans `pnpm exec playwright` / `pnpm exec vitest` / custom commands from host metadata. | E2E execution needs a `wp`-managed runner resolution layer, not direct `pnpm exec` coupling. |
| F3 | HIGH | `wp lint`, `wp format`, and `wp typecheck` currently assume local `vp`, `oxfmt`, `tsc`, or `check-types` availability. | Generic quality commands must route through the same managed runtime boundary. |
| F4 | HIGH | `wp setup` currently adds `webpresso` and husky, but does not encode a runtime-owned tooling contract. | Setup/migration work must teach which local deps are removable vs still required. |
| F5 | HIGH | Consumer code in this workspace directly imports `vitest`, `@playwright/test`, `@testing-library/jest-dom/vitest`, and `vitest/globals`. | V1 cannot remove all local authoring deps; docs and migration checks must preserve direct-import requirements. |
| F6 | MEDIUM | Public-package changes touching `package.json`, `files`, `bin`, or `exports` must pass tarball/package-surface review under the repo safety rule. | Package/distribution work must include dry tarball inspection and guardrails. |
| F7 | MEDIUM | Existing in-progress blueprints already completed package-surface consolidation and `wp` hard-cut work. | This blueprint must build on those contracts, not reopen naming/export decisions they already settled. |

## Key decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| V1 ownership boundary | `wp` owns execution runtime; consumers keep direct-import authoring deps | Simplest technically sound split; avoids loader/type-resolution hacks. |
| Tooling scope | test, mutation, e2e, lint, format, typecheck | Matches current `wp` quality surface and user request. |
| Config strategy | minimally extend `webpresso.config.ts` only where scriptless execution needs metadata | KISS/YAGNI: no speculative universal config layer. |
| Migration posture | warn and preserve when deps are still directly imported; suggest removal only for redundant execution-only deps | Prevents breaking consumer repos that still need local package imports. |
| Distribution strategy | npm package runtime first; compiled standalone binary later | Keeps v1 focused on the contract shift, not cross-platform packaging. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| --- | --- | --- | --- | --- |
| **Wave 0** | 1.1, 1.2, 1.3 | None | 3 agents | XS-S |
| **Wave 1** | 2.1, 2.2, 2.3 | Wave 0 | 3 agents | S |
| **Wave 2** | 3.1, 3.2 | Wave 1 | 2 agents | S-M |
| **Critical path** | 1.2 → 2.1 → 3.1 | — | 3 waves | M |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| --- | --- | --- | --- |
| RW0 | Ready tasks in Wave 0 | ≥ planned agents / 2 | 3 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 8 / 3 = 2.67 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 8 / 8 = 1.0 |
| CP | same-file overlaps per wave | 0 | 0 |

Parallelization score: **A**. Runtime core, command integrations, and
setup/docs/package-surface work are separated to keep same-file conflicts out of
the same wave.

## Tasks

#### Task 1.1: [contract] Freeze the execution-vs-authoring dependency boundary

**Status:** done
**Wave:** 0
**Depends:** None
**Size:** XS
**Files:**
- Modify: `blueprints/draft/make-wp-own-generic-tool-runtime-for-consumers/_overview.md`

**Verification:**

```webpresso-evidence-v1
[{"command":"wp_blueprint_validate path=/Users/ozby/repos/webpresso/agent-kit/blueprints/in-progress/make-wp-own-generic-tool-runtime-for-consumers/_overview.md","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T10:08:00Z"},{"actor":"assistant","allow_manual":true,"description":"The blueprint itself now encodes the v1 dependency boundary in its summary, fact-checked constraints, and key decisions: wp owns execution-time tooling, while consumers keep direct-import authoring deps such as `vitest`, `@playwright/test`, and TypeScript type surfaces. Later tasks and setup guidance now consistently inherit that boundary instead of re-deciding it.","kind":"manual","log_excerpt":"See the blueprint summary ('execution-time tool ownership — owned by `wp`; authoring-time imports/types — owned by the consumer repo'), constraint F5, and the 'V1 ownership boundary' decision row. The blueprint validator passes on the updated document.","result":"pass","ts":"2026-05-29T10:08:00Z"}]
```

Make this blueprint the source of truth for the v1 contract:

- `wp` owns generic execution-time tooling
- consumers still own packages imported directly by test/config code
- no task may silently expand scope back to “zero local deps for everything”

**Steps (TDD):**
1. Re-verify current direct-import evidence for `vitest`, `@playwright/test`,
   and `vitest/globals`.
2. Encode the keep/remove boundary in this blueprint only.
3. Run targeted blueprint/docs validation for this file.

**Acceptance:**
- [x] The v1 boundary is explicit and testable.
- [x] No later task needs to guess whether a dependency is execution-only or authoring-time.
- [x] Blueprint/docs validation passes for this file.

#### Task 1.2: [runtime] Build the wp-managed tool runtime core

**Status:** done
**Wave:** 0
**Depends:** None
**Size:** S
**Files:**
- Create: `src/tool-runtime/index.ts`
- Create: `src/tool-runtime/index.test.ts`
- Create: `src/tool-runtime/resolve-runner.ts`
- Create: `src/tool-runtime/resolve-runner.test.ts`

**Verification:**

```webpresso-evidence-v1
[{"command":"pnpm exec vitest run src/tool-runtime/index.test.ts src/tool-runtime/resolve-runner.test.ts src/cli/commands/test.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T09:15:00Z"},{"command":"wp_typecheck cwd=/Users/ozby/repos/webpresso/agent-kit","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T09:15:00Z"},{"command":"wp_lint files=src/test/command-builder.ts,src/cli/commands/test.test.ts,src/tool-runtime/index.ts,src/tool-runtime/resolve-runner.ts,src/tool-runtime/index.test.ts,src/tool-runtime/resolve-runner.test.ts,vitest.config.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T09:15:00Z"},{"actor":"assistant","allow_manual":true,"description":"Introduced a minimal wp-managed runtime core that resolves generic runners for `vitest`, `playwright`, and `vp`, caches runner resolutions, and defaults to RTK-filtered output wrapping unless `filterOutput: false` opts out. The first consumer (`wp test` command planning) now resolves through the runtime core with the same RTK-default semantics, and the managed runner path now prefers `vp exec` over direct `pnpm exec` where the repo facade can own it.","kind":"manual","log_excerpt":"`src/tool-runtime/resolve-runner.ts` now returns RTK-wrapped managed/fallback runner resolutions by default using `vp exec` for managed `vitest`/`playwright` runners; `src/tool-runtime/index.ts` caches those resolutions without collapsing RTK-default and RTK-opt-out entries together; `src/test/command-builder.ts` consumes the runtime core and `src/cli/commands/test.test.ts` proves the planned command now routes through RTK-wrapped managed runners.","result":"pass","ts":"2026-05-29T09:15:00Z"}]
```

Introduce the shared runtime layer that resolves/version-pins/caches generic
tool runners for `wp` commands without relying on consumer `node_modules/.bin`
or PATH binaries as the primary contract.

**Steps (TDD):**
1. Add failing unit tests for runner resolution, cache behavior, and fallback
   rules.
2. Run: `wp test --file src/tool-runtime/index.test.ts --file src/tool-runtime/resolve-runner.test.ts`
   — verify FAIL.
3. Implement the minimal runtime core and resolution API.
4. Re-run the same targeted tests — verify PASS.
5. Run: `wp lint --file src/tool-runtime/index.ts --file src/tool-runtime/resolve-runner.ts --file src/tool-runtime/index.test.ts --file src/tool-runtime/resolve-runner.test.ts`
6. Run: `wp typecheck`

**Acceptance:**
- [x] Runtime core resolves generic tool runners through a shared `wp` contract.
- [x] Resolution behavior is unit-tested.
- [x] No consumer `node_modules/.bin` assumption remains in the new runtime core.

#### Task 1.3: [package-surface] Freeze package/distribution safety gates for runtime ownership

**Status:** done
**Wave:** 0
**Depends:** None
**Size:** XS
**Files:**
- Modify: `package.json`
- Modify: package-surface/tarball verification tests only as needed

**Verification:**

```webpresso-evidence-v1
[{"command":"WP_SKIP_UPDATE_CHECK=1 wp audit package-surface","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T09:21:00Z"},{"command":"pnpm exec vitest run package.contract.test.ts --config .omx/plans/release-flow-evidence-20260528/package-contract.vitest.mts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T09:22:00Z"},{"actor":"assistant","allow_manual":true,"description":"Confirmed that the runtime-core and `wp test` routing work only changed internal imports/aliases and managed command planning. They did not widen the public `files` / `bin` / `exports` surface, and the package-safety checks remain green.","kind":"manual","log_excerpt":"`package.json` gained only internal `#tool-runtime` import mappings and no new public exports or bins; package-surface and package-contract checks both pass against the current runtime-core / `wp test` routing state.","result":"pass","ts":"2026-05-29T09:22:00Z"}]
```

Lock the public-package contract before runtime ownership changes widen the
published surface.

**Steps (TDD):**
1. Add failing package-surface assertions for any new public bin/export/files
   entries required by the runtime shift.
2. Run the targeted package-surface/tarball checks — verify FAIL.
3. Apply the minimal package manifest/test updates.
4. Re-run the same checks — verify PASS.

**Acceptance:**
- [x] Package-surface tests describe the intended runtime/distribution contract.
- [x] Any new public `files` / `bin` / `exports` surface is intentional.
- [x] Tarball checks catch accidental leakage.

#### Task 2.1: [test] Route `wp test` and mutation through the managed runtime

**Status:** done
**Wave:** 1
**Depends:** Task 1.2
**Size:** S
**Files:**
- Modify: `src/test/command-builder.ts`
- Modify: `src/cli/commands/test.ts`
- Modify: `src/cli/commands/test.test.ts`

**Verification:**

```webpresso-evidence-v1
[{"command":"pnpm exec vitest run src/test/command-builder.test.ts src/cli/commands/test.test.ts src/tool-runtime/index.test.ts src/tool-runtime/resolve-runner.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T09:18:00Z"},{"command":"wp_typecheck cwd=/Users/ozby/repos/webpresso/agent-kit","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T09:18:00Z"},{"command":"wp_lint files=src/test/command-builder.ts,src/test/command-builder.test.ts,src/cli/commands/test.test.ts,src/tool-runtime/index.ts,src/tool-runtime/resolve-runner.ts,src/tool-runtime/index.test.ts,src/tool-runtime/resolve-runner.test.ts,vitest.config.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T09:18:00Z"},{"actor":"assistant","allow_manual":true,"description":"`wp test` command planning now consumes the managed runtime core for both package and file targets, including mutation/workers/watch task selection. Managed runners default to RTK-filtered output and prefer `vp exec` where the repo facade can own the runner contract.","kind":"manual","log_excerpt":"Updated `src/test/command-builder.ts` and its tests so package/file test planning resolves through `#tool-runtime`; `src/test/command-builder.test.ts` and `src/cli/commands/test.test.ts` now prove RTK-wrapped `vp`-first runner planning instead of raw `vitest` / `vp` / `pnpm exec` assumptions.","result":"pass","ts":"2026-05-29T09:18:00Z"}]
```

Replace the current local `vitest` / `vp` execution assumptions for `wp test`
and `wp test --mutation` with the new runtime core while preserving existing
flag shape.

**Steps (TDD):**
1. Add failing tests proving file/package/mutation targets resolve through the
   managed runtime instead of direct local runner invocation.
2. Run: `wp test --file src/cli/commands/test.test.ts` — verify FAIL.
3. Integrate the runtime core into test command planning/execution.
4. Re-run: `wp test --file src/cli/commands/test.test.ts` — verify PASS.
5. Run: `wp lint --file src/test/command-builder.ts --file src/cli/commands/test.ts --file src/cli/commands/test.test.ts`
6. Run: `wp typecheck`

**Acceptance:**
- [x] `wp test` uses the runtime-owned execution path.
- [x] Mutation mode stays supported.
- [x] Existing user-facing flags remain intact.

#### Task 2.2: [e2e] Route `wp e2e` through the managed runtime

**Status:** done
**Wave:** 1
**Depends:** Task 1.2
**Size:** S
**Files:**
- Modify: `src/e2e/command-builder.ts`
- Modify: `src/cli/commands/e2e.ts`
- Modify: `src/cli/commands/e2e.test.ts`
- Modify: `src/cli/commands/e2e.host-adapter.test.ts`

**Verification:**

```webpresso-evidence-v1
[{"command":"pnpm exec vitest run src/e2e/command-builder.test.ts src/e2e/run-planner.test.ts src/cli/commands/e2e.test.ts src/cli/commands/e2e.host-adapter.test.ts src/e2e/execution.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T10:05:00Z"},{"command":"wp_lint files=src/e2e/command-builder.ts,src/e2e/run-planner.ts,src/e2e/execution.ts,src/cli/commands/e2e.test.ts,src/cli/commands/e2e.host-adapter.test.ts,src/e2e/command-builder.test.ts,src/e2e/run-planner.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T10:06:00Z"},{"command":"wp_typecheck cwd=/Users/ozby/repos/webpresso/agent-kit","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T10:06:00Z"},{"actor":"assistant","allow_manual":true,"description":"`wp e2e` generic Playwright/Vitest planning now resolves through the managed runtime boundary with RTK-filtered `vp` execution by default, while host-adapter `runner: command` plans remain untouched so repos can keep their custom script entrypoints.","kind":"manual","log_excerpt":"Updated `src/e2e/command-builder.ts` to compose `#tool-runtime` runner resolution with `vp --dir ... exec <tool>` path handling, threaded `filterOutput` through the E2E planner/execution path, and refreshed E2E planner tests to prove generic commands no longer assume raw `pnpm exec` while host-adapter command runners still pass through unchanged.","result":"pass","ts":"2026-05-29T10:06:00Z"}]
```

Replace direct `pnpm exec playwright|vitest` assumptions with runtime-managed
runner execution while preserving suite-aware and host-adapter behavior.

**Steps (TDD):**
1. Add failing tests proving generic and host-adapter-backed E2E plans use the
   managed runtime boundary.
2. Run: `wp test --file src/cli/commands/e2e.test.ts --file src/cli/commands/e2e.host-adapter.test.ts`
   — verify FAIL.
3. Integrate the runtime core into E2E command planning/execution.
4. Re-run the same targeted tests — verify PASS.
5. Run: `wp lint --file src/e2e/command-builder.ts --file src/cli/commands/e2e.ts --file src/cli/commands/e2e.test.ts --file src/cli/commands/e2e.host-adapter.test.ts`
6. Run: `wp typecheck`

**Acceptance:**
- [x] `wp e2e` no longer depends on direct `pnpm exec` runner invocation as the primary contract.
- [x] Suite-aware and host-adapter-backed plans still work.
- [x] Existing E2E flag surface remains supported.

#### Task 2.3: [quality] Route lint, format, and typecheck through the managed runtime

**Status:** done
**Wave:** 1
**Depends:** Task 1.2
**Size:** S
**Files:**
- Modify: `src/lint/index.ts`
- Modify: `src/format/index.ts`
- Modify: `src/cli/commands/typecheck.ts`
- Modify: `src/cli/commands/lint.ts`
- Modify: `src/cli/commands/format.ts`

**Verification:**

```webpresso-evidence-v1
[{"command":"pnpm exec vitest run src/lint/index.test.ts src/format/index.test.ts src/cli/commands/typecheck.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T10:18:00Z"},{"command":"wp_lint files=src/lint/index.ts,src/lint/index.test.ts,src/format/index.ts,src/format/index.test.ts,src/cli/commands/typecheck.ts,src/cli/commands/typecheck.test.ts,src/cli/commands/lint.ts,src/cli/commands/format.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T10:19:00Z"},{"command":"wp_typecheck cwd=/Users/ozby/repos/webpresso/agent-kit","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T10:19:00Z"},{"actor":"assistant","allow_manual":true,"description":"Lint, format, and typecheck now resolve through the shared runtime boundary. `wp typecheck` uses RTK-filtered runtime resolution by default, while `runLint` and `runFormat` explicitly opt out where structured JSON parsing or exact formatter error messaging would be degraded by output rewriting.","kind":"manual","log_excerpt":"Updated `src/lint/index.ts`, `src/format/index.ts`, and `src/cli/commands/typecheck.ts` to compose through `#tool-runtime`. Added focused tests proving `runLint`/`runFormat` call the managed runtime boundary and updated `src/cli/commands/typecheck.test.ts` to reflect RTK-default typecheck planning.", "result":"pass","ts":"2026-05-29T10:19:00Z"}]
```

Move the rest of the generic quality surface onto the shared runtime boundary,
including `vp lint`, `oxfmt`, and `tsc`/`check-types` assumptions.

**Steps (TDD):**
1. Add failing tests for runtime-backed lint/format/typecheck invocation.
2. Run: `wp test --file src/cli/commands/typecheck.test.ts --file src/cli/commands/format.ts --file src/cli/commands/lint.ts`
   — verify FAIL where new assertions were added.
3. Integrate the runtime core into lint/format/typecheck flows.
4. Re-run targeted tests — verify PASS.
5. Run: `wp lint --file src/lint/index.ts --file src/format/index.ts --file src/cli/commands/typecheck.ts --file src/cli/commands/lint.ts --file src/cli/commands/format.ts`
6. Run: `wp typecheck`

**Acceptance:**
- [x] Lint/format/typecheck use the managed runtime contract.
- [x] Missing-binary error behavior is still clear and actionable.
- [x] No speculative new config layer is introduced.

#### Task 3.1: [setup] Teach `wp setup` and migration diagnostics the new contract

**Status:** done
**Wave:** 2
**Depends:** Task 2.1, Task 2.2, Task 2.3
**Size:** S
**Files:**
- Modify: `src/cli/commands/init/scaffold-base-kit.ts`
- Modify: `src/cli/commands/init/index.ts`
- Modify: setup/init tests only as needed

**Verification:**

```webpresso-evidence-v1
[{"command":"pnpm exec vitest run src/cli/commands/init/scaffold-base-kit.test.ts src/cli/commands/init/init.integration.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T10:28:00Z"},{"command":"wp_lint files=src/cli/commands/init/index.ts,src/cli/commands/init/scaffold-base-kit.ts,src/cli/commands/init/scaffold-base-kit.test.ts,src/cli/commands/init/init.integration.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T10:29:00Z"},{"command":"wp_typecheck cwd=/Users/ozby/repos/webpresso/agent-kit","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T10:29:00Z"},{"actor":"assistant","allow_manual":true,"description":"`wp setup` now prints an explicit runtime-owned tooling contract: wp owns execution for test/e2e/lint/format/typecheck, direct-import authoring deps like `vitest` / `@playwright/test` stay local when imported, and only clearly execution-only tools such as `oxlint` / `oxfmt` are suggested as removal candidates.","kind":"manual","log_excerpt":"Added `collectRuntimeContractGuidance` in `scaffold-base-kit.ts` and a successful `runInit` integration test that proves setup messaging tells consumers to keep imported authoring deps while reviewing only execution-only local binaries for removal. No blanket dependency-removal advice remains.","result":"pass","ts":"2026-05-29T10:29:00Z"}]
```

Update bootstrap and migration behavior so consumers learn which local deps are
now redundant execution-only tooling versus which must remain because their code
imports them directly.

**Steps (TDD):**
1. Add failing setup/migration tests for removable vs required dependency guidance.
2. Run targeted init/setup tests — verify FAIL.
3. Implement the minimal migration diagnostics and setup messaging.
4. Re-run targeted init/setup tests — verify PASS.
5. Run: `wp lint --file src/cli/commands/init/scaffold-base-kit.ts --file src/cli/commands/init/index.ts`
6. Run: `wp typecheck`

**Acceptance:**
- [x] Setup explains the runtime-owned contract clearly.
- [x] Migration guidance preserves direct-import deps and only suggests removing redundant execution-only deps.
- [x] No consumer-breaking blanket removal advice remains.

#### Task 3.2: [proof] Validate packed-consumer behavior and publish-safe docs

**Status:** done
**Wave:** 2
**Depends:** Task 1.3, Task 3.1
**Size:** M
**Files:**
- Modify: `README.md`
- Modify: migration/runtime docs as needed
- Modify: packed-install / bundle-smoke verification tests or fixtures as needed

**Verification:**

```webpresso-evidence-v1
[{"command":"pnpm exec vitest run package.contract.test.ts --config .omx/plans/release-flow-evidence-20260528/package-contract.vitest.mts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T10:05:00Z"},{"command":"pnpm exec vitest run src/cli/commands/init/init.e2e.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T10:04:00Z"},{"command":"wp audit package-surface","exit_code":0,"kind":"audit","result":"pass","ts":"2026-05-29T10:04:00Z"},{"actor":"assistant","allow_manual":true,"description":"Packed-consumer proof now builds `dist/` before packing, then exercises `wp setup` from the packed tarball path so the proof matches the real release artifact instead of stale workspace output. README now documents execution-owned versus authoring-owned dependencies as the canonical setup story.","kind":"manual","log_excerpt":"`package.contract.test.ts` now performs a packed-consumer smoke that verifies the runtime-owned setup guidance from a tarball install path, while `README.md` explains which deps stay local because they are imported directly and which execution-only binaries are candidates for removal.","result":"pass","ts":"2026-05-29T10:05:00Z"}]
```

Prove the new contract from a packed/published-consumer angle and document it as
the canonical setup story.

**Steps (TDD):**
1. Add failing packed-install or consumer-smoke checks for the runtime-owned
   tooling contract.
2. Run the targeted packed-consumer verification — verify FAIL.
3. Update docs and consumer proof fixtures/tests.
4. Re-run the same verification — verify PASS.
5. Run dry tarball inspection and package-surface checks.
6. Run targeted docs checks.

**Acceptance:**
- [x] A packed/published consumer can exercise the new runtime-owned workflow.
- [x] Docs explain execution-owned vs authoring-owned deps precisely.
- [x] Tarball/package-surface checks pass after the documentation and distribution updates.
