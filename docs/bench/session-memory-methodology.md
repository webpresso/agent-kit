---
title: Session-memory benchmark methodology
type: guide
last_updated: 2026-06-15
---

# Session-memory benchmark methodology

This guide explains how `wp bench session-memory` turns the May 14, 2026
research into a reproducible local benchmark surface for plugin authors and
agent-kit maintainers.

## Research basis

The benchmark methodology is captured in this guide and in the durable harness
assets under `scripts/bench/`.

The research basis established three constraints that the harness keeps intact:

1. **Two-turn `--print` runs do not measure session-memory value.** The useful
   signal appears only after long sessions and compaction pressure.
2. **Reproducibility is non-negotiable.** Pinned manifests, deterministic
   fixtures, and recorded transcripts are required for any credible result.
3. **Agentic recall beats chatbot-style full-context stuffing.** The harness is
   designed around multi-turn tool-using scenarios rather than short QA prompts.

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

The benchmark does not use tiny prompts. Instead it uses versioned scenarios in
`scripts/bench/scenarios/` with these constraints:

- each scenario documents a worst-case token count above `200000`
- each scenario includes qrels for recall scoring
- scenarios are written to force the baseline path into compaction territory
- one scenario explicitly spans multiple sessions to test resumability

This aligns the harness with the research conclusion that session memory should
be measured across long-running, compaction-aware workflows.

## Operational flow

1. Choose workspace mode using [`scripts/bench/PREFLIGHT.md`](../../scripts/bench/PREFLIGHT.md).
2. Run `wp bench session-memory --dry-run` to validate manifest, scenarios, and
   workspace configuration without making API calls.
3. Run a one-cell smoke before any full matrix execution.
4. Inspect `scripts/bench/runs/<run-id>/report.md` for cost, recall, and wall
   time summaries.

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
use `mode: measured`, include numeric `observed` values, and show `passed` for
every required reference parity axis:

| axis | pass condition |
| --- | --- |
| `post_tool_capture_latency_ms` | observed average is at or below `750` |
| `precompact_snapshot_latency_ms` | observed average is at or below `1000` |
| `startup_resume_injection_latency_ms` | observed average is at or below `750` |
| `routing_injection_coverage` | required routing-injection evidence is present (`1.0`) |
| `pretool_session_redirect_coverage` | required PreToolUse session redirect evidence is present (`1.0`) |
| `posttoolbatch_summary_coverage` | required PostToolBatch bounded-summary evidence is present (`1.0`) |
| `repair_path_coverage` | required hook doctor repair-path evidence is present (`1.0`) |
| `search_quality_recall_at_5` | observed recall@5 is at or above `0.8` |

A replacement parity claim should cite the live `report.md`, pinned manifest
hash, workspace mode, scenario id, variant set, trial count, and threshold rows
used for the reference parity decision.

## Why the workspace contract matters

Cache-sensitive claims are only honest when variants do not share Anthropic
workspace cache state. The harness therefore distinguishes:

- `isolated` mode for clean cache-isolation claims
- `single-workspace` mode for directional-only cache-sensitive comparisons

That is a methodological safeguard, not just an operator convenience.

## Related

- [`../../scripts/bench/README.md`](../../scripts/bench/README.md)
- [`../../scripts/bench/PREFLIGHT.md`](../../scripts/bench/PREFLIGHT.md)
