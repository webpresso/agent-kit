---
type: vision
last_updated: 2026-05-04
---

# agent-kit Vision

## The problem

Every repo that uses AI coding agents — Claude Code, Codex CLI, Gemini CLI,
OpenCode, Cursor, Windsurf — needs the same bootstrapped infrastructure:
operating contracts (`AGENTS.md`), scoped rules (`.claude/rules/`), lifecycle
hooks (`.claude/settings.json`, `.codex/hooks.json`), slash-command skills, and
quality gates. Today every team hand-crafts this from scratch, the surfaces drift
across tools and repos, and the knowledge of _what to configure and why_ lives
in tribal memory rather than code.

agent-kit's job: make `ak setup` the single command that provisions a fully
wired agentic workspace from a versioned, auditable catalog.

## North star

> **One command, fully wired.** `ak setup` turns a bare git checkout into a
> repo where every AI coding agent — regardless of IDE — has the context,
> hooks, and guardrails it needs to work correctly.

No tribal knowledge. No per-repo drift. No manual gitignore gymnastics. The
catalog is the single source of truth; `ak setup --overwrite` re-syncs on every
catalog release.

## What "fully wired" means in 2026

The AI coding agent ecosystem has matured to a point where every serious tool
supports a common set of surfaces. A fully wired repo has all of them:

### 1. Context loaded at session start (zero-config)

| Surface | Loaded by | How agent-kit provisions it |
|---|---|---|
| `AGENTS.md` | All tools (Claude Code, Codex, Gemini, OpenCode, Kiro, Zed…) | `scaffold-agents-md` renders from `catalog/AGENTS.md.tpl` |
| `.claude/rules/*.md` | Claude Code — unconditionally or path-scoped via `paths:` frontmatter | `scaffoldClaudeRules` creates symlinks → `.agent/rules/` |
| `.agent/rules/*.md` | Codex / Amp / OpenCode agents that scan `.agent/` | `scaffold-agent` copies from `catalog/agent/rules/` |
| `~/.claude/skills/gstack/CLAUDE.md` | Claude Code (global, all projects) | `ensureGstack` clone + `./setup --team` |

Rules use `paths:` frontmatter for path-scoped injection — e.g. the release
rule only loads when the agent touches `.changeset/` or `package.json`. This
keeps context lean.

### 2. Hooks wired and resilient

| Event | What fires | Provisions by |
|---|---|---|
| `SessionStart` | `ak-sessionstart-routing` + gstack soft-check | `scaffold-agent-hooks` + `symlinkDirectories: [".claude"]` for worktrees |
| `PreToolUse (Bash\|Write\|Edit)` | `ak-pretool-guard` — blueprint lifecycle, import policy | `scaffold-agent-hooks` |
| `PreToolUse (Skill)` | gstack availability check | `scaffold-agent-hooks` |
| `PostToolUse (Write\|Edit)` | `ak-post-tool` — lint after edit, docs drift detection | `scaffold-agent-hooks` |
| `UserPromptSubmit` | `ak-guard-switch` — mode/context guard | `scaffold-agent-hooks` |
| `Stop` | `ak-stop-qa` — QA on changed files | `scaffold-agent-hooks` |

All hook commands are resilient: `[ -x ".../bin" ] && ... || true` so they
exit 0 gracefully when `node_modules` hasn't been installed yet (new worktrees,
CI without cache).

**Worktree continuity:** `symlinkDirectories: [".claude"]` in
`settings.json` ensures new Claude Code worktrees inherit all hooks, rules, and
MCP config from the main checkout without a manual `ak setup` run.

### 3. Context protection via MCP

context-mode is the companion MCP layer. Its hooks intercept large tool
outputs, sandbox them into FTS5, and return only what fits in context.
The routing rule lives in `catalog/agent/rules/context-mode-routing.md` and
propagates to `.claude/rules/` automatically via `ak setup`. On Claude Code
it's additionally distributed as a plugin (marketplace install, no project
config needed).

### 4. Skills and subagents in catalog

Skills (`catalog/agent/skills/`) are distributed across all IDEs by the
symlinker and the Claude Code plugin. The tier model (always/tier2/tier3)
lets consumers get the core set without noise.

**Next frontier (not yet in catalog):** subagent definitions
(`.claude/agents/*.md`) with model selection, tool scoping, MCP server
restriction, and per-subagent hooks. These are the 2026 equivalent of skills
but with full isolated execution contexts. The catalog should grow to include
canonical subagents for: code review, documentation, security audit, database
migration, and parallel blueprint execution.

