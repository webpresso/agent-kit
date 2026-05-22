---
type: vision
last_updated: 2026-05-15
---

# agent-kit Vision

The AI development toolkit that scaffolds consistent agent context, quality gates, and blueprint workflows across every IDE and coding agent in a repo.

## The problem

Every AI coding agent (Claude Code, Codex, OpenCode, Gemini, Cursor, Windsurf) builds its own isolated understanding of a codebase. Rules, skills, hooks, and quality checks are duplicated across `.claude/`, `.codex/`, `.cursor/`, `.gemini/`, and `.windsurf/` directories. Teams waste effort maintaining parallel configs, and agents give inconsistent answers because they don't share the same context.

## North star

> **One repo, one truth, every agent.**

Success means a developer runs `wp setup` once and every AI coding agent in the repo gets the same rules, skills, hooks, quality gates, and blueprint workflows — with no manual duplication.

## Boundaries

**In scope**

- `wp` CLI — setup, sync, audit, blueprint, and quality commands
- Skill catalog — reusable AI coding patterns (TanStack Query, React Doctor, frontend design, etc.)
- Preset system — scaffolder integrations for context-mode, gstack, omx, rtk, vision
- Blueprint MCP — SQLite-backed structured planning surface with evidence contracts
- Hook generation — additive, idempotent wiring for Claude Code, Codex, and OpenCode
- Symlinker / compile — propagate canonical `.agent/` content to every IDE surface
- Quality engine — package-aware test, lint, typecheck, and E2E routing

**Out of scope**

- `gstack`, `context-mode`, `omx`, `rtk`, `vision` — peer tools with their own repos; agent-kit scaffolds their integration but doesn't own their internals
- The Webpresso monorepo — a consumer of agent-kit, not part of it
- AI model selection or prompt engineering — agent-kit provides the scaffolding, not the prompts

## Design principles

- **Catalog-first** — all rules, skills, and hooks live in a single source catalog; IDE surfaces are generated, never hand-edited
- **Additive and idempotent** — every scaffolder operation is safe to re-run; it merges, never overwrites unrelated content
- **Agent-agnostic** — the same `.agent/` source truth propagates to Claude Code, Codex, OpenCode, Gemini, Cursor, and Windsurf
- **Evidence-contract blueprints** — planning tasks can't be marked done without proof (test pass, audit clean, manual verification)
- **Zero local state** — agent surfaces are regenerated from the catalog on every `wp setup`; nothing is tracked in git that can drift
