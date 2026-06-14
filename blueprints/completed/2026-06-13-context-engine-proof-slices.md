---
type: blueprint
title: "Context engine proof slices"
owner: ozby
status: completed
completed_at: '2026-06-14'
complexity: M
created: '2026-06-13'
last_updated: '2026-06-14'
progress: '100% (4/4 tasks done; implementation proof complete; Claude-login measured run produced failed recall evidence, not a pass claim)'
depends_on: []
cross_repo_depends_on: []
tags:
  - context-engine
  - benchmark
  - session-memory
  - proof
  - poc
max_parallel_agents: 2
---

# Context engine proof slices

**Goal:** Prove the smallest useful context-engine benchmark slice with measured
recall evidence before any larger continuity, release, or replacement work
expands scope.

This blueprint is intentionally a **pinpoint PoC**, not a context-engine parity
build. It converts the existing session-memory benchmark from “schema and
threshold scaffolding exists” into “one measured cell can produce auditable recall
evidence.” If that proof fails, downstream continuity/replacement work must stop
or be reshaped before implementation expands.

## Planning Summary

- Goal input: `make a pinpoint blueprint that encourages small PoC to prove claims instead of implementing huge changes`
- Draft slug: `2026-06-13-context-engine-proof-slices`
- Output path: `blueprints/completed/2026-06-13-context-engine-proof-slices.md`
- Handoff path: `.omx/plans/2026-06-13-context-engine-proof-slices.md`
- Validation scope: benchmark dry-run schema, one measured PoC cell, transcript scoring, report fields, threshold enforcement
- Non-goal: full multi-scenario/multi-variant benchmark matrix
- Hard scope constraint: no hook, database, schema, generated, package, daemon, or capture-surface changes

## Architecture Overview

```text
existing bench scenarios + qrels
  -> dry-run threshold/schema/no-API proof
  -> measured transcript scorer over one scenario/variant/trial
  -> report.md with recall_at_5 + recall_reason/recall_error
  -> stop-after-PoC decision gate
  -> downstream blueprint input, not downstream completion
```

## Fact-Checked Evidence

| ID | Evidence | Current repo reality | Plan impact |
| -- | -------- | -------------------- | ----------- |
| F1 | `src/cli/commands/bench/session-memory.ts:126-130` | The default benchmark threshold already defines `searchQualityRecallAt5: 0.8`. | Use `search_quality_recall_at_5 >= 0.8` as the explicit PoC pass threshold. |
| F2 | `src/cli/commands/bench/session-memory.ts:584-591` | Measured cells currently write `recall_at_5: 0`. | Replace the placeholder with transcript scoring or explicit scoring failure metadata. |
| F3 | `scripts/bench/lib/report-writer.ts:4-12` and `:48-53` | Report cells/rendering include `recall_at_5` but no recall explanation/error fields. | Add `recall_reason` / `recall_error` so zero recall is auditable. |
| F4 | `scripts/bench/scenarios/_schema.ts:7-28` | Scenarios already require qrels with `expected_substring_in_response`; qrels minimum is 5. | Reuse existing scenario qrels; do not invent a new benchmark framework. |
| F5 | `scripts/bench/lib/transcript-recorder.ts:8-14` and `:79-107` | Transcript recording wraps raw stream events under `event` with stable event metadata. | Scoring must support raw and recorder-wrapped Claude stream-json shapes. |
| F6 | `src/cli/commands/bench/session-memory.ts:472-485` | Dry-run resolves workspace configuration but is intended as safe preflight, not measured model output. | Dry-run proves schema/no-API behavior only; measured quality requires non-dry-run report output. |

## RALPLAN-DR Summary

### Principles

1. **Measure before expanding.** One auditable measured cell is more valuable than a broad unmeasured context-engine design.
2. **Reuse existing benchmark assets.** Existing scenarios, qrels, transcripts, reports, and thresholds are sufficient for this proof.
3. **Fail closed on quality claims.** Dry-run and failed cells cannot be counted as measured quality.
4. **Stop at the proof boundary.** This blueprint informs larger plans; it does not silently become them.
5. **No infrastructure drift.** Do not add storage, daemon, schema, capture, hook, package, or generated-surface work for this proof slice.

