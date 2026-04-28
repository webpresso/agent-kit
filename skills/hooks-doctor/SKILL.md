---
name: hooks-doctor
description: Verify the agent-kit plugin hooks installation is healthy. Run after install, when hooks seem broken, or when debugging plugin integration issues. Triggers on `/webpresso-agent-kit:hooks-doctor`, "doctor", "verify hooks", "check plugin", "hooks broken", "plugin not working", "ak hooks doctor".
argument-hint: '[--skip-mcp]'
allowed-tools: Bash
---

# Hooks Doctor

Verify the agent-kit plugin hooks installation is healthy. Run this first when:
- A hook seems not to be firing
- The plugin was just installed or updated
- Claude Code can't find expected tools
- Any plugin integration issue arises

## Running the Check

Run the doctor command directly:

```
ak hooks doctor
```

Or skip the MCP server check (for CI environments):

```
ak hooks doctor --skip-mcp
```

## Interpreting Results

Each check prints `[x]` (pass) or `[ ]` (fail) with a detail line:

```
[x] pretool-guard
[x] post-tool (lint-after-edit)
[x] stop (qa-changed-files)
[x] guard-switch
[x] sessionstart
[x] test-quality-check
[x] plugin.json integrity
[x] MCP server liveness: MCP server already running (sentinel found)
```

## Failure Remediation

| Check | Likely Cause | Fix |
|-------|-------------|-----|
| `pretool-guard` / `post-tool` / etc. — not found | `pnpm build` not run after install | `pnpm build` |
| `pretool-guard` / etc. — not executable | `chmod +x` not persisted | Re-run `pnpm prepare` or `pnpm build` which runs `chmod-bins` |
| `plugin.json integrity` — missing | `.claude-plugin/plugin.json` absent | Reinstall plugin: `claude plugin install @webpresso/agent-kit --scope user` |
| `MCP server liveness` — timeout | MCP server cold-start too slow | Wait and retry, or run `ak hooks doctor --skip-mcp` |
| Any check — not found at `dist/esm/...` | Build artifacts missing | Run `pnpm build` in the agent-kit repo |

After fixing, re-run `ak hooks doctor` to confirm.

## How It Works

The doctor runs five categories of checks:

1. **Bin existence** — each hook binary exists at the expected `dist/esm/hooks/...` path
2. **Executable bit** — bins have execute permission (skipped on Windows)
3. **stdin response** — interactive hooks (`pretool-guard`, `guard-switch`, `sessionstart`) respond to `{}` input with valid JSON and exit 0; fire-and-forget hooks (`lint-after-edit`, `qa-changed-files`) exit 0
4. **plugin.json integrity** — manifest exists, has required fields, and all referenced bins exist on disk
5. **MCP server liveness** — spawns the MCP server and sends a `tools/list` JSON-RPC request; times out at 5s (soft-fail — warning only, does not fail the overall check)

If `isMcpReady()` detects a live MCP sentinel, the MCP check fast-passes without spawning.
