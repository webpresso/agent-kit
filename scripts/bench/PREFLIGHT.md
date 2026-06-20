# Session-memory bench pre-flight

Before running `wp bench session-memory`, choose one workspace mode:

## Isolated mode

Use this when you need clean cache-isolation claims.

Required environment:

```bash
export BENCH_WORKSPACE_MODE=isolated
export ANTHROPIC_API_KEY_BASELINE=...
export ANTHROPIC_API_KEY_V1=...
export ANTHROPIC_API_KEY_V2=...
export ANTHROPIC_WORKSPACE_ID_BASELINE=...
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

Required environment, using an API key:

```bash
export BENCH_WORKSPACE_MODE=single-workspace
export ANTHROPIC_API_KEY=...
```

Alternative local smoke auth, using an already logged-in Claude CLI:

```bash
export BENCH_WORKSPACE_MODE=single-workspace
export BENCH_AUTH_MODE=claude-login
# optional when the logged-in Claude home is not the current HOME
export BENCH_CLAUDE_HOME=$HOME
```

Expectations:

- runs must be tagged as `cache-disabled baseline`
- `BENCH_AUTH_MODE=claude-login` is for local single-workspace smoke runs only; it validates the selected home with `claude auth status`, then reuses local Claude CLI auth instead of copying credentials into the benchmark run directory
- if `claude auth status` succeeds but execution returns `401`, refresh the Claude CLI login/session; this is a stale CLI session, not an API-key requirement
- results are directional only for cache-sensitive comparisons

## Why this matters

The benchmark only supports honest cache-savings claims when variants do not share prompt cache state. If workspace mode is missing, the harness must refuse to run.
