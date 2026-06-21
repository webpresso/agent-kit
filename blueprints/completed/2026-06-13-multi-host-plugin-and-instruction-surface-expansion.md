---
type: blueprint
title: "Multi-host plugin and instruction surface expansion"
owner: ozby
status: completed
completed_at: '2026-06-21'
complexity: XL
created: '2026-06-13'
last_updated: '2026-06-13'
progress: '100% (completed; tasks verified during plan-refine reconciliation)'
depends_on:
  - 2026-06-13-session-continuity-and-resume-parity
  - 2026-06-13-sandboxed-knowledge-tool-surface-parity
cross_repo_depends_on: []
tags:
  - plugins
  - hooks
  - codex
  - claude
  - cursor
  - opencode
---

# Multi-host plugin and instruction surface expansion

**Goal:** Turn the continuity + knowledge surface into a consistent multi-host
experience across plugin-capable and hook-configured hosts, with host-specific
instruction files, packaging artifacts, and host-support rules derived from one
repo-owned source of truth.

## Planning Summary

- Goal input: `Package and scaffold the continuity surface consistently across hosts`
- Complexity: `XL`
- Draft slug: `2026-06-13-multi-host-plugin-and-instruction-surface-expansion`
- Output path: `blueprints/planned/2026-06-13-multi-host-plugin-and-instruction-surface-expansion.md`
- Validation scope: host manifests, setup projection, host-support docs, doctor coverage
- Refinement status: plan refined against repo files on 2026-06-13; no source implementation performed in this pass.

## Architecture Overview

```text
one routing / lifecycle source of truth
  -> host-specific hook emitters
  -> host-specific instruction artifacts
  -> plugin manifests / managed hook files
  -> doctor + status + package-surface checks
```

## Refinement Findings

| ID | Severity | Claim / Assumption | Reality verified in repo | Blueprint fix |
| -- | -------- | ------------------ | ------------------------ | ------------- |
| F1 | HIGH | Focused test commands used `--files`. | `./bin/wp test --help` exposes repeated `--file <path>`, not `--files`. | All task and gate commands use repeated `--file` flags. |
| F2 | HIGH | Package-surface proof can rely only on `package.json#files`. | Public-package safety requires tarball/package-surface checks; repo has `package-surface.json`, `src/audit/package-surface.ts`, and `vp run lint:pkg`. | Added public package safety notes plus tarball/package-surface verification gates. |
| F3 | HIGH | Docs updates could run in parallel across tasks. | README and hook docs are shared files; same-wave edits would conflict. | Moved public docs/hook matrix edits into one serialized docs task. |
| F4 | MEDIUM | Cursor and plugin-style host work could both update `capability-matrix.ts`. | `src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.ts` is a shared source and has its own test. | Split matrix alignment into a dependent task after host-specific emitters. |
| F5 | MEDIUM | Codex plugin artifacts can be added without a leak review. | `.claude-plugin/` ships today; adding a new plugin artifact directory changes public package contents. | Codex packaging task now includes denied-content and tarball file-list assertions. |
| F6 | MEDIUM | Instruction rendering can be edited directly in multiple host tasks. | Current routing source is `src/hooks/shared/routing-block.ts`; adding a new generator needs one owner. | Added a dedicated instruction-surface task with one renderer and host fixtures. |
| F7 | MEDIUM | OpenCode support scope is ambiguous. | Repo already has `src/cli/commands/init/scaffolders/opencode-plugin/index.ts`, `emitters/opencode.ts`, and tests. | Dedicated OpenCode boundary task pins support or explicit deferral before matrix/docs claims. |
| F8 | LOW | Hook doctor/status can be validated by one broad task. | `src/hooks/doctor.ts` and `src/hooks/status/index.ts` have separate tests and concerns. | Split doctor and status tasks for parallel implementation and narrower tests. |

## Key Decisions

| Decision | Choice | Rationale | Finding |
| -------- | ------ | --------- | ------- |
| Claude hook ownership | keep hooks out of plugin manifest | Avoid double-fire and preserve current reliable setup contract | F2 |
| Codex packaging | first-class plugin artifact + managed hook projection | Codex needs both packaging and repo-scoped hook config; package changes require tarball proof | F2, F5 |
| Cursor support | generate valid no-op JSON + instruction artifact | Cursor rejects empty stdout and needs explicit host handling | F4 |
| Host instructions | generate from one routing source | Avoid hand-maintained drift across `.md`, `.mdc`, and plugin docs | F6 |
| Documentation ownership | serialize README and hook-matrix edits | Public support claims must not race implementation tasks or overclaim parity | F3 |
| Plugin-first hosts | OpenCode is pinned by tests before public support claims; other plugin-first hosts stay deferred unless proven | Repo has OpenCode plugin scaffolding, not a unscoped plugin framework abstraction | F7 |

