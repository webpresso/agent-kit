---
type: blueprint
title: "Make `wp` own generic tool runtime for consumers"
status: in-progress
complexity: M
owner: agent-kit
created: 2026-05-28
last_updated: 2026-05-28
progress: >-
  0% (draft; fact-checked 2026-05-28 against current wp command execution,
  setup scaffolding, consumer imports, and package-surface rules)
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

**Status:** todo
**Wave:** 0
**Depends:** None
**Size:** XS
**Files:**
- Modify: `blueprints/draft/make-wp-own-generic-tool-runtime-for-consumers/_overview.md`

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
- [ ] The v1 boundary is explicit and testable.
- [ ] No later task needs to guess whether a dependency is execution-only or authoring-time.
- [ ] Blueprint/docs validation passes for this file.

#### Task 1.2: [runtime] Build the wp-managed tool runtime core

**Status:** todo
**Wave:** 0
**Depends:** None
**Size:** S
**Files:**
- Create: `src/tool-runtime/index.ts`
- Create: `src/tool-runtime/index.test.ts`
- Create: `src/tool-runtime/resolve-runner.ts`
- Create: `src/tool-runtime/resolve-runner.test.ts`

Introduce the shared runtime layer that resolves/version-pins/caches generic
tool runners for `wp` commands without relying on consumer `node_modules/.bin`
or PATH binaries as the primary contract.

**Steps (TDD):**
1. Add failing unit tests for runner resolution, cache behavior, and fallback
   rules.
2. Run: `wp test --file src/tool-runtime/index.test.ts src/tool-runtime/resolve-runner.test.ts`
   — verify FAIL.
3. Implement the minimal runtime core and resolution API.
4. Re-run the same targeted tests — verify PASS.
5. Run: `wp lint src/tool-runtime/index.ts src/tool-runtime/resolve-runner.ts src/tool-runtime/index.test.ts src/tool-runtime/resolve-runner.test.ts`
6. Run: `wp typecheck`

**Acceptance:**
- [ ] Runtime core resolves generic tool runners through a shared `wp` contract.
- [ ] Resolution behavior is unit-tested.
- [ ] No consumer `node_modules/.bin` assumption remains in the new runtime core.

#### Task 1.3: [package-surface] Freeze package/distribution safety gates for runtime ownership

**Status:** todo
**Wave:** 0
**Depends:** None
**Size:** XS
**Files:**
- Modify: `package.json`
- Modify: package-surface/tarball verification tests only as needed

Lock the public-package contract before runtime ownership changes widen the
published surface.

**Steps (TDD):**
1. Add failing package-surface assertions for any new public bin/export/files
   entries required by the runtime shift.
2. Run the targeted package-surface/tarball checks — verify FAIL.
3. Apply the minimal package manifest/test updates.
4. Re-run the same checks — verify PASS.

**Acceptance:**
- [ ] Package-surface tests describe the intended runtime/distribution contract.
- [ ] Any new public `files` / `bin` / `exports` surface is intentional.
- [ ] Tarball checks catch accidental leakage.

#### Task 2.1: [test] Route `wp test` and mutation through the managed runtime

**Status:** todo
**Wave:** 1
**Depends:** Task 1.2
**Size:** S
**Files:**
- Modify: `src/test/command-builder.ts`
- Modify: `src/cli/commands/test.ts`
- Modify: `src/cli/commands/test.test.ts`

Replace the current local `vitest` / `vp` execution assumptions for `wp test`
and `wp test --mutation` with the new runtime core while preserving existing
flag shape.

**Steps (TDD):**
1. Add failing tests proving file/package/mutation targets resolve through the
   managed runtime instead of direct local runner invocation.
2. Run: `wp test --file src/cli/commands/test.test.ts` — verify FAIL.
3. Integrate the runtime core into test command planning/execution.
4. Re-run: `wp test --file src/cli/commands/test.test.ts` — verify PASS.
5. Run: `wp lint src/test/command-builder.ts src/cli/commands/test.ts src/cli/commands/test.test.ts`
6. Run: `wp typecheck`

**Acceptance:**
- [ ] `wp test` uses the runtime-owned execution path.
- [ ] Mutation mode stays supported.
- [ ] Existing user-facing flags remain intact.

#### Task 2.2: [e2e] Route `wp e2e` through the managed runtime

