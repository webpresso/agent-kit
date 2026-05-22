---
type: guide
last_updated: '2026-05-22'
---

# `wp setup --with` presets

`--with <names>` accepts a comma-separated mix of two things:

1. **Tier-3 skills** — opt-in skill packs from the agent-kit catalog (e.g. `tanstack-query`, `react-doctor`, `frontend-design`). Run `wp skill list` for the full list.
2. **Presets** — named scaffolder modes that wire in additional tooling beyond the skill catalog. `omx`, `omc`, `gstack`, `vision`, and `rtk` run by default on every `wp setup`; the rest are opt-in. Each preset is documented below.

Presets and Tier-3 skills can be combined freely:

```bash
wp setup --with omx,gstack,tanstack-query --yes
```

Unknown values fall through to Tier-3 skill resolution and are rejected with `EXIT_SETUP_FAIL` (exit code 1). Whitespace around commas is tolerated.

## Always-on Codex hook trust sync

Every non-`--dry-run` setup run writes agent-kit's Codex hook definitions and then
tries to trust only those agent-kit-owned hooks through the local Codex runtime.
The trust sync starts `codex app-server --listen stdio://`, reads hook `key` and
`currentHash` metadata with `hooks/list`, and upserts `hooks.state` with
`config/batchWrite`. Agent-kit does not auto-trust arbitrary project hooks.

If `codex` is not on `PATH`, app-server cannot start, a protocol call fails, or
verification still shows untrusted/disabled agent-kit hooks, setup prints a
concise `codex hook trust: warning` and continues. The generated hooks are still
present; inspect and approve them manually from Codex with `/hooks`.

This path uses the installed Codex runtime as the source of hook identity. Do not
treat the docs.rs `codex-app-server-protocol` crate as an official OpenAI
distribution for this behavior.

## Available presets

### `vision`

Drops a starter `VISION.md` at repo root from `catalog/vision/VISION.md.tmpl`, with `{{REPO_NAME}}` and `{{TODAY}}` substituted. Runs by default on every `wp setup`. The companion audit `wp audit vision` (part of the `guardrails` composite) enforces structure on the file from there on:

- frontmatter `type: vision` + `last_updated: YYYY-MM-DD`
- H1 contains "Vision"
- required H2 sections: Problem, North star, Boundaries, Principles (synonyms accepted)
- ≤ 100 body lines and ≤ 1500 body words
- soft-warns when `last_updated` is older than 365 days

**Touches:** `VISION.md` only; existing files are protected by the standard merge policy (reported as drift unless `--overwrite`).
**Requires nothing on PATH.**

### `lore-commits`

Writes `.husky/commit-msg` that enforces Lore Commit Protocol trailers via `wp audit commit-message --require-lore`. Composes safely with `base-kit` — if the hook already exists with the correct content, the run is a no-op.

**Touches:** `.husky/commit-msg` only.
**Requires nothing on PATH.**

### `omx`

