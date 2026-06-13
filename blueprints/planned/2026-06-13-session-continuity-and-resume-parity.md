---
type: blueprint
title: "Session continuity and resume parity"
owner: ozby
status: planned
complexity: XL
created: '2026-06-13'
last_updated: '2026-06-13'
progress: '0% (planned; refined 2026-06-13 with fact-check, path, command, safety, and parallelization audit)'
depends_on: []
cross_repo_depends_on: []
tags:
  - session-memory
  - hooks
  - claude
  - codex
  - cursor
max_parallel_agents: 4
---

# Session continuity and resume parity

**Goal:** Close the remaining automatic continuity gaps so supported hosts can
capture, compact, resume, and search prior work without the user having to
restate state after long sessions or host compaction events.

## Product wedge anchor

Long-running agent sessions should feel continuous after compaction, restart, or
host-specific lifecycle gaps. The wedge is not a new memory product; it is a
bounded, local, hook-driven continuity path that keeps current routing guidance,
recent decisions, constraints, tool outcomes, and compaction snapshots available
without leaking private local state into package artifacts or public docs.

## Planning Summary

- Goal input: `Automatic capture + snapshot + restore parity`
- Complexity: `XL`
- Draft slug: `2026-06-13-session-continuity-and-resume-parity`
- Output path: `blueprints/planned/2026-06-13-session-continuity-and-resume-parity.md`
- Validation scope: hook lifecycle parity, session-memory correctness, host-specific resume semantics
- Refinement scope: this blueprint only; downstream blueprints are read-only alignment inputs.

## Architecture Overview

```text
host hook events
  -> managed wp-* hook launchers
  -> typed continuity event capture
  -> local session-memory SQLite/FTS store
  -> bounded snapshot + restore artifacts
  -> SessionStart additionalContext / host-equivalent injection
```

## Fact-Check Findings

| ID | Severity | Claim / assumption checked | Reality verified in repo | Blueprint fix |
| -- | -------- | -------------------------- | ------------------------ | ------------- |
| F1 | HIGH | Session memory already captures enough structure for resume and can absorb typed events without migration design. | `src/session-memory/types.ts` and `src/session-memory/session.ts` currently persist `{ toolName, content }` into `session_events`; no typed event kind, priority, summary, or resume visibility exists, and the live SQLite + FTS layout needs an explicit schema-version / rebuild plan when rows gain new typed fields. | Task 1.1 now owns a hard-cut typed event envelope, schema-version guard, explicit rejection of untyped flat rows, and migration-safe tests including FTS rebuild coverage. |
| F2 | HIGH | A managed pre-compaction hook can be added by creating only a hook file. | Managed hook ownership is derived from `WP_HOOK_SPECS`, launcher/runtime bin lists, doctor/status/audit expectations, and generated host emitters. | Task 1.2 now includes IR, launcher/runtime, status/doctor, audit, and direct-bin tests. |
| F3 | MEDIUM | Verification commands using repeated `--files` are valid. | `./bin/wp test --help` exposes repeated `--file`; `./bin/wp lint --help` accepts positional files. | All task and gate commands now use `./bin/wp test --file ...` and `./bin/wp lint ...`. |
| F4 | HIGH | Host parity can be claimed uniformly. | `src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.ts` marks `PreCompact` as partial for Claude/Codex/OpenCode and unsupported for Cursor; current managed `wp-*` surface does not install a dedicated hook. | Host tasks must degrade explicitly, update capability notes, and test no unsupported Cursor claim. |
| F5 | MEDIUM | Post-tool, prompt, and stop hooks can share one implementation task. | Current hook files are independent hot paths: `src/hooks/post-tool/lint-after-edit.ts`, `src/hooks/guard-switch/index.ts`, and `src/hooks/stop/qa-changed-files.ts`. | Split into Tasks 2.1, 2.2, and 2.3 so agents can work without same-file conflicts. |
| F6 | HIGH | Package safety is unaffected because hooks are internal. | Adding a managed hook bin touches generated launchers, direct runtime bin maps, docs, and possibly public package surface tests. | Task 1.2 and whole-plan gates now require bin-surface, dry tarball, and secret checks before release claims. |
| F7 | MEDIUM | Downstream plans can consume this blueprint as a whole. | Related blueprints depend on specific task outputs: session event model, lifecycle contract, and host fixtures. | Cross-plan references now name the exact dependency outputs downstream work may rely on. |

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Storage owner | `src/session-memory/**` remains the only continuity store (F1) | Avoid parallel stores and keep recall/search behavior convergent. |
| Event model | Typed envelope with hard-cut schema expansion (F1) | Requires event kind, summary, priority, and resume visibility; untyped flat rows fail closed with an explicit diagnostic. |
| Resume contract | Hook-driven with explicit tool fallback | Automatic continuity is required, but operators still need manual recovery tools. |
| Host strategy | One canonical lifecycle IR with host-specific degradations (F4) | Claude, Codex, Cursor, and OpenCode differ; unsupported lifecycle paths must be visible rather than silently claimed. |
| Hot-path safety | Bounded capture, no broad shell-outs, fail-open except policy guard | Hooks fire frequently; capture must never block the agent or emit invalid host output. |
| Public package safety | Treat new hook bins/docs as package-surface changes (F6) | This is a public package; real pack tarball, package lint, dev-var carrier, secret-policy, and path checks must prove no private or generated-only surface leaks. |
| Simplicity gate | No new dependency or daemon for this blueprint | Existing SQLite/FTS and hook infrastructure are sufficient; new abstractions need a current task-owned caller. |