**Status:** todo
**Wave:** 1
**Depends:** Task 1.2
**Size:** S
**Files:**
- Modify: `src/e2e/command-builder.ts`
- Modify: `src/cli/commands/e2e.ts`
- Modify: `src/cli/commands/e2e.test.ts`
- Modify: `src/cli/commands/e2e.host-adapter.test.ts`

Replace direct `pnpm exec playwright|vitest` assumptions with runtime-managed
runner execution while preserving suite-aware and host-adapter behavior.

**Steps (TDD):**
1. Add failing tests proving generic and host-adapter-backed E2E plans use the
   managed runtime boundary.
2. Run: `wp test --file src/cli/commands/e2e.test.ts src/cli/commands/e2e.host-adapter.test.ts`
   — verify FAIL.
3. Integrate the runtime core into E2E command planning/execution.
4. Re-run the same targeted tests — verify PASS.
5. Run: `wp lint src/e2e/command-builder.ts src/cli/commands/e2e.ts src/cli/commands/e2e.test.ts src/cli/commands/e2e.host-adapter.test.ts`
6. Run: `wp typecheck`

**Acceptance:**
- [ ] `wp e2e` no longer depends on direct `pnpm exec` runner invocation as the primary contract.
- [ ] Suite-aware and host-adapter-backed plans still work.
- [ ] Existing E2E flag surface remains supported.

#### Task 2.3: [quality] Route lint, format, and typecheck through the managed runtime

**Status:** todo
**Wave:** 1
**Depends:** Task 1.2
**Size:** S
**Files:**
- Modify: `src/lint/index.ts`
- Modify: `src/format/index.ts`
- Modify: `src/cli/commands/typecheck.ts`
- Modify: `src/cli/commands/lint.ts`
- Modify: `src/cli/commands/format.ts`

Move the rest of the generic quality surface onto the shared runtime boundary,
including `vp lint`, `oxfmt`, and `tsc`/`check-types` assumptions.

**Steps (TDD):**
1. Add failing tests for runtime-backed lint/format/typecheck invocation.
2. Run: `wp test --file src/cli/commands/typecheck.test.ts src/cli/commands/format.ts src/cli/commands/lint.ts`
   — verify FAIL where new assertions were added.
3. Integrate the runtime core into lint/format/typecheck flows.
4. Re-run targeted tests — verify PASS.
5. Run: `wp lint src/lint/index.ts src/format/index.ts src/cli/commands/typecheck.ts src/cli/commands/lint.ts src/cli/commands/format.ts`
6. Run: `wp typecheck`

**Acceptance:**
- [ ] Lint/format/typecheck use the managed runtime contract.
- [ ] Missing-binary error behavior is still clear and actionable.
- [ ] No speculative new config layer is introduced.

#### Task 3.1: [setup] Teach `wp setup` and migration diagnostics the new contract

**Status:** todo
**Wave:** 2
**Depends:** Task 2.1, Task 2.2, Task 2.3
**Size:** S
**Files:**
- Modify: `src/cli/commands/init/scaffold-base-kit.ts`
- Modify: `src/cli/commands/init/index.ts`
- Modify: setup/init tests only as needed

Update bootstrap and migration behavior so consumers learn which local deps are
now redundant execution-only tooling versus which must remain because their code
imports them directly.

**Steps (TDD):**
1. Add failing setup/migration tests for removable vs required dependency guidance.
2. Run targeted init/setup tests — verify FAIL.
3. Implement the minimal migration diagnostics and setup messaging.
4. Re-run targeted init/setup tests — verify PASS.
5. Run: `wp lint src/cli/commands/init/scaffold-base-kit.ts src/cli/commands/init/index.ts`
6. Run: `wp typecheck`

**Acceptance:**
- [ ] Setup explains the runtime-owned contract clearly.
- [ ] Migration guidance preserves direct-import deps and only suggests removing redundant execution-only deps.
- [ ] No consumer-breaking blanket removal advice remains.

#### Task 3.2: [proof] Validate packed-consumer behavior and publish-safe docs

**Status:** todo
**Wave:** 2
**Depends:** Task 1.3, Task 3.1
**Size:** M
**Files:**
- Modify: `README.md`
- Modify: migration/runtime docs as needed
- Modify: packed-install / bundle-smoke verification tests or fixtures as needed

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
- [ ] A packed/published consumer can exercise the new runtime-owned workflow.
- [ ] Docs explain execution-owned vs authoring-owned deps precisely.
- [ ] Tarball/package-surface checks pass after the documentation and distribution updates.
