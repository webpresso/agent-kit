---
type: tech-debt
status: accepted
severity: medium
category: dependency
review_cadence: monthly
last_reviewed: "2026-05-11"
created: "2026-05-11"
linked_blueprints: ["agent-kit-v1-evidence-ledger"]
affected_modules: ["src/runners", "src/cli/commands/init/scaffolders/opencode-plugin"]
---

# opencode Runner execution backend

## Context

v1.0 alpha ships opencode as a **skill-sync target only**, not a
Runner execution backend. Today the agent-kit-opencode integration is:

- `src/cli/commands/init/scaffolders/opencode-plugin/index.ts` writes a
  thin `.opencode/plugins/agent-kit-dev-link.js` plugin that handles
  cross-runtime dev-link breakage warnings. It does NOT execute
  blueprint tasks.
- `src/symlinker/consumers.ts` excludes opencode from `DEFAULT_UNIFIED
_CONSUMERS` with a comment claiming "OpenCode: falls back to
  `.claude/skills/` covered by the Claude Code plugin." That fall-back
  may or may not work in practice (see Watch points).

Codex's outside-voice pass on 2026-05-11 flagged: "OpenCode support is
probably thinner than the plan implies. Docs show plugins and tool
hooks, plus permissions/subagents, but the repo's current OpenCode
plugin only emits dev-link warnings and compaction context. That is
not evidence that OpenCode can host equivalent blueprint execution
semantics."

## Why this is debt, not a feature

agent-kit's wedge is "blueprint as the unit of executable work across
AI coding CLIs." Today that wedge is two CLIs (Claude Code via
`claude-subagent`, Codex via `codex-exec`) plus a CLI-agnostic fallback
(`local-worktree`). opencode is named in the wedge marketing but does
not have a Runner backend.

Until opencode is a real Runner, users who choose opencode get the
same `local-worktree` behavior anyone gets — they don't benefit from
opencode-specific tool-use, tool wrappers, or compaction hooks.

## Watch points (review every cadence)

- **opencode docs on subagents and tool execution** at
  https://opencode.ai/docs/ — look for any "run task autonomously" API
  or programmatic Agent equivalent.
- **opencode plugin event surface** for new events that could host
  blueprint-task execution (e.g., a hypothetical `task.execute` event).
- **opencode-agent-skills evolution** at
  https://github.com/joshuadavidthomas/opencode-agent-skills — the
  upstream is moving the skill spec; watch for execution-mode skills.
- **Verify the fall-back claim** in `src/symlinker/consumers.ts`: does
  opencode actually read agent-kit skills from `.claude/skills/`, or
  is that aspirational? If aspirational, add opencode-canonical
  entries to `DEFAULT_UNIFIED_CONSUMERS`.

## Trigger

Resolve this item when **either** is true:

- opencode ships a documented "execute task autonomously" API or
  equivalent plugin event that can host the Runner contract from
  `src/runners/types.ts`.
- Cross-model agreement from a fresh codex-plan-review pass that
  the current opencode plugin surface is sufficient for Runner
  execution semantics (with concrete proof, not optimism).

## Action when triggered

1. Implement `src/runners/opencode/index.ts` against the new opencode
   API; tests mock at the opencode-plugin invocation boundary per the
   v1.0 testing convention.
2. Add `'opencode'` to the `RunnerId` enum in `src/blueprint/types/
execution-backend.ts` and to the migration schema.
3. Add an `opencode` entry to `selectRunner()` env-detection logic.
4. Add a Stryker exclusion if the integration test needs subprocess
   work, or keep mocked per the testing convention.
5. Move this file to `tech-debt/resolved/` with the implementing
   changeset link.

## Related

- Blueprint task: Task 1.8 (opencode skill-sync target, NOT runner).
- Audit note: `blueprints/planned/agent-kit-v1-evidence-ledger/notes/
opencode-audit.md` documents the current integration state.
- Outside-voice context: codex-plan-review 2026-05-11.
- Linked tech-debt: `h-006-public-distribution-flip-npm-marketplace.md`
  — broad adoption depends on opencode users having a real backend.
