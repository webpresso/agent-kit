---
type: blueprint
status: completed
complexity: L
created: '2026-05-30'
last_updated: '2026-05-31'
progress: '100% (execution map completed)'
depends_on: []
tags:
  - wp
  - cross-project
  - execution-map
  - agent-kit
  - framework
---

# Cross-project `wp` execution map

**Goal:** Coordinate the near-`wp`-only rollout across `agent-kit`, `framework`,
`monorepo`, `ingest-lens`, and `edge-matte`, with `agent-kit` as the durable
source of truth for the cross-repo dependency graph and execution order.

## Planning Summary

- Goal input: `Near-wp-only rollout with agent-kit as base wp and framework as extension`
- Complexity: `L`
- Draft slug: `2026-05-30-cross-project-wp-execution-map`
- Output path: `blueprints/planned/2026-05-30-cross-project-wp-execution-map.md`
- Validation scope: blueprint parser compliance + cross-plan dependency consistency

## Architecture Overview

```text
agent-kit (base wp)
 ├─ owns: setup, sync, install/add/remove/update/run/exec, generic quality flows
 ├─ owns: managed tool runners + extension runtime
 └─ drives cross-project execution map

framework (wp extension)
 └─ owns: reusable project/platform/framework commands

monorepo
 └─ first framework-extension consumer + extraction source

ingest-lens / edge-matte
 └─ thin agent-kit consumers
```

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Cross-repo orchestration home | `agent-kit` | The base `wp` program and reusable repo-contract logic live here |
| Base CLI owner | `@webpresso/agent-kit` | Generic `wp` behavior must stay framework-neutral |
| Extension owner | `@webpresso/webpresso` | Reusable platform/project behavior belongs in framework |
| Framework proving ground | `monorepo` | It already contains the private CLI host/bundle split to extract |
| Thin consumer target | `ingest-lens`, `edge-matte` | They should converge toward app-specific deps plus `@webpresso/agent-kit` |

## Agent-kit ownership ledger

`agent-kit` owns this execution map and remains the only durable cross-project
planner for the near-`wp` rollout. Repo-local blueprints may refine their own
tasks, but they must not invert these boundaries:

| Surface | Owner | Status in this map | Boundary |
| ------- | ----- | ------------------ | -------- |
| Cross-project execution map | `agent-kit` | canonical | Dependency order and readiness gates live here |
| Base `wp` package/quality verbs | `agent-kit` | completed blueprint | Generic setup/install/run/exec/test/typecheck/lint/format/audit behavior stays framework-neutral |
| `wp` extension host contract | `agent-kit` | completed blueprint | Load/discover/diagnose extension packages without knowing framework commands |
| Framework/project commands | `framework` (`@webpresso/webpresso`) | downstream blueprint | Reusable project/platform behavior is extension-owned, not base-`wp` code |
| Framework consumer cleanup | `monorepo` | downstream blueprint | Adopt base `wp` + framework extension; delete duplicated private CLI only after upstreams land |
| Thin-consumer cleanup | `ingest-lens`, `edge-matte` | downstream blueprints | Consume shipped shared rails only; keep app/runtime/deploy specifics local |

## Repo-local blueprint dependency graph

Canonical dependencies are slug-based. Paths below record the observed
2026-05-31 local checkout state; downstream repos should normalize moved
lifecycle paths before claiming cross-plan audit success.

| Blueprint | Repo/path observed | Current lifecycle | Required upstreams | Downstream / relation |
| --------- | ------------------ | ----------------- | ------------------ | --------------------- |
| `2026-05-30-cross-project-wp-execution-map` | `agent-kit/blueprints/planned/...` | planned control map | none | Owns all cross-repo ordering |
| `2026-05-30-agent-kit-base-wp-core` | `agent-kit/blueprints/completed/...` | completed | execution map | Required by extension runtime, framework extension, monorepo, ingest-lens, edge-matte |
| `2026-05-30-agent-kit-wp-extension-runtime` | `agent-kit/blueprints/completed/...` | completed | execution map + completed base `wp` contract | Unblocks framework extension implementation; remains upstream of monorepo final adoption |
| `2026-05-30-framework-wp-extension` | `framework/blueprints/planned/...` | planned | execution map + base `wp` + extension runtime | Blocks monorepo framework-consumer adoption |
| `2026-05-30-ingest-lens-wp-thin-consumer` | `ingest-lens/blueprints/planned/...` | planned | execution map + base `wp` | Runs after base `wp`; must not depend on framework extension |
| `2026-05-30-edge-matte-wp-thin-consumer` | `edge-matte/blueprints/planned/...` | planned | execution map + shipped base `wp`/`vp` split | Runs after base `wp`; must not be forced into future-only `wp` wrappers |
| `2026-05-30-monorepo-wp-first-framework-consumer` | `monorepo/webpresso/blueprints/planned/...` | planned | execution map + framework extension (+ base and runtime transitively) | Final adopter/proving ground for extracted framework behavior |