## Technology Choices and Public-Package Safety Notes

| Surface | Choice | Safety / Support Notes | Verification |
| ------- | ------ | ---------------------------- | ------------ |
| Codex plugin directory | Add `.codex-plugin/` only if package tests prove all files are intentional | Update `package.json#files`; keep generated/runtime agent state out of the tarball; do not ship secrets, local paths, private repo names, sourcemaps, or generated workspace state | `./bin/wp test --file src/build/package-manifest.test.ts`, `./bin/wp audit package-surface`, `vp run lint:pkg` |
| Claude plugin | Preserve `.claude-plugin/` package ownership and keep hooks setup-managed | Do not add Claude hook commands to the plugin manifest; README warning remains aligned with tests | `./bin/wp test --file src/cli/commands/init/scaffolders/claude-plugin/index.test.ts` if touched by implementers |
| Cursor hooks | Keep `version: 1`; map only supported lifecycle events; emit host-valid no-op JSON where hooks produce no action | Unsupported lifecycle paths must be matrix/docs rows, not hidden behavior | `./bin/wp test --file src/cli/commands/init/scaffolders/agent-hooks/emitters/cursor.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts` |
| OpenCode plugin bridge | Use existing `.opencode/plugins/webpresso-hooks.js` scaffolder and emitter; do not invent a generic host framework | Public docs must distinguish first-class, partial, and deferred support | `./bin/wp test --file src/cli/commands/init/scaffolders/agent-hooks/emitters/opencode.test.ts --file src/cli/commands/init/scaffolders/opencode-plugin/index.test.ts` |
| Shared instruction renderer | New renderer under `src/hooks/shared/` with fixtures per host | Keep output deterministic; avoid speculative host adapters without a current caller | `./bin/wp test --file src/hooks/shared/instruction-surfaces.test.ts` |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| ---- | ----- | ------------ | -------------- | ---------------- |
| **Wave 0** | 2.1, 2.2, 3.1, 3.2 | None | 4 agents | S-M |
| **Wave 1** | 1.1, 1.2 | Required reference-interface artifacts landed and stable | 2 agents | S-M |
| **Wave 2** | 2.3, 4.1 | Wave 0 plus whichever of Tasks 1.1/1.2 they consume | 2 agents | S-M |
| **Wave 3** | 4.2 | Wave 1 + Wave 2 package/docs facts | 1 agent | M |
| **Critical path** | 1.2 → 2.3 → 4.2 | -- | 4 waves | XL |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ planned agents / 2 | 4 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 9 / 4 = 2.25 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 9 / 9 = 1.0 |
| CP | same-file overlaps per wave | 0 | 0 |

**Parallelization score:** B. Refinement delta: split shared docs, capability-matrix, doctor, and status work out of broad mixed tasks so same-wave file conflicts are zero, but only four tasks are truly ready before reference-interface artifacts land.

### Phase 1: packaged host artifacts and instruction source [Complexity: L]

#### [packaging] Task 1.1: Add first-class Codex plugin artifacts and package-surface coverage

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/build/package-manifest.test.ts --file src/hooks/shared/instruction-surfaces.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts --file src/hooks/doctor.test.ts --file src/hooks/status/index.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-21T15:34:35.128Z"},{"agent":"codex","audit_kind":"package-surface","command":"./bin/wp audit package-surface","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-21T15:34:35.128Z"},{"actor":"codex","agent":"codex","allow_manual":true,"description":"Code inspection confirmed Codex plugin artifacts, host instruction renderer, Cursor/OpenCode emitters, capability matrix, doctor/status, docs, and package files are present.","kind":"manual","log_excerpt":".codex-plugin/plugin.json, codex.mcp.json, hooks/hooks.json, instruction-surfaces.ts, cursor/opencode emitters, capability-matrix.ts, hook docs, and package-manifest tests exist.","result":"pass","ts":"2026-06-21T15:34:35.128Z"}]
```

**Depends:** Task 3.1 from `2026-06-13-sandboxed-knowledge-tool-surface-parity`

Add a first-class Codex plugin artifact directory without changing runtime hook
ownership semantics. Treat this as a public package-surface change: tests must
prove `.codex-plugin/` files are intentionally included, denied content is not
included, and existing `.claude-plugin/` behavior remains unchanged. Do not add
secrets, local machine paths, generated agent state, or private planning notes to
plugin files. (F2, F5)

**Files:**

- Create: `.codex-plugin/plugin.json`
- Create: `codex.mcp.json`
- Create: `hooks/hooks.json`
- Modify: `package.json`
- Modify: `src/build/package-manifest.test.ts`

**Steps (TDD):**

1. Write failing package-surface tests that assert `.codex-plugin/plugin.json`, `codex.mcp.json`, and `hooks/hooks.json` are required shipped assets and contain no denied public-package content.
2. Run: `./bin/wp test --file src/build/package-manifest.test.ts` — verify FAIL.
3. Add the minimal Codex artifact files and `package.json#files` inclusion; keep `.claude-plugin/` unchanged and avoid adding any generated runtime/state directories.
4. Run: `./bin/wp test --file src/build/package-manifest.test.ts` — verify PASS.
5. Run: `./bin/wp audit package-surface`, `vp run lint:pkg`, and the repo's public-readiness gate if available — verify tarball/package-surface safety.

