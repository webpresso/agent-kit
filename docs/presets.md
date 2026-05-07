---
type: guide
last_updated: '2026-05-05'
---

# `ak setup --with` presets

`--with <names>` accepts a comma-separated mix of two things:

1. **Tier-3 skills** — opt-in skill packs from the agent-kit catalog (e.g. `tanstack-query`, `react-doctor`, `frontend-design`). Run `ak skills list` for the full list.
2. **Presets** — named scaffolder modes that wire in additional tooling beyond the skill catalog. `omx`, `gstack`, and `vision` run by default on every `ak setup`; the rest are opt-in. Each preset is documented below.

Presets and Tier-3 skills can be combined freely:

```bash
ak setup --with omx,gstack,tanstack-query --yes
```

Unknown values fall through to Tier-3 skill resolution and are rejected with `EXIT_SETUP_FAIL` (exit code 1). Whitespace around commas is tolerated.

## Available presets

### `vision`

Drops a starter `VISION.md` at repo root from `catalog/vision/VISION.md.tmpl`, with `{{REPO_NAME}}` and `{{TODAY}}` substituted. Runs by default on every `ak setup`. The companion audit `ak audit vision` (part of the `guardrails` composite) enforces structure on the file from there on:

- frontmatter `type: vision` + `last_updated: YYYY-MM-DD`
- H1 contains "Vision"
- required H2 sections: Problem, North star, Boundaries, Principles (synonyms accepted)
- ≤ 100 body lines and ≤ 1500 body words
- soft-warns when `last_updated` is older than 365 days

**Touches:** `VISION.md` only; existing files are protected by the standard merge policy (`.new` sidecar unless `--overwrite`).
**Requires nothing on PATH.**

### `lore-commits`

Writes `.husky/commit-msg` that enforces Lore Commit Protocol trailers via `ak audit commit-message --require-lore`. Composes safely with `base-kit` — if the hook already exists with the correct content, the run is a no-op.

**Touches:** `.husky/commit-msg` only.
**Requires nothing on PATH.**

### `omx`

Chains `omx setup --yes` after the agent-kit scaffold completes. OMX (oh-my-codex) is the operator-workflow execution layer that complements agent-kit's plan/audit layer; agent-kit invokes `omx team` downstream during blueprint execution.

**Detection:** `omx --version` on PATH; if missing, setup runs `npm install -g oh-my-codex` and probes again.
**Failure modes:**
- omx still not on PATH after the fallback install → `EXIT_SETUP_FAIL` (exit 1) with install hint in stderr
- `omx setup --yes` itself errors → `EXIT_WRITE_FAIL` (exit 3) with the omx exit code surfaced

**Idempotency:** OMX manages its own state — every `ak setup` re-invokes `omx setup --yes`, which is itself idempotent.
**Codex/OMX MCP persistence:** after `omx setup --yes`, agent-kit upserts the owned `[mcp_servers.playwright]` block in `$CODEX_HOME/config.toml` or `~/.codex/config.toml`. This gives both Codex and OMX a persistent Playwright MCP server for browser testing without relying on session-local tool state.
**Side-effects:** OMX writes its own files into the consumer repo (`.codex/`, `.omx/`, scope-specific AGENTS.md additions). agent-kit also writes the global Codex Playwright MCP block described above, preserving unrelated config.

### `playwright-mcp`

Upserts Playwright's MCP server into Codex's persistent MCP config. This is normally covered by default `omx` setup; the explicit preset remains available for callers that want to make the Codex-config write visible in `--with`.

**Touches:** `$CODEX_HOME/config.toml` if `CODEX_HOME` is set, otherwise `~/.codex/config.toml`.
**Idempotency:** replaces only the owned `[mcp_servers.playwright]` table, appends it when missing, and preserves unrelated tables/settings.
**Why persistent:** Codex only exposes MCP servers that are present when the session starts, so writing the config makes the server survive restarts. Restart Codex after first setup.

### `gstack`

Ensures gstack — a Claude Code skill registry providing `/qa`, `/ship`, `/review`, `/investigate`, `/browse`, etc. — is installed at `~/.claude/skills/gstack/`. This runs by default on every `ak setup`. If the directory is missing, setup clones from `https://github.com/garrytan/gstack.git` and runs `./setup --team`.

