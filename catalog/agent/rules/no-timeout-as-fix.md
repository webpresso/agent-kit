---
type: rule
slug: no-timeout-as-fix
title: Raising timeouts is never the fix
status: active
scope: repo
applies_to: [agents, humans]
related: []
created: '2026-05-06'
last_reviewed: '2026-05-06'
---

# Raising timeouts is never the fix

When a hook, test, request, deploy, fetch, or any other bounded operation hits
its timeout, **the timeout is the alarm, not the bug**. Raising the bound only
delays the next failure and silences the diagnostic that would have led to the
root cause. Investigate WHY it took that long.

This applies — but is not limited — to:

- `hookTimeout`, `testTimeout`, `teardownTimeout` in vitest
- `setTimeout` / `AbortSignal.timeout` in application code
- Runtime / compatibility deadline tweaks to dodge a hang
- HTTP client timeouts, RPC retries, polling intervals
- "just bump the CI minutes" reactions

## When you see a timeout failure, do this instead

1. **Reproduce deterministically.** Cold cache, fresh process, no warm state.
   If the failure is intermittent, that's a clue — capture the slow case.
2. **Profile the actual cost.** What took the time?
   - Vitest: `--reporter=verbose` to see per-hook duration; check `transform`
     vs `import` vs `setup` in the run summary.
   - Bundler / dev-server: clear the bundler cache (e.g. `node_modules/.vite`)
     and re-run; if cold-cache duration ≫ warm-cache duration, the bottleneck
     is transform/bundle.
   - Network calls: log `performance.now()` deltas, check DNS / TLS / TTFB.
3. **Fix at the source.**
   - Slow imports → pre-bundle (`optimizeDeps.include` or equivalent), split
     the module, remove unused re-exports, or eliminate the import path.
   - Slow tests → reduce setup work, share fixtures across tests, parallelize
     where safe.
   - Slow runtime boot → smaller dependency graphs, lazy-load heavy modules,
     review module-resolution path.
   - Slow API calls → cache, batch, or move out of the hot path.
4. **Document what changed.** A code or config diff with a comment that
   names the actual root cause is the durable artifact. "Bumped to 30s
   because flaky" is not.

## Acceptable cases for raising a bound (rare)

- The bound was measured against the wrong workload (e.g. unit-default 5s
  applied to an integration test that legitimately needs 30s of real DB
  setup). Document the measurement that justifies the new value.
- The bound came from upstream defaults that don't match this codebase's
  scale (e.g. a shared config sets `hookTimeout: 120000` for a one-time WASM
  init — a measured cost). Mirror existing precedent rather than inventing
  new numbers.

If you cannot point to a concrete measurement that justifies the new bound,
you are silencing a diagnostic. Don't.

## Why this rule exists

Sessions get burned chasing flakes that were silently retried at higher
timeouts instead of fixed:

- Tests that "passed at 30s but fail at 10s" turn out to be cold-cache
  bundler transforms — the right fix is pre-bundling, not a bigger budget.
- E2E tests where the supervisor is killed by a slow auth call — the call
  was making a network round-trip that should have been mocked at the test
  boundary.
- A hook timing out on schema/engine preload — the right fix is bypassing
  the preload in tests, not extending the deadline.

In every case, the larger timeout shipped a slower, less reliable test
suite and hid the real defect for weeks.

## Current repo-specific applications

- **Blueprint MCP discovery:** if `wp_blueprint_projects`, `wp_blueprint_list`,
  or adjacent resolver paths stall on roots fetches, git worktree probes, or
  recursive discovery, the fix is to bound those external calls and degrade to
  partial results + warnings (for example `roots_fetch_timeout` /
  `project_discovery_timeout`) — **never** to raise the MCP/tool timeout.
- **Hook runtime failures:** if a Codex hook only fails under a sanitized hook
  environment, the fix is to make the invoked binaries path-stable (usually
  absolute-path resolution in setup/scaffolding) — **not** to add retries or
  larger hook timeouts.