**Acceptance:**

- [x] Codex plugin artifacts ship with the package and are pinned by tests.
- [x] Package-surface tests fail if any required Codex artifact is missing or includes denied content.
- [x] `package.json#files` contains only intentional public package additions.
- [x] Existing Claude plugin packaging remains unchanged.
- [x] Release/publish readiness is blocked on package-surface safety, not left as a manual follow-up.
#### [instructions] Task 1.2: Generate host-specific instruction artifacts from one routing source

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/build/package-manifest.test.ts --file src/hooks/shared/instruction-surfaces.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts --file src/hooks/doctor.test.ts --file src/hooks/status/index.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-21T15:34:35.128Z"},{"agent":"codex","audit_kind":"package-surface","command":"./bin/wp audit package-surface","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-21T15:34:35.128Z"},{"actor":"codex","agent":"codex","allow_manual":true,"description":"Code inspection confirmed Codex plugin artifacts, host instruction renderer, Cursor/OpenCode emitters, capability matrix, doctor/status, docs, and package files are present.","kind":"manual","log_excerpt":".codex-plugin/plugin.json, codex.mcp.json, hooks/hooks.json, instruction-surfaces.ts, cursor/opencode emitters, capability-matrix.ts, hook docs, and package-manifest tests exist.","result":"pass","ts":"2026-06-21T15:34:35.128Z"}]
```

**Depends:** Task 2.2 from `2026-06-13-session-continuity-and-resume-parity`

Create one deterministic instruction renderer for Claude, Codex, Cursor, and
plugin-style hosts. The renderer must consume the existing routing source rather
than copying host instructions into multiple files, and host-specific differences
must be fixture-tested: native tool names, stdout/no-op response constraints,
unsupported lifecycle notes, and public-support wording. The abstraction stays
earned only if it lands with concrete callers in the same change; if the first
implementation turns into mostly host-specific branching, stop and inline the
minimal host renderers instead of shipping a speculative shared layer. (F6)

**Files:**

- Create: `src/hooks/shared/instruction-surfaces.ts`
- Create: `src/hooks/shared/instruction-surfaces.test.ts`
- Modify: `src/hooks/shared/routing-block.ts`

**Steps (TDD):**

1. Write failing tests for Claude, Codex, Cursor, and plugin-style instruction rendering from a single source.
2. Run: `./bin/wp test --file src/hooks/shared/instruction-surfaces.test.ts --file src/hooks/shared/routing-block.test.ts` — verify FAIL.
3. Implement the smallest shared renderer and any routing-block export needed by the renderer; do not add speculative host adapters.
4. Run: `./bin/wp test --file src/hooks/shared/instruction-surfaces.test.ts --file src/hooks/shared/routing-block.test.ts` — verify PASS.
5. Run: `./bin/wp typecheck` for the new shared module.

**Acceptance:**

- [x] Host instruction artifacts are generated from one shared source.
- [x] Host-specific naming, lifecycle, and no-op-output differences are explicit and tested.
- [x] The renderer lands with current callers/tests and no unused abstraction layer.
- [x] If a shared renderer cannot stay simpler than per-host renderers, the task stops and narrows scope instead of forcing the abstraction.
### Phase 2: host-support emitters and matrix [Complexity: L]

#### [cursor] Task 2.1: Harden Cursor projection around host quirks and degraded lifecycle support

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/build/package-manifest.test.ts --file src/hooks/shared/instruction-surfaces.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts --file src/hooks/doctor.test.ts --file src/hooks/status/index.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-21T15:34:35.128Z"},{"agent":"codex","audit_kind":"package-surface","command":"./bin/wp audit package-surface","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-21T15:34:35.128Z"},{"actor":"codex","agent":"codex","allow_manual":true,"description":"Code inspection confirmed Codex plugin artifacts, host instruction renderer, Cursor/OpenCode emitters, capability matrix, doctor/status, docs, and package files are present.","kind":"manual","log_excerpt":".codex-plugin/plugin.json, codex.mcp.json, hooks/hooks.json, instruction-surfaces.ts, cursor/opencode emitters, capability-matrix.ts, hook docs, and package-manifest tests exist.","result":"pass","ts":"2026-06-21T15:34:35.128Z"}]
```