**Detection:** path-based (`~/.claude/skills/gstack/setup` exists), NOT PATH-based.
**Failure modes:**
- `git clone` exits non-zero → `EXIT_WRITE_FAIL` (exit 3)
- `./setup --team` exits non-zero → `EXIT_WRITE_FAIL` (exit 3)

**Idempotency:** every `ak setup` checks gstack and refreshes in place if needed (`gstack: ✓ updated`). Managed installs with a `.git/` directory do a fast-forward pull before `./setup --team`; unmanaged-but-valid installs (a `setup` script without `.git/`) rerun `./setup --team` without forcing git metadata.
**Side-effects outside the consumer repo:** writes to the user's home dir at `~/.claude/skills/gstack/`. This is intentional — gstack is global by design.
**Opt-out:** set `AK_SKIP_GSTACK=1` in the environment to skip (CI / sandboxed environments only — most consumer repos treat gstack as a hard prerequisite for AI-assisted work).

### `rtk`

Ensures [rtk](https://github.com/rtk-ai/rtk) is available, then runs
`rtk init -g --auto-patch`. Agent-kit treats RTK as a peer plugin: RTK owns
long-tail shell-tool filtering, while agent-kit keeps `ak_*` quality routing.

**Detection:** `rtk --version` on PATH. If missing on macOS, setup falls back to
the official current install hint: `brew install rtk`.
**Failure modes:**
- RTK still not on PATH after the fallback install path or on non-macOS without
  RTK already installed → `EXIT_SETUP_FAIL` (exit 1)
- `rtk init -g --auto-patch` exits non-zero → `EXIT_WRITE_FAIL` (exit 3)

**Telemetry / config:** agent-kit invokes RTK with
`RTK_TELEMETRY_DISABLED=1` and a prefilled `RTK_HOOK_EXCLUDE_COMMANDS` list so
RTK skips commands already owned by `ak-pretool-guard`.

**Current upstream nuance (May 2026):**
- Claude-style hook surfaces compose via `.claude/settings.json`
- Codex is treated as a prompt/instructions lane upstream, not a hook-rewrite
  lane, so agent-kit does **not** add RTK to `.codex/hooks.json`

**Marker:** every `ak setup` writes `.agent/.rtk-requested` so `ak hooks doctor`
can report RTK status for the repo.
**Opt-out:** set `AK_SKIP_RTK=1` in the environment to skip (CI / sandboxed
environments without `brew` access, or platforms where RTK isn't yet packaged).

## Combining presets

Presets run independently in the order: `gstack`, `lore-commits`, `omx`, `playwright-mcp`, `rtk`, `vision`. The default preset set is `omx,gstack,vision,rtk`; `playwright-mcp` is also applied whenever `omx` runs. Specifying default presets explicitly is safe and idempotent. A failure in one does **not** skip subsequent presets — every preset gets a chance to run. The aggregate exit code reflects the worst failure across all presets.

Example: `ak setup` with `omx` unavailable after the fallback install and a reusable gstack install root already present → omx logs an error, gstack still detects + reports `updated`, overall exit code is 1 (the omx failure dominates).

## Runtime check (always-on)

After the scaffolder pass, every non-`--dry-run` `ak setup` runs a runtime check that probes `bun --version` and `vp --version`. Missing tools print an install hint to stdout but never fail the run. To skip the runtime check, pass `--dry-run`.

## Why `--with` mixes skills and presets

Tier-3 skills install **catalog content** (markdown files, SKILL.md, rules); presets run **scaffolder logic** (write hook files, spawn external CLIs). Conceptually different, but from the consumer's perspective both are "things you opt into during setup." Keeping them on a single flag avoids `--with-skills` / `--with-presets` proliferation. The name on each side is unambiguous because the namespaces don't collide.

## Adding new presets

Presets live under `src/cli/commands/init/scaffolders/<name>/index.ts` and are registered in the `PRESETS` const at `src/cli/commands/init/index.ts`. The CLI `--help` text reads from `PRESETS` directly so a new preset auto-surfaces in `ak setup --help`. Tests should follow the unit + integration + e2e pattern established by `omx/`, `gstack/`, and `runtime-check/`.
