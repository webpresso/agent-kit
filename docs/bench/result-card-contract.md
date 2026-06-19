---
title: Benchmark result-card contract
type: guide
last_updated: 2026-06-19
---

# Benchmark result-card contract

Public numeric benchmark claims require checked-in, first-party evidence. A claim
such as latency, recall, cost, throughput, percentile, or speedup must cite a
result card stored under `docs/bench/result-cards/` (or the checked-in source
report it summarizes).

Each result card must include:

- benchmark command and git commit or run id
- scenario id, variant set, and trial count
- workspace/auth mode and cache-isolation disclaimer when relevant
- checked-in first-party artifact paths, for example
  `scripts/bench/runs/<run-id>/report.md`
- metric table with the exact numeric values being claimed
- threshold report status, including `not-instrumented` axes when hook-specific
  latency was not measured

`wall_sec` is an end-to-end cell duration. It is not hook latency. Hook latency
claims require separately instrumented hook-specific observations.