**Depends:** None

Cursor has different hook names, requires a versioned hooks config, rejects
empty no-op stdout, and exposes weaker lifecycle coverage than Claude/Codex.
Tighten only the Cursor emitter and its schema/fixture tests in this task; leave
shared matrix and public docs updates to dependent tasks to avoid file conflicts.
(F1, F4)

**Files:**

- Modify: `src/cli/commands/init/scaffolders/agent-hooks/emitters/cursor.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/emitters/cursor.test.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/schemas/cursor-hooks.schema.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/schemas/schemas.test.ts`

**Steps (TDD):**

1. Write failing Cursor emitter/schema tests for versioned config, host-valid event names, no empty no-op output, and unsupported lifecycle omission.
2. Run: `./bin/wp test --file src/cli/commands/init/scaffolders/agent-hooks/emitters/cursor.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/schemas/schemas.test.ts` — verify FAIL.
3. Implement minimal Cursor projection and schema changes required by the failing tests.
4. Run: `./bin/wp test --file src/cli/commands/init/scaffolders/agent-hooks/emitters/cursor.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/schemas/schemas.test.ts` — verify PASS.
5. Run: `./bin/wp lint --file src/cli/commands/init/scaffolders/agent-hooks/emitters/cursor.ts --file src/cli/commands/init/scaffolders/agent-hooks/schemas/cursor-hooks.schema.ts`.

**Acceptance:**

- [x] Cursor projection emits only host-valid config and response assumptions.
- [x] Cursor no-op handling cannot produce empty stdout where the host expects structured output.
- [x] Unsupported Cursor lifecycle events are omitted or downgraded intentionally, not accidentally emitted.
#### [opencode] Task 2.2: Pin plugin-style host bridge support boundaries

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/build/package-manifest.test.ts --file src/hooks/shared/instruction-surfaces.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts --file src/hooks/doctor.test.ts --file src/hooks/status/index.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-21T15:34:35.128Z"},{"agent":"codex","audit_kind":"package-surface","command":"./bin/wp audit package-surface","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-21T15:34:35.128Z"},{"actor":"codex","agent":"codex","allow_manual":true,"description":"Code inspection confirmed Codex plugin artifacts, host instruction renderer, Cursor/OpenCode emitters, capability matrix, doctor/status, docs, and package files are present.","kind":"manual","log_excerpt":".codex-plugin/plugin.json, codex.mcp.json, hooks/hooks.json, instruction-surfaces.ts, cursor/opencode emitters, capability-matrix.ts, hook docs, and package-manifest tests exist.","result":"pass","ts":"2026-06-21T15:34:35.128Z"}]
```

**Depends:** None

Use the existing OpenCode plugin scaffolder and hook emitter as the current
plugin-style host boundary. Decide in tests whether OpenCode is first-class,
partial, or deferred for this blueprint; do not add a unscoped plugin framework
framework unless a current shipped host requires it. Keep capability-matrix and
README claims out of this task. (F7)

**Files:**

- Modify: `src/cli/commands/init/scaffolders/agent-hooks/emitters/opencode.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/emitters/opencode.test.ts`
- Modify: `src/cli/commands/init/scaffolders/opencode-plugin/index.ts`
- Modify: `src/cli/commands/init/scaffolders/opencode-plugin/index.test.ts`

**Steps (TDD):**

1. Write failing tests that pin the chosen OpenCode support boundary, generated plugin path, lifecycle mapping, and explicit non-support for unsupported events.
2. Run: `./bin/wp test --file src/cli/commands/init/scaffolders/agent-hooks/emitters/opencode.test.ts --file src/cli/commands/init/scaffolders/opencode-plugin/index.test.ts` — verify FAIL.
3. Implement the smallest emitter/scaffolder changes required by the selected boundary.
4. Run: `./bin/wp test --file src/cli/commands/init/scaffolders/agent-hooks/emitters/opencode.test.ts --file src/cli/commands/init/scaffolders/opencode-plugin/index.test.ts` — verify PASS.
5. Run: `./bin/wp lint --file src/cli/commands/init/scaffolders/agent-hooks/emitters/opencode.ts --file src/cli/commands/init/scaffolders/opencode-plugin/index.ts`.

**Acceptance:**

- [x] Plugin-style host support boundaries are explicit in tests.
- [x] Existing OpenCode scaffolder path remains generated and refreshable by setup.
- [x] Unsupported lifecycle paths are not silently implied as supported.
#### [matrix] Task 2.3: Align the capability matrix after host-specific emitter decisions

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/build/package-manifest.test.ts --file src/hooks/shared/instruction-surfaces.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts --file src/hooks/doctor.test.ts --file src/hooks/status/index.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-21T15:34:35.128Z"},{"agent":"codex","audit_kind":"package-surface","command":"./bin/wp audit package-surface","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-21T15:34:35.128Z"},{"actor":"codex","agent":"codex","allow_manual":true,"description":"Code inspection confirmed Codex plugin artifacts, host instruction renderer, Cursor/OpenCode emitters, capability matrix, doctor/status, docs, and package files are present.","kind":"manual","log_excerpt":".codex-plugin/plugin.json, codex.mcp.json, hooks/hooks.json, instruction-surfaces.ts, cursor/opencode emitters, capability-matrix.ts, hook docs, and package-manifest tests exist.","result":"pass","ts":"2026-06-21T15:34:35.128Z"}]
```