### Rollout order

```text
done: agent-kit-base-wp-core
  -> done: agent-kit-wp-extension-runtime
    -> framework-wp-extension
      -> monorepo-wp-first-framework-consumer

done: agent-kit-base-wp-core
  -> ingest-lens-wp-thin-consumer
  -> edge-matte-wp-thin-consumer
```

Thin-consumer work may proceed in parallel with extension-runtime work only when
it consumes currently shipped base capabilities. It must stop rather than
invent local future `wp` behavior or import framework-only commands.

## Fact-checked rollout constraints

| Finding | Severity | Reality checked on 2026-05-31 | Rollout fix / implication |
| ------- | -------- | ----------------------------- | ------------------------- |
| F1 | High | `agent-kit` is the root package for `@webpresso/agent-kit`, the local `AGENTS.md` owner of generated agent surfaces, and the repo containing this map. | Keep cross-repo dependency authority here; downstream plans link back here. |
| F2 | High | `2026-05-30-agent-kit-base-wp-core` and `2026-05-30-agent-kit-wp-extension-runtime` are now under `blueprints/completed/`, while some downstream `depends_on` entries still point at old planned paths. | Treat the slugs as satisfied, but require lifecycle-link normalization before `/pll` claims full cross-repo consistency. |
| F3 | High | All checked root manifests still declare `packageManager: pnpm@11.1.1`; `agent-kit` depends on `vite-plus`; package scripts still use `vp` as an internal delegate in build/package flows. | Do not remove `pnpm` or `vp`; route public guidance through `wp` where shipped and keep `vp` as substrate/delegate. |
| F4 | High | The extension runtime blueprint is completed in the current agent-kit worktree, including host-range diagnostics and alias-gating expectations. | Framework extension work is now next in sequence, but must consume the `agent-kit` contract rather than reimplementing an extension host. |
| F5 | Medium | `framework` still exposes raw `pnpm`, `vitest`, `tsc`, and build scripts in its root scripts today. | Framework cleanup belongs to the framework extension blueprint after the host contract exists; do not move those commands into `agent-kit`. |
| F6 | Medium | `monorepo` already has several `wp` scripts but still uses `vp` for CI/runtime orchestration and depends on framework extraction for final adoption. | Keep monorepo downstream of framework extraction; use existing unified-cli work as evidence, not the authority. |
| F7 | High | Thin consumers differ: `ingest-lens` has an aspirational `wp`-first plan, while `edge-matte` explicitly records the current shipped `vp` + `wp` split and package-local direct-tool exceptions. | Thin-consumer migrations may only consume shipped upstream surfaces; edge-matte must not be forced into a local future `wp`-only model. |

### Stop conditions

- Stop consumer execution if base `wp` package/quality verbs are unavailable in
  a fresh checkout of that repo.
- Stop framework extraction if the completed `agent-kit` extension runtime
  contract, host-range diagnostics, or alias-collision policy are unavailable
  in the framework checkout being migrated.
- Stop monorepo adoption if the framework extension entrypoint is not published
  or if adoption would recreate a parallel private command host.
- Stop thin-consumer cleanup if it introduces framework-specific behavior,
  package-local wrapper dependencies, or future-only `wp` commands not shipped
  by `agent-kit`.
- Stop `/pll` handoff if lifecycle audits still resolve moved blueprint paths
  incorrectly rather than slug/canonical lifecycle state.

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| ---- | ----- | ------------ | -------------- | ---------------- |
| **Wave 0** | 1.1 | None | 1 agent | XS |
| **Wave 1** | 1.2, 1.3 | Task 1.1 | 2 agents | S |
| **Wave 2** | 2.1, 2.2, 2.3 | Wave 1 | 3 agents | S-M |
| **Wave 3** | 3.1 | Wave 2 | 1 agent | M |
| **Critical path** | 1.1 → 1.2 → 2.1 → 2.3 → 3.1 | -- | 4 waves | L |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ 1 | 1 |
| CPR | total_tasks / critical_path_length | ≥ 2.0 | 1.5 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 1.33 |
| CP | same-file overlaps per wave | 0 | 0 |