### Decision Drivers

1. Current `recall_at_5` appears in reports/thresholds but is not yet auditable measured evidence.
2. Larger continuity/replacement plans need a decision gate before scope expands.
3. The PoC must be reversible, small, and runnable with repo-owned commands.

### Viable Options

| Option | Summary | Pros | Cons | Verdict |
| ------ | ------- | ---- | ---- | ------- |
| **A: Do nothing / defer to continuity plan** | Leave benchmark recall as-is until the larger continuity plan lands. | No immediate code risk; avoids API spend. | Preserves overclaim risk and leaves `recall_at_5` unproven. | Rejected; does not answer the user’s proof request. |
| **B: Single measured proof slice** | Keep dry-run as schema/no-API validation, then require at least one measured scenario/variant/trial report with recall scoring. | Small, fast, falsifiable; proves real transcript-to-report path; avoids premature matrix expansion. | Lower statistical confidence; does not prove all variants/scenarios. | **Chosen.** Right-sized for PoC. |
| **C: Broad continuity/replacement implementation** | Implement reference-first resume, symbolic retrieval, graph memory, repo map, and host integration together. | Could eventually close more parity gaps. | Too large, risky, and unmeasured; violates the pinpoint PoC request. | Rejected; only revisit after PoC evidence. |
| **D: Full benchmark matrix now** | Run all scenarios, all variants, and multiple trials before accepting context-engine proof. | Stronger statistical confidence; closer to release-grade evidence. | Too expensive/slow for PoC; hides scoring bugs behind matrix complexity. | Rejected for this blueprint; defer until scoring path is proven. |

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| PoC threshold | `search_quality_recall_at_5 >= 0.8` | Matches existing threshold intent and makes pass/fail explicit. |
| Measured scope | Minimum one scenario/variant/trial measured `report.md` | Proves the real output path without requiring a full matrix. |
| Default scenario | Prefer existing `debug-long-session` unless implementation proves another existing scenario is narrower | Avoid new fixtures unless needed; reuse current qrels. |
| Dry-run semantics | Schema/no-API only | Dry-run must not fake measured quality. |
| Placeholder removal | Replace hardcoded measured `recall_at_5: 0` | Measured reports must reflect transcript scoring or explicit scoring error. |
| Transcript support | Support raw Claude `stream-json` and recorder-wrapped event JSON paths | Current transcripts may be raw or wrapped by `recordStream`. |
| File scope | Benchmark/reporting files only | Prevent PoC work from becoming runtime/storage/hook redesign. |

## `recall_at_5` Contract

Task 1.2 must define and test `recall_at_5` as follows:

- **Scoring unit:** one measured benchmark cell: `(scenario_id, variant, trial)`.
- **Qrel source:** `scenario.qrels` from `scripts/bench/scenarios/*.json`.
- **Denominator:** `min(5, scenario.qrels.length)`. Because schema requires at least five qrels, the normal denominator is `5`. If a future scenario includes more than five qrels, only the first five in scenario order count toward `recall_at_5`.
- **Scored field:** `scored_response_text`, derived from the final assistant response text in the successful cell transcript after the final recall prompt. The scorer must also record `scored_transcript_path`, `scored_event_id` when available, and `scored_turn_idx` or line index when available.
- **Matching rule:** normalize both `expected_substring_in_response` and `scored_response_text` with Unicode NFC, trim, lowercase, and collapse consecutive whitespace to one space. A qrel matches when the normalized expected substring is contained in the normalized scored response.
- **Metric:** `recall_at_5 = matched_qrels / denominator`, rounded only at report-rendering time.
- **Failed-cell behavior:** if a benchmark run status is not `ok` (`rate_limit`, `spawn_failed`), preserve that non-`ok` status, set `recall_at_5: 0`, and include `recall_error`. If the benchmark run status is `ok` but scoring fails because the transcript is missing, malformed, unsupported, or lacks a scored response, keep `status: ok`, set `recall_at_5: 0`, and include `recall_error`; do not expand the status enum for scorer failures in this PoC.
- **Trial aggregation:** if report rows aggregate multiple trials, calculate per-trial recall first. Failed trials contribute `0` and preserve failure metadata; the row reports the arithmetic mean.

