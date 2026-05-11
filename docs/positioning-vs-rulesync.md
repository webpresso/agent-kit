---
type: guide
last_updated: '2026-05-11'
---

# agent-kit vs rulesync — positioning guide

agent-kit and rulesync are complementary, not competing. Understanding what each
tool owns prevents confusion and guides where to file issues or contribute.

## What rulesync does

[rulesync](https://github.com/dyoshikawa/rulesync) is a file-emission CLI: you
write rules once in a canonical format and rulesync generates the runtime-specific
files for 17 targets (Claude Code, Codex CLI, Cursor, Windsurf, Gemini, Copilot,
OpenCode, and more). It has ~175k weekly downloads, is MIT-licensed, and is
maintained actively as a standalone tool.

Core capabilities:

- **Emit to 17 runtimes** — single source, deterministic output per target.
- **Watch mode** — `rulesync watch` regenerates on source change.
- **Format adapters** — handles TOML (Gemini), JSON (`.claude/`), Markdown (Cursor).
- **Validation** — warns on unknown frontmatter keys and unsupported targets.

rulesync is laser-focused on file emission. It does not track lifecycle, audit
drift beyond its own output files, or integrate with CI in an opinionated way.

## What agent-kit adds on top

agent-kit uses rulesync as its emission substrate (`ak compile` calls
`rulesync generate` internally). Everything else agent-kit ships is outside
rulesync's scope:

**1. AGENTS.md section-keyed merger**
rulesync emits discrete files. When multiple `.agent/skills/` contribute to a
single `AGENTS.md`, agent-kit merges them using section-keyed precedence (local
overrides catalog, catalog overrides base). rulesync has no merger concept.

**2. Blueprint lifecycle**
`ak blueprint new` writes a markdown plan to `blueprints/in-progress/`. CI gates
on `ak audit blueprint-lifecycle` so plans can't silently rot in `draft/` or stay
marked `in-progress` after the work ships. rulesync has no lifecycle concept.

**3. Drift detection beyond emission**
`ak audit broken-refs` walks every `@AGENTS.md` and `@RULES.md` cross-reference
in the compiled output and flags dangling pointers. `ak audit skill-sizes` checks
that no skill file exceeds the IDE-specific byte budget (Codex: 8KB, Claude: 32KB).
rulesync validates its own sources but does not audit the compiled output for
semantic correctness.

**4. Tech-debt lifecycle**
`ak tech-debt new --from-audit skill-sizes` auto-creates a `tech-debt/needs-remediation/`
record from a failing audit. Items have status (`accepted` / `needs-remediation` /
`monitoring` / `resolved`) and a review cadence. rulesync has no tech-debt concept.

**5. Structured MCP tools**
The agent-kit MCP server exposes `ak_audit`, `ak_blueprint`, `ak_test`, and four
other tools so an AI coding agent can invoke quality gates mid-session without
leaving the IDE. rulesync ships no MCP surface.

**6. GitHub Action**
`webpresso/agent-kit/actions/audit` runs the full guardrails suite in CI and posts
structured PR comments on failures. rulesync has no GitHub Action.

## Worked example: catching a dangling cross-reference

**Without agent-kit (rulesync alone):**

A skill file at `.agent/skills/auth-patterns/SKILL.md` contains:

```markdown
See also: @AGENTS.md#session-management
```

The developer renames the heading to `## Session Lifecycle` in `AGENTS.md`.
rulesync regenerates all output files successfully — it emits what it's told.
The dangling `@AGENTS.md#session-management` reference ships silently. The AI
agent following the skill now hits a broken cross-reference and either hallucinates
the missing section or skips the guidance entirely.

**With agent-kit:**

```bash
ak audit broken-refs
# FAIL  .agent/skills/auth-patterns/SKILL.md
#   line 3: @AGENTS.md#session-management — heading not found in AGENTS.md
#   nearest: #session-lifecycle (edit distance 2)
# Exit 1
```

The pre-commit hook catches this before the branch merges. The developer updates
the cross-reference in the canonical source, re-runs `ak compile`, and the output
is consistent.

## Second example: over-budget skill caught before Codex rejects it

Codex CLI truncates skill files above 8KB. A developer adds an extended worked
example to a skill, pushing it to 9.2KB.

**Without agent-kit:** The file emits fine via rulesync. Codex silently truncates
it at 8KB. The last 1.2KB of guidance — including the critical error-handling
section — is never seen by Codex.

**With agent-kit:**

```bash
ak audit skill-sizes
# WARN  .agent/skills/auth-patterns/SKILL.md
#   compiled size: 9.2KB (Codex budget: 8KB, overage: 1.2KB)
#   suggestion: split into auth-patterns/core + auth-patterns/examples
# Exit 1 (--strict) or 0 with warning (default)
```

The CI check fails; the developer splits the skill before merge.

## Summary

Use rulesync for what it does best: deterministic file emission to 17 runtimes.
Use agent-kit when you need the integration layer on top: blueprint lifecycle,
drift audits, tech-debt management, MCP tools, and CI guardrails.

Both tools work together; agent-kit does not replace rulesync and does not fork it.