Refinement delta: Wave 0 stays intentionally narrow so the umbrella dependency
graph lands before the repo-local blueprints branch in parallel. Score: **B-**.

### Phase 1: umbrella contract [Complexity: S]

#### [docs] Task 1.1: Lock the cross-repo ownership and dependency graph

**Status:** done

**Depends:** None

Define the cross-repo ownership split and dependency order in one durable
blueprint. This task exists so later repo-local blueprints do not make
conflicting assumptions about whether behavior belongs in `agent-kit`,
`framework`, or repo-local code.

**Files:**

- Modify: `blueprints/planned/2026-05-30-cross-project-wp-execution-map.md`

**Steps (TDD):**

1. Record the ownership boundary for base `wp`, framework extension, framework consumer, and thin consumers.
2. Add explicit upstream/downstream links to every repo-local blueprint in this program.
3. Run `wp audit blueprint-lifecycle` — verify PASS.

**Acceptance:**

- [x] `agent-kit` is recorded as the owner of the cross-project execution map.
- [x] Every repo-local blueprint in this program has an explicit dependency relation here.
- [x] Blueprint lifecycle audit passes.

#### [docs] Task 1.2: Capture fact-checked findings and stop conditions

**Status:** done

**Depends:** Task 1.1

Persist the facts that force this rollout shape: `vp` remains an internal
delegate, `pnpm` remains substrate, `monorepo` is framework-bearing, and thin
consumers should not absorb framework behavior. Also define stop conditions for
unsafe execution.

**Files:**

- Modify: `blueprints/planned/2026-05-30-cross-project-wp-execution-map.md`

**Steps (TDD):**

1. Add F1-F7 findings with severity, reality, and fix.
2. Add explicit non-goals for “remove pnpm substrate” and “move framework deps into agent-kit”.
3. Run `wp audit blueprint-lifecycle` — verify PASS.

**Acceptance:**

- [x] The umbrella blueprint records the fact-checked constraints behind the rollout.
- [x] Unsafe directions are called out as non-goals or stop conditions.
- [x] Lifecycle audit passes.

#### [qa] Task 1.3: Define cross-project verification gates

**Status:** done

**Depends:** Task 1.1

Specify the minimum cross-repo contract checks required before any repo is
declared migrated. The intent is to prevent one repo from claiming `wp`-first
success while another still leaks public raw `pnpm`, direct `vitest`, or bare
`tsc`.

**Files:**

- Modify: `blueprints/planned/2026-05-30-cross-project-wp-execution-map.md`

**Steps (TDD):**

1. Define fresh-clone smoke gates for all consumer repos.
2. Define script/doc/workflow audit gates for public command surfaces.
3. Run `wp audit blueprint-lifecycle` — verify PASS.

**Acceptance:**

- [x] A single verification matrix covers `agent-kit`, `framework`, `monorepo`, `ingest-lens`, and `edge-matte`.
- [x] Public `pnpm` / direct tool leakage is part of the acceptance criteria.
- [x] Lifecycle audit passes.

### Phase 2: blueprint set branching [Complexity: S]

#### [docs] Task 2.1: Create the agent-kit base-wp blueprint

**Status:** done

**Depends:** Task 1.2

Create the repo-local blueprint that makes base `wp` sufficient for public
human/CI use. It must own package verbs, managed tool runners, and public UX
cleanup.

**Files:**

- Create/complete: `blueprints/completed/2026-05-30-agent-kit-base-wp-core.md`

**Steps (TDD):**

1. Draft the blueprint using the shared dependency graph from Task 1.1.
2. Link this execution map as the upstream plan.
3. Run `wp audit blueprint-lifecycle` — verify PASS.

**Acceptance:**

- [x] The base-wp blueprint exists and links back to this umbrella plan.
- [x] It does not mix framework-specific behavior into agent-kit.
- [x] Lifecycle audit passes.

#### [docs] Task 2.2: Create the framework-extension and thin-consumer blueprints

**Status:** done

**Depends:** Task 1.2

Create the framework and consumer blueprints that consume the umbrella plan.
Keep the framework extension separate from thin-consumer repo migrations so
`monorepo` can adopt extracted behavior only after framework owns it.

**Files:**

- Create: `framework/blueprints/planned/2026-05-30-framework-wp-extension.md`
- Create: `ingest-lens/blueprints/planned/2026-05-30-ingest-lens-wp-thin-consumer.md`
- Create: `edge-matte/blueprints/planned/2026-05-30-edge-matte-wp-thin-consumer.md`