## Supported Transcript JSON Paths

Transcript scoring must extract assistant response text from these supported paths,
in order, with fixture tests for raw and recorder-wrapped Claude `stream-json`
records:

1. Raw Claude assistant text: `$.message.content[*].text`
2. Raw Claude result text: `$.result`
3. Recorder-wrapped Claude assistant text: `$.event.message.content[*].text`
4. Recorder-wrapped Claude result text: `$.event.result`

Malformed lines, unsupported events, or missing text must not crash scoring. They
must produce an explicit `recall_error` when no score can be computed.

## Dry-run vs Measured-run Contract

`./bin/wp bench session-memory --dry-run` proves only:

- manifest loading / verification wiring;
- scenario selection;
- scenario/schema validity;
- threshold axis shape;
- cell-count calculation;
- workspace preflight behavior that is safe without API calls;
- no external model/API invocation, including no Anthropic admin workspace lookup / workspace verification call.

Dry-run does **not** prove recall quality, renderer usefulness, reference quality,
user-visible continuity, or release readiness. Measured quality requires a
non-dry-run benchmark cell that writes transcripts and a `report.md` containing
real `recall_at_5` values plus `recall_reason` or `recall_error`.

## Stop-after-PoC Gate

Stop after the measured PoC and record a decision. Do not continue into broader
implementation in this blueprint.

Forbidden in this blueprint:

- no release claim;
- no broad replacement/parity wording in README, CHANGELOG, package docs, or public docs;
- no new database;
- no schema migration;
- no daemon;
- no new capture pipeline;
- no host hook changes;
- no public package-surface expansion;
- no generated agent-surface edits;
- no full multi-scenario/multi-variant matrix requirement.

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| ---- | ----- | ------------ | -------------- | ------ |
| Wave 0 | 1.1 | None | 1 agent | S |
| Wave 1 | 1.2 | Task 1.1 | 1 agent | S-M |
| Wave 2 | 1.3 | Task 1.2 | 1 agent | S |
| Wave 3 | 1.4 | Task 1.3 | 1 verifier | S |
| Critical path | 1.1 → 1.2 → 1.3 → 1.4 | -- | 4 waves | M |

## Phase 1: measured recall proof [Complexity: M]

#### [bench] Task 1.1: Lock dry-run as schema/no-API validation

**Status:** done

**Depends:** None

Keep `wp bench session-memory --dry-run` as a schema validation path only. It
must not call the variant runner, spawn Claude, require API credentials, or
pretend to produce measured recall. It must validate the threshold report shape
and include a schema-valid threshold definition for
`search_quality_recall_at_5 >= 0.8`.

**Files:**

- Modify: `src/cli/commands/bench/session-memory.test.ts`
- Modify: `src/cli/commands/bench/session-memory.ts`
- Modify: `scripts/bench/lib/report-writer.test.ts`
- Modify: `scripts/bench/lib/report-writer.ts`

**Steps (TDD):**

1. Add failing tests that dry-run includes threshold axis `search_quality_recall_at_5` with metric `recall_at_5`, threshold `0.8`, observed `null`, and status `schema-valid`.
2. Add failing tests that dry-run does not call `runCell`, does not require API credentials, does not call Anthropic admin workspace lookup / workspace verification, and does not write a measured `report.md`.
3. Implement only the minimum threshold/report schema adjustments needed.
4. Run focused tests and lint.

**Acceptance:**

