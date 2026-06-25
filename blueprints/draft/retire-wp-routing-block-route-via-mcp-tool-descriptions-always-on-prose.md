---
type: blueprint
title: "Retire WP_ROUTING_BLOCK; route via MCP tool descriptions + always-on prose"
status: draft
complexity: M
owner: ""
created: 2026-06-25
last_updated: 2026-06-25
tags: [hooks, mcp, routing, cleanup]
---

## Product wedge anchor

- **Stage outcome:** Public extraction roadmap — the agent-kit toolchain axis must
  be idiomatic and low-cost for 3rd-party consumers (ingest-lens, edge-matte).
  This removes a ~9KB hook-injected block every consumer session paid for.
- **Consuming surface:** every `wp_*` MCP tool `description` (the protocol's
  when-to-use surface) + the always-on `AGENTS.md` / `CLAUDE.md` convention prose.
- **New user-visible capability:** in any consumer repo, an agent routes a dev
  command to the right `wp_*` tool from the native tool schema — no per-session
  9KB routing-block injection, lower context cost, one source of truth.

## Summary

The SessionStart hook injects a ~9KB XML routing block into every
Claude/Codex/OpenCode session, restating per-tool triggers and forbidden raw
commands — work whose native home is the MCP tool `description` field. Research
(Anthropic/OpenAI/OpenCode docs + a Codex `agent-kit:review`, verdict
sound-with-changes) confirms this is the one real hook over-reach; the other five
hooks are idiomatic.

Move per-tool guidance into compact MCP tool descriptions (native, MCP-load
dependent), migrate durable global conventions into always-on AGENTS.md/CLAUDE.md
prose + `rtk-routing.md` (covers the MCP-off path), re-point
`instruction-surfaces.ts` `native_tool_names` from block-regex to the MCP tool
registry, strip the SessionStart hook to continuity/update-banner/`.agent/routing.md`
only, and delete the routing block entirely (no shim). Long-tail commands get
soft prose only — no new pretool-guard deny rules (user decision). Single atomic
no-shim cut after all importers, tests, generated surfaces (AGENTS/Cursor/OpenCode),
the plugin-manifest fixture, and reference-parity goldens are updated. Also
codifies a worktree + draft-PR step into the blueprint gate. Full plan:
`~/.claude/plans/i-want-you-to-eventual-falcon.md`.

## Key decisions

- No backwards-compat / no legacy shim: the routing block constant +
  `createRoutingInstructionSource` deleted; no trimmed fallback preamble.
- Always-on safety net = AGENTS.md/CLAUDE.md prose (read regardless of MCP state).
- Long-tail routing = soft prose, no new deny rules.
- `<wp_instruction_surface>` envelope kept; `native_tool_names` re-pointed to
  `COMPILED_TOOL_REGISTRY` (now includes `wp_format`/`wp_worktree`); blueprint
  tools excluded; pinned by test.

## Tasks

#### Task 1.1: [mcp] Enrich dev-workflow tool descriptions

**Status:** todo
**Wave:** 0
**Depends:** None
**Files:**
- src/mcp/tools/test.ts, e2e.ts, lint.ts, typecheck.ts, qa.ts, audit.ts, audits.ts, ci-act.ts, worker-tail.ts, pr-status.ts, bench.ts, gain.ts, release-readiness.ts, format.ts, worktree.ts (+ description tests)

**Acceptance:**
- [ ] each description names its trigger and a raw alternative, under byte budget
- [ ] tests green

#### Task 1.2: [mcp] Enrich session-memory tool descriptions

**Status:** todo
**Wave:** 0
**Depends:** None
**Files:**
- src/mcp/tools/session-*.ts (+ tests)

**Acceptance:**
- [ ] each session tool self-describes when to reach for it
- [ ] tests green

#### Task 1.3: [docs] Migrate global conventions to always-on prose

**Status:** todo
**Wave:** 0
**Depends:** None
**Files:**
- AGENTS.md managed-section source
- catalog/agent/rules/rtk-routing.md

**Acceptance:**
- [ ] conventions exist once in an always-on file
- [ ] rtk-routing no longer references the routing block

#### Task 2.1: [hooks] Re-point instruction-surfaces to the MCP registry

