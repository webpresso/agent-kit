---
type: blueprint
title: current context tool vs v1 vs v2 — selection benchmark and ship decision
owner: agent-kit
status: planned
complexity: L
created: '2026-06-12'
last_updated: '2026-06-12'
progress: '0% — queued after candidate parity evidence'
depends_on:
  - ak-session-memory-v1-independent-option-hardening-and-truth-alignment
  - ak-session-memory-v2-independent-option-stabilization-post-handoff
tags:
  - session-memory
  - benchmark
  - selection
  - lane-2
  - current-context-tool
---

# current context tool vs v1 vs v2 — selection benchmark and ship decision

## Purpose

Compare the current context tool, v1, and v2 as independent lane-2 options and
produce the dated ship/park decision. This blueprint owns the removal trigger for
the current context tool from agent-kit defaults.

## Inputs

- Canonical matrix: `docs/session-memory-option-matrix.md`.
- Methodology: `docs/bench/session-memory-methodology.md`.
- Candidate PR evidence from PR #94 and PR #95.
- Any revived benchmark harness assets from parked benchmark blueprints.

## Required outputs

- Parity matrix with evidence links.
- Benchmark methodology and run manifest.
- Success criteria with thresholds for recall, latency, cost/token savings,
  packaging risk, and maintenance burden.
- Final decision memo naming exactly one result:
  - ship v1,
  - ship v2, or
  - park both and keep the current context tool baseline.
- Follow-up trigger for default-removal/cutover only if the decision ships v1 or
  v2.

## Non-goals

- Rewriting candidate PR history.
- Removing the current context tool before the decision memo exists.
- Treating v1 and v2 as a sequential release train.

## Acceptance criteria

- Current baseline, v1, and v2 run through the same benchmark scenarios.
- Matrix statuses are updated from evidence, not intent.
- Default-removal work is a follow-up with its own PR/blueprint.
- Public docs link to the decision memo before claiming a replacement is chosen.