## Technology Choices and Safety Notes

| Area | Choice | Safety / verification note |
| ---- | ------ | -------------------------- |
| Storage | Existing SQLite-backed `SessionMemorySessionStore` | Keep WAL/busy-timeout behavior; add bounded serialization and restore tests before schema changes. |
| Search | Existing FTS/event restore path | Do not introduce a second search backend; downstream tool-surface work can unify recall after typed events exist. |
| Hook execution | Existing `runHook` bootstrap and managed launcher generation | Preserve valid JSON/no-op behavior for malformed stdin and unsupported host events. |
| Runtime bins | Existing direct-bin map in `bin/_run.js` and `bin/runtime-lanes.js` | Adding `wp-precompact-snapshot` is an internal managed hook-bin change; package-surface tests must prove public `bin` intent. |
| Public package | No new dependency, no secret-bearing fixtures, no local absolute paths | Run real pack tarball/package/dev-var carrier/secret-policy/path checks before any release or README parity claim. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| ---- | ----- | ------------ | -------------- | ---------------- |
| **Wave 0** | 1.1, 1.2 | None | 2 agents | S-M |
| **Wave 1** | 2.1, 2.2, 2.3, 2.4 | Task 1.1; Task 2.4 also uses existing SessionStart contract | 4 agents | S-M |
| **Wave 2** | 3.1 | Task 1.2, Task 2.1, Task 2.2, Task 2.3, Task 2.4 | 1 agent | M |
| **Wave 3** | 3.2 | Task 3.1 | 1 agent | S |
| **Critical path** | 1.1 → 2.1 → 3.1 → 3.2 | — | 4 waves | XL |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ planned agents / 2 | 2 for 4 planned agents |
| RW1 | Ready tasks in Wave 1 | Keep planned agents busy | 4 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 8 / 4 = 2.0 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 10 / 8 = 1.25 |
| CP | same-file overlaps per wave | 0 | 0 |

**Parallelization score:** B. The initial wave is intentionally narrow because
Task 1.1 defines the shared typed event contract and Task 1.2 defines the
managed lifecycle/bin contract. Wave 1 reaches four disjoint lanes. Do not split
Task 1.1 further unless an interface-only task can be extracted without forcing
same-file edits in `src/session-memory/session.ts`.

## Phases

### Phase 1: continuity contract + lifecycle IR [Complexity: L]

#### [schema] Task 1.1: Upgrade session-memory to typed continuity events

**Status:** todo

**Depends:** None

Replace the current flat `{ toolName, content }` capture model with a typed
continuity envelope in the existing session-memory store. The envelope must cover
user prompts, decisions, constraints, tool reads/edits/commands, failures,
rejected approaches, assistant turn summaries, compaction boundaries, and rule
snapshots. Reject untyped flat rows with an explicit diagnostic/reset path instead of
inferring missing type metadata. This task must also define a
live SQLite migration path: bump/check schema version, rebuild any affected FTS
content/index structures safely, and prove behavior when another process opens
the same repo database during upgrade.

**Files:**

- Modify: `src/session-memory/types.ts`
- Modify: `src/session-memory/session.ts`
- Modify: `src/session-memory/session.test.ts`
- Create: `src/session-memory/session-failure.test.ts`
- Create: `src/session-memory/hook-capture.ts`
- Create: `src/session-memory/hook-capture.test.ts`
- Create: `src/session-memory/migration.test.ts`

