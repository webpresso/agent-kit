# webpresso

> One command turns a repo into a shared workspace for AI coding agents: Claude Code, Codex CLI, Cursor, Windsurf, Gemini, and OpenCode get the same instructions, skills, hooks, planning files, and quality gates. Edit canonical `.agent/` content once; `wp sync` propagates it everywhere. MIT. Experimental (v0.x).

## What problem does this solve?

AI coding agents are powerful, but every repo tends to rebuild the same support
system by hand: `AGENTS.md`, IDE-specific rules, hooks, MCP routing, skill
catalogs, planning conventions, drift checks, and quality gates. Those surfaces
then diverge across Claude Code, Codex, Cursor, Windsurf, Gemini, OpenCode, and
local CI.

Agent-kit packages that operating layer. The published package is
`@webpresso/agent-kit`; it exposes the `wp`, `webpresso`, and `wp` CLI aliases
that scaffold, sync, audit, and refresh the surfaces each tool expects.

## What does webpresso do?

- Scaffolds a repo-local `.agent/` source of truth plus `AGENTS.md`, blueprints,
  docs templates, hooks, and gitignore protection for generated agent surfaces.
- Emits that source of truth into each supported IDE/runtime surface, including
  `.claude/`, `.codex/`, `.cursor/`, `.windsurf/`, `.gemini/`, `.opencode/`,
  and `.agents/`.
- Installs or refreshes companion workflow tools that stay owned by their own
  projects, then wires them into the repo where appropriate.
- Provides `wp_*` MCP tools and `wp` / `wp` CLI commands for tests, lint,
  typecheck, E2E, audits, blueprints, skills, and tech-debt lifecycle work.

## Companion tools and links

webpresso is the glue layer, not a replacement for the tools below. Default
setup installs or refreshes OMX, OMC, gstack, vision, and RTK; context-mode is
opt-in.

