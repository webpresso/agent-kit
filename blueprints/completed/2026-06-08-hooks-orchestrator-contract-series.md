---
type: blueprint
title: Hooks orchestrator contract series
owner: ozby
status: completed
complexity: L
created: '2026-06-08'
last_updated: '2026-06-08'
progress: '100% (20/21 tasks done, 1 dropped as cross-repo-only; T19, T20, T12, and T11 completed with fresh verification on 2026-06-08; no repo-owned tasks remain)'
depends_on: []
tags:
  - hooks
  - claude
  - codex
  - cursor
  - opencode
  - setup
historical_verification_gap_waiver: true
historical_verification_gap_rationale: This blueprint is materialized from the existing Claude local plan at ~/.claude/plans/also-investigate-codex-cli-buzzing-popcorn.md plus already-landed branch work. Done-task status is imported from that plan and current repo state rather than fabricated as fresh per-task evidence in one turn.
---

# Hooks orchestrator contract series

## Product wedge anchor

- **Stage outcome:** finish the hooks-orchestrator series that started in the Claude local plan and is already partially landed on this branch.
- **Consuming surface:** `wp setup`, `wp hooks *`, generated Claude/Codex hook configs, future Cursor/OpenCode emitters, doctor/remediation surfaces, and workspace upgrade flows.
- **New user-visible capability:** deterministic install, status, restore/disable, dispatch, and docs surfaces today; remaining work adds Cursor/OpenCode emitters, demo/fix flows, event expansion, and workspace-scale operations.

## Planning Summary

This blueprint is the repo-native import of the Claude Code plan at:

- `~/.claude/plans/also-investigate-codex-cli-buzzing-popcorn.md`

Imported current state:

- Wave 2a branch work is already landed for **T3, T4, T5, T6, T7, T13, T14, T15, T16, T22**
- the repo-local follow-up stabilization after takeover is also landed:
  - real `wp hooks status` routing
  - manifest-backed `--restore-hooks` / `--disable-hooks`
  - Claude global hook absolute-Node repair
  - stale `bin/wp` source-vs-dist repair
  - quiet init/setup integration output seam

This blueprint keeps the full task graph from the Claude plan, but uses repo-local lifecycle truth:

- repo-owned landed tasks are marked `done`
- the sibling-repo husky migration task is marked `dropped` here because it is not executable inside this repo-owned blueprint
- remaining repo-owned tasks continue from the next runnable wave

## Source references

- Imported plan: `~/.claude/plans/also-investigate-codex-cli-buzzing-popcorn.md`
- Existing lineage:
  - `blueprints/completed/codex-global-hook-runtime-hardening/_overview.md`
  - `blueprints/completed/2026-06-01-claude-plugin-native-runtime-hardening.md`
  - `blueprints/completed/2026-06-07-root-launcher-contract-and-hook-ownership-alignment.md`

## Key decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Import shape | One full repo blueprint covering the full Claude plan series | The user explicitly asked for the full plan to become a real blueprint, not only the remainder slice. |
| Done-task truthfulness | Import already-landed tasks as `done` with an explicit historical-verification waiver | Avoids inventing fake fresh evidence while still preserving the real branch state. |
| Cross-repo scope | Mark the sibling-repo husky migration task as `dropped` in this repo blueprint | It is not repo-owned here and would make the local blueprint dishonest/noisy. |
| Execution restart point | Continue from the first remaining repo-owned runnable tasks in BP2b | BP2a is already landed; the next highest-value execution wave is BP2b. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| --- | --- | --- | --- | --- |
| **BP1·W0** | T1, T2 | None | 2 agents | XS-S |
| **BP2a·W0** | T3 | T1 | 1 agent | M |
| **BP2a·W1** | T4, T5, T13, T14, T22 | T3 | 5 agents | S-M |
| **BP2a·W2** | T6, T15, T7, T16 | W1 partial | 4 agents | S-M |
| **BP2b·W0** | T8, T9, T17, T18 | BP2a gate | 4 agents | S-M |
| **BP2b·W1** | T10, T19 | T8 / T17 | 2 agents | S |
| **BP3·W0** | T11 | T6, T8, T9 | 1 agent | M |
| **BP4·W0** | T20, T12 | T15+T18 / T4 | 2 agents | S-M |
| **Critical path** | T1 → T3 → T4 → T8 → T10 → T11 → T20 | — | 7 waves | L |

