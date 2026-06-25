---
type: guide
last_updated: "2026-06-08"
---

# Hooks Quickstart

webpresso ships a typed hooks-orchestrator for Claude Code, Codex CLI, and Cursor.
Hooks let wp-\* binaries intercept agent tool calls, enforce policies, and log decisions.

## Install

```bash
wp setup --with hooks
```

## Verify

```bash
wp hooks status
```

Expected output shows each hook with its status: `installed`, `enforcing`, or `disabled`.

## If Codex hooks still need trust

Codex may still require explicit trust for hook definitions after setup. If hooks are present but not executing, trust them:

```bash
codex hooks trust
```

## Next steps

- [Hooks demo](hooks-demo.md) — simulate hook outcomes without executing anything
- [Doctor guide](hooks-doctor.md) — diagnose hook problems
- [Rollback guide](hooks-rollback.md) — restore or disable hooks
- [Capability matrix](../src/cli/commands/docs/generate-capability-matrix.ts) — per-vendor event support