| Tool | Link | How it relates |
| --- | --- | --- |
| gstack | [gstack.lol](https://gstack.lol/) / [GitHub](https://github.com/garrytan/gstack) | Opinionated Claude Code and Codex workflow skills such as QA, review, release, design review, and office-hours style planning. |
| OMX, `oh-my-codex` | [docs](https://oh-my-codex.dev/docs.html) / [GitHub](https://github.com/Yeachan-Heo/oh-my-codex) | Codex orchestration layer for tmux teams, durable workflow state, HUD/status surfaces, and persistent execution modes. |
| OMC, `oh-my-claudecode` | [website](https://yeachan-heo.github.io/oh-my-claudecode-website/) / [GitHub](https://github.com/Yeachan-Heo/oh-my-claudecode) | Claude-side sibling to OMX. When `claude` is on `PATH`, default `wp setup` ensures the OMC Claude Code plugin marketplace install. |
| context-mode | [GitHub](https://github.com/mksglu/context-mode) | Optional context-window and tool-output routing layer for teams that explicitly opt into `wp setup --with context-mode`. |
| rulesync | [GitHub](https://github.com/dyoshikawa/rulesync) | Multi-runtime emission substrate used by agent-kit instead of reimplementing each IDE format. |

## Requires bun

webpresso CLI bins ship as TypeScript source with `#!/usr/bin/env bun`. Install
bun globally before running `wp`, `webpresso`, or `wp`:

```bash
curl -fsSL https://bun.sh/install | bash
```

## Install

```bash
vp install -g @webpresso/agent-kit
```

> **Pinned-version / devDependency path** (Codex CLI, library consumers):
> `vp install -D @webpresso/agent-kit && vp exec wp setup`. See
> [docs/getting-started.md](./docs/getting-started.md) for the full setup
> matrix. The current published package is `@webpresso/agent-kit`; the
> unscoped `webpresso` package is a placeholder and does not ship this CLI.

## First 5 minutes

```bash
# 1. Install and set up
vp install -g @webpresso/agent-kit
wp setup --with base-kit --with example-skill

# 2. Compile to all 6 IDE surfaces
wp compile

# 3. Verify no drift
wp audit skill-sizes
wp audit broken-refs

# 4. Open in your IDE — the hello-webpresso skill is now available
```

## How agent-kit relates to rulesync

agent-kit uses [rulesync](https://github.com/dyoshikawa/rulesync) as a substrate
for multi-runtime emission (17 runtimes, MIT, 175k weekly downloads).

| Capability | rulesync | agent-kit |
|---|---|---|
| Emit to 17 runtimes | ✅ | ✅ (via rulesync) |
| AGENTS.md section-keyed merger | ❌ | ✅ |
| Blueprint lifecycle (plan→in-progress→done) | ❌ | ✅ |
| Drift detection (broken refs, size budgets) | ❌ | ✅ |
| Tech-debt lifecycle (auto-file from audit) | ❌ | ✅ |
| Cross-repo correlation (permission-aware) | ❌ | ✅ (v0.13+) |
| Structured MCP tools for agents | ❌ | ✅ |
| GitHub Action (CI audit + PR comments) | ❌ | ✅ |

**agent-kit does not reimplement what rulesync does well.** It adds the integration layer that rulesync doesn't own: blueprint lifecycle, drift audits, tech-debt compounding, and structured MCP surfaces.

## Quick start

```bash
# Global install (recommended — Claude Code, Codex CLI, Cursor, Windsurf, Gemini, OpenCode):
vp install -g @webpresso/agent-kit && wp setup

# Claude Code plugin:
/plugin marketplace add webpresso/agent-kit
/plugin install agent-kit@agent-kit
```

Requires Node `>=24` and bun on the machine that runs the CLI or Claude Code plugin.

## context-mode is now opt-in

`wp setup` / `wp setup` no longer wires `context-mode` by default. This keeps the
default setup MIT-only and lets consumers avoid the ELv2 plugin unless they
explicitly need the `ctx_*` tools.

If you still want the `context-mode` MCP server + Codex hooks + OpenCode config,
opt in explicitly:

```bash
wp setup --with context-mode
```

Migration details:
- [docs/migration/context-mode-opt-in.md](./docs/migration/context-mode-opt-in.md)
- The longer-horizon MIT replacement work remains tracked separately under the
  session-memory blueprints.

## What changes after `wp setup`

### 1. Multi-IDE rule sync — no more drift

| Before | After |
| --- | --- |
| Edit `.cursor/rules/foo.md`. Then `.claude/skills/foo/SKILL.md`. Then `.gemini/commands/foo.toml`. Then `.windsurf/rules/foo.md`. Four files for one rule. They drift. | Edit `.agent/skills/foo/SKILL.md` once. `wp sync` propagates to every IDE surface. `wp audit catalog-drift` fails CI if anything diverges. |

### 2. Repo bootstrap — one command, idempotent

```bash
# Before: copy AGENTS.md, wire .codex/hooks.json, patch .claude/settings.json,
#         install Husky, configure commitlint + secretlint, bolt on bundle-budget,
#         blueprint-lifecycle, catalog-drift checks. Hours, drifts.

# After:
wp setup
```

`wp setup` (alias: `wp setup`) is re-runnable. Existing divergent files are left untouched and reported as drift; `--overwrite` replaces them. Hooks are patched additively into `.claude/settings.json` and `.codex/hooks.json` — your custom hooks survive. Setup also repairs the managed `.gitignore` block so regenerated `.codex/`, `.omx/`, `.agent/`, and IDE projection outputs stay out of Git.

### 3. Implementation plans that don't rot

| Before | After |
| --- | --- |
| Paste a plan into chat. Lose it on `/clear`. No way to track which agent worked on which task. | `wp blueprint new "<goal>"` writes a markdown plan to `blueprints/in-progress/`. Lifecycle states (`draft` / `planned` / `in-progress` / `completed`) are CI-gated by `wp audit blueprint-lifecycle`. |

### 4. Commit messages that survive six months

Lore Commit Protocol uses native git trailers — `git log` becomes a queryable decision log:

```
feat(auth): prevent silent session drops [lore]

Long sessions sometimes lost their auth token mid-flight. The fix
re-checks the cookie before every privileged call.

Confidence: high
Constraint: cannot break existing session cookies on rolling deploy
Rejected: refresh-token rotation (too invasive for the symptom)
Scope-risk: narrow
Reversibility: clean
Tested: tests/auth/session-drop.test.ts
```

Required trailers: `Confidence:` (`low|medium|high`) and at least one of `Constraint:` / `Rejected:` / `Directive:`. Audit-gated by `wp audit commit-message --require-lore`. Soft-adoption with `--lore-warn`.
wp_wp_wp_wp_wp_wp_wp_
### 5. Tech-debt that gets reviewed, not buried

| Before | After |
| --- | --- |
| 47 `TODO` comments, no owner, no triage, no review cadence. | `wp tech-debt new --severity high --category complexity` creates `tech-debt/<status>/h-NNN-slug.md` with a status (`accepted` / `needs-remediation` / `monitoring` / `resolved`) and a review cadence. `wp audit tech-debt` keeps the inventory honest. |

### 6. One audit gate, every check

```bash
# Before: 8 separate pre-commit hooks, each in its own config file.
# After:  one composite, same registry powers pre-commit + CI + ship gate.
wp audit guardrails
# composes: catalog-drift + blueprint-lifecycle + docs-frontmatter
#         + no-relative-parent-imports + vision + commit-message
#         + tech-debt + bucket-boundary
```

Add a new audit kind to `REPO_AUDIT_REGISTRY` and it propagates to all three call sites — pre-commit, CI, ship gate — automatically.

Audit + mutation harness ships in-package: `@webpresso/agent-kit/quality-engine` for programmatic access; `wp audit mutation` / `wp audit quality` for the CLI.

## Install paths

Two paths exist because Codex CLI doesn't ship a plugin marketplace yet ([config docs](https://github.com/openai/codex/blob/main/docs/config.md)). They're additive — pick either or both.

### Path A — Claude Code plugin

```bash
/plugin marketplace add webpresso/agent-kit
/plugin install agent-kit@agent-kit
```

You get: hooks (PreToolUse, PostToolUse, Stop, SessionStart), the `wp` MCP server with seven tools (`wp_test`, `wp_e2e`, `wp_lint`, `wp_typecheck`, `wp_qa`, `wp_audit`, `wp_blueprint`), slash commands, and the skills catalog. Pin to release tags — `main` does not ship `dist/`. Hot-reload from source: see [CONTRIBUTING.md](./CONTRIBUTING.md#edge-local-plugin-link-hot-reload-hooks-from-source).

### Path B — global install + `wp setup`

```bash
vp install -g @webpresso/agent-kit
wp setup
```

Required for Codex CLI, OpenCode, Cursor, Gemini, and any IDE without a plugin marketplace. Same hooks, scaffolded into `.claude/settings.json` AND `.codex/hooks.json`. Library imports (`defineAgentKitConfig`, `createAkTestCommandConfig`) flow through this path too.

If the `claude` CLI is on PATH, `wp setup` / `wp setup` now also attempts to ensure the **Claude Code user-scope marketplace + plugin** automatically:

```bash
claude plugin marketplace add --scope user <agent-kit-package-root>
claude plugin install --scope user agent-kit@agent-kit
claude plugin update --scope user agent-kit@agent-kit
```

That means one `wp setup` run can wire Codex's global MCP entry, Claude Code's user-global agent-kit plugin state, OMX, and OMC. Agent-kit uses OMC's Claude Code plugin marketplace path: when `claude` is on `PATH`, setup runs `claude plugin marketplace add --scope user https://github.com/Yeachan-Heo/oh-my-claudecode` and `claude plugin install --scope user oh-my-claudecode`; `wp setup --project` requests project-scoped OMX/OMC instead. Set `WP_SKIP_CLAUDE_PLUGIN=1` or `WP_SKIP_OMC=1` to opt out. See [`docs/getting-started.md`](./docs/getting-started.md) for the full setup matrix and [`docs/presets.md`](./docs/presets.md) for `--with` presets (`omx`, `omc`, `gstack`, `context-mode`, `playwright-mcp`, `vision`, `lore-commits`, `rtk`, `base-kit`).

> **Pinned-version devDependency:** `vp install -D @webpresso/agent-kit && vp exec wp setup`. `wp` is a working alias for all `wp` commands.

## IDE support matrix

| IDE | Skills surface | Setup path |
| --- | --- | --- |
| Claude Code | `.claude/skills/` | Path A (plugin marketplace) |
| Codex CLI | `.agents/skills/` + `.codex/hooks.json` | Path B (`wp setup`) |
| OpenCode | `.agents/skills/` + `.claude/skills/` | Path B (`wp setup`) |
| Cursor / Windsurf | `.cursor/skills/` / `.windsurf/skills/` | Path B (`wp setup`) |
| Gemini CLI | `.gemini/commands/*.toml` (TOML transform) | Path B (`wp setup`) |

## `wp` / `wp` CLI reference

`wp` is the primary bin alias. `webpresso` and `wp` are working aliases for all commands.

| Command | What it does |
| --- | --- |
| `wp setup` | Scaffold every IDE surface, install presets, idempotent |
| `wp setup --with <preset>` | Comma-separated presets: `omx`, `omc`, `gstack`, `context-mode`, `playwright-mcp`, `lore-commits`, `vision`, `rtk`, `base-kit` |
| `wp sync` | Propagate canonical `.agent/` rules + skills to every IDE surface (`--check` for drift, no writes) |
| `wp blueprint new "<goal>" --complexity M` | Create a new blueprint under `blueprints/draft/` |
| `wp blueprint audit --all --strict` | Audit blueprint lifecycle states |
| `wp blueprint list` / `wp roadmap list` | List blueprints / parent roadmaps |
| `wp blueprint db build` | Cold-start rebuild of the SQLite projection from markdown |
| `wp blueprint db query <template>` | Run a pre-registered query (e.g. `next-ready-task`) |
| `wp blueprint db verify` | Check the SQLite DB matches markdown on disk |
| `wp blueprint db browse` | Open Datasette UI (requires `pip install datasette`) |
| `wp blueprint export --format spec-kit <slug>` | Export a blueprint to spec-kit 4-file format |
| `wp tech-debt new --severity <s> --category <c>` | Create a tech-debt record with lifecycle status |
| `wp tech-debt new --from-audit <audit-name>` | Auto-file audit findings as tech-debt items |
| `wp worktree new [branch] [--name <name>] [--prefix <prefix>]` | Create a git worktree and seed `.agent/`; no branch auto-generates `agent/<timestamp>-<suffix>` |
| `wp worktree list` / `wp worktree remove <branch-or-path>` | List or remove worktrees (resolves by branch, basename, or path) |
| `wp skill list` / `wp skill install <name>` | Browse and install catalog skills into the active IDE surfaces |
| `wp audit guardrails` | Composite audit (8 checks) — wired into pre-commit, CI, ship gate |
| `wp audit quality` | `guardrails` + Stryker mutation testing |
| `wp audit commit-message --require-lore` | Enforce Lore trailers on commit messages |
| `wp audit bundle-budget <dir> --max-js-asset-bytes 512000` | Vite bundle budget guard |
| `wp audit vision` | Enforce `VISION.md` structure (frontmatter, ≤100 lines, ≤1500 words, required sections) |
| `wp audit skill-sizes` | Check that skill files don't exceed size budget |
| `wp audit broken-refs` | Detect dead links and missing file references in agent surfaces |
| `wp audit memory-rotation` | Verify memory files are rotated per retention policy |
| `wp audit gitignore-agent-surfaces` | Check that generated IDE surfaces are gitignored |
| `wp audit memory-unified` | Unified memory consistency check across IDE surfaces |
| `wp audit compile-drift` | Detect drift between `.agent/` source and compiled IDE outputs |
| `wp skills orphans --fix` | List (and optionally remove) stale IDE skill outputs with no `.agent/` source |
| `wp compile` | Compile `.agent/` to all 6 IDE surfaces (wraps rulesync) |
| `wp test`, `wp e2e`, `wp lint`, `wp typecheck`, `wp format` | Portable command surface — same flags work in every consumer repo |
| `wp err <cmd>` | Run a command and print only failure-looking lines |
| `wp hooks doctor` | Verify hook bins are installed, executable, MCP reachable |
| `wp doctor` | Repo audit health check with remediation hints |
| `wp mcp` | Run the agent-kit MCP server over stdio |
| `wp docs lint <file>` | Lint a research or blueprint doc |

Run `wp <command> --help` (or `wp <command> --help`) for full flags.

## Blueprint structured store

`wp blueprint db` gives agents and humans a queryable SQLite view of all blueprints and tech-debt.

```bash
wp blueprint db build           # cold-start rebuild from markdown
wp blueprint db query next-ready-task   # what should I work on next?
wp blueprint db verify          # check DB matches markdown on disk
wp blueprint db browse          # open Datasette UI (requires pip install datasette)
```

Nine pre-registered query templates. See `docs/blueprint-db-cookbook.md`.

Mutation verbs:
```bash
wp blueprint task advance <slug> <task-id> --to in-progress
wp blueprint promote <slug> planned
wp blueprint finalize <slug>
wp blueprint export --format spec-kit <slug>   # export to github/spec-kit format
```

### Tech-debt lifecycle

```bash
wp tech-debt new --from-audit skill-sizes   # auto-file findings as h-NNN-*.md
wp tech-debt list
wp tech-debt review
```

## Skills catalog

18 curated skills live at [`catalog/agent/skills/`](./catalog/agent/skills/). They ship as `skills/<name>/SKILL.md` in the published package and become `/webpresso-agent-kit:<skill>` after plugin install.

`better-auth-best-practices` · `deep-research` · `frontend-design` · `hooks-doctor` · `logging-best-practices` · `lore-protocol` · `monorepo-navigation` · `plan-refine` · `pll` · `react-doctor` · `systematic-debugging` · `tanstack-query` · `tech-debt` · `test-driven-development` · `testing-philosophy` · `vercel-react-best-practices` · `verify` · `web-design-guidelines`

Opinionated baseline, not a registry. Extend with your own under `.agent/skills/` and they ride the same `wp sync` distribution.

## Non-goals

- **Running AI agents themselves** — that's Claude Code / Codex / Cursor / etc.
- **Repo-specific rule content** — consumers extend via local `.agent/`. The catalog is for the parts everyone needs.
- **Authoring prompts, system messages, or model selection.**
- **Application or runtime code** — agent-kit is dev-time scaffolding only.

## Design invariants

- **Zero `@webpresso/*` runtime or dev dependencies.** agent-kit is standalone — does not depend on the Webpresso monorepo.
- **The catalog is canonical.** Consumers run `wp setup` once, then own their copy. Edit the catalog → publish → consumers pull. Don't hand-edit generated `.cursor/`, `.gemini/`, `.codex/` files; `wp audit catalog-drift` will catch it.
- **Fail loudly, never silently degrade.** If a surface can't be wired, `wp setup` reports it.

## Status

**Experimental (v0.x).** Public API may change between minor versions. Pin to a release tag if you need stability. See [`MIGRATION.md`](./MIGRATION.md) for upgrading from `@webpresso/agent-kit`, [`docs/getting-started.md`](./docs/getting-started.md) for the full onboarding guide, and [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the release process.

## Telemetry

`wp setup` can optionally collect anonymous wall-clock timing to help improve the
developer experience. No PII, no repo identifiers, no file paths are ever collected.

**Off by default** for third-party adopters. Opt in: `WP_TELEMETRY=1 wp setup`.
**Always on** for internal consumers (`WP_INTERNAL=1`).
**Always off**: `WP_TELEMETRY=0 wp setup`.

## License

MIT

## Consolidated helper package subpaths

`webpresso` also replaces the separate `@webpresso/agent-*` helper packages.
Install one package, then migrate old imports/config paths to the matching
`webpresso/*` subpath. Full details live in [MIGRATION.md](./MIGRATION.md).

| Old package/path | New `webpresso` path |
| --- | --- |
| `@webpresso/agent-tsconfig/base.json` | `webpresso/tsconfig/base.json` |
| `@webpresso/agent-tsconfig/cloudflare.json` | `webpresso/tsconfig/cloudflare.json` |
| `@webpresso/agent-tsconfig/library.json` | `webpresso/tsconfig/library.json` |
| `@webpresso/agent-tsconfig/react-library.json` | `webpresso/tsconfig/react-library.json` |
| `@webpresso/agent-tsconfig/react-router.json` | `webpresso/tsconfig/react-router.json` |
| `@webpresso/agent-tsconfig/webpresso.json` | `webpresso/tsconfig/webpresso.json` |
| `@webpresso/agent-vitest/node` | `webpresso/vitest/node` |
| `@webpresso/agent-vitest/react` | `webpresso/vitest/react` |
| `@webpresso/agent-vitest/react-router` | `webpresso/vitest/react-router` |
| `@webpresso/agent-vitest/workers` | `webpresso/vitest/workers` |
| `@webpresso/agent-vitest/react-setup` | `webpresso/vitest/react-setup` |
| `@webpresso/agent-vitest/flakiness-reporter` | `webpresso/vitest/flakiness-reporter` |
| `@webpresso/agent-stryker` | `webpresso/stryker` |
| `@webpresso/agent-stryker/webpresso` | `webpresso/stryker/webpresso` |
| `@webpresso/agent-oxlint` | `webpresso/oxlint` |
| `@webpresso/agent-oxlint/import-hygiene` | `webpresso/oxlint/import-hygiene` |
| `@webpresso/agent-oxlint/monorepo-paths` | `webpresso/oxlint/monorepo-paths` |
| `@webpresso/agent-oxlint/testing-quality` | `webpresso/oxlint/testing-quality` |
| `@webpresso/agent-workers-test` | `webpresso/workers-test` |
| `@webpresso/agent-docs-lint` | `webpresso/docs-lint` |
| `@webpresso/agent-docs-lint/schemas` | `webpresso/docs-lint/schemas` |
| `@webpresso/agent-docs-lint/generator` | `webpresso/docs-lint/generator` |
| `@webpresso/agent-launch` | `webpresso/launch` |
| `@webpresso/agent-test-preset` | `webpresso/test-preset` |
| `@webpresso/agent-test-preset/vitest` | `webpresso/test-preset/vitest` |
| `@webpresso/agent-e2e-preset` | `webpresso/e2e-preset` |
| `@webpresso/agent-e2e-preset/playwright` | `webpresso/e2e-preset/playwright` |

Oxlint consumers should move JSON-only `.oxlintrc.json` wiring to
`oxlint.config.ts` and import the TypeScript config surface from
`webpresso/oxlint`.