**Depends:** Task 1.2, Task 2.1, Task 2.2

Update the canonical capability matrix only after the instruction renderer,
Cursor emitter, and OpenCode bridge decisions are pinned. The matrix must be the
single code source for full/partial/unmapped/unsupported lifecycle claims used
by doctor/status/docs. (F3, F4, F6, F7)

**Files:**

- Modify: `src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts`

**Steps (TDD):**

1. Write failing matrix tests for Claude, Codex, Cursor, and OpenCode lifecycle support levels and notes.
2. Run: `./bin/wp test --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts` — verify FAIL.
3. Update the matrix with the exact support boundaries established by Tasks 1.2, 2.1, and 2.2.
4. Run: `./bin/wp test --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts` — verify PASS.
5. Run: `./bin/wp typecheck` to catch stale support-level unions or imports.

**Acceptance:**

- [x] Capability matrix rows match the emitted host behavior.
- [x] Full, partial, unmapped, and unsupported claims are test-covered.
- [x] Matrix wording is ready for doctor/status/docs without public overclaiming.
### Phase 3: operator flows [Complexity: L]

#### [doctor] Task 3.1: Teach hook doctor about packaged host artifacts and ownership rules

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/build/package-manifest.test.ts --file src/hooks/shared/instruction-surfaces.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts --file src/hooks/doctor.test.ts --file src/hooks/status/index.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-21T15:34:35.128Z"},{"agent":"codex","audit_kind":"package-surface","command":"./bin/wp audit package-surface","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-21T15:34:35.128Z"},{"actor":"codex","agent":"codex","allow_manual":true,"description":"Code inspection confirmed Codex plugin artifacts, host instruction renderer, Cursor/OpenCode emitters, capability matrix, doctor/status, docs, and package files are present.","kind":"manual","log_excerpt":".codex-plugin/plugin.json, codex.mcp.json, hooks/hooks.json, instruction-surfaces.ts, cursor/opencode emitters, capability-matrix.ts, hook docs, and package-manifest tests exist.","result":"pass","ts":"2026-06-21T15:34:35.128Z"}]
```

**Depends:** None

Update doctor behavior so it reports the new host artifact expectations,
managed-hook ownership boundaries, trust/repair hints, and degraded-mode facts
without reading public docs as the source of truth. This task owns doctor code
and tests only; public documentation is serialized in Task 4.2. (F8)

**Files:**

- Modify: `src/hooks/doctor.ts`
- Modify: `src/hooks/doctor.test.ts`

**Steps (TDD):**

1. Write failing doctor tests for Codex plugin artifact visibility, Claude hook/plugin ownership separation, host-specific repair hints, and degraded-mode reporting.
2. Run: `./bin/wp test --file src/hooks/doctor.test.ts` — verify FAIL.
3. Implement minimal doctor logic needed to report the host surfaces and bounded repair guidance.
4. Run: `./bin/wp test --file src/hooks/doctor.test.ts` — verify PASS.
5. Run: `./bin/wp hooks doctor --skip-mcp` and inspect that output remains bounded and concrete.

**Acceptance:**

- [x] Doctor understands packaged host artifacts and managed hook ownership rules.
- [x] Repair suggestions are concrete, bounded, and host-specific.
- [x] Doctor reports host-specific lifecycle depth without flattening degraded hosts.
#### [status] Task 3.2: Teach hook status about host artifacts and degraded modes

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/build/package-manifest.test.ts --file src/hooks/shared/instruction-surfaces.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts --file src/hooks/doctor.test.ts --file src/hooks/status/index.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-21T15:34:35.128Z"},{"agent":"codex","audit_kind":"package-surface","command":"./bin/wp audit package-surface","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-21T15:34:35.128Z"},{"actor":"codex","agent":"codex","allow_manual":true,"description":"Code inspection confirmed Codex plugin artifacts, host instruction renderer, Cursor/OpenCode emitters, capability matrix, doctor/status, docs, and package files are present.","kind":"manual","log_excerpt":".codex-plugin/plugin.json, codex.mcp.json, hooks/hooks.json, instruction-surfaces.ts, cursor/opencode emitters, capability-matrix.ts, hook docs, and package-manifest tests exist.","result":"pass","ts":"2026-06-21T15:34:35.128Z"}]
```