**Steps (TDD):**

1. Write failing tests for typed event persistence, untyped flat-row rejection, byte-capped snapshot serialization, event-priority filtering, schema-version upgrade, and FTS/search behavior after a live migration.
2. Run: `./bin/wp test --file src/session-memory/session.test.ts --file src/session-memory/session-failure.test.ts --file src/session-memory/hook-capture.test.ts --file src/session-memory/migration.test.ts` — verify FAIL.
3. Implement the smallest schema/runtime changes and pure hook-capture helpers needed by later hook tasks; keep SQLite local and dependency-free.
4. Run: `./bin/wp test --file src/session-memory/session.test.ts --file src/session-memory/session-failure.test.ts --file src/session-memory/hook-capture.test.ts --file src/session-memory/migration.test.ts` — verify PASS.
5. Run: `./bin/wp lint src/session-memory/types.ts src/session-memory/session.ts src/session-memory/hook-capture.ts src/session-memory/session.test.ts src/session-memory/session-failure.test.ts src/session-memory/hook-capture.test.ts src/session-memory/migration.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] Session memory persists typed continuity categories, not only freeform tool text.
- [ ] Untyped `{ toolName, content }` rows fail closed with explicit diagnostic/reset guidance.
- [ ] Snapshot rows preserve enough bounded structure to rebuild host resume context.
- [ ] Schema upgrade is guarded by an explicit version check and preserves search behavior after any required FTS rebuild.
- [ ] Capture helpers are pure, unit-tested, byte-capped, and reusable by hook tasks without shelling out.
- [ ] No new dependency, daemon, telemetry, or second continuity store is introduced.

#### [infra] Task 1.2: Add a managed PreCompact hook lane and internal bin surface

**Status:** todo

**Depends:** None

Introduce a first-class managed pre-compaction hook that creates bounded
snapshots before host compaction where supported. This is a lifecycle/bin change,
not only a source file addition: update the canonical hook IR, launcher/runtime
maps, status/doctor/audit surfaces, generated host emitters, and bin-surface
tests. Unsupported hosts must degrade explicitly instead of receiving invalid
config, and the task must leave a documented Stop-based continuity fallback for
hosts where pre-compaction is unavailable.

**Files:**

- Create: `src/hooks/precompact/index.ts`
- Create: `src/hooks/precompact/index.test.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/ir.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/ir.test.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/index.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/index.test.ts`
- Modify: `src/hooks/status/index.ts`
- Modify: `src/hooks/status/index.test.ts`
- Modify: `src/hooks/doctor.ts`
- Modify: `src/hooks/doctor.test.ts`
- Modify: `src/audit/agents.ts`
- Modify: `src/audit/agents.test.ts`
- Modify: `bin/_run.js`
- Modify: `bin/_run.test.ts`
- Modify: `bin/runtime-lanes.js`
- Modify: `src/build/package-manifest.test.ts`

**Steps (TDD):**

1. Write failing tests proving `PreCompact` appears in managed hook specs, launcher generation, runtime-bin dispatch, status/doctor output, and audit expectations.
2. Run: `./bin/wp test --file src/cli/commands/init/scaffolders/agent-hooks/ir.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/index.test.ts --file src/hooks/status/index.test.ts --file src/hooks/doctor.test.ts --file src/audit/agents.test.ts --file bin/_run.test.ts --file src/build/package-manifest.test.ts` — verify FAIL.
3. Implement `wp-precompact-snapshot` as a bounded JSON-safe hook over Task 1.1 helpers; update launcher/runtime maps and status/doctor/audit surfaces.
4. Run: `./bin/wp test --file src/hooks/precompact/index.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/ir.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/index.test.ts --file src/hooks/status/index.test.ts --file src/hooks/doctor.test.ts --file src/audit/agents.test.ts --file bin/_run.test.ts --file src/build/package-manifest.test.ts` — verify PASS.
5. Run: `./bin/wp lint src/hooks/precompact src/cli/commands/init/scaffolders/agent-hooks src/hooks/status src/hooks/doctor.ts src/audit/agents.ts bin/_run.js bin/runtime-lanes.js src/build/package-manifest.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] `WP_HOOK_SPECS` includes a managed `PreCompact` hook with a stable internal bin name.
- [ ] Claude/Codex emitters install it only where valid; Cursor remains explicitly unsupported/degraded for this lifecycle event.
- [ ] `wp hooks status` and `wp hooks doctor --skip-mcp` report the hook accurately.
- [ ] Internal hook bin dispatch works in source and packaged-runtime paths.
- [ ] Package-surface tests prove the new internal hook bin does not create an unintended public CLI contract.
- [ ] Unsupported hosts keep an explicit Stop-based continuity path rather than pretending pre-compaction coverage exists.

