---
type: guide
last_updated: '2026-06-08'
---

# Example consumer: hooks demo lane

This is a minimal adopter-facing example for the hooks-orchestrator series.
It is intentionally small: the goal is to exercise the documented `wp setup`,
`wp hooks status`, `wp hooks demo`, and rollback flows in a consumer-shaped
repo without depending on this checkout's own test harness.

## 1. Create the example consumer

```bash
mkdir hooks-consumer && cd hooks-consumer
cp /path/to/agent-kit/examples/hooks-consumer/package.json .
vp install
```

## 2. Scaffold the agent surface

```bash
vp exec wp setup
```

Expected follow-up checks:

```bash
vp exec wp hooks status
vp exec wp hooks demo SessionStart
vp exec wp hooks demo PreToolUse --tool Bash
vp exec wp hooks doctor
```

## 3. Try the recovery flows

Disable one vendor:

```bash
vp exec wp setup --disable-hooks codex
vp exec wp hooks status --vendor codex
```

Restore it:

```bash
vp exec wp setup --restore-hooks
vp exec wp hooks status --vendor codex
```

## 4. Workspace upgrade lane

If this repo is listed in `~/.agent/workspace.yaml`, the workspace refresh
surface can be previewed without writing:

```bash
vp exec wp hooks upgrade --workspace
```

Apply only after reviewing the dry-run summary:

```bash
vp exec wp hooks upgrade --workspace --apply
```
