---
type: vision
last_updated: 2026-05-11
---

# agent-kit Vision

## The problem

Every repo using AI coding agents — Claude Code, Codex, Gemini, OpenCode,
Cursor, Windsurf — needs the same scaffolding: `AGENTS.md` operating
contracts, scoped rules, lifecycle hooks, slash-command skills, quality
gates. Today each team hand-crafts this from scratch, surfaces drift
across tools and repos, and the knowledge of *what to configure and why*
lives in tribal memory rather than code.

## North star

> **One command, fully wired.** `ak setup` turns a bare git checkout into
> a repo where every AI coding agent — regardless of IDE — has the
> context, hooks, and guardrails it needs to work correctly.

No tribal knowledge. No per-repo drift. The catalog is the single source
of truth; `ak setup --overwrite` re-syncs on every catalog release.

The `ak_*` MCP tools are now summary-first and context-friendly: structured
results are canonical, while raw logs are clipped and secondary.

What "fully wired" means here: when MCP is ready, deny reasons lead with a
literal `mcp__agent-kit__ak_*` tool name; context-mode owns its own `ctx_*`
nudging when installed; and `.omx` remains runtime/state rather than a direct
hook surface.

Current documented-vs-measured hook support lives in
[`/Users/ozby/repos/webpresso/agent-kit/docs/hook-matrix.md`](/Users/ozby/repos/webpresso/agent-kit/docs/hook-matrix.md).
In particular, agent-kit currently claims Codex `Edit|Write` hook coverage, not
full Claude-style `MultiEdit` parity.

## Boundaries

**In scope**

- The versioned catalog: `AGENTS.md` template, rules, guides, commands,
  skills, hooks. Distribution to per-IDE surfaces (`.claude/`, `.codex/`,
  `.gemini/`, `.cursor/`, `.windsurf/`).
- `ak setup` (scaffold) and `ak audit` (enforcement).
- Quality gates: blueprint lifecycle, catalog drift, docs frontmatter,
  bundle budget, vision, commit message, no-relative-parent-imports.
- Multi-IDE symlinker: edit canonical `.agent/` once, sync everywhere.

**Out of scope**

- Running AI agents themselves (that's Claude Code / Codex / etc.).
- Repo-specific rule content (consumers extend via local `.agent/`).
- Authoring prompts, system messages, or model selection.
- Application or runtime code.

## Design principles

- **Catalog is law, repos are consumers.** Edit the catalog and publish;
  don't hand-edit `.agent/` in consumers. `ak audit catalog-drift` is
  the gate.
- **Surfaces load at the right time.** Unconditional rules for operating
  contract; path-scoped for technology-specific; on-demand for heavy
  skills; hooks (sub-100ms) for tool-time enforcement.
- **Softest sufficient boundary.** Catalog rules → hooks → CI gates →
  linter plugins. Escalate only when a softer layer has been violated in
  practice.
- **Multi-IDE distribution is zero-maintenance.** Adding a rule must
  propagate to every IDE surface without per-repo edits.
- **Fail loudly, never silently degrade.** If a surface can't be wired,
  report it; don't paper over.

## Anti-patterns

- Do **not** use `prepare: ak setup` to keep agent surfaces current. It fires
  too early in install flows and creates bootstrap failures that look like
  environment bugs instead of setup-order bugs.
- Do **not** hand-edit generated `.claude/` or `.codex/` hook surfaces when
  the catalog/scaffolder is the source of truth.
- Do **not** assume worktree-local `.claude/` isolation when
  `symlinkDirectories` is deliberately configured to inherit the main checkout's
  agent surface.

Worktree inheritance details live in [`/Users/ozby/repos/webpresso/agent-kit/docs/worktrees.md`](/Users/ozby/repos/webpresso/agent-kit/docs/worktrees.md).
