# @webpresso/agent-kit

Toolkit for agent-driven development on the Webpresso stack. Ships a **Blueprint runtime** (Markdown-based implementation-plan format with lifecycle engine and DAG executor), a **Symlinker** that keeps each IDE's native command/skill surface in sync with a canonical `.agent/` source of truth, a curated **Skills catalog** of generalized slash-commands and workflows, a **Lore commit protocol** for tracing decisions to code, a **Tech-Debt lifecycle** manager, and the **`ak` CLI** that ties all of it together — one install, all IDEs covered.

## Install & Quickstart

> **Claude Code users:** run `/plugin marketplace add webpresso/agent-kit` — done, zero config.  
> **Codex CLI / Cursor / Windsurf users:** `pnpm add -D @webpresso/agent-kit && npx ak setup`

Agent-kit ships through **two coexisting distribution channels** — mirrors the [context-mode pattern](https://github.com/mksglu/context-mode). Choose either or both; they're additive and idempotent.

### Path A — Claude Code plugin (zero-config)

```bash
/plugin marketplace add webpresso/agent-kit
/plugin install agent-kit@webpresso
```

What you get: **hooks** (PreToolUse, PostToolUse, Stop, SessionStart), **`ak mcp` server** with 7 tools (`ak_test`, `ak_e2e`, `ak_lint`, `ak_typecheck`, `ak_qa`, `ak_audit`, `ak_blueprint`), **slash commands** (`/ak:test`, `/ak:qa`, `/ak:audit`, `/ak:blueprint`), and the **skill catalog**. Manifest at `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json`. Pin to release tags (`v<version>`) — `main` does not have `dist/` checked in; only release tags do (see [CONTRIBUTING.md](./CONTRIBUTING.md#releases)).

Long-running MCP tools are now **summary-first**: they return canonical `structuredContent`, keep JSON text `content` for compatibility, clip oversized `rawOutput`, and may include a `logPath` when overflow is persisted for later investigation.

**Plugin runtime contract:** the Claude Code plugin executes with **Bun** and currently points at bundled `src/*.ts` entrypoints from the published package. The tarball intentionally ships both `src/` and `dist/`; `dist/esm/*` is a library/build artifact, not the current plugin execution path.

**Plugin dev mode (working on agent-kit itself):** `pnpm dev:link` installs an `edge-local` symlink at `~/.claude/plugins/cache/agent-kit/agent-kit/edge-local` AND mirrors every top-level repo entry (e.g. `.claude-plugin/`, `src/`) into the plugin root as symlinks, so every hook + MCP invocation resolves into the live working tree. Edit `src/hooks/**` or `src/mcp/**` and the next call uses it. No build, no Changesets, no reinstall. Idempotent — re-run after any marketplace upgrade. See [CONTRIBUTING.md → Edge-local plugin link](./CONTRIBUTING.md#edge-local-plugin-link-hot-reload-hooks-from-source).

### Path B — npm + `ak setup` (Codex CLI, OpenCode, Cursor, Gemini, …)

```bash
pnpm add -D @webpresso/agent-kit
npx ak setup
```

What you get: the **same hooks**, idempotently scaffolded into `.claude/settings.json` AND `.codex/hooks.json` (both wrapped under the canonical `hooks` key per Codex docs — legacy flat-form entries are migrated automatically on the next `ak setup`), plus the per-IDE skill surfaces (`.agent/`, `.agents/skills/`, `.cursor/`, `.gemini/commands/` via TOML transform). Required for Codex CLI, OpenCode, Cursor, Gemini, and any non-Claude IDE — none of those have a Claude-Code-style `/plugin install` path. Library imports (e.g. `defineAgentKitConfig` from `@webpresso/agent-kit/e2e`) also flow through this path.

**Gstack auto-orchestration:** `ak setup` installs and keeps `~/.claude/skills/gstack/` current on every run (clone-if-missing, fast-forward pull + `./setup --team` otherwise). Set `AK_SKIP_GSTACK=1` to opt out — CI / sandboxed environments only.

### Why two paths

Codex CLI ([config docs](https://github.com/openai/codex/blob/main/docs/config.md)) ships MCP servers via `~/.codex/config.toml` and hooks via `~/.codex/hooks.json` but has no plugin marketplace as of 2026-04. The `ak setup` scaffolder is the canonical install path for Codex and any other IDE without a Claude-Code-style plugin marketplace. When Codex's plugin story matures, the two paths can converge — tracked at [`tech-debt/accepted/h-001-track-codex-cli-plugin-marketplace-maturity.md`](./tech-debt/accepted/h-001-track-codex-cli-plugin-marketplace-maturity.md).

## Claude Code Plugin

Agent Kit ships as a native Claude Code plugin. The skills appear as `/webpresso-agent-kit:<skill-name>` (or short-names like `/pll` once the plugin is registered).

**Runtime requirement:** Bun must be available on the machine that runs the Claude Code plugin, because the shipped manifest invokes hook and MCP entrypoints through `bun ${CLAUDE_PLUGIN_ROOT}/src/...`.

**Per-session setup (works today):**

```bash
claude --plugin-dir ./node_modules/@webpresso/agent-kit
```

**Persistent setup (one-time, survives restarts):**

```bash
# The .claude-plugin/marketplace.json in the package makes this work
claude plugin marketplace add ./node_modules/@webpresso/agent-kit --scope local
claude install-plugin @agent-kit@local
```

> Verified working 2026-04-25 — `claude install-plugin @agent-kit@local` succeeds on a machine with agent-kit consumed via `git+ssh://git@github.com/webpresso/agent-kit.git#main`. Skills persist across restarts.

The plugin manifest lives at `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json`. Skills are generated into `skills/<name>/SKILL.md` at build time from `catalog/agent/skills/`.

## Codex CLI

Codex CLI doesn't have a plugin marketplace — `~/.codex/config.toml` registers MCP servers and `~/.codex/hooks.json` registers hooks, both via direct file edits ([config reference](https://developers.openai.com/codex/config-reference)). Path B above (`pnpm add -D @webpresso/agent-kit && npx ak setup`) is the canonical install for Codex.

What `ak setup` does for Codex:
- Skills: per-skill symlinks under `.agents/skills/` → `../../.agent/skills/<name>` (project-local, OpenAI/Amp/OpenCode convergent path).
- Hooks: idempotent patch of `.codex/hooks.json` adding `ak-pretool-guard`, `ak-post-tool`, `ak-stop-qa`, `ak-sessionstart-routing` entries (additive — won't clobber existing user hooks).
- MCP servers: register `agent-kit` manually once, and let the `omx` or `playwright-mcp` preset persist Playwright's MCP server in `$CODEX_HOME/config.toml` (or `~/.codex/config.toml`):

  ```toml
  [mcp_servers.agent-kit]
  command = "npx"
  args = ["@webpresso/agent-kit", "mcp"]

  [mcp_servers.playwright]
  command = "npx"
  args = ["-y", "@playwright/mcp@latest", "--caps=testing,storage,network,devtools"]
  enabled = true
  startup_timeout_sec = 30
  ```

  `ak setup` installs/refreshes OMX and gstack by default, then writes only the owned Playwright block while preserving unrelated Codex config. Codex and OMX share the same persistent browser-testing MCP entry.

Convergence with Claude Code's plugin path is tracked at [`tech-debt/accepted/h-001-track-codex-cli-plugin-marketplace-maturity.md`](./tech-debt/accepted/h-001-track-codex-cli-plugin-marketplace-maturity.md) — when Codex ships a plugin marketplace, this section folds into the Path A flow.

## OpenCode

OpenCode reads skills from `.agents/skills/` (convergent) and `.claude/skills/` (fallback). Both are covered by `ak setup`:
- `.agents/skills/<name>/` → symlinked to `.agent/skills/<name>/`
- `.claude/skills/<name>/` → symlinked to `.agent/skills/<name>/`

No plugin install or marketplace registration needed.

## IDE Support Matrix

| IDE | Skills path | Plugin manifest | Setup needed |
|-----|-------------|----------------|--------------|
| Claude Code | `.claude/skills/` | `.claude-plugin/plugin.json` + `marketplace.json` | `claude plugin marketplace add` + `install-plugin` |
| Codex CLI | `.agents/skills/` | none (no marketplace) — `.codex/hooks.json` patched by `ak setup` | `ak setup` (Path B); add `agent-kit` MCP once; use `--with playwright-mcp` or `--with omx` for Playwright MCP |
| OpenCode | `.agents/skills/` + `.claude/skills/` (fallback) | none | `ak symlink sync` (done) |
| Cursor / Windsurf | `.cursor/skills/` / `.windsurf/skills/` | localskills.sh distribution | via `ak setup` scaffolder |
| Gemini CLI | `.gemini/commands/*.toml` (transformed from `.agent/`) | none | `ak symlink sync` (done) |

## `ak` CLI Reference

| Command | Description |
|---------|-------------|
| `ak blueprint new "<goal>" --complexity M` | Create a new blueprint with goal and complexity |
| `ak blueprint new "<goal>" --complexity M --type parent-roadmap` | Create a parent roadmap stub for grouping child blueprints |
| `ak blueprint audit --all --strict` | Audit all blueprints for structural issues |
| `ak blueprint list` | List blueprints by status |
| `ak roadmap list` / `ak roadmap show <slug>` | Inspect first-class parent roadmaps and their child lanes |
| `ak symlink sync` | Sync skill surfaces across all configured IDEs (fans out AGENTS.md + mcp.json) |
| `ak symlink import --from .cursorrules` | Import existing IDE rules into canonical `.agent/` |
| `ak setup --with monorepo-navigation,tanstack-query` | Scaffold agent surfaces and install named Tier-3 skills |
| `ak setup` | Scaffold agent surfaces, install default external tooling presets (`omx`, `gstack`), and persist Playwright MCP for Codex/OMX |
| `ak setup --with playwright-mcp` | Explicitly request the Playwright MCP Codex-config write; normally covered by default `omx` setup |
| `ak doctor` | Run repo audit health checks with remediation hints; keep hook/plugin health under `ak hooks doctor` |
| `ak skills list` | List available skills in the catalog |
| `ak skills install <name>` | Install a named skill into the active IDE surfaces |
| `ak audit tph` | Run tech-debt phase health audit |
| `ak audit vision` | Enforce VISION.md exists at root with required structure (frontmatter, ≤100 lines, ≤1500 words, required sections) |
| `ak audit roadmap-links` | Check bidirectional parent-roadmap ↔ child blueprint links; use `--strict` to fail unresolved/orphan parent references |
| `ak audit guardrails` | Composite of every repo-level audit (catalog-drift, blueprint-lifecycle, roadmap-links, docs-frontmatter, vision, tech-debt, no-relative-parent-imports, bucket-boundary). Wired into the scaffolded pre-commit hook and CI workflow — adding a repo audit to `REPO_AUDIT_REGISTRY` in `src/cli/commands/audit.ts` propagates to all three (standalone CLI, composite, ship gate). |
| `ak audit mutation` | Run Stryker mutation testing; fails CI on threshold misses |
| `ak audit quality` | Full ship gate: mutation + guardrails composite. (bundle-budget and commit-message take caller-supplied paths — run separately.) |
| `ak audit bundle-budget apps/client/dist --max-js-asset-bytes 512000` | Check Vite bundle against budget |
| `ak audit no-relative-parent-imports` | Enforce `#alias` imports — fail if any `../` parent imports exist in `src/` (also runs as part of `guardrails`) |
| `ak hooks doctor` | Verify plugin hook health: bins exist, executable, respond to stdin, MCP reachable |
| `ak docs lint docs/research/my-doc.md` | Lint a research or blueprint doc |

## Distribution

| IDE / Runtime | How skills reach it | Command surface |
|---------------|--------------------|--------------------|
| Claude Code | Native plugin (`--plugin-dir` or marketplace) | `/webpresso-agent-kit:<skill>` |
| Cursor / Windsurf | `ak setup` → `localskills.sh` | `.cursor/skills/` / `.windsurf/skills/` |
| Codex CLI / Amp | `ak symlink sync` → Symlinker | `.agents/skills/` |
| Gemini CLI | `ak symlink sync` → Symlinker + TOML transform | `.gemini/skills/` |

## Skills Catalog

Catalog lives at `catalog/agent/skills/`. Each skill ships as `skills/<name>/SKILL.md` in the published package (generated at build time).

Current skills: `better-auth-best-practices`, `deep-research`, `frontend-design`, `plan-refine`, `pll`, `react-doctor`, `systematic-debugging`, `tanstack-query`, `test-driven-development`, `testing-philosophy`, `vercel-react-best-practices`, `verify`, `web-design-guidelines`.

Skills are namespaced after plugin install: `/webpresso-agent-kit:plan-refine`, `/webpresso-agent-kit:verify`, etc.

For detailed skill docs, see [`catalog/agent/skills/`](./catalog/agent/skills/).
For blueprint format spec, see [`docs/`](./docs/).

## Parent roadmaps vs blueprints

Use `type: parent-roadmap` when the file is a strategic queue that groups child
blueprints. Use `type: blueprint` for executable tactical work with concrete
tasks and verification gates.

`ak blueprint list` renders roadmaps first as `ROADMAP` rows, with child
blueprints indented as `CHILD` rows and unlinked work under `ORPHANS`. `/pll`
uses that shape to choose the next planned child of an active roadmap before
falling back to orphan blueprints.

```bash
ak blueprint new "Q2 platform roadmap" --complexity M --type parent-roadmap
ak roadmap list
ak audit roadmap-links
```

## Design Invariants

- **Zero `@webpresso/*` runtime or dev dependencies.** Ships self-contained from its own public Git repo without depending on the Webpresso monorepo.
- **Catalog content is canonical once shipped.** Consumers run `ak setup` once, then own their copy. Additional skills are installed explicitly with `ak skills install <name>`; no implicit upstream refresh.

## Status

**Experimental (v0.x).** Public API may change. See [docs/getting-started.md](./docs/getting-started.md) for setup and migration notes.

## Vite Guardrails

```ts
import { installChunkLoadRecovery } from "@webpresso/agent-kit/vite";
installChunkLoadRecovery();
```

```bash
ak audit bundle-budget apps/client/dist \
  --max-js-asset-bytes 512000 \
  --max-html-eager-js-asset-bytes 262144 \
  --max-html-eager-js-total-bytes 393216
```

## Portable Test & E2E Surfaces

```ts
import { createAkTestCommandConfig } from "@webpresso/agent-kit/test";
import {
  createCommandE2eHostAdapter,
  defineAgentKitConfig,
  planE2eRun,
} from "@webpresso/agent-kit/e2e";
```

```bash
ak test --package cli2
ak test --file apps/cli2/src/commands/target.test.ts
ak e2e --suite smoke --config playwright.config.ts
ak audit tph-e2e
```

MCP surface split:

- `ak_test` — generic test execution by explicit `packages` or `files`
- `ak_e2e` — suite-aware / host-adapter-aware E2E execution
- `ak_audit(kind=\"tph-e2e\")` — E2E testing-philosophy audit only

For long-running MCP calls, expect a compact `summary` first, structured `details` second, and bounded `rawOutput` only when needed.

## License

MIT