- [ ] Dry-run is schema/no-API only.
- [ ] Dry-run does not call the benchmark variant runner.
- [ ] Dry-run does not require Anthropic/API credentials.
- [ ] Dry-run does not call Anthropic admin workspace lookup / workspace verification.
- [ ] Dry-run threshold report includes `search_quality_recall_at_5 >= 0.8`.
- [ ] Dry-run marks threshold axes `schema-valid`, not measured passed/failed.
- [ ] No measured `report.md` is required or produced by dry-run.

#### [bench] Task 1.2: Replace placeholder recall with transcript scoring

**Status:** done

**Depends:** Task 1.1

Replace the measured-cell placeholder `recall_at_5: 0` with actual qrel scoring
from the measured transcript. For this PoC, one scenario/variant/trial must be
measured and reported; do not require or implement the full matrix.

**Allowed files:**

- Modify: `src/cli/commands/bench/session-memory.ts`
- Modify: `src/cli/commands/bench/session-memory.test.ts`
- Create: `scripts/bench/lib/transcript-scorer.ts`
- Create: `scripts/bench/lib/transcript-scorer.test.ts`
- Modify/Create: `scripts/bench/__fixtures__/*.jsonl`

**Forbidden files/surfaces:** hook files, database files, schema migration files,
generated files, package manifest/bin/export files, daemon files, and
capture/session-memory storage files.

**Steps (TDD):**

1. Add failing tests for a measured run proving `recall_at_5` is not silently hardcoded to `0`.
2. Add fixture tests for raw Claude `stream-json`, recorder-wrapped `stream-json`, malformed lines, unsupported events, and missing text.
3. Implement a pure transcript scorer that computes recall@5 against scenario qrels and returns provenance plus `recall_reason` or `recall_error`.
4. Wire measured cells through the scorer before threshold aggregation and report writing.
5. Preserve existing measured latency/cost behavior.

**Acceptance:**

- [ ] The measured path explicitly replaces placeholder `recall_at_5: 0`.
- [ ] A measured cell computes recall from transcript text and scenario qrels.
- [ ] Scoring supports `message.content[*].text`, `result`, `event.message.content[*].text`, and `event.result`.
- [ ] Unsupported or malformed transcripts produce explicit scoring errors, not silent zero recall.
- [ ] A one-cell run such as `--scenario debug-long-session --variant baseline --trials 1` writes a measured `report.md` when credentials are available.
- [ ] The measured threshold report marks `search_quality_recall_at_5` as `passed` only when observed recall is `>= 0.8`, otherwise `failed`.

#### [bench] Task 1.3: Add recall reason/error fields to report output

**Status:** done

**Depends:** Task 1.2

Extend report cells so measured recall is explainable. Successful scoring must
include a concise `recall_reason`; failed scoring must include `recall_error`.
Tests must cover both fields. Scorer failures on otherwise successful benchmark
runs must keep `status: ok` and use `recall_error`; benchmark run failures keep
their existing non-`ok` status and also include `recall_error` when available.

**Files:**

- Modify: `scripts/bench/lib/report-writer.ts`
- Modify: `scripts/bench/lib/report-writer.test.ts`
- Modify: `src/cli/commands/bench/session-memory.ts`
- Modify: `src/cli/commands/bench/session-memory.test.ts`

**Steps (TDD):**

1. Add failing report-writer tests for a successful measured cell with `recall_reason`.
2. Add failing report-writer tests for a failed scoring cell with `recall_error`.
3. Add command tests proving measured report cells carry one of these fields.
4. Add command/report tests proving scorer failures do not expand the cell status enum; they use `status: ok` plus `recall_error`.
5. Render the fields in `report.md` without breaking existing cost/latency columns.

**Acceptance:**

- [ ] Report cells include `recall_reason` when recall scoring succeeds.
- [ ] Report cells include `recall_error` when recall scoring fails.
- [ ] Tests explicitly cover both `recall_reason` and `recall_error`.
- [ ] A scoring failure cannot masquerade as `recall_at_5: 0` without an error.
- [ ] Scorer failures on successful benchmark runs keep `status: ok` and add `recall_error`; benchmark run failures keep their existing non-`ok` status.
- [ ] `report.md` remains deterministic and human-readable.