## External task mapping

| Blueprint task | Claude-plan task |
| --- | --- |
| 0.1 | T1 |
| 0.2 | T2 |
| 1.1 | T3 |
| 1.2 | T4 |
| 1.3 | T5 |
| 1.4 | T13 |
| 1.5 | T14 |
| 1.6 | T22 |
| 1.7 | T6 |
| 1.8 | T15 |
| 1.9 | T7 |
| 1.10 | T16 |
| 2.1 | T8 |
| 2.2 | T9 |
| 2.3 | T17 |
| 2.4 | T18 |
| 2.5 | T10 |
| 2.6 | T19 |
| 3.1 | T11 |
| 4.1 | T20 |
| 4.2 | T12 |

### Phase 0: BP1 imported gate tasks [Complexity: S]

#### [hooks] Task 0.1: Import the hotfix launcher-chain gate (T1)

**Status:** done

**Depends:** None

Imported from the Claude local plan as the precondition gate that unlocked T3.
This task covered the stop-gate launcher chain in the generated hook surfaces,
including Node fallback cleanup and gstack gating behavior.

**Files:**

- Modify: `src/cli/commands/init/scaffolders/agent-hooks/index.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/skill-hooks.ts`

**Acceptance:**

- [x] T3/T4-era hook generation preconditions exist in the current repo state
- [x] Imported as historical done state with waiver rather than re-fabricated evidence

#### [cross-repo] Task 0.2: Import the sibling-repo husky migration (T2)

**Status:** dropped

**Depends:** None

The Claude local plan included a sibling-repo task that edits husky surfaces in
`../monorepo` and `../framework`. That is not repo-owned work inside this
agent-kit blueprint, so this local import records the task but drops it from
execution here.

**Files:**

- None (cross-repo-only task, not executed in this blueprint)

**Acceptance:**

- [x] Cross-repo scope boundary is explicit
- [x] Repo-local execution queue does not block on sibling-repo writes

### Phase 1: BP2a contract core (imported landed wave) [Complexity: M]

#### [ir] Task 1.1: HookSpec IR + capability matrix split (T3)

**Status:** done

**Depends:** Task 0.1

Create the HookSpec IR, capability matrix, module split, and byte-parity
goldens that became the keystone for the rest of the hooks work.

**Files:**

- Modify: `src/cli/commands/init/scaffolders/agent-hooks/*`

**Acceptance:**

- [x] IR and capability-matrix surfaces exist in the repo
- [x] Downstream T4/T5/T13/T14/T22/T6/T15/T16 work is unblocked and landed

#### [dispatcher] Task 1.2: `wp hooks dispatch` grammar + routing (T4)

**Status:** done

**Depends:** Task 1.1

Implement `wp hooks dispatch <event>`, keep the hidden `wp hook` alias, and
centralize per-vendor dispatch translation.

**Files:**

- Modify: `src/cli/commands/hook.ts`
- Modify: `src/hooks/dispatch/*`

**Acceptance:**

- [x] Dispatch surface landed
- [x] CLI grammar exists and is routable from current branch state

#### [manifest] Task 1.3: Hooks manifest + doctor verdict basis (T5)

**Status:** done

**Depends:** Task 1.1

Write and consume `.webpresso/hooks-manifest.json` as the source of truth for
managed hook ownership and doctor/status reasoning.

**Files:**

- Modify: `src/cli/commands/init/scaffolders/agent-hooks/manifest.ts`
- Modify: `src/hooks/doctor.ts`

