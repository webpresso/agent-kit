---
type: blueprint
status: planned
complexity: M
created: '2026-05-06'
last_updated: '2026-05-06'
progress: '0% (planned — follow-up to compact QA caveat; route Monorepo QA through agent-kit or define adapter boundary)'
depends_on:
  - compact-qa-output-filters
tags:
  - agent-kit
  - monorepo
  - qa
  - context-window
  - cross-repo
---

# Route Monorepo QA Through agent-kit

**Goal:** Close the compact-QA caveat for the **Monorepo** by deciding and
implementing the safest bridge from `webpresso/monorepo` `just qa` to compact
agent-kit QA output, without expanding `compact-qa-output-filters` or
reimplementing rtk filters in agent-kit.

## Why

`compact-qa-output-filters` deliberately covers the agent-kit MCP QA path:
`ak qa`, `ak test`, `ak lint`, `ak typecheck`, and local dev commands that
`ak-pretool-guard` redirects to those MCP handlers.

The **Monorepo** `just qa` recipe is different: it runs its own parallel
pipeline and does not currently call `ak qa`. Compacting that output needs a
separate cross-repo boundary decision:

1. route `just qa` through the agent-kit MCP path, preserving Monorepo flags; or
2. keep Monorepo orchestration local and add an explicit adapter that emits the
   same compact contract.

This blueprint exists so the caveat is durable, testable, and not hidden inside
the compact-QA implementation blueprint.

## Scope

### A. Boundary discovery

- Inspect the Monorepo `just qa` recipe and its package/file filter semantics.
- Map which stages correspond to `ak lint`, `ak typecheck`, `ak test`, and
  `ak qa`.
- Identify any Monorepo-only stages that cannot be represented by agent-kit MCP
  tools yet.

### B. Bridge decision

Pick one bridge:

- **Preferred:** route Monorepo `just qa` to `ak qa`/MCP handlers while
  preserving package and file filters.
- **Fallback:** define a Monorepo-side adapter that emits the compact-QA
  transform contract without moving orchestration into agent-kit.

Record the decision in this blueprint before implementation starts.

### C. Implementation

- Update the chosen Monorepo command surface.
- Keep agent-kit changes limited to generic flags/contracts needed by the MCP
  path.
- Do not edit rtk internals or add rtk-equivalent filters to agent-kit.

### D. Verification

- Seed one lint failure, one type error, and one failing test in a Monorepo
  fixture/worktree.
- Run Monorepo `just qa`.
- Assert the LLM-facing payload uses the compact-QA contract and preserves all
  failures with file/line signal.

## Out of scope

- Reopening `compact-qa-output-filters` scope.
- Reimplementing rtk long-tail filters in agent-kit.
- Compressing arbitrary shell commands such as `git`, `gh`, `kubectl`, `cargo`,
  or `pytest`; those remain rtk's lane.
- Changing completed roadmap decisions.

## Verification Gates

| Gate | Expected behavior |
| --- | --- |
| **G1. Boundary decision** | Blueprint records whether Monorepo uses `ak qa` routing or a Monorepo-side adapter, with reasons. |
| **G2. Flag preservation** | Existing Monorepo package/file filters still work after routing. |
| **G3. Compact payload** | Seeded lint/type/test failures produce an LLM-facing compact payload ≤ 2 KB total, unless the chosen adapter documents a different budget. |
| **G4. Failure preservation** | All seeded failures remain present with file/line signal. |
| **G5. No rtk clone** | No agent-kit-side rtk filter reimplementation is added. |
| **G6. Cross-repo docs** | Boundary contract or blueprint notes document which repo owns future changes. |

## Tasks (Blueprint format)

#### [agent-kit] Task 1.1: Discover Monorepo QA boundary

**Status:** todo

**Depends:** None

Inspect the Monorepo QA recipe and document the bridge constraints before
editing either repo.

**Files:**

- Inspect: `webpresso/monorepo/justfile`
- Inspect: Monorepo package/test/lint/typecheck config touched by `just qa`
- Modify: this blueprint's decision section

**Steps (TDD):**

1. Capture current `just qa` command graph.
2. Identify package/file filter semantics.
3. Map stages to agent-kit MCP tools where possible.
4. Record unsupported stages and risks.

**Acceptance:**

- [ ] Current Monorepo `just qa` stages are documented.
- [ ] Existing filter semantics are documented.
- [ ] Unknowns are resolved or explicitly blocked.

#### [agent-kit] Task 1.2: Choose bridge contract

**Status:** todo

**Depends:** Task 1.1

Choose `ak qa` routing or Monorepo-side adapter based on the discovery result.

**Files:**

- Modify: this blueprint's "Bridge decision" section
- Modify/create: relevant boundary contract under `.agent/planning/` if the
  chosen bridge changes cross-repo ownership

**Steps (TDD):**

1. Compare `ak qa` routing vs Monorepo-side adapter.
2. Pick the softest sufficient boundary.
3. Document rejected alternative and reason.
4. Define acceptance fixtures for the chosen path.

**Acceptance:**

- [ ] Decision is explicit.
- [ ] Rejected alternative is documented.
- [ ] Ownership boundary is clear.

#### [agent-kit] Task 2.1: Implement selected bridge

**Status:** todo

**Depends:** Task 1.2

Make Monorepo `just qa` reach compact-QA output through the selected boundary.

**Files:**

- Modify: Monorepo `just qa` surface or adapter files
- Modify: agent-kit MCP flags/contracts only if the selected bridge requires it

**Steps (TDD):**

1. Write/identify failing integration fixture.
2. Implement the selected bridge.
3. Preserve existing Monorepo flags.
4. Keep agent-kit changes generic.

**Acceptance:**

- [ ] `just qa` reaches the compact-QA contract.
- [ ] Existing flags still work.
- [ ] No rtk filter clone is introduced.

#### [agent-kit] Task 3.1: End-to-end compact-output verification

**Status:** todo

**Depends:** Task 2.1

Verify the user-facing Monorepo result.

**Files:**

- Create/modify: cross-repo fixture or documented smoke script
- Modify: this blueprint with final verification evidence

**Steps (TDD):**

1. Seed lint, type, and test failures.
2. Run Monorepo `just qa`.
3. Assert compact payload budget and failure preservation.
4. Record evidence.

**Acceptance:**

- [ ] G1-G6 pass.
- [ ] Evidence links to commands/output summary.
- [ ] Follow-up risks are documented.

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| --- | --- | --- | --- | --- |
| Wave 0 | 1.1 | None | no | S |
| Wave 1 | 1.2 | Task 1.1 | no | S |
| Wave 2 | 2.1 | Task 1.2 | no | M |
| Wave 3 | 3.1 | Task 2.1 | no | S |

Critical path: 1.1 → 1.2 → 2.1 → 3.1.

## Related

- Prerequisite: [`compact-qa-output-filters`](../compact-qa-output-filters/_overview.md)
- Sibling: [`integrate-rtk-as-peer-plugin`](../integrate-rtk-as-peer-plugin/_overview.md)
- Context snapshot: `.omx/context/compact-qa-caveat-20260506T170959Z.md`