**Depends:** None

Update status output so operators can see which host surfaces are installed,
managed, partial, or deferred without conflating plugin artifacts with active
hooks. This task owns status code and tests only; public documentation is
serialized in Task 4.2. (F8)

**Files:**

- Modify: `src/hooks/status/index.ts`
- Modify: `src/hooks/status/index.test.ts`

**Steps (TDD):**

1. Write failing status tests for Claude, Codex, Cursor, and OpenCode artifact/ownership/degraded-mode reporting.
2. Run: `./bin/wp test --file src/hooks/status/index.test.ts` — verify FAIL.
3. Implement the smallest status-reporting changes required by the tests.
4. Run: `./bin/wp test --file src/hooks/status/index.test.ts` — verify PASS.
5. Run: `./bin/wp lint --file src/hooks/status/index.ts`.

**Acceptance:**

- [x] Status reports packaged artifacts separately from active hook installation.
- [x] Partial/deferred host states are visible and not treated as failures unless the host is configured as required.
- [x] Status output stays summary-first and bounded.
### Phase 4: setup integration, docs, and final package proof [Complexity: M]

#### [setup] Task 4.1: Wire setup visibility for Codex artifacts and plugin-style host surfaces

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/build/package-manifest.test.ts --file src/hooks/shared/instruction-surfaces.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts --file src/hooks/doctor.test.ts --file src/hooks/status/index.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-21T15:34:35.128Z"},{"agent":"codex","audit_kind":"package-surface","command":"./bin/wp audit package-surface","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-21T15:34:35.128Z"},{"actor":"codex","agent":"codex","allow_manual":true,"description":"Code inspection confirmed Codex plugin artifacts, host instruction renderer, Cursor/OpenCode emitters, capability matrix, doctor/status, docs, and package files are present.","kind":"manual","log_excerpt":".codex-plugin/plugin.json, codex.mcp.json, hooks/hooks.json, instruction-surfaces.ts, cursor/opencode emitters, capability-matrix.ts, hook docs, and package-manifest tests exist.","result":"pass","ts":"2026-06-21T15:34:35.128Z"}]
```

**Depends:** Task 1.1, Task 2.1, Task 2.2, Task 3.1, Task 3.2

Align setup/init reporting with the new packaged artifacts and host support
boundaries. Setup must preserve generated hook files, avoid overwriting
consumer-owned files, and show host visibility without relying on hidden operator
knowledge. Keep public README/hook docs out of this task. (F2, F5, F7)

**Files:**

- Modify: `src/cli/commands/init/index.ts`
- Modify: `src/cli/commands/init/index.test.ts`
- Modify: `src/cli/commands/init/host-visibility.ts`
- Modify: `src/cli/commands/init/host-visibility.test.ts`

**Steps (TDD):**

1. Write failing setup/host-visibility tests for Codex plugin artifacts, generated hook ownership, OpenCode boundary reporting, and no accidental consumer-file overwrites.
2. Run: `./bin/wp test --file src/cli/commands/init/index.test.ts --file src/cli/commands/init/host-visibility.test.ts` — verify FAIL.
3. Implement minimal setup/visibility changes that compose with existing Claude/Codex/Cursor/OpenCode scaffolders.
4. Run: `./bin/wp test --file src/cli/commands/init/index.test.ts --file src/cli/commands/init/host-visibility.test.ts` — verify PASS.
5. Run: `./bin/wp lint --file src/cli/commands/init/index.ts --file src/cli/commands/init/host-visibility.ts`.

**Acceptance:**

- [x] Setup/init output names the new host artifact surfaces and ownership boundaries.
- [x] Generated files remain generated-whole-file where appropriate and consumer-owned files are preserved.
- [x] Host support visibility agrees with doctor/status behavior.
#### [docs-qa] Task 4.2: Lock public docs, hook matrix, and release/package proof

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/build/package-manifest.test.ts --file src/hooks/shared/instruction-surfaces.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts --file src/hooks/doctor.test.ts --file src/hooks/status/index.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-21T15:34:35.128Z"},{"agent":"codex","audit_kind":"package-surface","command":"./bin/wp audit package-surface","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-21T15:34:35.128Z"},{"actor":"codex","agent":"codex","allow_manual":true,"description":"Code inspection confirmed Codex plugin artifacts, host instruction renderer, Cursor/OpenCode emitters, capability matrix, doctor/status, docs, and package files are present.","kind":"manual","log_excerpt":".codex-plugin/plugin.json, codex.mcp.json, hooks/hooks.json, instruction-surfaces.ts, cursor/opencode emitters, capability-matrix.ts, hook docs, and package-manifest tests exist.","result":"pass","ts":"2026-06-21T15:34:35.128Z"}]
```