### Phase 2: automatic capture + restore [Complexity: XL]

#### [hook] Task 2.1: Replace PostToolUse stub behavior with bounded structured capture

**Status:** todo

**Depends:** Task 1.1

Replace the current lint-eligibility-only post-tool stub with bounded structured
capture for edits, writes, reads, command summaries, and failures. Keep the
existing hot-path no-broad-shell-out rule: classify and persist concise summaries
only, return host-safe output for malformed stdin, and never emit raw large tool
payloads.

**Files:**

- Modify: `src/hooks/post-tool/lint-after-edit.ts`
- Modify: `src/hooks/post-tool/lint-after-edit.test.ts`
- Modify: `src/hooks/bin-purity.test.ts`

**Steps (TDD):**

1. Write failing tests for write/edit/read/bash-like event capture, malformed JSON no-op behavior, and bin purity.
2. Run: `./bin/wp test --file src/hooks/post-tool/lint-after-edit.test.ts --file src/hooks/bin-purity.test.ts` — verify FAIL.
3. Implement minimal bounded capture using Task 1.1 helpers; preserve current lintable-file classification exports.
4. Run: `./bin/wp test --file src/hooks/post-tool/lint-after-edit.test.ts --file src/hooks/bin-purity.test.ts` — verify PASS.
5. Run: `./bin/wp lint src/hooks/post-tool/lint-after-edit.ts src/hooks/post-tool/lint-after-edit.test.ts src/hooks/bin-purity.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] PostToolUse records typed continuity events instead of only returning a stub boolean.
- [ ] Hook stdout remains valid for all supported host paths.
- [ ] Captured content is summarized and byte-capped.
- [ ] The hook stays latency-sensitive: no broad test/lint/typecheck subprocesses are added.

#### [hook] Task 2.2: Capture UserPromptSubmit decisions while preserving guard toggles

**Status:** todo

**Depends:** Task 1.1

Extend the user-prompt hook so prompts, explicit decisions, constraints, and
operator instructions feed continuity. Preserve exact `guard on` / `guard off`
behavior, including state updates and intentional hook exit semantics.

**Files:**

- Modify: `src/hooks/guard-switch/index.ts`
- Create: `src/hooks/guard-switch/index.test.ts`

**Steps (TDD):**

1. First add characterization coverage for the current `guard on` / `guard off` state mutation and exit semantics, then add failing tests for normal prompt capture, decision/constraint tagging, and malformed-input no-op behavior.
2. Run: `./bin/wp test --file src/hooks/guard-switch/index.test.ts` — verify FAIL.
3. Implement prompt capture via Task 1.1 helpers without changing guard-toggle state semantics.
4. Run: `./bin/wp test --file src/hooks/guard-switch/index.test.ts` — verify PASS.
5. Run: `./bin/wp lint src/hooks/guard-switch/index.ts src/hooks/guard-switch/index.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] Guard toggles remain functional, baseline-characterized, and tested with their existing exit semantics.
- [ ] UserPromptSubmit records continuity-safe prompt, decision, and constraint events.
- [ ] Prompt capture excludes secrets by summary/cap policy and does not write raw oversized content.
- [ ] Unsupported or malformed host input degrades to a host-safe no-op.

#### [hook] Task 2.3: Capture bounded turn-end summaries from Stop

**Status:** todo

**Depends:** Task 1.1

Turn-end capture should record what changed during the latest assistant turn
without running expensive QA on the Stop hot path. Extend the existing Stop hook
so it can persist bounded changed-file and turn-summary artifacts while keeping
current JSON-safe output and deferred-QA posture.

**Files:**

- Modify: `src/hooks/stop/qa-changed-files.ts`
- Modify: `src/hooks/stop/qa-changed-files.test.ts`

**Steps (TDD):**