#### [qa] Task 1.4: Record the PoC decision and stop

**Status:** done

**Depends:** Task 1.2, Task 1.3

Run the verification gates and record the proof outcome for downstream plans. The
outcome must be one of: `PoC failed`, `PoC passed but needs broader matrix`, or
`PoC passed and downstream plans may consume recall evidence`.

**Files:**

- No required source files.
- Suggested evidence location: PR body plus implementation notes in this blueprint before lifecycle completion.

**Steps:**

1. Run focused tests, dry-run benchmark, lint, and typecheck.
2. If credentials/operator approval are available, run one measured cell and attach the generated `report.md` path.
3. Verify no forbidden files/surfaces changed.
4. Record decision without claiming release readiness or downstream completion.

**Acceptance:**

- [ ] Outcome includes dry-run proof.
- [ ] Outcome includes measured `report.md` evidence if any quality claim is made.
- [ ] Outcome does not claim release readiness.
- [ ] Outcome does not claim larger continuity/replacement blueprint completion.
- [ ] Follow-up recommendations name the downstream blueprint(s) that should be revised or unblocked.

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Focused tests | `./bin/wp test --file src/cli/commands/bench/session-memory.test.ts --file scripts/bench/lib/report-writer.test.ts --file scripts/bench/lib/transcript-scorer.test.ts` | All targeted tests pass. |
| Dry-run proof | `./bin/wp bench session-memory --dry-run` | Exits 0; threshold axes are `schema-valid`; no API/model invocation. |
| Lint | `./bin/wp lint src/cli/commands/bench/session-memory.ts src/cli/commands/bench/session-memory.test.ts scripts/bench/lib/report-writer.ts scripts/bench/lib/report-writer.test.ts scripts/bench/lib/transcript-scorer.ts scripts/bench/lib/transcript-scorer.test.ts` | Zero lint violations. |
| Typecheck | `./bin/wp typecheck` | Zero type errors. |
| Measured PoC | `./bin/wp bench session-memory --scenario debug-long-session --variant baseline --trials 1` | Requires credentials/operator approval; generated `report.md` has non-placeholder `recall_at_5`, `recall_reason` or `recall_error`, and threshold pass/fail. |
| Scope audit | `git diff --name-only` | Only benchmark/reporting files and this blueprint/handoff changed. |
| Blueprint lifecycle | `./bin/wp audit blueprint-lifecycle` | Blueprint format and lifecycle are valid. |

## Cross-Plan References

| Type | Blueprint | Relationship |
| ---- | --------- | ------------ |
| Downstream | `blueprints/planned/2026-06-13-session-continuity-and-resume-parity.md` | May consume measured recall evidence after PoC pass; not satisfied by this blueprint. |
| Downstream | `blueprints/planned/2026-06-13-sandboxed-knowledge-tool-surface-parity.md` | May use scoring evidence to prioritize retrieval/tool-surface work; not satisfied by this blueprint. |
| Downstream | `blueprints/completed/2026-06-13-reference-parity-regression-and-host-smoke-gate.md` | Prior gate exposed parity evidence needs; this blueprint supplies a narrow follow-up proof slice, not retroactive completion. |

## Risks and Mitigations

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Claude stream-json shape drifts | Scorer silently misses response text. | Fixture drift tests for raw and recorder-wrapped JSON paths; unsupported shapes emit `recall_error`. |
| Dry-run is mistaken for proof | Replacement claims outrun measured evidence. | Dry-run status remains `schema-valid`; docs/README release claims are forbidden. |
| PoC expands into matrix work | Small proof becomes slow and broad. | Acceptance requires minimum one measured cell only; full matrix is a follow-up. |
| Scope creep into runtime/storage | Blueprint duplicates larger continuity plans. | Forbidden files/surfaces and scope audit gate. |
| Placeholder recall survives | Reports remain misleading. | Tests must fail on hardcoded measured `recall_at_5: 0` without scorer output/error. |
| API credentials unavailable | Measured proof cannot run in normal CI. | Keep dry-run CI-safe; record measured proof as operator-approved evidence when available. |

