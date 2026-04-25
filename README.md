# @webpresso/agent-kit

Toolkit for agent-driven development on the Webpresso stack. Ships a **Blueprint runtime** (Markdown-based implementation-plan format with lifecycle engine and DAG executor), a **Symlinker** that keeps each IDE's native command/skill surface in sync with a canonical `.agent/` source of truth, a curated **Skills catalog** of generalized slash-commands and workflows, a **Lore commit protocol** for tracing decisions to code, a **Tech-Debt lifecycle** manager, and the **`ak` CLI** that ties all of it together — one install, all IDEs covered.

## Install & Quickstart

```bash
pnpm add -D @webpresso/agent-kit
npx ak setup
```

`ak setup` scaffolds `.agent/`, `.claude/`, and `.agents/` surfaces and installs the skill catalog into your IDE's native skill directory.

## Claude Code Plugin

Agent Kit ships as a native Claude Code plugin. The skills appear namespaced as `/webpresso-agent-kit:<skill-name>` in any Claude Code session.

**Local dev (confirmed):**

```bash
claude --plugin-dir ./node_modules/@webpresso/agent-kit
```

**Marketplace install** (once the Webpresso marketplace is live):

```
/plugin install webpresso-agent-kit@webpresso
```

> **Note:** `claude install-plugin @webpresso/agent-kit` is not in the official Claude Code CLI reference. Use `--plugin-dir` for local dev. Marketplace-based install is the supported remote path.

The plugin manifest lives at `.claude-plugin/plugin.json`. Skills are generated into `skills/<name>/SKILL.md` at build time from `catalog/agent/skills/`.

## `ak` CLI Reference

| Command | Description |
|---------|-------------|
| `ak blueprint new "<goal>" --complexity M` | Create a new blueprint with goal and complexity |
| `ak blueprint audit --all --strict` | Audit all blueprints for structural issues |
| `ak blueprint list` | List blueprints by status |
| `ak symlink sync` | Sync skill surfaces across all configured IDEs |
| `ak setup --with monorepo-navigation,tanstack-query` | Scaffold agent surfaces and install named skills |
| `ak skills list` | List available skills in the catalog |
| `ak skills install <name>` | Install a named skill into the active IDE surfaces |
| `ak audit tph` | Run tech-debt phase health audit |
| `ak audit bundle-budget apps/client/dist --max-js-asset-bytes 512000` | Check Vite bundle against budget |
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
```

## License

MIT
