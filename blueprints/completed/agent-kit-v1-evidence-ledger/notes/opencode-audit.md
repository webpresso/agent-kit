# opencode integration audit (Task 0.10 output)

Generated: 2026-05-11
Auditor: /plan-refine + /plan-eng-review consolidated audit pass.

## What exists today

### Scaffolder: `init/scaffolders/opencode-plugin/index.ts`

Writes a single JavaScript plugin file at
`<repoRoot>/.opencode/plugins/agent-kit-dev-link.js`. The plugin:

- Listens on `session.created` and the experimental
  `experimental.session.compacting` event.
- Shells out to `ak-check-dev-link` (the same bin Claude Code and Codex
  run as a SessionStart hook).
- Emits dev-link breakage warnings to stderr (visible in the opencode
  TUI) and pushes the same message into `output.context` during
  compaction so it survives compacted sessions.

**This is a dev-link warning plugin only. It does NOT execute blueprint
tasks. It does NOT sync skills.**

### Symlinker: `src/symlinker/consumers.ts`

opencode is **explicitly excluded** from `DEFAULT_UNIFIED_CONSUMERS`.
The header comment claims:

> Primary IDEs (Claude Code, Cursor, Windsurf, OpenCode) are no longer
> handled by the symlinker — they distribute skills via native channels:
> ...
> OpenCode: falls back to Claude-local generated surfaces covered by the Claude Code
> plugin

`DEFAULT_UNIFIED_CONSUMERS` (line 146-175) covers:

- `.agent/{rules,skills}/` (working dir source-of-truth, symlinked)
- `.cursor/rules/` (copy, `.mdc` extension)
- `.windsurf/skills/` (copy)
- `.claude/rules/` (symlink, claude-rules)
- `.claude/skills/` (symlink, claude-skills)
- `.gemini/commands/` (generated separately by legacy `syncAll`, not unified sync)
- `.codex/agents/` (symlink, codex-rules + codex-skills)

No `.opencode/skills/`, no `~/.config/opencode/skills/`, no
`opencode-*` consumer entry.

## The unproven claim

The codebase's stated theory is: **opencode reads Claude-local generated
surfaces as a fall-back, so the existing Claude consumer entries cover
opencode automatically.**

Codex's outside-voice pass on 2026-05-11 flagged this as unverified:

> OpenCode support is probably thinner than the plan implies. Docs
> show plugins and tool hooks, plus permissions/subagents, but the
> repo's current OpenCode plugin only emits dev-link warnings and
> compaction context. That is not evidence that OpenCode can host
> equivalent blueprint execution semantics.

**The fall-back claim cannot be verified from the agent-kit codebase
alone.** It depends on opencode's current skill-discovery behavior.

## Delta for Task 1.8

Two paths forward, depending on what opencode actually does:

### Path A: opencode genuinely reads `.claude/skills/` as fall-back

If verified via opencode docs or behavior test, Task 1.8 is a **NO-OP**.
The current `claude-rules` and `claude-skills` consumer entries already
cover opencode users, transitively.

Acceptance: update the comment in `consumers.ts:10-13` from "falls back
to ... covered" to "verified to read ... covered" with a citation.

### Path B: opencode does NOT read `.claude/skills/` (or only does so
inconsistently across versions)

Task 1.8 adds two new entries to `DEFAULT_UNIFIED_CONSUMERS`:

```ts
{ id: 'opencode-rules', dir: '.opencode/skills', acceptsKind: 'rule', strategy: 'symlink' },
{ id: 'opencode-skills', dir: '.opencode/skills', acceptsKind: 'skill', strategy: 'symlink' },
```

(Or whatever the opencode-canonical path is — possibly
`~/.config/opencode/skills/` for user-global, possibly
`.opencode/skills/` for repo-local.)

Acceptance: `wp sync` writes opencode skills to the verified path;
existing Codex + Gemini sync regression-checked; the comment in
`consumers.ts` is updated to reflect the actual opencode integration
shape.

## Recommendation for Task 1.8 implementer

1. **Verify first.** Before writing code, read opencode's current docs
   on skill discovery (https://opencode.ai/docs/skills/ or successor).
   If unclear, write a small test that installs agent-kit skills to
   `.claude/skills/` only, then runs opencode in the test repo and
   checks whether the skills appear in opencode's `/skills` output
   (or whatever the discovery surface is).

2. **Pick the path** based on verification:
   - Verified fall-back works → Path A (no-op + doc update).
   - Fall-back doesn't work → Path B (add opencode consumers).

3. **Stay scoped to skill-sync only.** Per CEO plan + Blueprint, this
   task does NOT add an opencode Runner execution backend. That's
   tracked by `tech-debt/accepted/h-003-opencode-runner-execution
   -backend.md` and deferred to v1.x.

## Related

- Blueprint task: 1.8 (opencode skill-sync target).
- Blueprint task: 0.10 (this audit).
- Tech-debt: `h-003-opencode-runner-execution-backend.md` (the runner
  backend is a separate, deferred concern).
- Codex outside-voice flag: "OpenCode support is probably thinner
  than the plan implies."
