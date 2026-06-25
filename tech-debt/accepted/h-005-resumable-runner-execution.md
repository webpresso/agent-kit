---
type: tech-debt
status: accepted
severity: low
category: complexity
review_cadence: quarterly
last_reviewed: "2026-05-11"
created: "2026-05-11"
linked_blueprints: ["agent-kit-v1-evidence-ledger"]
affected_modules: ["src/runners", "src/blueprint/db"]
---

# resumable Runner execution

## Context

v1.0 alpha ships all three Runner backends (`claude-subagent`,
`codex-exec`, `local-worktree`) with `capabilities.resumable = false`.

A Runner.run() that's interrupted by Ctrl-C, AbortSignal, or process
crash cannot be resumed from the last checkpoint. The next invocation
starts from scratch.

The Runner contract has a `snapshot()` method designed to make
resumability addable as a non-breaking extension — `snapshot()` returns
a `RunnerSnapshot` shape that can be persisted to the
`runner_events` table (introduced by Blueprint Task 1.3's migration
0002). But none of the three v1.0 backends implement
`resume(snapshot)`, and the contract doesn't yet require it.

## Why this is debt, not a feature

For long-running blueprint tasks (e.g., a 30-minute eval against a
complex blueprint), losing all progress to a SIGINT or network hiccup
is expensive. The user has to re-run the entire blueprint from the
start. This compounds for users on flaky networks (mobile / hotel
wifi) and for users iterating on a blueprint where they want to
"continue from where you stopped."

Resumability also unlocks a class of UX flows: pausing a long-running
blueprint, inspecting partial results, deciding whether to continue
or abort with cleanup.

## Watch points (review every cadence)

- **User reports of "I wished pll could pick up where it left off."**
  Every such report is a calibration signal.
- **Competing tools' resumable-runner positioning** — Maestro,
  Parallel Code, ComposioHQ/agent-orchestrator. If a competitor
  ships resumability as a marketing claim, agent-kit's wedge
  weakens.
- **Eval suite duration** — if `pnpm eval` runs cross 30 minutes
  routinely, the cost of a partial loss compounds.

## Trigger

Resolve this item when **any one** of:

- Five or more user reports of "lost progress to interruption."
- A competing tool ships resumability as a marketing claim that
  agent-kit needs to match.
- Eval suite duration crosses 1 hour on default Runner backend.

## Action when triggered

1. Design `RunnerExecution.snapshot()` checkpoint schema (likely
   per-event-stream-offset + per-backend-private opaque state).
2. Add `resume(snapshot: RunnerSnapshot): AsyncIterable<RunnerEvent>`
   to the `RunnerExecution` interface. **This is a breaking change to
   the Runner contract** — bump `Runner.version` major.
3. Implement per-backend resume:
   - `claude-subagent`: replay conversation history; resume from last
     subagent turn.
   - `codex-exec`: re-invoke `codex exec` with same prompt; rely on
     Codex's own resumability if it exists, else re-start with
     event-stream alignment.
   - `local-worktree`: worktree state is the checkpoint; just
     re-attach.
4. Extend `runner_events` table schema with a `snapshot_blob`
   column (or separate `runner_snapshots` table) to persist the
   opaque state.
5. Document the resume CLI surface: `wp blueprint resume <execution
_handle>`.
6. Move this file to `tech-debt/resolved/` with the implementing
   blueprint link.

## Related

- Blueprint contract: `src/runners/types.ts` (Task 1.4) defines
  `capabilities.resumable: boolean`, currently always `false`.
- Blueprint risks R4 + R6 (the iron-rule baseline + worktree orphan
  scenarios overlap with this concern).
- Outside-voice context: codex-plan-review 2026-05-11, finding
  "Runner 1A is under-specified. ... missing capability negotiation,
  runner version, ... resumability, ..."