**Status:** todo
**Wave:** 0
**Depends:** None
**Files:**
- src/hooks/shared/instruction-surfaces.ts (+ test)

**Acceptance:**
- [ ] envelope tool-names come from the registry (incl. format/worktree), pinned by test
- [ ] no reference to the routing block

#### Task 2.2: [hooks] Strip the SessionStart hook to continuity-only

**Status:** todo
**Wave:** 1
**Depends:** Task 2.1
**Files:**
- src/hooks/sessionstart/index.ts

**Acceptance:**
- [ ] SessionStart emits valid JSON with no routing block
- [ ] continuity and .agent/routing.md passthrough unchanged

#### Task 3.1: [test] Delete the routing-block module (no-shim cut)

**Status:** todo
**Wave:** 2
**Depends:** Task 2.1, Task 2.2
**Files:**
- delete src/hooks/shared/routing-block.ts (+ test)

**Acceptance:**
- [ ] file gone; wp typecheck clean (no dangling import)

#### Task 3.2: [test] Rewrite block-asserting tests

**Status:** todo
**Wave:** 2
**Depends:** Task 2.2, Task 3.1
**Files:**
- src/hooks/sessionstart/index.test.ts, instruction-surface + emitter tests

**Acceptance:**
- [ ] suite green; asserts the new contract

#### Task 3.3: [test] Add a tools/list contract test

**Status:** todo
**Wave:** 1
**Depends:** Task 1.1, Task 1.2
**Files:**
- src/mcp/server or registry test

**Acceptance:**
- [ ] enrichment asserted for representative tools; per-description byte budget enforced

#### Task 4.1: [build] Regenerate generated surfaces + goldens

**Status:** todo
**Wave:** 3
**Depends:** Task 1.3, Task 2.1, Task 3.1
**Files:**
- regenerated .cursor/, .opencode/, AGENTS.md
- __fixtures__/plugin-manifest/expected.json + audit goldens

**Acceptance:**
- [ ] wp sync --check clean; no stale routing-block references anywhere

#### Task 4.2: [docs] Codify worktree+PR into the blueprint gate

**Status:** todo
**Wave:** 0
**Depends:** None
**Files:**
- catalog/agent/rules/pre-implementation.md, CLAUDE.md, AGENTS.md source

**Acceptance:**
- [ ] gate text includes worktree + switch + draft-PR
- [ ] consistent across the three files

#### Task 5.1: [qa] Full verify + cross-CLI smoke

**Status:** todo
**Wave:** 4
**Depends:** all
**Files:**
- (verification only)

**Acceptance:**
- [ ] wp qa + wp audits green; wp typecheck clean
- [ ] zero hits for the deleted block symbols across the repo
- [ ] Claude + Codex route a dev command from the tool schema alone (OpenCode degraded)

## Quick Reference (Execution Waves)

| Wave | Tasks | Depends | Parallel |
| ---- | ----- | ------- | -------- |
| 0 | 1.1, 1.2, 1.3, 2.1, 4.2 | None | 5 |
| 1 | 2.2, 3.3 | Wave 0 | 2 |
| 2 | 3.1, 3.2 | 2.1, 2.2 | 2 |
| 3 | 4.1 | 1.3, 2.1, 3.1 | 1 |
| 4 | 5.1 | all | 1 |
| Critical path | 2.1 then 2.2 then 3.1 then 3.2 then 4.1 then 5.1 | - | 6 waves |

## Edge cases / risks (from Codex review)

| ID | Severity | Risk | Mitigation |
| -- | -------- | ---- | ---------- |
| R1 | High | MCP descriptions vanish if MCP not loaded | Conventions live in always-on AGENTS.md/CLAUDE.md |
| R2 | High | OpenCode bridge is degraded, not equivalent | Documented; no equivalence claim |
| R3 | High | Long-tail loses hard nudge | Soft prose (accepted); pretool-guard still denies common cmds |
| R4 | Medium | Re-bloat inside tool schemas | Compact descriptions + byte-budget test (3.3) |
| R5 | Medium | registry differs from old block tool list | Explicit policy + exact-list test (2.1) |
| R6 | Medium | no-shim atomicity (dangling imports/goldens) | Delete (3.1) sequenced after all importers + regen (4.1) |

**Verification standard:** behavioral change (NOT extraction-parity) — no byte-identity claim.
