# webpresso

> One command turns a repo into a shared workspace for AI coding agents: Claude Code, Codex CLI, Cursor, Windsurf, Gemini, and OpenCode get the same instructions, skills, hooks, planning files, and quality gates. Edit canonical `.agent/` content once; `wp sync` propagates it everywhere. MIT. Experimental (v0.x).

## What problem does this solve?

AI coding agents are powerful, but every repo tends to rebuild the same support
system by hand: `AGENTS.md`, IDE-specific rules, hooks, MCP routing, skill
catalogs, planning conventions, drift checks, and quality gates. Those surfaces
then diverge across Claude Code, Codex, Cursor, Windsurf, Gemini, OpenCode, and
local CI.

Webpresso packages that operating layer. During the v0.x migration the
published package exposes working `wp` and `webpresso` command aliases that
scaffold, sync, audit, and refresh the surfaces each tool expects. Durable
public CLI branding is being consolidated under the `webpresso ...` command
family; `wp_*` names in this README refer to MCP tools, not CLI brands.

## What does webpresso do?

- Scaffolds a repo-local `.agent/` source of truth plus `AGENTS.md`, blueprints,
  docs templates, hooks, and gitignore protection for generated agent surfaces.
- Emits that source of truth into each supported IDE/runtime surface, including
  `.claude/`, `.codex/`, `.cursor/`, `.windsurf/`, `.gemini/`, `.opencode/`,
  and `.agents/`.
- Installs or refreshes companion workflow tools that stay owned by their own
  projects, then wires them into the repo where appropriate.