## Non-Goals

- No OpenHands condenser clone.
- No Aider-style repo map.
- No Serena-style symbol index.
- No Claude-Mem/OpenMemory replacement.
- No Graphiti temporal graph.
- No Letta-style git-backed memory layer.
- No new vector DB, graph DB, daemon, background worker, or persistent service.
- No host hook integration.
- No public package-surface expansion.
- No release-readiness or parity claim.

## ADR

### Decision

Implement a tiny measured benchmark proof slice: preserve dry-run as schema/no-API
validation, replace placeholder measured `recall_at_5` with transcript scoring,
and add recall reason/error reporting. Stop after one measured scenario/variant/trial
can produce auditable evidence.

### Drivers

- Existing bench thresholds already define the desired quality axis.
- Existing scenarios already carry qrels.
- Existing transcripts can support response extraction with a small scorer.
- The user asked for proof slices instead of large implementation.

### Alternatives considered

- Defer to larger continuity plan: rejected because it leaves claims unproven.
- Full benchmark matrix: rejected as too broad for PoC.
- Schema-only dry-run proof: rejected because it cannot prove recall quality.
- Broad parity implementation: rejected because it violates the pinpoint scope.

### Why chosen

This is the smallest reversible path that turns a visible quality metric into
measured evidence and gives downstream plans a concrete pass/fail signal.

### Consequences

- Passing this blueprint does not unlock release or replacement claims.
- Failing this blueprint should pause or reshape downstream context-engine plans.
- Future work may expand to a full matrix only after the scorer/report path is proven.

### Follow-ups

- If PoC passes: add a follow-up blueprint for full matrix + fixture expansion.
- If PoC fails: revise scenario/qrel design or abandon larger recall claims.
- If measured recall passes but qualitative usefulness remains unclear: plan a separate reference-first resume PoC.

## Available-Agent-Types Roster

- `executor` — implement benchmark/reporting changes.
- `test-engineer` — harden scorer, fixture drift, and report tests.
- `verifier` — run gates, inspect diff scope, and validate claim wording.
- `architect` — review follow-up scope only if PoC suggests larger architecture.
- `critic` — reject overclaiming or parity creep.
- `planner` — update downstream blueprints after evidence exists.

## Follow-up Staffing Guidance

Recommended default: **`$ultragoal` with one executor and one verifier**.

- Lane 1: `executor`, medium reasoning — Tasks 1.1 through 1.3.
- Lane 2: `verifier`, high reasoning — Task 1.4, scope audit, and claim audit.

Use `$team` only if speed matters; do not parallelize Tasks 1.2 and 1.3 because
their write sets overlap in `session-memory.ts`, its tests, and report-writer files.

## Launch Hints

Default durable path:

```text
$ultragoal "Implement blueprints/planned/2026-06-13-context-engine-proof-slices.md. Keep scope to one measured benchmark proof slice; stop after evidence; no hooks/db/schema/package/generated changes."
```

Parallel path, if needed:

```text
$team "Execute the context-engine proof slices blueprint with one benchmark executor and one verifier. Serialize overlapping implementation tasks, enforce the forbidden-surface list, and stop after one measured report.md proof."
```

Ralph fallback only when explicitly requested:

```text
$ralph "Single-owner implementation of blueprints/planned/2026-06-13-context-engine-proof-slices.md. Preserve pinpoint scope, run targeted tests, dry-run bench, lint, typecheck, and scope audit."
```

## Team Verification Path

Before shutdown, Team must provide:

1. focused test output;
2. dry-run bench output;
3. measured report path or explicit credentials blocker;
4. `git diff --name-only` proving no forbidden surfaces changed and Tasks 1.2/1.3 were not implemented as conflicting parallel edits;
5. exact outcome wording for Task 1.4.

## Goal-Mode Follow-up Suggestions

