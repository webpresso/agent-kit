---
type: guide
last_updated: '2026-06-07'
---

# Hooks Quickstart

webpresso ships a typed hooks-orchestrator for Claude Code, Codex CLI, and Cursor.
Hooks let wp-* binaries intercept agent tool calls, enforce policies, and log decisions.

## Install

```bash
wp setup --with hooks
```

## Verify

```bash
wp hooks status
```

Expected output shows each hook with its status: `installed`, `enforcing`, or `pending-trust`.

## If hooks show `pending-trust` (Codex only)

Codex requires explicit trust for hook definitions. Trust each hook:

```bash
codex hooks trust
```

## Test the hooks system

```bash
wp hooks demo
```

This runs a pure simulation — no real changes are made, no trust is consumed.

## Next steps

- [Doctor guide](hooks-doctor.md) — diagnose hook problems
- [Demo guide](hooks-demo.md) — understand demo output
- [Rollback guide](hooks-rollback.md) — restore or disable hooks
- [Capability matrix](../src/cli/commands/docs/generate-capability-matrix.ts) — per-vendor event support