Chains `omx setup --yes --scope user` after the agent-kit scaffold completes. [OMX](https://oh-my-codex.dev/docs.html) ([oh-my-codex on GitHub](https://github.com/Yeachan-Heo/oh-my-codex)) is the operator-workflow execution layer that complements agent-kit's plan/audit layer; agent-kit invokes `omx team` downstream during blueprint execution. Use `wp setup --project` to request `omx setup --yes --scope project` instead.

**Detection:** `omx --version` on PATH; if missing, setup runs `vp install -g oh-my-codex` and probes again.
**Failure modes:**
- omx still not on PATH after the fallback install → `EXIT_SETUP_FAIL` (exit 1) with install hint in stderr
- `omx setup --yes --scope user` itself errors → `EXIT_WRITE_FAIL` (exit 3) with the omx exit code surfaced

**Idempotency:** OMX manages its own state — every `wp setup` re-invokes `omx setup --yes --scope user`, which is itself idempotent. After OMX finishes, agent-kit also migrates deprecated Codex config entries from `[features].codex_hooks` to `[features].hooks` in `$CODEX_HOME/config.toml` (or `~/.codex/config.toml`) so older OMX releases do not keep re-triggering Codex's deprecation warning.
**Codex/OMX MCP persistence:** after `omx setup --yes --scope user`, agent-kit upserts the owned `[mcp_servers.playwright]` block in `$CODEX_HOME/config.toml` or `~/.codex/config.toml`. This gives both Codex and OMX a persistent Playwright MCP server for browser testing without relying on session-local tool state.
**Side-effects:** OMX writes user-scoped Codex/OMX configuration and may persist `.omx/setup-scope.json` in the consumer repo. `wp setup` also repairs the managed `.gitignore` block for generated agent surfaces (`.codex/`, `.omx/`, `.agent/`, IDE projections) so re-running setup does not expose regenerated files as untracked. When default user-scoped setup migrates a repo that was previously project-scoped, agent-kit removes Git-tracked `.codex/` and `.omx/` files so repo-scoped OMX/Codex artifacts do not remain committed; untracked local runtime files are preserved. agent-kit also writes the global Codex Playwright MCP block described above and the one-line `codex_hooks` → `hooks` feature-flag migration when needed, preserving unrelated config.

### `omc`

Ensures [OMC / oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) is installed through Claude Code's plugin marketplace. OMC is the Claude Code sibling to OMX. It runs by default on every `wp setup` when the `claude` CLI is on `PATH`.

**Install path:** agent-kit uses OMC's Claude Code plugin marketplace path. Upstream OMC also documents an npm runtime package (`oh-my-claude-sisyphus`), but `wp setup` does not use that path. Default setup runs:

```bash
claude plugin marketplace add --scope user https://github.com/Yeachan-Heo/oh-my-claudecode
claude plugin install --scope user oh-my-claudecode
```

Use `wp setup --project` to request project-scoped OMC plugin installation instead.

**After install:** run `/oh-my-claudecode:omc-setup --global` in Claude Code for user-wide OMC configuration, or `/oh-my-claudecode:omc-setup --local` when you intentionally want project-local OMC configuration.

**Failure/skip modes:**
- `claude` is not on `PATH` → setup warns and skips OMC, because agent-kit only drives the Claude Code plugin path
- any plugin command exits non-zero → setup warns with the exact failing step and fallback command

**Opt-out:** set `WP_SKIP_OMC=1` in the environment to skip.

### `playwright-mcp`

Upserts Playwright's MCP server into Codex's persistent MCP config. This is normally covered by default `omx` setup; the explicit preset remains available for callers that want to make the Codex-config write visible in `--with`.

**Touches:** `$CODEX_HOME/config.toml` if `CODEX_HOME` is set, otherwise `~/.codex/config.toml`.
**Idempotency:** replaces only the owned `[mcp_servers.playwright]` table, appends it when missing, and preserves unrelated tables/settings.
**Why persistent:** Codex only exposes MCP servers that are present when the session starts, so writing the config makes the server survive restarts. Restart Codex after first setup.


### `context-mode`

Configures the [context-mode](https://github.com/mksglu/context-mode) peer tool for
Codex CLI and OpenCode. This preset is opt-in; run `wp setup --with context-mode` when you want the `ctx_*` MCP tools and hook routing. It ensures `context-mode` is available on `PATH`; if missing, agent-kit installs it with `vp install -g context-mode` before patching config files.

**Touches:**
- `$CODEX_HOME/config.toml` (or `~/.codex/config.toml`)
- `$CODEX_HOME/hooks.json` (or `~/.codex/hooks.json`)
- `<repoRoot>/opencode.json`

**Idempotency:**
- Replaces only the owned `[mcp_servers.context-mode]` table in Codex config
- Merges the Codex hook chain additively into the wrapped `hooks` schema
- Merges OpenCode's `mcp.context-mode` entry and `plugin: ["context-mode"]`
  without clobbering unrelated config

**Codex hook events wired by this preset:**

| Event | Command |
| ----- | ------- |
| `PreToolUse` | `context-mode hook codex pretooluse` (matcher: ctx/shell tools) |
| `PostToolUse` | `context-mode hook codex posttooluse` |
| `SessionStart` | `context-mode hook codex sessionstart` |
| `UserPromptSubmit` | `context-mode hook codex userpromptsubmit` |
| `Stop` | `context-mode hook codex stop` |
| `PreCompact` | `context-mode hook codex precompact` |
| `PostCompact` | `context-mode hook codex postcompact` |

**Failure modes:**
- `context-mode` missing from `PATH` and automatic `vp install -g context-mode` fails → `EXIT_SETUP_FAIL` with install hint

**OpenCode note:**
- The preset wires `opencode.json` only. If you want upstream context-mode routing
  prose in the repo contract, copy its `configs/opencode/AGENTS.md` manually or fold
  equivalent guidance into your existing `AGENTS.md`.wp_

### `gstack`

Ensures [gstack](https://gstack.lol/)'s **canonical checkout** exists at `~/.claude/skills/gstack/` ([GitHub](https://github.com/garrytan/gstack)). This runs by default on every `wp setup`. If the directory is missing, setup clones from `https://github.com/garrytan/gstack.git` and runs `./setup --team`. When Codex is detected, agent-kit then runs gstack's official host-specific setup flow (`./setup --host codex`) from that same checkout so Codex skills materialize under `~/.codex/skills/`.

**Detection:** path-based (`~/.claude/skills/gstack/setup` exists), NOT PATH-based.
**Failure modes:**
- `git clone` exits non-zero → `EXIT_WRITE_FAIL` (exit 3)
- `./setup --team` exits non-zero → `EXIT_WRITE_FAIL` (exit 3)
- `./setup --host codex` exits non-zero after Codex is detected → `EXIT_WRITE_FAIL` (exit 3)

**Codex detection:** Codex is considered present when either `~/.codex/config.toml` exists or `codex --version` succeeds on `PATH`.
**Idempotency:** every `wp setup` checks gstack and refreshes in place if needed (`gstack: ✓ updated`). Managed installs with a `.git/` directory do a fast-forward pull before `./setup --team`; unmanaged-but-valid installs (a `setup` script without `.git/`) rerun `./setup --team` without forcing git metadata. Codex materialization is also refreshed in place when Codex is detected (`gstack (codex): ✓ updated`).
**Side-effects outside the consumer repo:** writes to the user's home dir at `~/.claude/skills/gstack/`. This is intentional — gstack is global by design.
**Opt-out:** set `WP_SKIP_GSTACK=1` in the environment to skip (CI / sandboxed environments only — most consumer repos treat gstack as a hard prerequisite for AI-assisted work).

### `rtk`

Ensures [rtk](https://github.com/rtk-ai/rtk) is available, then runs
`rtk init -g --auto-patch`. Agent-kit treats RTK as a peer plugin: RTK owns
long-tail shell-tool filtering, while agent-kit keeps `wp_*` quality routing.

**Detection:** `rtk --version` on PATH. If missing on macOS, setup falls back to
the official current install hint: `brew install rtk`.
**Failure modes:**
- RTK still not on PATH after the fallback install path or on non-macOS without
  RTK already installed → `EXIT_SETUP_FAIL` (exit 1)
- `rtk init -g --auto-patch` exits non-zero → `EXIT_WRITE_FAIL` (exit 3)

**Telemetry / config:** agent-kit invokes RTK with
`RTK_TELEMETRY_DISABLED=1` and a prefilled `RTK_HOOK_EXCLUDE_COMMANDS` list so
RTK skips commands already owned by `wp-pretool-guard`.

**Current upstream nuance (May 2026):**
- Claude-style hook surfaces compose via `.claude/settings.json`
- Codex is treated as a prompt/instructions lane upstream, not a hook-rewrite
  lane, so agent-kit does **not** add RTK to `.codex/hooks.json`

**Marker:** every `wp setup` writes `.agent/.rtk-requested` so `wp hooks doctor`
can report RTK status for the repo.
**Opt-out:** set `WP_SKIP_RTK=1` in the environment to skip (CI / sandboxed
environments without `brew` access, or platforms where RTK isn't yet packaged).

## Combining presets

Presets run independently from the setup command's registered scaffolder flow. The default preset set is `omx,omc,gstack,vision,rtk`; `playwright-mcp` is also applied whenever `omx` runs. Specifying default presets explicitly is safe and idempotent. A failure in one does **not** skip subsequent presets — every preset gets a chance to run. The aggregate exit code reflects the worst failure across all presets.

Example: `wp setup` with `omx` unavailable after the fallback install and a reusable gstack install root already present → omx logs an error, gstack still detects + reports `updated`, overall exit code is 1 (the omx failure dominates).

## Runtime check (always-on)

After the scaffolder pass, every non-`--dry-run` `wp setup` runs a runtime check that probes `bun --version` and `vp --version`. Missing tools print an install hint to stdout but never fail the run. To skip the runtime check, pass `--dry-run`.

## Why `--with` mixes skills and presets

Tier-3 skills install **catalog content** (markdown files, SKILL.md, rules); presets run **scaffolder logic** (write hook files, spawn external CLIs). Conceptually different, but from the consumer's perspective both are "things you opt into during setup." Keeping them on a single flag avoids `--with-skills` / `--with-presets` proliferation. The name on each side is unambiguous because the namespaces don't collide.

### `example-skill`

Scaffolds a working `.agent/skills/hello-webpresso/SKILL.md` and then runs
`wp compile` as the final step. Designed for first-time setup: gives the
consumer an immediately invokable skill to verify that IDE skill discovery
is working end-to-end.

```bash
wp setup --with base-kit --with example-skill
# → .agent/skills/hello-webpresso/SKILL.md created
# → wp compile runs: all 6 IDE surfaces populated
# → /hello-webpresso is now available in Claude Code / Codex / Cursor / etc.
```

**Idempotency:** if `.agent/skills/hello-webpresso/SKILL.md` already exists,
the scaffolder skips the write. `wp compile` still runs to ensure surfaces are
current.
**Requires:** nothing beyond Node/Bun on PATH. rulesync is bundled with agent-kit.

### `audit-hooks`

Extends `.husky/pre-commit` (after `base-kit`) with two staged-mode audit hooks:

```bash
wp audit skill-sizes --staged
wp audit broken-refs --staged
```

`--staged` mode scans only the files in the current git staging area, so the
pre-commit check typically runs in under a second.

**Requires:** `base-kit` (runs `wp setup --with husky` first if not already set up).

## Adding new presets

Presets live under `src/cli/commands/init/scaffolders/<name>/index.ts` and are registered in the `PRESETS` const at `src/cli/commands/init/index.ts`. The CLI `--help` text reads from `PRESETS` directly so a new preset auto-surfaces in `wp setup --help`. Tests should follow the unit + integration + e2e pattern established by `omx/`, `omc/`, `gstack/`, and `runtime-check/`.