**Acceptance:**

- [x] Manifest writer exists
- [x] Later T7/T18 work builds on this landed surface

#### [status] Task 1.4: Failure vocabulary + `wp hooks status` (T13)

**Status:** done

**Depends:** Task 1.1

Implement failure vocabulary and the per-vendor `wp hooks status` command.

**Files:**

- Modify: `src/hooks/shared/vocabulary.ts`
- Modify: `src/hooks/status/*`
- Modify: `src/cli/commands/hooks.ts`

**Acceptance:**

- [x] `wp hooks status` is now a real user-facing routed command
- [x] Status semantics are test-covered on the current branch

#### [deny] Task 1.5: Deny envelope + progressive disclosure (T14)

**Status:** done

**Depends:** Task 1.1

Add the stable deny-envelope/failure-shape work over the pretool-guard
validators.

**Files:**

- Modify: `src/hooks/pretool-guard/*`
- Modify: `src/hooks/shared/types.ts`

**Acceptance:**

- [x] Deny-envelope work is imported as landed branch state

#### [audit] Task 1.6: Hook-vendor drift audit (T22)

**Status:** done

**Depends:** Task 1.1

Implement the vendor-drift audit against vendored hook sources/schemas.

**Files:**

- Modify: `src/audit/hook-vendor-drift.ts`

**Acceptance:**

- [x] Audit surface exists in the current branch state

#### [harness] Task 1.7: Conformance harness + schema fixtures (T6)

**Status:** done

**Depends:** Task 1.1, Task 1.2

Land the hook conformance harness, vendored schemas/fixtures, and the related
proof surface for emitters and dispatchers.

**Files:**