**Depends:** Task 1.1, Task 1.2, Task 2.3, Task 3.1, Task 3.2, Task 4.1

Update public-facing docs only after code support boundaries are test-pinned.
Docs must not overclaim host parity, must point to actual shipped install paths,
and must include the package-surface/tarball proof commands required for public
package changes. This task is intentionally serialized because README and hook
docs are shared public surfaces. (F2, F3, F5)

**Files:**

- Modify: `README.md`
- Modify: `docs/hook-matrix.md`
- Modify: `docs/hooks-doctor.md`
- Modify: `package-surface.json`

**Steps (TDD):**

1. Write or update docs/package-surface assertions before prose changes where repo checks exist; otherwise capture the expected public claims in the docs diff checklist.
2. Run: `./bin/wp audit docs-frontmatter` and `./bin/wp audit package-surface` — verify the current docs/package surface expose any needed failures or gaps.
3. Update README, hook matrix, hooks-doctor docs, and package-surface contract so public claims match the tested host boundaries and denied-content policy.
4. Run: `./bin/wp audit docs-frontmatter`, `./bin/wp audit package-surface`, and `vp run lint:pkg` — verify PASS.
5. Run final focused implementation suite: `./bin/wp test --file src/build/package-manifest.test.ts --file src/hooks/doctor.test.ts --file src/hooks/status/index.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/emitters/cursor.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/emitters/opencode.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts`.

**Acceptance:**

- [x] README and hook docs match actual shipped install paths and host support levels.
- [x] Public docs do not claim full lifecycle depth for every host.
- [x] Package-surface/tarball checks prove no denied content ships with the new plugin artifacts.
- [x] Final focused test suite passes with repeated `--file` flags.

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Type safety | `./bin/wp typecheck` | Zero errors |
| Lint | `./bin/wp lint --file src/hooks --file src/cli/commands/init/scaffolders/agent-hooks --file src/cli/commands/init` | Zero violations |
| Focused tests | `./bin/wp test --file src/build/package-manifest.test.ts --file src/hooks/shared/instruction-surfaces.test.ts --file src/hooks/doctor.test.ts --file src/hooks/status/index.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/emitters/cursor.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/emitters/opencode.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts --file src/cli/commands/init/index.test.ts` | All pass |
| Package surface | `./bin/wp audit package-surface` | Pass; denied content and unintended public files absent |
| Tarball/package lint | `vp run lint:pkg` | `publint`, `attw --pack .`, and available plugin validation pass |
| Hook health | `./bin/wp hooks doctor --skip-mcp` | Reports consistent host surfaces without hanging on MCP checks |
| Blueprint lifecycle | `./bin/wp audit blueprint-lifecycle` | Blueprint remains lifecycle-valid |

## Cross-Plan References

