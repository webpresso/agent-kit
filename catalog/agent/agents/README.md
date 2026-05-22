---
type: core
last_updated: 2026-05-05
---

# Canonical Subagents

These markdown files are the canonical Claude subagent definitions shipped by
agent-kit. `wp setup` distributes them to `.claude/agents/`.

## Included Agents

- `code-reviewer.md` — review changed code for regressions, missing tests, and maintainability risks
- `security-auditor.md` — inspect trust boundaries, secrets handling, and auth-sensitive changes
- `doc-writer.md` — update public docs, migration notes, and operational guidance
- `explorer.md` — map the repo quickly before implementation or deeper review

## Usage

- Run `wp setup` to sync the canonical agents into `.claude/agents/`.
- Keep custom consumer agents under `.claude/agents/*.md`; the scaffolder preserves them.
- If a canonical agent drifts, re-run `wp setup` or `wp audit agents`.
