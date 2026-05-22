---
type: guide
last_updated: '2026-05-06'
---

# Compact QA output

Agent-kit quality tools compact noisy local-dev command output before it enters
agent context. The goal is not to hide logs; it is to return a small,
machine-readable failure set and keep the full command available through the
normal command/log path when deeper debugging is needed.

## Shape

Each compact quality leaf remains summary-first and adds:

- `failures`: structured failure rows the agent can act on.
- `tier`: parser quality (`1` structured JSON, `2` regex fallback, `3`
  generic/passthrough).
- `bytes`: emitted compact-output bytes.
- `tokensSaved`: raw bytes minus compact bytes, used as the budget proxy.

`wp_qa` keeps the existing envelope and carries the additive leaf metadata under
`details.lint`, `details.typecheck`, and `details.test`.

## Current transforms

- `wp_lint` uses the oxlint JSON transform when available and a generic
  errors-only fallback for heterogeneous package-manager lint output.
- `wp_typecheck` compacts TypeScript diagnostics by file/line/code.
- `wp_test` asks Vitest for JSON on the MCP path and compacts failing tests.
- Unknown tools fall back to the generic errors-only transform.

For one-off local commands without a quality wrapper, use `wp err <cmd>`. It
prints only lines matching failure markers such as `error`, `fail`, `✗`, or
`✘`, and exits with the wrapped command's exit code.

## Escape hatch

Set `QUALITY_ENGINE_COMPACT=0` to disable compact transforms and fall back to
legacy `clipRawOutput` / passthrough behavior. This is useful when you need the
old full raw-output shape for debugging or compatibility checks.

## BOOKEND usage

Full QA remains a BOOKEND command: run it once before broad work and once at the
end. During the middle loop, use scoped leaves (`wp_lint`, `wp_typecheck`,
`wp_test`, or their repo-owned wrappers) so the agent receives compact evidence
instead of full logs.

When an external repo such as ingest-lens wants to validate the budget, set
`INGEST_LENS_PATH=/path/to/ingest-lens` for the optional integration test. The
test is skipped when the variable is absent, so CI remains safe by default.
