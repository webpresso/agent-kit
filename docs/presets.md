---
type: guide
last_updated: '2026-04-25'
---

# `ak setup --with` presets

`--with <names>` accepts a comma-separated mix of two things:

1. **Tier-3 skills** — opt-in skill packs from the agent-kit catalog (e.g. `tanstack-query`, `react-doctor`, `frontend-design`). Run `ak skills list` for the full list.
2. **Presets** — named scaffolder modes that wire in additional tooling beyond the skill catalog. Each preset is documented below.

Presets and Tier-3 skills can be combined freely:

```bash
ak setup --with omx,gstack,tanstack-query --yes
```

Unknown values fall through to Tier-3 skill resolution and are rejected with `EXIT_SETUP_FAIL` (exit code 1). Whitespace around commas is tolerated.

## Available presets

### `lore-commits`

Writes `.husky/commit-msg` that enforces Lore Commit Protocol trailers via `ak audit commit-message --require-lore`. Composes safely with `base-kit` — if the hook already exists with the correct content, the run is a no-op.

**Touches:** `.husky/commit-msg` only.
**Requires nothing on PATH.**

### `omx`

Chains `omx setup --yes` after the agent-kit scaffold completes. OMX (oh-my-codex) is the operator-workflow execution layer that complements agent-kit's plan/audit layer; agent-kit invokes `omx team` downstream during blueprint execution.

**Detection:** `omx --version` on PATH.
**Failure modes:**
- omx not on PATH → `EXIT_SETUP_FAIL` (exit 1) with install hint in stderr
- `omx setup --yes` itself errors → `EXIT_WRITE_FAIL` (exit 3) with the omx exit code surfaced

**Idempotency:** OMX manages its own state — re-running `--with omx` re-invokes `omx setup --yes`, which is itself idempotent.
**Side-effects:** OMX writes its own files into the consumer repo (`.codex/`, `.omx/`, scope-specific AGENTS.md additions). agent-kit doesn't predict or assert what OMX writes.

### `gstack`

Ensures gstack — a Claude Code skill registry providing `/qa`, `/ship`, `/review`, `/investigate`, `/browse`, etc. — is installed at `~/.claude/skills/gstack/`. If the directory is missing, clones from `https://github.com/garrytan/gstack.git` and runs `./setup --team`.

**Detection:** path-based (`~/.claude/skills/gstack/setup` exists), NOT PATH-based.
**Failure modes:**
- `git clone` exits non-zero → `EXIT_WRITE_FAIL` (exit 3)
- `./setup --team` exits non-zero → `EXIT_WRITE_FAIL` (exit 3)

**Idempotency:** if gstack is already installed, the run is a no-op (`gstack: ✓ already installed`). Cloning happens at most once per host, then `./setup --team` runs.
**Side-effects outside the consumer repo:** writes to the user's home dir at `~/.claude/skills/gstack/`. This is intentional — gstack is global by design. Only opt in via `--with gstack` when you actually want gstack's skills available.

## Combining presets

Presets run independently in the order: `lore-commits`, `omx`, `gstack`. A failure in one does **not** skip subsequent presets — every preset gets a chance to run. The aggregate exit code reflects the worst failure across all presets.

Example: `ak setup --with omx,gstack` with `omx` not on PATH and gstack already installed → omx logs an error, gstack still detects + reports "already installed", overall exit code is 1 (the omx failure dominates).

## Runtime check (always-on)

After the scaffolder pass, every non-`--dry-run` `ak setup` runs a runtime check that probes `bun --version` and `vp --version`. Missing tools print an install hint to stdout but never fail the run. To skip the runtime check, pass `--dry-run`.

## Why `--with` mixes skills and presets

Tier-3 skills install **catalog content** (markdown files, SKILL.md, rules); presets run **scaffolder logic** (write hook files, spawn external CLIs). Conceptually different, but from the consumer's perspective both are "things you opt into during setup." Keeping them on a single flag avoids `--with-skills` / `--with-presets` proliferation. The name on each side is unambiguous because the namespaces don't collide.

## Adding new presets

Presets live under `src/cli/commands/init/scaffolders/<name>/index.ts` and are registered in the `PRESETS` const at `src/cli/commands/init/index.ts`. The CLI `--help` text reads from `PRESETS` directly so a new preset auto-surfaces in `ak setup --help`. Tests should follow the unit + integration + e2e pattern established by `omx/`, `gstack/`, and `runtime-check/`.
