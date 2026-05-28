---
title: context-mode is now opt-in
type: migration
last_updated: 2026-05-15
---

# context-mode is now opt-in

As of the current `wp setup` / `wp setup` behavior, `context-mode` is **not**
wired by default.

## Why

The default setup path should remain MIT-only so consumers can avoid inheriting
the ELv2 `context-mode` surface unless they explicitly choose it.

## Default behavior

```bash
wp setup
```

This now installs the standard webpresso surfaces without:
- `[mcp_servers.context-mode]` in Codex config
- `context-mode hook codex ...` entries in `.codex/hooks.json`
- context-mode Codex feature gates (`[features].hooks` / `[features].plugin_hooks`)
- `context-mode` entries in `opencode.json`

## Opt back in

If you still need the `ctx_*` tools, run:

```bash
wp setup --with context-mode
```

The opt-in path now enables Codex's gated plugin hook support instead of
writing manual Codex MCP or hook blocks. The context-mode plugin provides MCP
through `.codex-plugin/mcp.json`, skills through `skills/`, and bundled hooks
through `.codex-plugin/hooks.json`.

Equivalent:

```bash
wp setup --with context-mode
```

## Consumer migration checklist

1. Re-run setup without `context-mode`:

   ```bash
   wp setup
   ```

2. Verify default host surfaces no longer reference `context-mode`.
3. If your workflows still require `ctx_*`, opt back in explicitly:

   ```bash
   wp setup --with context-mode
   ```

4. Re-run setup after upgrading OMX or context-mode so managed Codex hook
   launchers stay in sync with the currently resolved runtime paths. If the
   default context-mode storage root is not writable from the Codex process,
   launch Codex with an absolute writable root:

   ```bash
   CONTEXT_MODE_DIR="$HOME/.codex-context-mode" codex
   ```

## Clean-install verification

Run the license surface checks:

```bash
pnpm run license:check
```

That runs `wp audit open-source-licenses` (root `LICENSE`, `THIRD-PARTY-NOTICES.md`,
vendored skill provenance, and tarball inclusion) and
`scripts/verify-no-context-mode.sh`, which packs the current package and fails if
`context-mode` appears in the resulting dependency metadata.
