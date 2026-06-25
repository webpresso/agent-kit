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

Each result card is a scientific claim wrapper around a raw checked-in report.
It must include these exact fields so `public:readiness` can validate it:

- `Command:` benchmark command used to produce the report
- `Git commit:` commit or immutable run source
- `Run id:` run identifier
- `Raw run artifact:` repo-relative checked-in artifact path, normally
  `scripts/bench/runs/<run-id>/report.md`
- `Scenario id:`, `Variant set:`, and `Trial count:`
- `Workspace/auth mode:` and `Cache-isolation disclaimer:`
- `Environment:` and `Tool versions:`
- a metric table with `metric`, `threshold`, `result`, and `status` columns

The metric table must match the referenced raw report. A result card may repeat a
metric from the raw report; it may not change the observed value, threshold, or
status. Hook latency claims require a separately instrumented hook-latency row in
the raw report. A `wall_sec` row is end-to-end cell duration and is not evidence
for hook latency.

Current deterministic byte-budget fields such as `gainBytes` and
`approxTokensSaved` are exact UTF-8 byte accounting plus an approximate `/4`
token proxy. They are not provider token, dollar, or global context-reduction
measurements unless a separate measured result card proves that claim.

## JSON Source of Truth

`report.json` is the canonical measurement artifact (Option B conservative
evidence policy). `report.md` is generated from `report.json` — never edit
`report.md` directly. Edits to `report.md` will be overwritten on the next
benchmark run.

Each result card's metric table must match the data in the referenced
`report.json`. The `Raw run artifact:` field in the result card must point to
the `report.json` file (for example `scripts/bench/runs/<run-id>/report.json`).

## Metric Class Binding

Each metric row in a result card proves one metric class:

| Metric class           | What it measures                                            |
| ---------------------- | ----------------------------------------------------------- |
| `byte_proxy`           | Deterministic UTF-8 byte delta (`gainBytes`)                |
| `provider_tokens_cost` | Actual provider token usage and USD cost                    |
| `recall`               | Information-retrieval recall@k from qrels                   |
| `hook_latency`         | Separately instrumented hook execution time                 |
| `native_speedup`       | Native addon throughput vs TypeScript fallback              |
| `replacement_parity`   | Behavioral equivalence against the reference implementation |
| `rtk_context_mode`     | RTK context-mode token reduction                            |

A public claim of one class cannot be satisfied by a card of a different class.
For example, a `byte_proxy` measurement does NOT prove provider token savings;
that requires a separate `provider_tokens_cost` result card.

## Redaction Requirements

Result cards that ship in the npm tarball must contain no secrets, API keys,
local absolute paths, or private transcript markers. The `redactionStatus`
field in `report.json` must be `'clean'` before a card can be used as public
evidence. Cards with `redactionStatus` other than `'clean'` must be stripped or
excluded from the published package via the `files` or `.npmignore` surface.
