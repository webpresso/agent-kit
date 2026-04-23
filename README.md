# @webpresso/agent-kit

Toolkit for agent-driven development. Ships:

- **Blueprint runtime** — Markdown-based implementation-plan format with
  lifecycle states, parser, validator, DAG executor, and lifecycle engine.
- **Symlinker** — keeps each IDE's native command/skill surface in sync
  with a canonical `.agent/` source of truth. Ships defaults for Claude
  Code, Cursor, Windsurf, OpenCode, Codex CLI, and Amp (Sourcegraph),
  plus Gemini CLI via TOML transform. Skills converge on two surfaces:
  `.claude/skills` (Claude + OpenCode-fallback) and `.agents/skills/`
  (Codex + Amp + OpenCode-fallback).
- **Skills catalog** — a curated set of generalized slash-commands, skills,
  workflows, rules, guides, and doc templates that any repo can adopt.
- **Vite guardrails** — reusable bundle-budget analysis and a tiny
  `vite:preloadError` recovery helper for Vite-built clients.
- **`ak` CLI** — umbrella command that drives everything:

```bash
ak blueprint new "<goal>" --complexity M
ak blueprint audit --all --strict
ak symlink sync
ak init --with monorepo-navigation,tanstack-query
ak audit tph
ak audit bundle-budget apps/client/dist --max-js-asset-bytes 512000
ak skills list
ak docs lint docs/research/my-doc.md
```

## Install

```bash
pnpm add -D @webpresso/agent-kit
npx ak init
```

## Status

**Experimental (v0.x).** Public API may change. See
[docs/getting-started.md](./docs/getting-started.md) and the root plan in
the webpresso repo's `blueprints/planned/adopt-webpresso-agent-kit/` for
context.

## Design invariants

- **Zero `@webpresso/*` runtime or dev dependencies.** The package ships
  self-contained so it's cheap to extract to its own GitHub repo later
  without rewrites.
- **Catalog content is canonical once shipped.** Consumers run `ak init`
  once, then own their copy. `ak skills refresh` can re-pull upstream
  content in a future version.

## License

MIT

## Vite guardrails

Agent Kit exposes the reusable parts of Vite client-performance guardrails while
leaving app-specific routing decisions in each consuming app:

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

The analyzer checks generated asset sizes and HTML-eager JavaScript references.
It intentionally does not inspect route names or generated chunk filename
prefixes.
