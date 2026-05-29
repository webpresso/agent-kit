---
type: blueprint
title: RTK inside ctx_execute — recover shell filtering in sandboxed commands
status: completed
complexity: S
owner: agent-kit
historical_verification_gap_waiver: true
historical_verification_gap_rationale: Historical completed/parked record predates the durable per-task verification convention; retain lifecycle truth without fabricating retroactive evidence.
created: '2026-05-13'
last_updated: '2026-05-29'
progress: '100% (1 of 1 tasks completed)'
depends_on: []
tags:
  - hooks
  - routing
  - rtk
  - context-mode
---

# RTK inside ctx_execute — recover shell filtering in sandboxed commands

## Product wedge anchor

- **Stage outcome:** Every `ctx_execute(shell, ...)` call in webpresso sessions gets RTK's per-command output filtering, recovering token savings that were silently lost when context-mode's hook intercepted Bash calls.
- **Consuming surface:** `~/.claude/plugins/cache/context-mode/.../hooks/core/routing.mjs` — fires on every `ctx_execute` tool call with `language: "shell"`.
- **New user-visible capability:** After this lands, `rtk gain --history` shows token savings from sandboxed shell commands (git, gh, find, grep, etc.) that previously bypassed RTK entirely.

## Problem Statement

Three hooks fire on every Bash tool call in Claude Code with both context-mode and agent-kit installed:

1. `rtk hook claude` (user settings, Bash matcher) — rewrites `Bash(cmd)` → `Bash(rtk cmd)` via `updatedInput`
2. `context-mode pretooluse.mjs` (plugin layer) — calls `core/routing.mjs:routePreToolUse()`, which for commands like `git log`, `git diff`, `find`, `grep` (SANDBOX_PREFIXES in agent-kit's dev-routing) emits a guidance nudge and lets them through — but **the agent then calls** `ctx_execute("shell", "git log")` directly
3. `ak-pretool-guard` (project settings, Bash|Write|Edit matcher) — validator only, no rewrite

When the agent calls `ctx_execute("shell", "git log -50")`, RTK's Bash PreToolUse hook no longer fires — its matcher is `Bash`, not `ctx_execute`. RTK's per-command output filtering (token savings of 60-90% on git/gh output) is silently bypassed.

## Architecture Overview

```text
Before fix:
  Bash("git log -50")
    → rtk hook → Bash("rtk git log -50")   ← RTK filters output ✓
  ctx_execute("shell", "git log -50")
    → routing.mjs ctx_execute block → return null (passthrough) ← RTK bypassed ✗

After fix:
  ctx_execute("shell", "git log -50")
    → routing.mjs ctx_execute block
    → wrapWithRtk("git log -50") → "rtk git log -50"
    → return { action: "modify", updatedInput: { ...input, code: "rtk git log -50" } }
    → context-mode executes "rtk git log -50" ← RTK filters output ✓
```

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Implementation location | `context-mode/hooks/core/routing.mjs` | The rewrite must happen before context-mode executes the shell command; routing.mjs already has the `ctx_execute` intercept point |
| RTK detection | `existsSync("/opt/homebrew/bin/rtk")` | Same path used in RTK's own tooling; defensive — silently skips on machines without RTK |
| Verb allowlist | Conservative set: git, gh, ls, tree, find, diff, grep, pnpm, npm, tsc, cargo | Only verbs RTK is known to handle; unknown commands pass through unchanged |
| `modify` action | Return `{ action: "modify", updatedInput: { ...toolInput, code: rtkWrapped } }` | Claude Code hook protocol: `updatedInput` fields are merged into the tool call |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable |
| ---- | ----- | ------------ | -------------- |
| **Wave 1** | 1.1 | None | 1 agent |
| **Critical path** | 1.1 | -- | 1 wave |

### Phase 1: Implement RTK prefix in routing.mjs [Complexity: S]

#### Task 1.1: Add wrapWithRtk helper and ctx_execute shell intercept

**Status:** done

**Depends:** None

Add `wrapWithRtk(cmd)` function and wire it into the `ctx_execute` shell branch of `routePreToolUse()` in context-mode's `core/routing.mjs`.

The function:
1. Checks for RTK at `/opt/homebrew/bin/rtk` via `existsSync` (already imported)
2. Skips if command already starts with `rtk `
3. Checks the leading verb against a conservative allowlist
4. Returns `rtk <cmd>` if all conditions pass, unchanged otherwise

The `ctx_execute` branch change:
- After the security check (unchanged), call `wrapWithRtk(code)`
- If the wrapped result differs from the original, return `{ action: "modify", updatedInput: { ...toolInput, code: rtkWrapped } }`
- Otherwise fall through to `return null`

**Files:**

- Modify: `/Users/ozby/repos/ozby/context-mode/hooks/core/routing.mjs`

**Acceptance:**

- [x] `wrapWithRtk` helper added after imports, before `mcpRedirect`
- [x] `ctx_execute` shell branch updated to call `wrapWithRtk` and return modify when applicable
- [x] Security check preserved (not weakened)
- [x] No new dependencies introduced
- [x] `existsSync` already imported — no import changes needed

---

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Functional smoke | `rtk gain --history` before/after a session that uses ctx_execute(shell, ...) | Shows token savings from git/gh commands |
| No regression | Existing context-mode test suite | All pass |
| RTK absent | Remove `/opt/homebrew/bin/rtk`, call ctx_execute(shell, "git log") | No modification — passthrough |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --------- | ---- | -------- | ---- |
| RTK not installed | `existsSync` returns false → `wrapWithRtk` returns cmd unchanged | Defensive check in `wrapWithRtk` | 1.1 |
| Command already has `rtk ` prefix | Double-wrapping | Early return if `trimmed.startsWith("rtk ")` | 1.1 |
| Verb not in RTK_VERBS | Unknown command passed to RTK | Allowlist — unknown verbs pass through unchanged | 1.1 |
| Multi-statement shell code (`git log && git diff`) | Only leading verb checked | Multi-statement commands have leading verb `git` — RTK handles compound commands | 1.1 |
| security module unavailable | `security` may be null | Security check guarded by `if (security)` — unchanged | 1.1 |

## Non-goals

- Adding RTK prefix to `ctx_execute_file` shell calls (different execution path, lower frequency)
- Adding RTK prefix to `ctx_batch_execute` commands (each command is a separate entry; future work)
- Modifying RTK's own hook to also match `ctx_execute`

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| RTK changes its PATH | wrapWithRtk silently bypasses | Defensive: returns unchanged cmd if binary absent |
| RTK verb set diverges from what RTK actually handles | No token savings for unhandled verbs | Conservative allowlist; easy to expand |

## Technology Choices

| Component | Technology | Version | Why |
| --------- | ---------- | ------- | --- |
| Implementation | Plain JS (ES modules) | Node 18+ | Matches existing routing.mjs style |
## Historical verification note

This blueprint contains done tasks recorded before the current per-task `**Verification:**` convention was consistently enforced. It remains a truthful historical record, but should not be treated as having retroactively reconstructed evidence beyond the repository and audit state captured elsewhere.