1. Write failing tests for bounded changed-file summaries, no-git/no-repo degradation, JSON output shape, and preservation of deferred QA behavior.
2. Run: `./bin/wp test --file src/hooks/stop/qa-changed-files.test.ts` — verify FAIL.
3. Implement minimal Stop continuity capture using Task 1.1 helpers; do not re-enable broad synchronous QA runs.
4. Run: `./bin/wp test --file src/hooks/stop/qa-changed-files.test.ts` — verify PASS.
5. Run: `./bin/wp lint src/hooks/stop/qa-changed-files.ts src/hooks/stop/qa-changed-files.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] Stop records bounded assistant-turn summaries useful for resume.
- [ ] Stop remains JSON-safe and fail-open for unsupported working directories.
- [ ] Existing helper command builders continue to produce `just test --file ...` and `just typecheck --file ...` where tested.
- [ ] No broad synchronous QA sweep is introduced on the Stop hot path.

#### [hook] Task 2.4: Upgrade SessionStart to inject bounded resume context

**Status:** todo

**Depends:** Task 1.1

Extend SessionStart from routing-only injection to layered routing plus
continuity injection. Preserve the current routing block, optional routing file,
gstack block, update banner, and valid JSON output while adding deterministic
startup/resume/compact restore snippets from session memory.

**Files:**

- Modify: `src/hooks/sessionstart/index.ts`
- Modify: `src/hooks/sessionstart/index.test.ts`
- Modify: `src/hooks/sessionstart/update-banner.test.ts`

**Steps (TDD):**

1. Write failing tests for startup/resume/compact restore content, routing-block composition, byte caps, malformed stdin, and update-banner coexistence.
2. Run: `./bin/wp test --file src/hooks/sessionstart/index.test.ts --file src/hooks/sessionstart/update-banner.test.ts` — verify FAIL.
3. Implement bounded resume injection over Task 1.1 restore/snapshot helpers; preserve existing output contract exactly.
4. Run: `./bin/wp test --file src/hooks/sessionstart/index.test.ts --file src/hooks/sessionstart/update-banner.test.ts` — verify PASS.
5. Run: `./bin/wp lint src/hooks/sessionstart/index.ts src/hooks/sessionstart/index.test.ts src/hooks/sessionstart/update-banner.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] SessionStart can restore prior continuity on startup, compact, and resume without dropping routing guidance.
- [ ] Resume injection is bounded, deterministic, and excludes raw oversized payloads.
- [ ] No host path emits invalid JSON or unsupported fields.
- [ ] Existing update-banner and routing-file tests remain green.

### Phase 3: host parity hardening, docs, and package proof [Complexity: M]

#### [qa] Task 3.1: Prove continuity behavior across managed host emitters

**Status:** todo

**Depends:** Task 1.2, Task 2.1, Task 2.2, Task 2.3, Task 2.4

Add fixture-backed integration coverage for managed host emitters and dispatch
so continuity claims are backed by concrete Claude, Codex, Cursor, and OpenCode
capability data. This task may tighten emitters and capability notes, but it
must not invent support for unsupported lifecycle events.

**Files:**

- Modify: `src/hooks/dispatch/index.test.ts`
- Modify: `src/cli/commands/init/init.e2e.test.ts`
- Modify: `src/cli/commands/init/host-smoke.e2e.test.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/index.test.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/__fixtures__/vendor-io-conformance.test.ts`

**Steps (TDD):**

1. Write failing fixture tests for managed startup, post-tool, user-prompt, stop, and pre-compaction coverage by host.
2. Run: `./bin/wp test --file src/hooks/dispatch/index.test.ts --file src/cli/commands/init/init.e2e.test.ts --file src/cli/commands/init/host-smoke.e2e.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/index.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/__fixtures__/vendor-io-conformance.test.ts` — verify FAIL.
3. Tighten emitters/fixtures/capability notes until tests match actual host support and documented degradations.
4. Run: `./bin/wp test --file src/hooks/dispatch/index.test.ts --file src/cli/commands/init/init.e2e.test.ts --file src/cli/commands/init/host-smoke.e2e.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/index.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/__fixtures__/vendor-io-conformance.test.ts` — verify PASS.
5. Run: `./bin/wp lint src/hooks/dispatch src/cli/commands/init` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] Managed host fixtures prove startup, post-tool, user-prompt, stop, and supported pre-compaction coverage.
- [ ] Capability matrix notes match tested behavior and mark Cursor/OpenCode degradations precisely.
- [ ] Resume claims are no longer docs-only.
- [ ] Same-file edits are serialized after implementation tasks, avoiding parallel conflict pressure.