- Provides `wp_*` MCP tools for tests, lint, typecheck, E2E, audits,
  blueprints, local CI act, Worker tail, skills, and tech-debt lifecycle work;
  current `wp ...` CLI examples are v0.x migration examples, not durable public
  brand commitments.

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
| rulesync | [GitHub](https://github.com/dyoshikawa/rulesync) | Multi-runtime emission substrate used by webpresso instead of reimplementing each IDE format. |

The AI reliability contract documented in this repo is also informed by
[daronyondem/claude-architect-exam-guide](https://github.com/daronyondem/claude-architect-exam-guide),
especially its emphasis on keeping deterministic guarantees in code, schemas,
tool contracts, and audits rather than prompts alone.

## Runtime requirements

Current v0.x `wp` and `webpresso` bins ship as Node launchers. They prefer
packaged `dist/esm` output and only fall back to `bun + src/*.ts` when you are
running directly from a source checkout.

Install bun if you develop webpresso from source or rely on source-checkout
fallbacks:

```bash
curl -fsSL https://bun.sh/install | bash
```

## Install

```bash
vp install -g webpresso
```

If bootstrap, hooks, or local live-source linking ever drift, diagnose first:

```bash
wp hooks doctor
```

Typical repairs:

- refresh local surfaces: `wp setup`
- restore a live-source link: `vp install` or `vp run dev:link --consumer <repo>`
- fix GitHub Packages auth before reinstalling if `vp install` fails with `403`
  on `@webpresso/*`

> **Pinned-version / devDependency path** (Codex CLI, library consumers):
> `vp install -D webpresso && vp exec wp setup`. See
> [docs/getting-started.md](./docs/getting-started.md) for the full setup
> matrix. The canonical published package is `webpresso`.

## First 5 minutes

```bash
# 1. Install and set up
vp install -g webpresso
wp setup --with base-kit --with example-skill

# 2. Compile to all 6 IDE surfaces
wp compile

# 3. Verify no drift
wp audit skill-sizes
wp audit broken-refs

# 4. Open in your IDE — the hello-webpresso skill is now available
```

## How webpresso relates to rulesync

webpresso uses [rulesync](https://github.com/dyoshikawa/rulesync) as a substrate
for multi-runtime emission (17 runtimes, MIT, 175k weekly downloads).

| Capability | rulesync | webpresso |
|---|---|---|
| Emit to 17 runtimes | ✅ | ✅ (via rulesync) |
| AGENTS.md section-keyed merger | ❌ | ✅ |
| Blueprint lifecycle (plan→in-progress→done) | ❌ | ✅ |
| Drift detection (broken refs, size budgets) | ❌ | ✅ |
| Tech-debt lifecycle (auto-file from audit) | ❌ | ✅ |
| Cross-repo correlation (permission-aware) | ❌ | ✅ (v0.13+) |
| Structured MCP tools for agents | ❌ | ✅ |
| GitHub Action (CI audit + PR comments) | ❌ | ✅ |

**webpresso does not reimplement what rulesync does well.** It adds the integration layer that rulesync doesn't own: blueprint lifecycle, drift audits, tech-debt compounding, and structured MCP surfaces.

## Quick start

```bash
# Global install (recommended — Claude Code, Codex CLI, Cursor, Windsurf, Gemini, OpenCode):
vp install -g webpresso && wp setup

# Claude Code plugin:
/plugin marketplace add webpresso/webpresso
/plugin install webpresso@webpresso
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

Current v0.x `wp setup` / `webpresso setup` is re-runnable. By default it refreshes the sections, structured config keys, and generated surfaces that webpresso owns, while leaving divergent consumer-owned files untouched and reported as drift. Use `--overwrite` only when you intentionally want full-file replacement for eligible managed files. Hooks are patched additively into `.claude/settings.json` and `.codex/hooks.json` — your custom hooks survive. Setup also repairs the managed `.gitignore` block so regenerated `.codex/`, `.omx/`, `.agent/`, and IDE projection outputs stay out of Git.

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
# composes: catalog-drift + package-surface + blueprint-lifecycle + docs-frontmatter
#         + architecture-drift
#         + no-relative-parent-imports + vision + commit-message + ai-contracts
#         + tech-debt + bucket-boundary
```

Add a new audit kind to `REPO_AUDIT_REGISTRY` and it propagates to all three call sites — pre-commit, CI, ship gate — automatically.

Audit + mutation harness ships in-package: `webpresso/quality-engine` for programmatic access; `wp audit mutation` / `wp audit quality` for the CLI.

## Install paths

Two paths exist because Codex CLI doesn't ship a plugin marketplace yet ([config docs](https://github.com/openai/codex/blob/main/docs/config.md)). They're additive — pick either or both.

### Path A — Claude Code plugin

```bash
/plugin marketplace add webpresso/webpresso
/plugin install webpresso@webpresso
```

You get: hooks (PreToolUse, PostToolUse, Stop, SessionStart), the `wp` MCP server with tools such as `wp_test`, `wp_e2e`, `wp_lint`, `wp_typecheck`, `wp_qa`, `wp_audit`, `wp_blueprint`, `wp_ci_act`, and `wp_worker_tail`, slash commands, and the skills catalog. Pin to release tags — `main` does not ship `dist/`. Hot-reload from source: see [CONTRIBUTING.md](./CONTRIBUTING.md#edge-local-plugin-link-hot-reload-hooks-from-source).

### Path B — global install + `wp setup`

```bash
vp install -g webpresso
wp setup
```

Required for Codex CLI, OpenCode, Cursor, Gemini, and any IDE without a plugin marketplace. Same hooks, scaffolded into `.claude/settings.json` AND `.codex/hooks.json`. Library imports (`defineAgentKitConfig`, `createAkTestCommandConfig`) flow through this path too.

If the `claude` CLI is on PATH, current v0.x `wp setup` / `webpresso setup` now also attempts to ensure the **Claude Code user-scope marketplace + plugin** automatically:

```bash
claude plugin marketplace add --scope user <webpresso-package-root>
claude plugin install --scope user webpresso@webpresso
claude plugin update --scope user webpresso@webpresso
```

That means one `wp setup` run can wire Codex's global MCP entry, Claude Code's user-global webpresso plugin state, OMX, and OMC. Webpresso uses OMC's Claude Code plugin marketplace path: when `claude` is on `PATH`, setup runs `claude plugin marketplace add --scope user https://github.com/Yeachan-Heo/oh-my-claudecode` and `claude plugin install --scope user oh-my-claudecode`; `wp setup --project` requests project-scoped OMX/OMC instead. Set `WP_SKIP_CLAUDE_PLUGIN=1` or `WP_SKIP_OMC=1` to opt out. See [`docs/getting-started.md`](./docs/getting-started.md) for the full setup matrix and [`docs/presets.md`](./docs/presets.md) for `--with` presets (`omx`, `omc`, `gstack`, `context-mode`, `playwright-mcp`, `vision`, `lore-commits`, `rtk`, `base-kit`).

> **Pinned-version devDependency:** `vp install -D webpresso && vp exec wp setup`. `wp` is the current v0.x setup alias; durable public command ownership is expected to consolidate under `webpresso ...`.

## IDE support matrix

| IDE | Skills surface | Setup path |
| --- | --- | --- |
| Claude Code | `.claude/skills/` | Path A (plugin marketplace) |
| Codex CLI | `.agents/skills/` + `.codex/hooks.json` | Path B (`wp setup`) |
| OpenCode | `.agents/skills/` + `.claude/skills/` | Path B (`wp setup`) |
| Cursor / Windsurf | `.cursor/skills/` / `.windsurf/skills/` | Path B (`wp setup`) |
| Gemini CLI | `.gemini/commands/*.toml` (TOML transform) | Path B (`wp setup`) |

## Current v0.x CLI reference

The examples below use the current `wp` setup alias because that is what the
package ships today. Treat them as migration-era CLI examples; durable public
command ownership is expected to consolidate under `webpresso ...`. MCP tool
names such as `wp_test`, `wp_ci_act`, and `wp_worker_tail` remain canonical
agent tool names.

### Secret-aware local CI and Worker tail

Agents should use the canonical MCP tools for secret-scoped execution:
`wp_ci_act` for local GitHub Actions and `wp_worker_tail` for Cloudflare Worker
logs. Those tools route through the provider-neutral shell contract
`with-secrets -- <cmd>`; downstream helper references should use
`act-with-webpresso` for local CI adoption. Configure secret-manager metadata
with current v0.x `wp config secrets ...` examples, or
`webpresso config secrets ...` where the installed package exposes that bin.
Do not treat `wp ...` examples as durable public CLI branding.

| Command | What it does |
| --- | --- |
| `wp setup` | Scaffold every IDE surface, install presets, idempotent |
| `wp setup --with <preset>` | Comma-separated presets: `omx`, `omc`, `gstack`, `context-mode`, `playwright-mcp`, `lore-commits`, `vision`, `rtk`, `base-kit` |
| `wp sync` | Propagate canonical `.agent/` rules + skills to every IDE surface (`--check` for drift, no writes) |
| `wp blueprint new "<goal>" --complexity M` | Create a new blueprint under `blueprints/draft/` |
| `wp blueprint audit --all --strict` | Audit blueprint lifecycle states |
| `wp audit package-surface` | Enforce the public/private Webpresso package-surface contract |
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
| `wp audit guardrails` | Composite audit registry — wired into pre-commit, CI, ship gate |
| `wp audit quality` | `guardrails` + Stryker mutation testing |
| `wp audit architecture-drift` | Verify architecture docs/contracts and active blueprint linkage/before-after policy |
| `wp audit commit-message --require-lore` | Enforce Lore trailers on commit messages |
| `wp audit ai-contracts` | Verify the AI reliability contract across summary-first MCP result surfaces |
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
| `wp hooks doctor` | Verify hook bins are installed/executable, MCP reachable, and `.codex/hooks.json` command paths resolve |
| `wp doctor` | Repo audit health check with remediation hints |
| `wp mcp` | Run the webpresso MCP server over stdio |
| `wp docs lint <file>` | Lint a research or blueprint doc |

Run `wp <command> --help` for current v0.x examples, or
`webpresso <command> --help` where the installed package exposes that bin.

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

18 curated skills live at [`catalog/agent/skills/`](./catalog/agent/skills/). They ship as `skills/<name>/SKILL.md` in the published package and become `/webpresso:<skill>` after plugin install.

`better-auth-best-practices` · `deep-research` · `frontend-design` · `hooks-doctor` · `logging-best-practices` · `lore-protocol` · `monorepo-navigation` · `plan-refine` · `pll` · `react-doctor` · `systematic-debugging` · `tanstack-query` · `tech-debt` · `test-driven-development` · `testing-philosophy` · `vercel-react-best-practices` · `verify` · `web-design-guidelines`

Opinionated baseline, not a registry. Extend with your own under `.agent/skills/` and they ride the same `wp sync` distribution.

## Non-goals

- **Running AI agents themselves** — that's Claude Code / Codex / Cursor / etc.
- **Repo-specific rule content** — consumers extend via local `.agent/`. The catalog is for the parts everyone needs.
- **Authoring prompts, system messages, or model selection.**
- **Application or runtime code** — webpresso is dev-time scaffolding only.

## Design invariants

- **Zero `@webpresso/*` runtime or dev dependencies.** webpresso is standalone — does not depend on the Webpresso monorepo.
- **The catalog is canonical.** Consumers run `wp setup` once, then own their copy. Edit the catalog → publish → consumers pull. Don't hand-edit generated `.cursor/`, `.gemini/`, `.codex/` files; `wp audit catalog-drift` will catch it.
- **Fail loudly, never silently degrade.** If a surface can't be wired, `wp setup` reports it.

## Status

**Experimental (v0.x).** Public API may change between minor versions. Pin to a release tag if you need stability. See [`docs/getting-started.md`](./docs/getting-started.md) for the full onboarding guide and [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the release process.

## Telemetry

`wp setup` can optionally collect anonymous wall-clock timing to help improve the
developer experience. No PII, no repo identifiers, no file paths are ever collected.

**Off by default** for third-party adopters. Opt in: `WP_TELEMETRY=1 wp setup`.
**Always on** for internal consumers (`WP_INTERNAL=1`).
**Always off**: `WP_TELEMETRY=0 wp setup`.

## License

MIT

## Config and tooling subpaths

`webpresso` ships the configuration and tooling surfaces directly from the root
package. Install one dependency, then import the subpath you need:

- `webpresso/tsconfig/base.json`
- `webpresso/tsconfig/cloudflare.json`
- `webpresso/tsconfig/library.json`
- `webpresso/tsconfig/react-library.json`
- `webpresso/tsconfig/react-router.json`
- `webpresso/tsconfig/webpresso.json`
- `webpresso/vitest/node`
- `webpresso/vitest/react`
- `webpresso/vitest/react-router`
- `webpresso/vitest/workers`
- `webpresso/vitest/react-setup`
- `webpresso/vitest/flakiness-reporter`
- `webpresso/stryker`
- `webpresso/oxlint`
- `webpresso/workers-test`
- `webpresso/docs-lint`
- `webpresso/launch`
- `webpresso/test-preset`
- `webpresso/e2e-preset`

Oxlint consumers should use `oxlint.config.ts` and import the TypeScript config
surface from `webpresso/oxlint`.

## Session memory

Agent-kit includes zero-cloud session memory for local agents. It captures tool/session events into an in-process SQLite database with FTS5 search so future turns can restore relevant context without an external memory service, embedding provider, Docker service, or API key.

- **Enabled by default:** no setup flag is required because the v1 engine is local-only and low cost.
- **Data location:** per-repo databases live under `~/.webpresso/sessions/<repo-hash>.db`, outside the repository and out of Git.
- **Disable:** set `WP_SESSION_MEMORY=0` (or `WEBPRESSO_SESSION_MEMORY=0` for compatibility) in the agent process environment to skip capture/restore hooks as they land.
- **Privacy:** all indexing/search happens on the local machine. Session memory makes zero cloud calls and emits no telemetry.

See [docs/guides/session-memory.md](docs/guides/session-memory.md) for the event flow and schema.
