# @webpresso/agent-kit

> One command scaffolds a repo so every AI coding agent — Claude Code, Codex CLI, Cursor, Windsurf, Gemini, OpenCode — shares the same context, hooks, and quality gates. Edit a canonical `.agent/` once; `ak sync` propagates everywhere. MIT. Experimental (v0.x).

## Registry setup

agent-kit publishes to GitHub Packages. Add to your `.npmrc`:

```
@webpresso:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then: `pnpm add -D @webpresso/agent-kit`

## First 5 minutes

```bash
# 1. Install and set up
pnpm add -D @webpresso/agent-kit
npx ak setup --with base-kit --with example-skill

# 2. Compile to all 6 IDE surfaces
npx ak compile

# 3. Verify no drift
npx ak audit skill-sizes
npx ak audit broken-refs

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

## The problem

Every repo using AI coding agents needs the same scaffolding: an `AGENTS.md` operating contract, scoped rules, lifecycle hooks, slash-command skills, quality gates. Today each team hand-crafts this from scratch, surfaces drift across tools and repos, and the knowledge of *what to configure and why* lives in tribal memory rather than code.

agent-kit is the catalog and the `ak` CLI that fixes that.

## Quick start

```bash
# npm install (Codex CLI / Cursor / Windsurf / Gemini / OpenCode):
pnpm add -D @webpresso/agent-kit && npx ak setup

# Claude Code plugin:
/plugin marketplace add webpresso/agent-kit
/plugin install agent-kit@webpresso
```

Requires Node `>=24` and Bun on the machine that runs the Claude Code plugin.

## What changes after `ak setup`

### 1. Multi-IDE rule sync — no more drift

| Before | After |
| --- | --- |
| Edit `.cursor/rules/foo.md`. Then `.claude/skills/foo/SKILL.md`. Then `.gemini/commands/foo.toml`. Then `.windsurf/rules/foo.md`. Four files for one rule. They drift. | Edit `.agent/skills/foo/SKILL.md` once. `ak sync` propagates to every IDE surface. `ak audit catalog-drift` fails CI if anything diverges. |

### 2. Repo bootstrap — one command, idempotent

```bash
# Before: copy AGENTS.md, wire .codex/hooks.json, patch .claude/settings.json,
#         install Husky, configure commitlint + secretlint, bolt on bundle-budget,
#         blueprint-lifecycle, catalog-drift checks. Hours, drifts.

# After:
npx ak setup
```

`ak setup` is re-runnable. Existing files get a `<name>.new` sidecar by default; `--overwrite` replaces them. Hooks are patched additively into `.claude/settings.json` and `.codex/hooks.json` — your custom hooks survive.

### 3. Implementation plans that don't rot

| Before | After |
| --- | --- |
| Paste a plan into chat. Lose it on `/clear`. No way to track which agent worked on which task. | `ak blueprint new "<goal>"` writes a markdown plan to `blueprints/in-progress/`. Lifecycle states (`draft` / `planned` / `in-progress` / `completed`) are CI-gated by `ak audit blueprint-lifecycle`. |

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

Required trailers: `Confidence:` (`low|medium|high`) and at least one of `Constraint:` / `Rejected:` / `Directive:`. Audit-gated by `ak audit commit-message --require-lore`. Soft-adoption with `--lore-warn`.

### 5. Tech-debt that gets reviewed, not buried

| Before | After |
| --- | --- |
| 47 `TODO` comments, no owner, no triage, no review cadence. | `ak tech-debt new --severity high --category complexity` creates `tech-debt/<status>/h-NNN-slug.md` with a status (`accepted` / `needs-remediation` / `monitoring` / `resolved`) and a review cadence. `ak audit tech-debt` keeps the inventory honest. |

### 6. One audit gate, every check

```bash
# Before: 8 separate pre-commit hooks, each in its own config file.
# After:  one composite, same registry powers pre-commit + CI + ship gate.
ak audit guardrails
# composes: catalog-drift + blueprint-lifecycle + docs-frontmatter
#         + no-relative-parent-imports + vision + commit-message
#         + tech-debt + bucket-boundary
```

Add a new audit kind to `REPO_AUDIT_REGISTRY` and it propagates to all three call sites — pre-commit, CI, ship gate — automatically.

Audit + mutation harness ships in-package: `@webpresso/agent-kit/quality-engine` for programmatic access; `ak audit mutation` / `ak audit quality` for the CLI.

