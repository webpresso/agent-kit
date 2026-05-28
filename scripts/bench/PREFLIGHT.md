# Session-memory bench pre-flight

Before running `wp bench session-memory`, choose one workspace mode:

## Isolated mode

Use this when you need clean cache-isolation claims.

Required environment:

```bash
export BENCH_WORKSPACE_MODE=isolated
export ANTHROPIC_API_KEY_BASELINE=...
export ANTHROPIC_API_KEY_CONTEXT_MODE=...
export ANTHROPIC_API_KEY_V1=...
export ANTHROPIC_API_KEY_V2=...
export ANTHROPIC_WORKSPACE_ID_BASELINE=...
export ANTHROPIC_WORKSPACE_ID_CONTEXT_MODE=...
export ANTHROPIC_WORKSPACE_ID_V1=...
export ANTHROPIC_WORKSPACE_ID_V2=...
```

Optional stronger-proof environment:

```bash
export ANTHROPIC_ADMIN_KEY=...
```

Expectations:

- each key must resolve to a distinct Anthropic workspace
- without `ANTHROPIC_ADMIN_KEY`, reports must be tagged as **operator-asserted workspace isolation**
- with `ANTHROPIC_ADMIN_KEY`, pre-flight can validate the configured workspace IDs via the Anthropic Admin API
- because raw secret keys do not self-identify a workspace in this repo code, isolated mode currently requires explicit `ANTHROPIC_WORKSPACE_ID_*` mapping

## Single-workspace mode

Use this when you only have one Anthropic workspace.

Required environment:

```bash
export BENCH_WORKSPACE_MODE=single-workspace
export ANTHROPIC_API_KEY=...
```

Expectations:

- runs must be tagged as `cache-disabled baseline`
- results are directional only for cache-sensitive comparisons

## Why this matters

The benchmark only supports honest cache-savings claims when variants do not share prompt cache state. If workspace mode is missing, the harness must refuse to run.