## The `ak setup` contract

`ak setup` is the canonical bootstrap command. It MUST:

1. **Always produce the same result from the same catalog version** — idempotent,
   no side effects beyond the repo directory.
2. **Fail loudly, never silently degrade** — if a surface can't be wired
   (missing runtime, bad gitignore), report it; don't paper over it.
3. **Work without the package installed** — consumers should be able to run
   `npx @webpresso/agent-kit setup` before adding it as a devDep.
4. **Update cleanly** — `ak setup --overwrite` re-runs from the latest catalog
   and is safe to run in CI on every install.

### What `ak setup` provisions today

```
AGENTS.md                    ← rendered from catalog/AGENTS.md.tpl
.agent/rules/*.md            ← copied from catalog/agent/rules/
.agent/guides/*.md           ← copied from catalog/agent/guides/
.agent/commands/*.md         ← copied from catalog/agent/commands/
.agent/skills/<tier1-2>/     ← copied from catalog/agent/skills/
.claude/rules/*.md           ← symlinks → .agent/rules/ (Claude Code auto-loads)
.claude/settings.json        ← hooks patched (ak-* + gstack, resilient)
.claude/hooks/*.sh           ← gstack check scripts
.codex/hooks.json            ← hooks patched (ak-* for Codex)
~/.claude/skills/gstack/     ← gstack global install (ensureGstack)
.codex/ OMX surfaces         ← omx setup --yes (ensureOmx)
```

### What `ak setup` should provision (gaps)

- `.claude/agents/` — subagent definitions catalog
- `pnpm add -D @webpresso/agent-kit` — auto-add devDep so re-runs work without npx
- `.github/workflows/agent-surfaces.yml` — CI check that `ak setup --dry-run`
  exits 0 (catalog drift detection)
- `@webpresso/agent-kit` as a `prepare` script hook so `pnpm install` re-syncs
  agent surfaces automatically

## Design principles

### Catalog is law, repos are consumers

Rules, guides, commands, skills, and the AGENTS.md template all live in the
catalog. Repos are consumers. Editing `.agent/` directly in a consumer repo is
the wrong abstraction — edit the catalog, publish, run `ak setup --overwrite`.
The `ak audit catalog-drift` command detects consumer drift and fails CI.

### Surfaces load at the right time

- **Unconditional** (AGENTS.md, `.claude/rules/` without `paths:`): operating
  contract and cross-cutting rules — always relevant.
- **Path-scoped** (`.claude/rules/` with `paths:`): technology-specific rules
  load only when the agent touches matching files. Keeps context lean for repos
  that don't use every feature.
- **On-demand** (skills): loaded when invoked. Full content injected once and
  stays for the session. Heavy skills shouldn't be preloaded.
- **Hooks**: triggered by tool use. Must be sub-100ms for `PreToolUse` or they
  degrade the interaction loop.

### Enforce at the right boundary

From softest to hardest:

1. **Catalog rules** — instructions loaded into context. Agent _should_ follow them.
2. **Hooks** — programmatic enforcement at tool-use time. Agent _must_ comply or the
   action is blocked/redirected.
3. **CI gates** — `ak audit` commands in CI. Catches drift that hooks can't
   (e.g. committed generated files, wrong gitignore patterns).
4. **Linter plugins** — AST-level enforcement baked into the lint pass. The
   hardest gate; no escape hatch.

Use the softest boundary that is sufficient. Only escalate when a softer
boundary has been violated repeatedly in practice.

### Multi-IDE distribution must be zero-maintenance

Adding a new rule to the catalog should propagate to Claude Code (via
`.claude/rules/` symlinks), Codex (via `.agent/rules/` copy), Gemini (via
`.gemini/commands/` TOML), and future IDEs — without touching any per-repo
config. The symlinker + catalog copy pattern achieves this. New tools should
be added by extending `consumers.ts` or `scaffoldClaudeRules`, not by
hand-editing consumer repos.

## Success metrics

- `ak setup` on a bare repo → all agent surfaces wired, exit 0, no manual steps.
- `ak setup --overwrite` on an existing repo → clean re-sync, no data loss.
- `ak audit catalog-drift` → zero drift in consumers on main.
- Context-mode routing rule loads in every Claude Code session without a hook.
- New worktrees inherit all hooks and rules via `symlinkDirectories`.
- Any new webpresso public package gets full agent surfaces by adding
  `@webpresso/agent-kit` as a devDep and running `ak setup`.