- `$ultragoal` — default for this small implementation and evidence gate.
- `$performance-goal` — only if the next phase focuses on recall, latency, cost, or benchmark optimization.
- `$autoresearch-goal` — only if the next phase returns to external project research.
- `$team` — optional acceleration path, not the default.

## Stop Rules

Stop after:

- dry-run schema/no-API checks pass;
- one measured scenario/variant/trial `report.md` path is implemented or an explicit credentials blocker is recorded;
- placeholder measured `recall_at_5: 0` is replaced by scorer output/error;
- `recall_reason`/`recall_error` tests pass;
- transcript JSON path fixture drift tests pass;
- `search_quality_recall_at_5 >= 0.8` pass/fail threshold is enforced;
- no forbidden surfaces changed.

Do not continue into full benchmark matrix execution, hook integration, database
changes, package/bin work, daemon work, generated-surface updates, capture
pipeline redesign, release-claim edits, or downstream blueprint completion under
this blueprint.


## Completion Summary

Implemented the pinpoint benchmark proof slice without expanding into runtime,
hook, database, generated, package-bin, daemon, or capture-pipeline surfaces.

Completed evidence:

- Dry-run remains schema/no-API validation only and reports
  `search_quality_recall_at_5` as `schema-valid` with threshold `0.8`.
- Measured benchmark cells now call a pure transcript scorer instead of silently
  hardcoding measured `recall_at_5: 0`.
- Transcript scoring supports raw Claude `stream-json` assistant/result text and
  recorder-wrapped event text/result paths.
- Report cells include `recall_reason` on successful scoring and `recall_error`
  on scoring failures; scorer failures on otherwise successful benchmark runs
  keep `status: ok` and do not expand the status enum.
- Scored transcript provenance includes structured `scored_transcript_path`,
  event id, turn index, and line index when available.
- Run-level recall threshold evaluation fails closed when any attempted cell is
  non-`ok` or carries `recall_error`; failed cells contribute `0` instead of
  being excluded from the quality axis.
- Live measured one-cell execution was run with local Claude CLI login via
  `BENCH_AUTH_MODE=claude-login`; the cell returned `rate_limit`, produced no
  transcript, and failed closed with `recall_at_5: 0` against threshold `0.8`.
  No quality/release/parity claim is made.

Verification evidence recorded during execution:

```bash
./bin/wp test --file src/cli/commands/bench/session-memory.test.ts --file scripts/bench/lib/report-writer.test.ts --file scripts/bench/lib/transcript-scorer.test.ts
./bin/wp bench session-memory --dry-run
./bin/wp lint src/cli/commands/bench/session-memory.ts src/cli/commands/bench/session-memory.test.ts scripts/bench/lib/report-writer.ts scripts/bench/lib/report-writer.test.ts scripts/bench/lib/transcript-scorer.ts scripts/bench/lib/transcript-scorer.test.ts
./bin/wp typecheck
./bin/wp audit blueprint-lifecycle
vp run verify:paths
vp run verify:secrets
```

Measured PoC outcome: `PoC failed: a Claude-login measured run completed the
benchmark path but the cell returned rate_limit, so recall_at_5 was 0 and the
search_quality_recall_at_5 threshold failed. Implementation and dry-run proof
passed, but downstream plans must not consume recall quality evidence until a
measured report succeeds.`

Measured report evidence:

```text
reportPath: scripts/bench/runs/97c5dfef5ae1/report.md
status: rate_limit
recall_at_5: 0
search_quality_recall_at_5: failed (observed 0, threshold 0.8)
cache_disclaimer: cache-disabled baseline; single-workspace Claude CLI login
```

## Retrospective

The blueprint successfully prevented scope creep: no hooks, DB/schema migrations,
package-bin surfaces, generated files, daemon work, or capture-pipeline changes
were introduced. The next evidence step, if desired, is a later single-cell rerun
after the local Claude rate limit clears:

```bash
./bin/wp bench session-memory --scenario debug-long-session --variant baseline --trials 1
```
