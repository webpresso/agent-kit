# Bench and harness gates

This directory contains durable benchmark assets, including
`wp bench session-memory` and the harness regression gate runner.

## Install

No extra install step is required beyond the repo itself. The harness uses the
repo's existing Bun-based runtime and the `wp` CLI surface.

## How to run

1. Choose a workspace mode and export the required environment from
   [`./PREFLIGHT.md`](./PREFLIGHT.md).
2. Validate the harness without making API calls:

   ```bash
   wp bench session-memory --dry-run
   ```

3. Run a single smoke cell:

   ```bash
   wp bench session-memory --scenario debug-long-session --variant baseline --trials 1
   ```

## Expected output

Each run writes `scripts/bench/runs/<run-id>/report.md`.

| Field | Meaning |
| ----- | ------- |
| `scenario` | Versioned scenario id, for example `debug-long-session` |
| `variant` | `baseline`, `v1`, or `v2` |
| `trials` | Number of executions per cell |
| `status` | `ok`, `rate_limit`, or `spawn_failed` |
| `cost_usd` | Aggregated USD cost for successful samples in the cell |
| `cost_mean_usd` / `cost_std_usd` | Per-sample USD mean and population standard deviation |
| `input_tokens` / `output_tokens` | Provider-reported input and output tokens summed across successful samples |
| `cache_write_tokens` / `cache_read_tokens` | Provider-reported cache token categories summed across successful samples |
| `total_tokens` | Sum of the provider token categories above; not a “tokens saved” field |
| `provider_duration_ms_mean` / `provider_duration_ms_std` | Provider-reported duration summary |
| `local_wall_ms_mean` / `local_wall_ms_std` | Local monotonic wall-clock summary around the spawned provider process |
| `recall@5` | Recall score computed from scenario qrels |
| `wall_sec` | `local_wall_ms_mean / 1000`; not hook latency |

The CLI also prints a compact JSON summary with `runId`, `dryRun`, `reportPath`,
`cellCount`, and `thresholdReport`. Measured threshold failures return a nonzero
exit code. Hook-specific latency axes report `not-instrumented` unless a run
collects hook-specific latency observations separately from `wall_sec`.

## Public result cards

Numeric benchmark claims in public docs must cite checked-in first-party
evidence. Use [`../../docs/bench/result-card-contract.md`](../../docs/bench/result-card-contract.md)
for the required result-card fields before promoting latency, recall, cost, or
speedup numbers.

## Cost cap

The intended smoke budget is a single-cell run:

```bash
wp bench session-memory --scenario debug-long-session --variant baseline --trials 1
```

Use that as the low-risk check before a full matrix run. The blueprint's local
verification gate targets a smoke cost below `$1` for that one-cell path.

## Troubleshooting

| Symptom | Likely cause | Fix |
| ------- | ------------ | --- |
| `Missing workspace API keys` | Required API-key env vars are not set | Follow [`./PREFLIGHT.md`](./PREFLIGHT.md), or use `BENCH_AUTH_MODE=claude-login` for a local single-workspace smoke run with an already logged-in Claude CLI |
| `Workspace mode unspecified` | `BENCH_WORKSPACE_MODE` is missing | Export `BENCH_WORKSPACE_MODE=isolated` or `BENCH_WORKSPACE_MODE=single-workspace` |
| `rate_limit` in the report | Anthropic throttled the cell | Re-run later or reduce the number of cells/trials |
| `spawn_failed` in the report | `claude` failed before a valid transcript was recorded | Verify local Claude CLI auth and plugin path |
| `Manifest mismatch` | Pinned tool or plugin versions drifted from `manifest.lock.json` | Re-pin deliberately or restore the expected tool/plugin versions |

## Harness regression gate

`scripts/bench/harness-gate/index.ts` produces the local harness-gate verdict
used by `.github/workflows/harness-gate.yml`. By default it is
**planned-only**: it maps changed harness-surface files to declared reference
consumer suites without executing downstream consumer commands.

```bash
bun scripts/bench/harness-gate/index.ts --json \
  --changed-file catalog/agent/harness-surfaces.yaml
```

Pass `--execute` only when the referenced consumer worktrees are available and
you intentionally want to run their `harness-gate/suites.yaml` commands. The
runner reads `catalog/agent/harness-gate/consumers.yaml` and
`catalog/agent/harness-surfaces.yaml`; use `wp audit harness-surfaces` to check
that manifest before trusting a verdict.

## Related files

- [`./PREFLIGHT.md`](./PREFLIGHT.md) — workspace-mode contract
- [`./scenarios/`](./scenarios/) — scenario fixtures and schema
- [`../../docs/bench/session-memory-methodology.md`](../../docs/bench/session-memory-methodology.md) — session-memory methodology summary
- [`./harness-gate/`](./harness-gate/) — reference-consumer harness gate runner
- [`../../catalog/agent/harness-gate/`](../../catalog/agent/harness-gate/) — harness gate consumer declarations