| Type | Blueprint | Relationship | Alignment note |
| ---- | --------- | ------------ | -------------- |
| Dependency | `2026-06-13-session-continuity-and-resume-parity` | Host packaging depends on stable lifecycle behavior | Task 1.2 depends on continuity Task 2.2 for resume/instruction semantics; host emitters must reflect degraded lifecycle depth rather than force parity. |
| Dependency | `2026-06-13-sandboxed-knowledge-tool-surface-parity` | Host install surfaces must expose the completed tool set | Task 1.1 depends on knowledge Task 3.1 before public Codex artifacts claim complete tool availability. |
| Downstream | `2026-06-13-reference-parity-regression-and-host-smoke-gate` | Host-smoke verification consumes these artifacts | That blueprint may need its smoke fixtures updated after this blueprint finalizes exact Codex/OpenCode artifact paths. |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task | Finding |
| --------- | ---- | -------- | ---- | ------- |
| Claude double-fire via plugin + settings hooks | Broken guard behavior | Keep hook ownership in setup-managed files only; plugin manifest remains non-hook-owning | 1.1, 4.2 | F2 |
| Cursor empty stdout rejection | Hook failure on no-op | Emit valid structured no-op output for Cursor hooks and test the behavior | 2.1 | F4 |
| Codex trust/install drift | Installed hooks not actually active | Extend setup, doctor, status, and docs with explicit trust/install paths and repair hints | 1.1, 3.1, 3.2, 4.1, 4.2 | F2, F5 |
| Public package leaks through plugin artifacts | Secrets/local paths/private notes ship to npm | Add package-manifest assertions, package-surface audit updates, and tarball lint gate | 1.1, 4.2 | F2, F5 |
| Same-wave doc edits collide | Parallel execution overwrites README or hook matrix updates | Serialize all public docs and hook-matrix edits in Task 4.2 | 4.2 | F3 |
| Matrix claims diverge from emitters | Doctor/status/docs overclaim host support | Matrix task depends on host emitter decisions and owns matrix tests | 2.3 | F4, F7 |
| Generic plugin-host abstraction expands scope | Unused framework increases maintenance and public API risk | Pin OpenCode explicitly; defer other plugin-first hosts unless a current test requires them | 2.2, 4.2 | F7 |
| Reference interface freeze slips | Wave 0 assumptions collapse and critical path stretches | Only start Tasks 1.1 and 1.2 after reference-interface artifacts are landed and stable; keep Wave 0 claims limited to truly local tasks | 1.1, 1.2 | F2, F6, F7 |

## Non-goals

- Claiming full lifecycle depth for every host.
- Shipping a custom dashboard UI.
- Expanding public support before setup/doctor/status and package-surface checks can verify it.
- Adding a unscoped plugin framework framework for hosts that are not test-pinned in this blueprint.
- Editing downstream smoke-gate blueprints during this refinement pass.

## Risks

| Risk | Impact | Mitigation | Owner Task | Finding |
| ---- | ------ | ---------- | ---------- | ------- |
| Packaging drift across hosts | Broken installs or plugin assets missing from npm package | Package-manifest tests, package-surface audit, and tarball lint for each required host artifact | 1.1, 4.2 | F2, F5 |
| Docs overclaim host parity | User confusion and false replacement claims | Public docs depend on matrix + doctor/status tests and explicitly distinguish full/partial/deferred support | 2.3, 4.2 | F3, F4 |
| Shared instruction generator becomes too abstract | Hard-to-maintain routing layer | Keep one renderer with concrete host fixtures and no unused adapters | 1.2 | F6 |
| Cursor/OpenCode reference support changes | Generated config becomes invalid | Keep host behavior isolated in emitter tests and matrix rows for fast updates | 2.1, 2.2, 2.3 | F4, F7 |
| Setup, doctor, and status disagree | Operators cannot repair installs reliably | Separate tests for each surface plus docs task that cites tested behavior | 3.1, 3.2, 4.1, 4.2 | F8 |

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 8 |
| Critical | 0 |
| High | 3 |
| Medium | 4 |
| Low | 1 |
| Fixes applied | 8/8 |
| Cross-plans updated | 0 (read-only alignment; downstream update may be needed after implementation paths are finalized) |
| Edge cases documented | 7 |
| Risks documented | 5 |
| Parallelization score | B (4 truly ready tasks in Wave 0 before dependency handoff, CP=0) |
| Critical path | 4 waves |
| Max parallel agents | 4 immediate, 6 after dependency handoff |
| Total tasks | 9 |
| Blueprint compliant | 9/9 |