#### [docs] Task 3.2: Align operator docs and release/package safety gates

**Status:** todo

**Depends:** Task 3.1

Update operator-facing docs after behavior is proven, not before. Keep docs
bounded to shipped behavior and public-package-safe examples; add release proof
commands for hook health, lifecycle audit, tarball inspection, package lint, and
secret checks.

**Files:**

- Modify: `docs/guides/session-memory.md`
- Modify: `docs/hook-matrix.md`
- Modify: `docs/hooks-doctor.md`
- Modify: `README.md`

**Steps (TDD):**

1. Write or update failing docs/README assertions only where this repo already has a relevant docs or package-surface check.
2. Run: `./bin/wp test --file src/build/package-manifest.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts` and `./bin/wp audit blueprint-lifecycle` — verify the docs/package expectations fail before edits where applicable.
3. Update docs to describe typed events, capture/restore flow, host degradations, operator recovery, and package-safety release gates.
4. Run: `./bin/wp test --file src/build/package-manifest.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts` and `./bin/wp audit blueprint-lifecycle` — verify PASS.
5. Run: `./bin/docs-lint.js docs/guides/session-memory.md docs/hook-matrix.md docs/hooks-doctor.md README.md` and `vp run docs:check`, `npm pack --dry-run --json`, `vp run lint:pkg`, `vp run verify:secrets`, the four secret audits, `vp run verify:paths`, and `./bin/wp audit reference-parity-matrix --json`.

**Acceptance:**

- [ ] Docs match tested lifecycle behavior and avoid unsupported parity claims.
- [ ] Public examples contain no secrets, machine-local absolute paths, private workspace aliases, or private unpublished notes.
- [ ] Package-surface and tarball checks are listed as release prerequisites for hook-bin/doc changes.
- [ ] Downstream blueprints can rely on the documented typed event model, lifecycle contract, and host fixtures.

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Type safety | `./bin/wp typecheck` | Zero errors |
| Lint | `./bin/wp lint src/hooks src/session-memory src/cli/commands/init src/audit docs/guides/session-memory.md docs/hook-matrix.md docs/hooks-doctor.md README.md` | Zero violations |
| Focused tests | `./bin/wp test --file src/session-memory/session.test.ts --file src/session-memory/session-failure.test.ts --file src/session-memory/hook-capture.test.ts --file src/hooks/precompact/index.test.ts --file src/hooks/post-tool/lint-after-edit.test.ts --file src/hooks/guard-switch/index.test.ts --file src/hooks/stop/qa-changed-files.test.ts --file src/hooks/sessionstart/index.test.ts --file src/hooks/dispatch/index.test.ts` | All pass |
| Hook scaffolder tests | `./bin/wp test --file src/cli/commands/init/scaffolders/agent-hooks/ir.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/index.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/__fixtures__/vendor-io-conformance.test.ts` | Managed lifecycle and host fixture coverage pass |
| Hook health | `./bin/wp hooks doctor --skip-mcp` | Reports installed lifecycle accurately |
| Lifecycle audit | `./bin/wp audit blueprint-lifecycle` | Pass |
| Package surface | `npm pack --dry-run --json` and `vp run lint:pkg` | Real pack tarball and package checks show only intentional public files/bins |
| Secret and path safety | `vp run verify:secrets`, `./bin/wp audit secrets-policy`, `./bin/wp audit no-dev-vars`, `./bin/wp audit secret-provider-quarantine`, `./bin/wp audit secrets-config`, `vp run verify:paths` | Dev-var carriers, secret-policy violations, and path-policy violations are absent |

## Cross-Plan References

| Type | Blueprint | Relationship | Required alignment |
| ---- | --------- | ------------ | ------------------ |
| Downstream | `2026-06-13-sandboxed-knowledge-tool-surface-parity` | Consumes Task 1.1 typed event model and Task 3.2 docs | Its `wp_session_*` restore/search semantics should rely on typed continuity events, not a second store. |
| Downstream | `2026-06-13-multi-host-plugin-and-instruction-surface-expansion` | Consumes Task 1.2 lifecycle contract and Task 3.1 host fixtures | Plugin/host packaging must preserve this blueprint's degraded-mode matrix. |
| Downstream | `2026-06-13-reference-parity-regression-and-host-smoke-gate` | Consumes Task 3.1 host proofs and Task 3.2 release/package gates | Parity claims must remain blocked until this blueprint's tests and package-safety gates are green. |
| Reference evidence | `2026-06-10-harness-regression-gate` / `2026-06-10-harness-surface-manifest` | Later benchmark thresholds can measure this continuity surface | This blueprint does not add benchmark thresholds; it only creates capture/restore behavior to measure. |

