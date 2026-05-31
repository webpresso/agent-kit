---
type: blueprint
status: planned
complexity: L
created: '2026-05-30'
last_updated: '2026-05-31'
progress: '35% (agent-kit base blueprint completed)'
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

- [ ] `agent-kit` is recorded as the owner of the cross-project execution map.
- [ ] Every repo-local blueprint in this program has an explicit dependency relation here.
- [ ] Blueprint lifecycle audit passes.

#### [docs] Task 1.2: Capture fact-checked findings and stop conditions

**Status:** todo

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

- [ ] The umbrella blueprint records the fact-checked constraints behind the rollout.
- [ ] Unsafe directions are called out as non-goals or stop conditions.
- [ ] Lifecycle audit passes.

#### [qa] Task 1.3: Define cross-project verification gates

**Status:** todo

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

- [ ] A single verification matrix covers `agent-kit`, `framework`, `monorepo`, `ingest-lens`, and `edge-matte`.
- [ ] Public `pnpm` / direct tool leakage is part of the acceptance criteria.
- [ ] Lifecycle audit passes.

### Phase 2: blueprint set branching [Complexity: S]

#### [docs] Task 2.1: Create the agent-kit base-wp blueprint

**Status:** todo

**Depends:** Task 1.2

Create the repo-local blueprint that makes base `wp` sufficient for public
human/CI use. It must own package verbs, managed tool runners, and public UX
cleanup.

**Files:**

- Create: `blueprints/planned/2026-05-30-agent-kit-base-wp-core.md`

**Steps (TDD):**

1. Draft the blueprint using the shared dependency graph from Task 1.1.
2. Link this execution map as the upstream plan.
3. Run `wp audit blueprint-lifecycle` — verify PASS.

**Acceptance:**

- [x] The base-wp blueprint exists and links back to this umbrella plan.
- [x] It does not mix framework-specific behavior into agent-kit.
- [x] Lifecycle audit passes.

#### [docs] Task 2.2: Create the framework-extension and thin-consumer blueprints

**Status:** todo

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

- [ ] Framework and thin-consumer blueprints exist.
- [ ] Cross-plan references are consistent with the umbrella dependency graph.
- [ ] No thin-consumer blueprint assumes framework behavior.

#### [docs] Task 2.3: Create the monorepo framework-consumer blueprint

**Status:** todo

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

- [ ] Monorepo is described as a framework consumer, not a custom CLI island.
- [ ] The blueprint depends on framework extraction before final adoption.
- [ ] Cross-plan references are consistent.

### Phase 3: rollout handoff [Complexity: M]

#### [qa] Task 3.1: Freeze the cross-project execution order for `/pll`

**Status:** todo

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

- [ ] `/pll` can execute from this map without additional planning.
- [ ] Critical path, dependencies, and acceptance gates match the created blueprints.
- [ ] Lifecycle audit passes.

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Blueprint lifecycle | `wp audit blueprint-lifecycle` | Zero lifecycle violations |
| Cross-plan consistency | `wp blueprint audit` | No broken references from this map to repo-local plans |
| Cross-repo smoke matrix | `wp setup --yes --cwd <repo>` then `wp --version && wp install --help && wp test --help` | All participating repos boot with `@webpresso/agent-kit` ownership and no raw-command regressions in public surfaces |

## Cross-Plan References

| Type | Blueprint | Relationship |
| ---- | --------- | ------------ |
| Downstream | `2026-05-30-agent-kit-base-wp-core` | base `wp` implementation blueprint |
| Downstream | `2026-05-30-agent-kit-wp-extension-runtime` | extension runtime blueprint |
| Downstream | `2026-05-30-framework-wp-extension` | framework extension blueprint |
| Downstream | `2026-05-30-ingest-lens-wp-thin-consumer` | ingest-lens migration blueprint |
| Downstream | `2026-05-30-edge-matte-wp-thin-consumer` | edge-matte migration blueprint |
| Downstream | `2026-05-30-monorepo-wp-first-framework-consumer` | monorepo adoption blueprint |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --------- | ---- | -------- | ---- |
| Base `wp` lands after consumer migration starts | consumer churn and contradictory docs | force consumers to depend on the base-wp blueprint | 1.1, 3.1 |
| Framework extraction and monorepo adoption overlap on the same command roots | repo-private/future-extension conflict | keep monorepo downstream of framework extraction | 2.3, 3.1 |

## Non-goals

- Eliminating `pnpm` as workspace substrate
- Moving framework-specific dependencies into `agent-kit`
- Rewriting existing monorepo CLI history instead of extracting reusable parts

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Cross-repo wave order drifts during execution | High | Keep the umbrella plan in `agent-kit` and link every downstream blueprint back to it |
| Repo-local blueprints diverge in terminology or ownership | Medium | Record the shared terms and boundaries here first |

## Technology Choices

| Component | Technology | Version | Why |
| --------- | ---------- | ------- | --- |
| Public CLI base | `@webpresso/agent-kit` | workspace | Generic `wp` ownership |
| Framework extension | `@webpresso/webpresso/wp-extension` | workspace | Reusable platform/project behavior |
| Internal package facade | `vite-plus (vp)` | current repo version | Internal delegate for package-manager verbs |
