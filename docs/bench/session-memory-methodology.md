---
title: Session-memory benchmark methodology
type: guide
last_updated: 2026-06-19
---

# Session-memory benchmark methodology

This guide explains how `wp bench session-memory` produces reproducible local
benchmark evidence for plugin authors and agent-kit maintainers. The current
public claim boundary is intentionally conservative: checked-in dry-run and unit
gates prove the harness shape; public numeric savings, speedup, cost, recall, or
latency claims require a measured report plus a valid result card.

## Research basis

The benchmark methodology is captured in this guide and in the durable harness
assets under `scripts/bench/`.

The research basis established three constraints that the harness keeps intact:

1. **Short prompts are not enough for session-memory value claims.** Useful
   session-memory evidence needs long scenarios, explicit qrels, and compaction
   or resumability pressure.
2. **Reproducibility is non-negotiable.** Pinned manifests, deterministic
   fixtures, recorded transcripts, and checked-in result cards are required for
   any public numeric claim.
3. **Byte-budget proxy metrics are not provider-token savings.** `gainBytes` and
   `approxTokensSaved` are deterministic UTF-8 accounting only. Provider token,
   dollar, recall, latency, and native-speed claims require separate measured
   evidence.

## Deterministic-by-construction properties

The current harness enforces determinism at several layers:

- `scripts/bench/manifest.lock.json` pins tool and plugin versions
- `scripts/bench/lib/manifest.ts` refuses to run when captured versions drift
- `scripts/bench/lib/transcript-recorder.ts` writes deterministic event ids
- `scripts/bench/__tests__/reproducibility.test.ts` proves identical output for
  identical seeded mocked runs
- `scripts/bench/lib/refresh-cli-fixture.test.ts` guards the live Claude
  stream-json schema against silent drift

Those properties are the practical translation of the research requirement that
benchmark claims remain reproducible by another operator.

## Scenario design

The scenario fixtures live in `scripts/bench/scenarios/` and are schema-gated.
They must document worst-case token counts, qrels, expected tool calls, and the
session turns needed by the benchmark harness. A scenario file by itself is not a
result: public claims require a measured run artifact and a result card.

Current `wp bench session-memory` live cells are provider `--print` executions
against selected variants. Treat those cells as reproducible provider-runner
measurements, not as automatic proof of multi-session compaction benefit. A
future compaction-specific claim must add a replay/compaction producer and a
result-card metric row for that producer.

## Operational flow

1. Choose workspace mode using [`scripts/bench/PREFLIGHT.md`](../../scripts/bench/PREFLIGHT.md).
2. Run `wp bench session-memory --dry-run` to validate manifest, scenarios, and
   workspace configuration without making API calls.
3. Run a one-cell smoke before any full matrix execution.
4. Inspect `scripts/bench/runs/<run-id>/report.md` for cost, token, recall,
   provider-duration, local-wall-time, and threshold summaries.
5. Before publishing any numeric claim, check in a result card that follows
   [`result-card-contract.md`](./result-card-contract.md).

## Measurement fields

Measured report rows include:

- provider usage categories: input, output, cache-write, cache-read, and total
  tokens
- per-cell USD cost total plus per-sample mean and standard deviation
- provider-reported duration mean/std and local monotonic wall-clock mean/std
- recall@5 from qrels
- threshold status rows for hook latency and search quality

`wall_sec` is derived from local monotonic wall time. It is still end-to-end cell
duration and must not be reused as hook latency evidence.

## Regression thresholds

The threshold report supports reference parity and replacement parity gates. It
has two modes: dry-run schema validation and live benchmark evidence.

### Dry-run schema validation

`wp bench session-memory --dry-run` validates the manifest, scenarios, threshold
schema, and report shape without measured benchmark results. In this mode the
threshold report must use `mode: dry-run`, mark each axis as `schema-valid`, and
leave `observed` as `n/a`.