## Edge Cases and Error Handling

| ID | Edge Case | Risk | Solution | Task |
| -- | --------- | ---- | -------- | ---- |
| F1 | Existing flat session rows lack typed metadata | Silent restore/search regression | Reject missing kind with an explicit diagnostic; test hard-cut failure behavior | 1.1 |
| F1 | Snapshot grows beyond host prompt budget | Compaction/resume injects too much text | Apply byte caps, priority ordering, and partial status metadata | 1.1, 2.4 |
| F2 | New managed hook bin missed by one launcher/runtime surface | Installed hooks fail at runtime | Derive from `WP_HOOK_SPECS` where possible and test IR, launcher, runtime, doctor/status, and audit surfaces | 1.2 |
| F3 | Invalid command flags in blueprint tasks | Agents waste time on nonexistent commands | Use verified `./bin/wp test --file`, positional `./bin/wp lint`, and whole-repo `./bin/wp typecheck` | all |
| F4 | Host does not support a lifecycle event | False parity claim or invalid emitted config | Emit only supported hook config; document degraded modes in capability matrix and docs | 1.2, 3.1, 3.2 |
| F5 | Parallel tasks edit the same file in the same wave | Merge conflict or non-deterministic execution | Wave table keeps overlapping files serialized; hook capture lanes are file-disjoint in Wave 1 | all |
| F6 | Hook-bin/doc changes leak private surface into public package | Public package disclosure issue | Require real pack tarball, package lint, dev-var carrier, secret-policy, and path checks before release claims | 1.2, 3.2 |
| F6 | Hook input contains secrets or huge payloads | Sensitive or noisy local state stored/resumed | Store summaries with caps; exclude raw oversized payloads and token-shaped content where detectable | 1.1, 2.1, 2.2, 2.3, 2.4 |
| F7 | Downstream plans assume benchmark/search parity too early | Later plans build on unproved behavior | Cross-plan references name only the outputs this blueprint actually owns | 3.2 |

## Risks

| ID | Risk | Impact | Mitigation | Owner task |
| -- | ---- | ------ | ---------- | ---------- |
| F1 | Schema churn breaks manual session-memory tools | Restore/search regressions | Backfill tests before changing handlers; test hard-cut schema failure and operator reset guidance | 1.1 |
| F2 | Hook lifecycle addition drifts across IR, launchers, runtime bins, and doctor/status | Broken hooks after setup | Keep `WP_HOOK_SPECS` central and test every downstream surface | 1.2 |
| F4 | Host wire mismatch | Broken hooks on one vendor | Fixture-test each emitter and keep unsupported events degraded | 3.1 |
| F5 | Hook latency regression | User-visible slowdown | Pure summaries only; no broad shell-outs; byte caps in every hot path | 2.1, 2.2, 2.3, 2.4 |
| F6 | Public package leak or unintended public CLI | Release/disclosure failure | Real pack tarball, package lint, package-manifest tests, dev-var carrier, secret-policy, and path checks | 1.2, 3.2 |
| F7 | Docs outrun implementation | False replacement claims | Docs task depends on host proofs and must state tested degradations | 3.2 |

## Non-goals

- Shipping a dashboard UI in this blueprint.
- Expanding beyond the managed host set before core continuity is stable.
- Replacing routing-block ownership with a second instruction system.
- Adding a daemon, cloud service, telemetry path, new database, or new search dependency.
- Proving final benchmark thresholds; that belongs to the downstream reference parity regression gate.
- Editing downstream blueprints as part of this refinement pass.

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 7 |
| Critical | 0 |
| High | 4 |
| Medium | 3 |
| Low | 0 |
| Fixes applied | 7/7 |
| Cross-plans updated | 0 (read-only per refinement scope) |
| Edge cases documented | 8 |
| Risks documented | 6 |
| Parallelization score | B (Wave 1 reaches 4 disjoint agents; CP = 0) |
| Critical path | 4 waves |
| Max parallel agents | 4 |
| Total tasks | 8 |
| Blueprint compliant | 8/8 tasks include status, dependencies, files, TDD steps, and acceptance |
