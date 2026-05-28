---
title: Session-memory benchmark methodology
type: guide
last_updated: 2026-05-28
---

# Session-memory benchmark methodology

This guide explains how `wp bench session-memory` turns the May 14, 2026
research into a reproducible local benchmark surface for plugin authors and
agent-kit maintainers.

## Research basis

The authoritative research file is
[`docs/research/2026-05-14-token-savings-benchmark-methodology.md`](../research/2026-05-14-token-savings-benchmark-methodology.md).

That research established three constraints that the harness keeps intact:

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

## Why the workspace contract matters

Cache-sensitive claims are only honest when variants do not share Anthropic
workspace cache state. The harness therefore distinguishes:

- `isolated` mode for clean cache-isolation claims
- `single-workspace` mode for directional-only cache-sensitive comparisons

That is a methodological safeguard, not just an operator convenience.

## Related

- [`docs/research/2026-05-14-token-savings-benchmark-methodology.md`](../research/2026-05-14-token-savings-benchmark-methodology.md)
- [`../../scripts/bench/README.md`](../../scripts/bench/README.md)
- [`../../scripts/bench/PREFLIGHT.md`](../../scripts/bench/PREFLIGHT.md)