Dry-run output proves the gate contract is parseable. If workspace mode is
omitted, dry-run uses a single-workspace schema default so the smoke gate remains
credential-free. Dry-run also uses a current-checkout manifest mode: tool locks
(`bun`, `claude`, `node`, and `model`) must still match the pinned manifest, and
plugin refs must still be valid git SHAs, but plugin SHA equality is not required
because every feature-branch commit legitimately changes the current checkout
HEAD. It is not replacement parity evidence.

### Live benchmark requirements

Replacement parity evidence requires an operator-triggered live run that writes
a measured `scripts/bench/runs/<run-id>/report.md`. The threshold report must
use `mode: measured`. It must show `passed` for every measured benchmark axis
and `not-instrumented` for hook-specific latency axes that were not separately
measured. `wall_sec` is the cell wall-clock duration and must not be reused as
hook latency evidence:

| axis                                  | pass condition                                                                               |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| `post_tool_capture_latency_ms`        | separately instrumented observed average is at or below `750`, otherwise `not-instrumented`  |
| `precompact_snapshot_latency_ms`      | separately instrumented observed average is at or below `1000`, otherwise `not-instrumented` |
| `startup_resume_injection_latency_ms` | separately instrumented observed average is at or below `750`, otherwise `not-instrumented`  |
| `search_quality_recall_at_5`          | observed recall@5 is at or above `0.8`                                                       |

A replacement parity claim should cite focused hook/audit proof plus the live
`report.md`, pinned manifest hash, workspace mode, scenario id, variant set,
trial count, threshold rows, and checked-in result card used for the reference
parity decision.

## Why the workspace contract matters

Cache-sensitive claims are only honest when variants do not share Anthropic
workspace cache state. The harness therefore distinguishes:

- `isolated` mode for clean cache-isolation claims
- `single-workspace` mode for directional-only cache-sensitive comparisons

That is a methodological safeguard, not just an operator convenience.

## Canonical Measurement Artifact: report.json

`report.json` is the single source of truth (SSOT) for every benchmark run.
Its schema includes:

| Field             | Role                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runId`           | Per-run unique identifier: git commit SHA + dirty flag + ISO timestamp. Changes on every run, even for identical code.                                           |
| `manifestDigest`  | Content-addressed digest of the pinned manifest. Used for deduplication: two runs with identical manifests and identical measured results share the same digest. |
| `gitCommit`       | Git commit SHA at time of the run.                                                                                                                               |
| `gitDirty`        | Boolean — `true` when the working tree had uncommitted changes at run time. A dirty run is directional evidence only, not public proof.                          |
| `command`         | Exact CLI command used to produce the run, including flags and workspace mode.                                                                                   |
| `environment`     | OS, Node.js version, Bun version, and relevant tool versions captured at run time.                                                                               |
| `redactionStatus` | Must be `'clean'` before the card can be used as public evidence.                                                                                                |
| `metrics`         | Array of metric rows, each with `class`, `name`, `threshold`, `observed`, and `status`.                                                                          |

`report.md` is generated from `report.json`. Do not edit `report.md` directly;
it will be overwritten on the next run.

### runId vs manifestDigest

`runId` is per-run unique: it encodes `<gitCommit>[-dirty]-<timestamp>`, so
every run produces a distinct `runId` even when the code has not changed.

`manifestDigest` is content-addressed: it is derived from the locked manifest
(`scripts/bench/manifest.lock.json`) and changes only when tool versions or
plugin refs change. Two runs can share the same `manifestDigest` while having
different `runId` values. The digest is used for caching and deduplication;
the `runId` is used for provenance tracing.

### Provenance fields

`gitCommit` and `gitDirty` together establish the source state of the run.
`command` records the exact invocation. `environment` records the runtime
context. Together these four fields make a run reproducible: another operator
with the same source state, command, and environment should be able to produce
a matching result. When `gitDirty` is `true`, full reproducibility is not
guaranteed — treat the run as directional evidence only.

## Related

- [`../../scripts/bench/README.md`](../../scripts/bench/README.md)
- [`../../scripts/bench/PREFLIGHT.md`](../../scripts/bench/PREFLIGHT.md)