**Steps (TDD):**

1. Draft the framework extension blueprint with explicit ownership boundaries.
2. Draft both thin-consumer blueprints with `wp`-first migration goals.
3. Verify all three link back to this execution map.

**Acceptance:**

- [x] Framework and thin-consumer blueprints exist.
- [x] Cross-plan references are consistent with the umbrella dependency graph.
- [x] No thin-consumer blueprint assumes framework behavior.

#### [docs] Task 2.3: Create the monorepo framework-consumer blueprint

**Status:** done

**Depends:** Task 1.2

Create the monorepo blueprint that consumes base `wp` plus the framework
extension and deletes duplicated private CLI behavior. This task must keep
monorepo downstream of framework extraction and thin-consumer learnings.

**Files:**

- Create: `monorepo/webpresso/blueprints/planned/2026-05-30-monorepo-wp-first-framework-consumer.md`

**Steps (TDD):**

1. Draft the monorepo consumer blueprint with explicit upstream dependencies.
2. Link existing unified-cli cutover work as background, not as the sole source of truth.
3. Run repo-local blueprint validation where available — verify PASS.

**Acceptance:**

- [x] Monorepo is described as a framework consumer, not a custom CLI island.
- [x] The blueprint depends on framework extraction before final adoption.
- [x] Cross-plan references are consistent.

### Phase 3: rollout handoff [Complexity: M]

#### [qa] Task 3.1: Freeze the cross-project execution order for `/pll`

**Status:** done

**Depends:** Task 2.1, Task 2.2, Task 2.3

Once every repo-local blueprint exists, finalize the wave order and readiness
criteria for parallel execution. This is the operator handoff plan for
cross-project implementation.

**Files:**

- Modify: `blueprints/planned/2026-05-30-cross-project-wp-execution-map.md`

**Steps (TDD):**

1. Record the final wave order and critical path using the created blueprints.
2. Recompute the parallel metrics.
3. Run `wp audit blueprint-lifecycle` — verify PASS.

**Acceptance:**

- [x] `/pll` can execute from this map without additional planning.
- [x] Critical path, dependencies, and acceptance gates match the created blueprints.
- [x] Lifecycle audit passes.

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Blueprint lifecycle | `wp audit blueprint-lifecycle` from `agent-kit` | Zero lifecycle violations for the local map |
| Cross-plan consistency | repo-local blueprint-link/lifecycle audits where available | No broken references to moved lifecycle paths; slugs resolve to canonical status |
| Cross-repo smoke matrix | See matrix below | Each repo proves the command surface it claims before migration is accepted |
| Public command leakage | grep/audit tests for active docs/scripts/workflows/package scripts | Public guidance is `wp`-first where shipped; remaining `vp`/`pnpm`/direct-tool usage is internal, substrate, or explicitly justified |

### Cross-project verification matrix

| Project | Role | Minimum local evidence before claiming migrated | Leakage / boundary acceptance | Stop condition |
| ------- | ---- | ---------------------------------------------- | ----------------------------- | -------------- |
| `agent-kit` | base `wp` owner + map owner | `wp audit blueprint-lifecycle`; `wp typecheck`; `wp lint`; `wp format --check`; targeted `wp test`/package-surface checks | Public docs/scripts prefer `wp`; `vp` remains internal delegate; no framework commands in base runtime | Any base verb, managed runner, package export, or lifecycle audit regression |
| `framework` | `wp` extension provider | After runtime lands: extension contract tests; framework verification (`webpresso test` or repo-owned test command); package-surface checks for `@webpresso/webpresso/wp-extension` | Framework/project commands live here; aliases are repo-detected; no imports from monorepo-private packages | Host contract missing, alias leakage into non-framework repos, or package export drift |
| `monorepo` | first framework consumer | Fresh checkout proves base `wp` + framework extension load; repo typecheck/lint/test recipes; blueprint/docs validation | Public surfaces use `wp`/framework extension for normal workflows; private CLI remains only for non-reusable local orchestration | Adoption outruns framework extraction or recreates duplicated generic command ownership |
| `ingest-lens` | thin consumer | `wp setup`; `wp typecheck`/`wp lint`/`wp format --check` where shipped; repo e2e/test recipes; architecture drift check | Generic flows consume `agent-kit`; no framework behavior is assumed; remaining `vp`/direct tools are substrate or app-specific | Migration adds framework-only commands/deps or removes app/runtime/deploy-specific behavior without proof |
| `edge-matte` | thin consumer with current `vp` + `wp` split | `vp run format:check`; `vp run -r lint`; `vp run -r check-types`; `node --test "test/**/*.test.mjs"`; `vp run -r test`; `wp audit blueprint-lifecycle --legacy-omx`; architecture/path/secrets audits | Root orchestration may remain `vp`; `wp` covers setup/audits/shipped quality lanes; package-local direct-tool exceptions stay classified | Any attempt to force unshipped local `wp` wrappers, add package-local wrapper deps, or erase justified Vitest/tsc coupling |