## Install paths

Two paths exist because Codex CLI doesn't ship a plugin marketplace yet ([config docs](https://github.com/openai/codex/blob/main/docs/config.md)). They're additive — pick either or both.

### Path A — Claude Code plugin

```bash
/plugin marketplace add webpresso/agent-kit
/plugin install agent-kit@webpresso
```

You get: hooks (PreToolUse, PostToolUse, Stop, SessionStart), the `ak` MCP server with seven tools (`ak_test`, `ak_e2e`, `ak_lint`, `ak_typecheck`, `ak_qa`, `ak_audit`, `ak_blueprint`), slash commands, and the skills catalog. Pin to release tags — `main` does not ship `dist/`. Hot-reload from source: see [CONTRIBUTING.md](./CONTRIBUTING.md#edge-local-plugin-link-hot-reload-hooks-from-source).

### Path B — npm + `ak setup`

```bash
pnpm add -D @webpresso/agent-kit
npx ak setup
```

Required for Codex CLI, OpenCode, Cursor, Gemini, and any IDE without a plugin marketplace. Same hooks, scaffolded into `.claude/settings.json` AND `.codex/hooks.json`. Library imports (`defineAgentKitConfig`, `createAkTestCommandConfig`) flow through this path too. See [`docs/getting-started.md`](./docs/getting-started.md) for the full setup matrix and [`docs/presets.md`](./docs/presets.md) for `--with` presets (`omx`, `gstack`, `context-mode`, `playwright-mcp`, `vision`, `lore-commits`, `rtk`, `base-kit`).

## IDE support matrix

| IDE | Skills surface | Setup path |
| --- | --- | --- |
| Claude Code | `.claude/skills/` | Path A (plugin marketplace) |
| Codex CLI | `.agents/skills/` + `.codex/hooks.json` | Path B (`ak setup`) |
| OpenCode | `.agents/skills/` + `.claude/skills/` | Path B (`ak setup`) |
| Cursor / Windsurf | `.cursor/skills/` / `.windsurf/skills/` | Path B (`ak setup`) |
| Gemini CLI | `.gemini/commands/*.toml` (TOML transform) | Path B (`ak setup`) |

## `ak` CLI reference

| Command | What it does |
| --- | --- |
| `ak setup` | Scaffold every IDE surface, install presets, idempotent |
| `ak setup --with <preset>` | Comma-separated presets: `omx`, `gstack`, `context-mode`, `playwright-mcp`, `lore-commits`, `vision`, `rtk`, `base-kit` |
| `ak sync` | Propagate canonical `.agent/` rules + skills to every IDE surface (`--check` for drift, no writes) |
| `ak blueprint new "<goal>" --complexity M` | Create a new blueprint under `blueprints/draft/` |
| `ak blueprint audit --all --strict` | Audit blueprint lifecycle states |
| `ak blueprint list` / `ak roadmap list` | List blueprints / parent roadmaps |
| `ak blueprint db build` | Cold-start rebuild of the SQLite projection from markdown |
| `ak blueprint db query <template>` | Run a pre-registered query (e.g. `next-ready-task`) |
| `ak blueprint db verify` | Check the SQLite DB matches markdown on disk |
| `ak blueprint db browse` | Open Datasette UI (requires `pip install datasette`) |
| `ak blueprint export --format spec-kit <slug>` | Export a blueprint to spec-kit 4-file format |
| `ak tech-debt new --severity <s> --category <c>` | Create a tech-debt record with lifecycle status |
| `ak tech-debt new --from-audit <audit-name>` | Auto-file audit findings as tech-debt items |
| `ak worktree new <branch>` | Create a git worktree and seed `.agent/` so AI agents have rules/skills/commands |
| `ak worktree list` / `ak worktree remove <branch-or-path>` | List or remove worktrees (resolves by branch, basename, or path) |
| `ak skill list` / `ak skill install <name>` | Browse and install catalog skills into the active IDE surfaces |
| `ak audit guardrails` | Composite audit (8 checks) — wired into pre-commit, CI, ship gate |
| `ak audit quality` | `guardrails` + Stryker mutation testing |
| `ak audit commit-message --require-lore` | Enforce Lore trailers on commit messages |
| `ak audit bundle-budget <dir> --max-js-asset-bytes 512000` | Vite bundle budget guard |
| `ak audit vision` | Enforce `VISION.md` structure (frontmatter, ≤100 lines, ≤1500 words, required sections) |
| `ak audit skill-sizes` | Check that skill files don't exceed size budget |
| `ak audit broken-refs` | Detect dead links and missing file references in agent surfaces |
| `ak audit memory-rotation` | Verify memory files are rotated per retention policy |
| `ak audit gitignore-agent-surfaces` | Check that generated IDE surfaces are gitignored |
| `ak audit memory-unified` | Unified memory consistency check across IDE surfaces |
| `ak audit compile-drift` | Detect drift between `.agent/` source and compiled IDE outputs |
| `ak skills orphans --fix` | List (and optionally remove) stale IDE skill outputs with no `.agent/` source |
| `ak compile` | Compile `.agent/` to all 6 IDE surfaces (wraps rulesync) |
| `ak test`, `ak e2e`, `ak lint`, `ak typecheck`, `ak format` | Portable command surface — same flags work in every consumer repo |
| `ak err <cmd>` | Run a command and print only failure-looking lines |
| `ak hooks doctor` | Verify hook bins are installed, executable, MCP reachable |
| `ak doctor` | Repo audit health check with remediation hints |
| `ak mcp` | Run the agent-kit MCP server over stdio |
| `ak docs lint <file>` | Lint a research or blueprint doc |

Run `ak <command> --help` for full flags.

## Blueprint structured store

`ak blueprint db` gives agents and humans a queryable SQLite view of all blueprints and tech-debt.

```bash
ak blueprint db build           # cold-start rebuild from markdown
ak blueprint db query next-ready-task   # what should I work on next?
ak blueprint db verify          # check DB matches markdown on disk
ak blueprint db browse          # open Datasette UI (requires pip install datasette)
```

Nine pre-registered query templates. See `docs/blueprint-db-cookbook.md`.

Mutation verbs:
```bash
ak blueprint task advance <slug> <task-id> --to in-progress
ak blueprint promote <slug> planned
ak blueprint finalize <slug>
ak blueprint export --format spec-kit <slug>   # export to github/spec-kit format
```

### Tech-debt lifecycle

```bash
ak tech-debt new --from-audit skill-sizes   # auto-file findings as h-NNN-*.md
ak tech-debt list
ak tech-debt review
```

## Skills catalog

18 curated skills live at [`catalog/agent/skills/`](./catalog/agent/skills/). They ship as `skills/<name>/SKILL.md` in the published package and become `/webpresso-agent-kit:<skill>` after plugin install.

`better-auth-best-practices` · `deep-research` · `frontend-design` · `hooks-doctor` · `logging-best-practices` · `lore-protocol` · `monorepo-navigation` · `plan-refine` · `pll` · `react-doctor` · `systematic-debugging` · `tanstack-query` · `tech-debt` · `test-driven-development` · `testing-philosophy` · `vercel-react-best-practices` · `verify` · `web-design-guidelines`

Opinionated baseline, not a registry. Extend with your own under `.agent/skills/` and they ride the same `ak sync` distribution.

## Non-goals

- **Running AI agents themselves** — that's Claude Code / Codex / Cursor / etc.
- **Repo-specific rule content** — consumers extend via local `.agent/`. The catalog is for the parts everyone needs.
- **Authoring prompts, system messages, or model selection.**
- **Application or runtime code** — agent-kit is dev-time scaffolding only.

## Design invariants

- **Zero `@webpresso/*` runtime or dev dependencies.** agent-kit is standalone — does not depend on the Webpresso monorepo.
- **The catalog is canonical.** Consumers run `ak setup` once, then own their copy. Edit the catalog → publish → consumers pull. Don't hand-edit generated `.cursor/`, `.gemini/`, `.codex/` files; `ak audit catalog-drift` will catch it.
- **Fail loudly, never silently degrade.** If a surface can't be wired, `ak setup` reports it.

## Status

**Experimental (v0.x).** Public API may change between minor versions. Pin to a release tag if you need stability. See [`docs/getting-started.md`](./docs/getting-started.md) for migration notes and [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the release process.

## Telemetry

`ak setup` can optionally collect anonymous wall-clock timing to help improve the
developer experience. No PII, no repo identifiers, no file paths are ever collected.

**Off by default** for third-party adopters. Opt in: `AK_TELEMETRY=1 npx ak setup`.
**Always on** for internal consumers (`AK_INTERNAL=1`).
**Always off**: `AK_TELEMETRY=0 npx ak setup`.

## License

MIT