- Modify: `src/cli/commands/init/scaffolders/agent-hooks/__fixtures__/*`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/schemas/*`

**Acceptance:**

- [x] Harness/schema surfaces are present
- [x] This branch imported the Wave 2a landed state for the harness task

#### [setup-ux] Task 1.8: Verdict-first setup report + dry-run diff (T15)

**Status:** done

**Depends:** Task 1.1, Task 1.3

Land verdict-first setup reporting and the dry-run diff surface.

**Files:**

- Modify: `src/cli/commands/init/scaffolders/agent-hooks/report.ts`
- Modify: `src/cli/commands/init/index.ts`

**Acceptance:**

- [x] Setup report landed
- [x] Dry-run diff surface landed
- [x] Post-import cleanup kept the surface quiet in integration tests

#### [migration] Task 1.9: Hook restore/disable migration flow (T7)

**Status:** done

**Depends:** Task 1.3

Implement setup snapshot/restore/disable flows and round-trip tests.

**Files:**

- Modify: `src/cli/commands/init/index.ts`
- Modify: `src/cli/commands/init/init.integration.test.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/manifest.ts`

**Acceptance:**

- [x] `wp setup --restore-hooks` exists
- [x] `wp setup --disable-hooks <claude|codex|all>` exists
- [x] Round-trip integration coverage landed

#### [docs] Task 1.10: Matrix/docs/journey pass (T16)

**Status:** done

**Depends:** Task 1.1, Task 1.4

Generate/update the docs and journey surfaces tied to the landed hooks work.

**Files:**

- Modify: `README.md`
- Modify: `docs/hooks-quickstart.md`
- Modify: `docs/hooks-rollback.md`
- Modify: `docs/hooks-demo.md`
- Modify: `src/cli/commands/docs/generate-capability-matrix.ts`

**Acceptance:**

- [x] Hook docs are truthful to the current shipped CLI
- [x] `wp hooks demo` is documented as a shipped CLI surface

### Phase 2: BP2b surface expansion [Complexity: M]

#### [cursor] Task 2.1: Cursor emitter + fact-check subtask (T8 + T8a)

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"command":"node bin/wp test --file src/cli/commands/init/scaffolders/agent-hooks/emitters/cursor.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/schemas/schemas.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts","kind":"test","result":"pass","ts":"2026-06-07T23:30:00Z"},{"command":"node bin/wp lint src/cli/commands/init/scaffolders/agent-hooks/emitters/cursor.ts src/cli/commands/init/scaffolders/agent-hooks/emitters/cursor.test.ts src/cli/commands/init/scaffolders/agent-hooks/schemas/cursor-hooks.schema.ts src/cli/commands/init/scaffolders/agent-hooks/schemas/schemas.test.ts src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.ts blueprints/completed/2026-06-08-hooks-orchestrator-contract-series.md","kind":"test","result":"pass","ts":"2026-06-07T23:30:00Z"},{"command":"node bin/wp typecheck","kind":"test","result":"pass","ts":"2026-06-07T23:30:00Z"},{"command":"node bin/wp audit blueprint-lifecycle","kind":"audit","result":"pass","ts":"2026-06-07T23:30:00Z"}]
```

**Depends:** Task 1.1, Task 1.2

Implement the Cursor emitter with the documented compatibility contract:
camelCase shape, required `version: 1`, fail-closed guards, sessionStart env
support, and an explicit fact-check subtask for current Cursor event coverage
before claiming parity in the capability matrix.

**Files:**

- Modify: `src/cli/commands/init/scaffolders/agent-hooks/emitters/cursor.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/*`
- Modify: docs/matrix surfaces that declare Cursor support

#### [opencode] Task 2.2: OpenCode emitter plugin generation (T9)

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"command":"node bin/wp test --file src/cli/commands/init/scaffolders/agent-hooks/emitters/opencode.test.ts --file src/cli/commands/init/scaffolders/opencode-plugin/index.test.ts","kind":"test","result":"pass","ts":"2026-06-07T23:26:05Z"},{"command":"node bin/wp lint src/cli/commands/init/scaffolders/agent-hooks/emitters/opencode.ts src/cli/commands/init/scaffolders/agent-hooks/emitters/opencode.test.ts src/cli/commands/init/scaffolders/opencode-plugin/index.ts src/cli/commands/init/scaffolders/opencode-plugin/index.test.ts blueprints/completed/2026-06-08-hooks-orchestrator-contract-series.md","kind":"test","result":"pass","ts":"2026-06-07T23:26:05Z"},{"command":"node bin/wp typecheck","kind":"test","result":"pass","ts":"2026-06-07T23:26:05Z"},{"command":"node bin/wp audit blueprint-lifecycle","kind":"audit","result":"pass","ts":"2026-06-07T23:26:05Z"}]
```

**Depends:** Task 1.2

Generate a do-not-edit OpenCode plugin surface that translates deny JSON into
throwing behavior, injects sessionStart context, and proves lifecycle/cwd/env
behavior in tests.

**Files:**

- Modify: `src/cli/commands/init/scaffolders/agent-hooks/emitters/opencode.ts`
- Modify: `src/cli/commands/init/scaffolders/opencode-plugin/*`

#### [demo] Task 2.3: `wp hooks demo` pure simulation (T17)

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"command":"node bin/wp test --file src/hooks/demo/index.test.ts --file src/cli/commands/hooks.test.ts --file src/hooks/dispatch/index.test.ts","kind":"test","result":"pass","ts":"2026-06-07T23:19:25Z"},{"command":"node bin/wp lint src/hooks/demo/index.ts src/hooks/demo/index.test.ts src/hooks/shared/installed-hooks.ts src/hooks/dispatch/index.ts src/cli/commands/hooks.ts src/cli/commands/hooks.test.ts README.md docs/hooks-demo.md docs/hooks-quickstart.md blueprints/completed/2026-06-08-hooks-orchestrator-contract-series.md","kind":"test","result":"pass","ts":"2026-06-07T23:19:25Z"},{"command":"node bin/wp typecheck","kind":"test","result":"pass","ts":"2026-06-07T23:19:25Z"},{"command":"node bin/wp audit blueprint-lifecycle","kind":"audit","result":"pass","ts":"2026-06-07T23:19:25Z"}]
```

**Depends:** Task 1.2, Task 1.4

Add a pure simulation surface for hook outcomes. It must not mutate trust
state, installed configs, or logs; it only renders labeled simulated verdicts
for the current command/event scenario.

**Files:**

- Create: `src/hooks/demo/*`
- Modify: `src/cli/commands/hooks.ts`
- Modify: `README.md`

#### [doctor] Task 2.4: Doctor remedies + `--fix` honesty (T18)

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"command":"wp_test files=src/cli/commands/hooks.test.ts,src/hooks/doctor.test.ts","kind":"test","result":"pass","ts":"2026-06-08T23:59:00Z"},{"command":"wp_lint files=src/hooks/doctor.ts,src/hooks/doctor.test.ts,src/cli/commands/hooks.ts,src/cli/commands/hooks.test.ts,docs/hooks-doctor.md,blueprints/completed/2026-06-08-hooks-orchestrator-contract-series.md","kind":"test","result":"pass","ts":"2026-06-08T23:59:00Z"},{"command":"wp_typecheck cwd=/Users/ozby/repos/webpresso/agent-kit","kind":"test","result":"pass","ts":"2026-06-08T23:59:00Z"},{"command":"node bin/wp audit blueprint-lifecycle","kind":"audit","result":"pass","ts":"2026-06-08T23:59:00Z"}]
```

**Depends:** Task 1.3, Task 1.4

Extend `wp hooks doctor` with explicit remedies per verdict and an honest fix
contract: `fixed`, `prepared`, `requires-approval`, or `blocked`. Refuse to
overwrite hand-edited files silently; when repair cannot be completed
automatically, say exactly why and which files were preserved.

**Files:**

- Modify: `src/hooks/doctor.ts`
- Modify: `src/cli/commands/hooks.ts`
- Modify: docs that describe hook repair flows

#### [tier] Task 2.5: Cursor tier promotion/audit alignment (T10)

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"command":"bun src/cli/cli.ts test --file src/cli/commands/init/scaffolders/agent-hooks/emitters/cursor.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/schemas/schemas.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts","kind":"test","result":"pass","ts":"2026-06-07T23:31:35Z"},{"command":"node bin/wp lint src/cli/commands/init/scaffolders/agent-hooks/emitters/cursor.ts src/cli/commands/init/scaffolders/agent-hooks/emitters/cursor.test.ts src/cli/commands/init/scaffolders/agent-hooks/schemas/cursor-hooks.schema.ts src/cli/commands/init/scaffolders/agent-hooks/schemas/schemas.test.ts src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.ts catalog/agent/rules/supported-agent-clis.md .github/workflows/ci.agent-kit.yml blueprints/completed/2026-06-08-hooks-orchestrator-contract-series.md","kind":"test","result":"pass","ts":"2026-06-07T23:31:35Z"},{"command":"node --input-type=module -e \"import fs from 'node:fs'; import YAML from 'yaml'; YAML.parse(fs.readFileSync('.github/workflows/ci.agent-kit.yml','utf8')); console.log('yaml ok')\"","kind":"test","result":"pass","ts":"2026-06-07T23:31:35Z"},{"command":"node bin/wp audit blueprint-lifecycle","kind":"audit","result":"pass","ts":"2026-06-07T23:31:35Z"}]
```

**Depends:** Task 2.1

Wire the Cursor shell-slice/CI evidence and update the supported-agent-clis
surface only after the emitter and fact-check task are complete.

**Files:**

- Modify: `catalog/agent/rules/supported-agent-clis.md`
- Modify: CI surfaces that assert the supported-agent-clis contract

#### [adopter] Task 2.6: Example consumer/adopter extras (T19)

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"command":"node bin/wp test --file src/cli/commands/hooks-upgrade/index.test.ts --file src/cli/commands/hooks.test.ts --file src/hooks/dispatch/index.test.ts --file src/hooks/demo/index.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/ir.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/__fixtures__/vendor-io-conformance.test.ts","kind":"test","result":"pass","ts":"2026-06-08T01:30:00Z"},{"command":"node bin/wp lint src/cli/commands/hooks-upgrade/index.ts src/cli/commands/hooks-upgrade/index.test.ts src/cli/commands/hooks.ts src/cli/commands/hooks.test.ts src/hooks/dispatch/index.test.ts src/hooks/demo/index.test.ts src/cli/commands/init/scaffolders/agent-hooks/ir.ts src/cli/commands/init/scaffolders/agent-hooks/ir.test.ts src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.ts src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts src/cli/commands/init/scaffolders/agent-hooks/emitters/cursor.ts src/cli/commands/init/scaffolders/agent-hooks/schemas/codex-hooks.schema.ts src/cli/commands/init/scaffolders/agent-hooks/__fixtures__/vendor-io-conformance.test.ts README.md docs/hook-matrix.md docs/hooks-cross-plan-notes.md examples/hooks-consumer/README.md examples/hooks-consumer/package.json","kind":"test","result":"pass","ts":"2026-06-08T01:30:00Z"},{"command":"node bin/wp typecheck","kind":"test","result":"pass","ts":"2026-06-08T01:30:00Z"},{"command":"node bin/wp audit blueprint-lifecycle","kind":"audit","result":"pass","ts":"2026-06-08T01:30:00Z"}]
```

**Depends:** Task 2.3

Add a runnable example consumer and the minimal adopter-facing extras that
exercise the demo/documented hook flows outside this repo.

**Files:**

- Create/Modify: `examples/*`

### Phase 3: BP3 full event coverage [Complexity: M]

#### [events] Task 3.1: Expand full event coverage across emitters (T11)

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"command":"node bin/wp test --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts --file src/audit/hook-vendor-drift.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/ir.test.ts --file src/hooks/dispatch/index.test.ts --file src/hooks/demo/index.test.ts --file src/cli/commands/hooks-upgrade/index.test.ts --file src/cli/commands/hooks.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/__fixtures__/vendor-io-conformance.test.ts","kind":"test","result":"pass","ts":"2026-06-08T01:51:00Z"},{"command":"node bin/wp audit hook-vendor-drift","kind":"audit","result":"pass","ts":"2026-06-08T01:51:00Z"},{"command":"node bin/wp lint src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.ts src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts src/cli/commands/init/scaffolders/agent-hooks/ir.ts src/audit/hook-vendor-drift.test.ts docs/hook-matrix.md blueprints/completed/2026-06-08-hooks-orchestrator-contract-series.md","kind":"test","result":"pass","ts":"2026-06-08T01:56:00Z"},{"command":"node bin/wp typecheck","kind":"test","result":"pass","ts":"2026-06-08T01:56:00Z"}]
```

**Depends:** Task 1.7, Task 2.1, Task 2.2

Finish the event-coverage contract by separating host-known lifecycle events
from the emitted managed `wp-*` subset, aligning the capability matrix with
what setup actually installs today, and recording richer native events as
`partial` / `unmapped` where a vendor can express the event but this repo does
not yet emit a dedicated managed hook for it.

**Files:**

- Modify: `src/cli/commands/init/scaffolders/agent-hooks/*`
- Modify: `src/hooks/*`
- Modify: `docs/hook-matrix.md`

### Phase 4: BP4 workspace ops + third-party coordination [Complexity: M]

#### [workspace] Task 4.1: `wp hooks upgrade --workspace` + bad-state fixtures (T20)

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"command":"node bin/wp test --file src/cli/commands/hooks-upgrade/index.test.ts --file src/cli/commands/hooks.test.ts --file src/hooks/dispatch/index.test.ts --file src/hooks/demo/index.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/ir.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/__fixtures__/vendor-io-conformance.test.ts","kind":"test","result":"pass","ts":"2026-06-08T01:30:00Z"},{"command":"node bin/wp hooks upgrade","kind":"smoke","result":"pass","ts":"2026-06-08T01:35:00Z"},{"command":"node bin/wp lint src/cli/commands/hooks-upgrade/index.ts src/cli/commands/hooks-upgrade/index.test.ts src/cli/commands/hooks.ts src/cli/commands/hooks.test.ts README.md blueprints/completed/2026-06-08-hooks-orchestrator-contract-series.md","kind":"test","result":"pass","ts":"2026-06-08T01:30:00Z"},{"command":"node bin/wp typecheck","kind":"test","result":"pass","ts":"2026-06-08T01:30:00Z"}]
```

**Depends:** Task 1.8, Task 2.4

Add a workspace upgrade surface with dry-run-first guidance, enforcement-state
deltas, bad-state fixtures, and regeneration/measurement honesty.

**Files:**

- Create/Modify: `src/cli/commands/hooks-upgrade/*`
- Create/Modify: workspace bad-state fixtures

#### [thirdparty] Task 4.2: OMC/context-mode coordination proof (T12)

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"command":"node bin/wp test --file src/cli/commands/hooks-upgrade/index.test.ts --file src/cli/commands/hooks.test.ts --file src/hooks/dispatch/index.test.ts --file src/hooks/demo/index.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/ir.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/__fixtures__/vendor-io-conformance.test.ts","kind":"test","result":"pass","ts":"2026-06-08T01:30:00Z"},{"command":"node bin/wp lint docs/hook-matrix.md docs/hooks-cross-plan-notes.md blueprints/completed/2026-06-08-hooks-orchestrator-contract-series.md","kind":"test","result":"pass","ts":"2026-06-08T01:30:00Z"},{"command":"node bin/wp audit hook-vendor-drift","kind":"audit","result":"pass","ts":"2026-06-08T01:51:00Z"},{"command":"node bin/wp typecheck","kind":"test","result":"pass","ts":"2026-06-08T01:56:00Z"}]
```

**Depends:** Task 1.2

Capture the third-party coordination lane for OMC/context-mode so the hooks
story remains bounded and measurable when multiple hook systems coexist.

**Files:**

- Modify: coordination surfaces under `src/cli/commands/init/scaffolders/*`
- Modify: blueprint evidence/docs for the coordination contract

## Verification Gates

| Gate | Command | Success Criteria |
| --- | --- | --- |
| Type safety | `wp_typecheck` | Zero errors on touched files |
| Lint | `wp_lint` | Zero issues on touched files |
| Tests | `wp_test` | All touched suites pass |
| Blueprint lifecycle | `wp_audit(kind=\"blueprint-lifecycle\")` or repo equivalent | Blueprint remains valid after edits |
| Hook drift | `wp_audit(kind=\"hook-vendor-drift\")` when hook contracts change | No unexpected vendor-drift failures |

## Cross-Plan References

| Type | Blueprint / plan | Relationship |
| --- | --- | --- |
| Upstream lineage | `blueprints/completed/codex-global-hook-runtime-hardening/_overview.md` | Runtime-hardening foundation for current hook surfaces |
| Upstream lineage | `blueprints/completed/2026-06-07-root-launcher-contract-and-hook-ownership-alignment.md` | Launcher and hook ownership contract used by setup/doctor surfaces |
| Imported source | `~/.claude/plans/also-investigate-codex-cli-buzzing-popcorn.md` | Full task graph source for this blueprint import |
| Cross-plan note | monorepo `unified-cli-public-cutover` note from original T16 | Canonical CLI naming note already carried in docs work |

## Non-goals

- Re-opening already-landed BP2a work unless verification exposes a real regression
- Inventing non-plan hook emitters beyond the imported Claude plan scope
- Pretending the sibling-repo husky migration is repo-owned inside this blueprint