## Cross-Plan References

| Type | Blueprint | Relationship | Canonical dependency statement |
| ---- | --------- | ------------ | ------------------------------ |
| Downstream | `2026-05-30-agent-kit-base-wp-core` | completed base `wp` implementation blueprint | Upstream of every remaining repo-local blueprint |
| Downstream | `2026-05-30-agent-kit-wp-extension-runtime` | completed `agent-kit` extension runtime blueprint | Depends on this map and the completed base contract; upstream of framework |
| Downstream | `2026-05-30-framework-wp-extension` | framework extension blueprint | Depends on base `wp` + extension runtime; upstream of monorepo |
| Downstream | `2026-05-30-ingest-lens-wp-thin-consumer` | ingest-lens migration blueprint | Depends on base `wp`; intentionally independent of framework |
| Downstream | `2026-05-30-edge-matte-wp-thin-consumer` | edge-matte migration blueprint | Depends on shipped base `wp`/`vp` split; intentionally independent of framework |
| Downstream | `2026-05-30-monorepo-wp-first-framework-consumer` | monorepo adoption blueprint | Depends on framework extension and transitive `agent-kit` runtime/base work |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --------- | ---- | -------- | ---- |
| Base `wp` lands after consumer migration starts | consumer churn and contradictory docs | force consumers to depend on the base-wp blueprint | 1.1, 3.1 |
| Framework extraction and monorepo adoption overlap on the same command roots | repo-private/future-extension conflict | keep monorepo downstream of framework extraction | 2.3, 3.1 |
| Downstream plans reference moved blueprint lifecycle paths | false broken-link failures | treat slugs as canonical and update repo-local links before final audit | 1.1, 3.1 |
| Thin consumer copies framework command behavior | dependency bloat and wrong UX | keep ingest-lens/edge-matte independent of framework extension | 1.2, 2.2 |
| EdgeMatte is forced beyond the shipped upstream surface | local divergence from upstream reality | preserve the explicit `vp` + `wp` split until `agent-kit` ships package-local wrappers | 1.2, 1.3 |

## Non-goals

- Eliminating `pnpm` as workspace substrate
- Moving framework-specific dependencies into `agent-kit`
- Rewriting existing monorepo CLI history instead of extracting reusable parts
- Forcing every `vp` occurrence out of package scripts while `vp` remains the
  managed package/workspace delegate
- Inventing package-local future `wp` wrappers inside thin consumers before the
  upstream `agent-kit` surface ships them
- Treating a docs-only execution-map update as permission to modify source,
  package, or generated agent-surface files

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Cross-repo wave order drifts during execution | High | Keep the umbrella plan in `agent-kit` and link every downstream blueprint back to it |
| Repo-local blueprints diverge in terminology or ownership | Medium | Record the shared terms and boundaries here first |
| Lifecycle path drift hides a real dependency mismatch | Medium | Verify canonical slugs and moved planned/completed paths in repo-local audits |
| "Near `wp` only" is interpreted as "delete all `vp` immediately" | High | Keep `vp`/`pnpm` as substrate/delegate non-goals and require shipped-surface evidence |

## Technology Choices

| Component | Technology | Version | Why |
| --------- | ---------- | ------- | --- |
| Public CLI base | `@webpresso/agent-kit` | workspace | Generic `wp` ownership |
| Framework extension | `@webpresso/webpresso/wp-extension` | workspace | Reusable platform/project behavior |
| Internal package facade | `vite-plus (vp)` | current repo version | Internal delegate for package-manager verbs |


## Completion Evidence

- Recorded `agent-kit` ownership for the cross-project execution map.
- Captured slug-based dependency graph across `agent-kit`, `framework`, `monorepo`, `ingest-lens`, and `edge-matte`.
- Added fact-checked constraints, stop conditions, rollout order, non-goals, and a cross-project verification matrix.
- Marked all execution-map tasks complete after the base `wp` blueprint and extension-runtime blueprint were completed in this repo.
- Verification on 2026-05-31: `wp audit blueprint-lifecycle` — pass.
