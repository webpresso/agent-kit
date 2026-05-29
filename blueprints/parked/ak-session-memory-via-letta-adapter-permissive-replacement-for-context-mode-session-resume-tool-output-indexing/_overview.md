---
type: blueprint
title: wp session memory v1 — Letta adapter (permissive replacement for context-mode)
status: parked
complexity: M
owner: agent-kit
created: '2026-05-13'
last_updated: '2026-05-29'
progress: 'Parked on 2026-05-29 after Letta fact-check invalidated the original memory-hierarchy rationale; retained only as a documented rejected direction pending no further local execution'
depends_on: []
parked_reason: |
  /plan-refine Phase 1 fact-check (Letta tech) revealed that Letta's
  memory-hierarchy semantics (archival_memory_insert / recall_memory_query)
  are INTERNAL to Letta's agent loop and not externally callable. The
  reason this blueprint chose Letta over mcp-memory-service in DX1 — the
  memory-hierarchy tiers — turned out to be unreachable from outside.
  As an external store, Letta reduces to "passages with embeddings + Postgres
  + pgvector + embedding provider" — heavier than mcp-memory-service for
  the same external capability.
  PARKED pending re-comparison of v1 backends with corrected facts.
  See: docs/research/ — Letta tech fact-check findings.
tags:
  - session-memory
  - letta
  - hooks
  - mcp
  - context-mode
  - lane-2
  - permissive-license
  - parked-pending-recompare
---

# wp session memory v1 — Letta adapter (permissive replacement for context-mode)

## Product wedge anchor

- **Stage outcome:** webpresso open-sourcing roadmap — Lane 2 of the four-lane routing model (context-mode owns `ctx_*`) becomes permissively-licensed, removing the only ELv2 dependency in the agent-kit-driven stack. Cited model lives at `catalog/agent/rules/gstack-routing.md`.
- **Consuming surface:** `wp setup --with session-memory` (new flag) + new MCP tools `wp_session_capture`, `wp_session_snapshot`, `wp_session_restore`, `wp_session_search` exposed by agent-kit's MCP server.
- **New user-visible capability:** After this lands, a webpresso consumer (e.g. ingest-lens dev) gets compaction-survival session memory without installing the ELv2 context-mode plugin. After a Claude Code compaction, the agent answers "what was I working on?" correctly using Letta's memory-hierarchy semantics (context window / archival / recall).

## Problem Statement

Today the only path to "agent remembers tool calls across compaction" is context-mode (ELv2). The Elastic License 2.0 forbids hosting the software as a managed service and restricts redistribution. webpresso's open-sourcing effort must not bundle ELv2 software in the package tarball; the current setup flow may request context-mode as an external default workstation lane while preserving package-boundary verification.

Adjacent permissive options (mem0, Letta, mcp-memory-service) were surveyed in
`docs/research/permissive-memory-landscape.md` (to be created). The user picked
**Letta** because:

1. The memory-hierarchy semantics (context window / archival / recall) match how
   long-running agents actually use memory — not just a flat event log.
2. Apache-2 license, 22.5K stars, YC-backed governance.
3. A real upstream feature surface (memory tiers, decay, consolidation) that we
   don't have to design ourselves.

The wedge cost is real: Letta defaults to PostgreSQL + a local Letta server,
which is heavier than mcp-memory-service's SQLite-only setup. v1 must keep
that setup invisible to the consumer.

## Architecture Overview

```text
                  END-USER CLAUDE CODE
                          │
                          │ tool invocations
                          ▼
┌────────────────────────────────────────────────────────────┐
│ HOOK CHAIN (rtk first, ak second — per eng-review D5)      │
│                                                             │
│  PreToolUse:    rtk-pretool-guard ──▶ ak-pretool-guard     │
│                                                             │
│  Tool fires                                                 │
│                                                             │
│  PostToolUse:   rtk-posttool ──▶ ak-post-tool              │
│                                       │                     │
│                                       ▼  HTTP (localhost)   │
│                                  Letta server (Python)      │
│                                  ├ archival_memory_insert   │
│                                  ├ archival_memory_search   │
│                                  ├ recall_memory_query      │
│                                  └ Postgres (auto-managed)  │
│                                                             │
│  PreCompact:    ak-pre-compact (Letta snapshot)            │
│  SessionStart:  ak-sessionstart-routing                    │
│                  └─ on source="compact": Letta recall      │
└────────────────────────────────────────────────────────────┘

LANE MODEL (revised, permissive only):
  1  agent-kit + Letta adapter   wp_session_*    MIT (adapter) + Apache-2 (Letta)
  2  current default context lane  context-mode/ctx_*  Elastic-2.0 external
  3  rtk (upstream)              bash filter     MIT
  4  gstack (upstream)           /skill          MIT

DATA FLOW (event capture path):
  tool result JSON  ──▶  ak-post-tool.ts  ──▶  letta-client.archival_memory_insert(
                                                  agent_id, content=<tool event>
                                                )
  on PreCompact:
                          ak-pre-compact.ts ──▶  letta-client.snapshot(agent_id)
                                                  (Letta consolidates archival → recall)
  on SessionStart (source=compact):
                          ak-sessionstart.ts ──▶  letta-client.recall_memory_query(
                                                  agent_id, query=last_user_prompt
                                                )
                                                  ──▶ inject <session_knowledge>
```

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Memory backend | Letta self-hosted (not cloud) | No credential boundary at T0; permissive Apache-2 |
| Storage | Letta's default Postgres (auto-provisioned via docker compose) | Letta's first-class config; SQLite mode exists but is alpha |
| Hot path transport | HTTP localhost to Letta server | Native Letta SDK pattern; ~50-100ms acceptable for v1 (v2 brings sub-ms via Rust FFI) |
| MCP tool namespace | `wp_session_*` (NOT `ctx_*`) | Eng-review D6: unified `wp_*` namespace; clean break from context-mode tool names |
| Hook order | rtk → ak (rtk first) | Eng-review D5: bash filter runs before event capture so Letta doesn't index pre-redacted output |
| Migration from context-mode | Hard: `wp setup` removes context-mode entries from `.mcp.json` with backup | Eng-review D7. Backup file written; idempotent re-run |
| Letta lifecycle | `wp setup` boots Letta as a background docker-compose service per-project | Avoid global daemon; project-scoped agent IDs |
| Agent ID strategy | One Letta agent per git repo root path (hashed) | Project isolation; survives multiple Claude Code sessions on same repo |
| PreCompact timeout | 5s cap; partial snapshot allowed (eng-review D14) | Letta snapshot can stall; capped + partial > silent loss |
| Failure mode | If Letta unreachable: wp_session_* tools return `unavailable`; agent-kit still works | Eng-review D13 spirit applied to Letta path |

## Quick Reference (Execution Waves)

| Wave              | Tasks            | Dependencies | Parallelizable |
| ----------------- | ---------------- | ------------ | -------------- |
| **Wave 1**        | 1.1, 1.2, 1.3    | None         | 3 agents       |
| **Wave 2**        | 2.1, 2.2         | Wave 1       | 2 agents       |
| **Wave 3**        | 3.1, 3.2, 3.3    | Wave 2       | 3 agents       |
| **Wave 4**        | 4.1, 4.2         | Wave 3       | 2 agents       |
| **Critical path** | 1.1 → 2.1 → 3.1 → 4.1 | --      | 4 waves        |

**Note:** Use t-shirt sizing (XS/S/M/L/XL) for individual task estimates. v1 total is M.

### Phase 1: Letta client + setup orchestration [Complexity: M]

#### [infra] Task 1.1: Add Letta to wp setup flow

**Status:** todo

**Depends:** None

Wire Letta installation into `wp setup --with session-memory`. The setup command MUST be idempotent (re-run = no-op if Letta already running), MUST handle docker-compose missing gracefully (clear error + opt-out flag), and MUST write a `.agent/letta/docker-compose.yml` to the project root.

The flag `--with session-memory` is an additive opt-in to the existing `wp setup` step. The setup orchestrator (current path: `src/cli/commands/setup/`) gets a new `installSessionMemory()` step that:

1. Detects docker / docker-compose presence; if missing, prints install URL + skips
2. Writes `.agent/letta/docker-compose.yml` declaring letta + postgres services on a project-local network
3. Runs `docker compose up -d` against that file
4. Polls Letta health endpoint (max 30s); on timeout, logs warning and proceeds
5. Writes the Letta endpoint URL to `.agent/letta/endpoint.json` for hooks to consume
6. Registers an `wp_session_*` MCP server entry in `.mcp.json` (with backup of previous version)

**Files:**

- Create: `src/cli/commands/setup/install-session-memory.ts`
- Create: `src/cli/commands/setup/install-session-memory.test.ts`
- Create: `src/templates/letta/docker-compose.yml` (template)
- Modify: `src/cli/commands/setup/index.ts` — wire the new step behind the flag

**Steps (TDD):**

1. Write failing tests for: idempotent re-run, docker-missing error, health-check timeout, .mcp.json backup creation
2. Run scoped test — verify FAIL
3. Implement the orchestrator step
4. Run scoped test — verify PASS
5. Manual smoke: `wp setup --with session-memory` in a fresh tmp repo

**Acceptance:**

- [ ] All test cases pass (idempotent, docker-missing, health-timeout, .mcp.json backup)
- [ ] Scoped lint clean
- [ ] Manual smoke verified — Letta endpoint returns 200 on `/health`
- [ ] Docker-compose file passes `docker compose config` validation

#### [backend] Task 1.2: Letta TypeScript client wrapper

**Status:** todo

**Depends:** None

Create a thin TS wrapper around Letta's REST API that exposes the four primitives our hooks need:

- `captureToolEvent(agentId, event)` → `POST /v1/agents/{id}/archival-memory`
- `snapshotForCompact(agentId)` → `POST /v1/agents/{id}/messages` with a "summarize and consolidate" system message
- `recallForResume(agentId, query)` → `GET /v1/agents/{id}/recall-memory?query=...`
- `searchEvents(agentId, query, k)` → `GET /v1/agents/{id}/archival-memory?search=...&limit=k`

Each method MUST timeout at 5s (configurable per-call), return typed Result-style values (never throw), and accept an `AbortSignal`. The Letta endpoint URL is read once from `.agent/letta/endpoint.json` at module-init.

**Files:**

- Create: `src/session-memory/letta-client.ts`
- Create: `src/session-memory/letta-client.test.ts`
- Create: `src/session-memory/types.ts` (event shape, result types)

**Steps (TDD):**

1. Define event/result types
2. Write failing tests against a mocked Letta endpoint (use msw or undici mock)
3. Implement HTTP wrapper with timeout + AbortSignal
4. Verify each method handles: 200, 4xx, 5xx, network timeout, malformed JSON
5. Add property tests for idempotent re-capture (same event twice = single archival entry)

**Acceptance:**

- [ ] All four methods covered by tests
- [ ] No `any` types; strict null checks
- [ ] Network failures return Result.err, never throw
- [ ] 5s timeout enforced via AbortSignal

#### [docs] Task 1.3: Document session-memory in agent-kit README + setup guide

**Status:** todo

**Depends:** None

Add a "Session memory" section to README explaining:

- What it does (1 sentence)
- How to enable (`wp setup --with session-memory`)
- Prerequisites (docker, ~500MB disk for Letta + postgres)
- How to disable (`wp setup --without session-memory` or remove from `.mcp.json`)
- Privacy: data stays local, no cloud calls, no telemetry

Also write `docs/guides/session-memory.md` with the full mental model — Letta's hierarchy (context / archival / recall) and what each layer is for.

**Files:**

- Modify: `README.md`
- Create: `docs/guides/session-memory.md`

**Acceptance:**

- [ ] README has working "Session memory" section
- [ ] Mental model doc explains the hierarchy with examples
- [ ] `wp audit docs-frontmatter` passes on the new guide

### Phase 2: Hook wiring [Complexity: M]

#### [backend] Task 2.1: ak-post-tool captures events via Letta

**Status:** todo

**Depends:** Task 1.2

Make `ak-post-tool.ts` thin (per eng-review D9): read tool-result JSON from stdin, project to the Letta event shape, call `letta-client.captureToolEvent(agentId, event)`. Resolve `agentId` from `.agent/letta/endpoint.json` + project-root hash. On failure, log to `~/.webpresso/cache/agent-kit/hooks/<repo>.session-capture.log` (do NOT block the tool call).

**Files:**

- Modify: `src/hooks/post-tool/index.ts` (the existing ak-post-tool entry)
- Create: `src/hooks/post-tool/session-capture.ts` (new module wired into the existing hook)
- Create: `src/hooks/post-tool/session-capture.test.ts`

**Steps (TDD):**

1. Test: event capture for a representative tool-result JSON (Bash, mcp__wp_test, Edit)
2. Test: failure path — Letta unreachable, hook still returns success
3. Test: agentId derivation is stable across runs (same repo → same id)
4. Implement
5. Smoke: run `claude-code` in a scratch repo, verify Letta DB has events

**Acceptance:**

- [ ] All test cases pass
- [ ] Hook is non-blocking on Letta failure
- [ ] Hot path: <100ms p99 measured (informational for v1; v2 brings the <2ms target)
- [ ] Log file path is correct and rotated

#### [backend] Task 2.2: ak-pre-compact snapshots + ak-sessionstart restores

**Status:** todo

**Depends:** Task 1.2

Implement two new hook bins (or extend the existing `ak-sessionstart-routing`):

- `ak-pre-compact` — fires on Claude Code's PreCompact event. Calls `letta-client.snapshotForCompact(agentId)` with a 5s cap. Logs partial snapshot if exceeded (per eng-review D14).
- `ak-sessionstart-routing` extension — on `source=compact`, calls `letta-client.recallForResume(agentId, lastPrompt)` and emits a `<session_knowledge>` directive into the session context.

**Files:**

- Create: `src/hooks/pre-compact/index.ts`
- Create: `src/hooks/pre-compact/index.test.ts`
- Modify: `src/hooks/sessionstart-routing/index.ts` — add the compact-source branch
- Modify: `src/cli/commands/setup/install-session-memory.ts` — register the new hook in `.claude/settings.json`

**Steps (TDD):**

1. Test: PreCompact with healthy Letta — returns snapshot id, hook exits 0
2. Test: PreCompact with stalled Letta — 5s cap fires, partial snapshot logged, hook exits 0
3. Test: SessionStart source=compact — recall query fires, `<session_knowledge>` directive present in stdout
4. Test: SessionStart source=startup — recall NOT fired (only on compact source)
5. Implement
6. End-to-end smoke: simulate compaction in Claude Code, verify agent resumes correctly

**Acceptance:**

- [ ] All tests pass
- [ ] Hooks register cleanly in `.claude/settings.json`
- [ ] End-to-end smoke verified manually

### Phase 3: MCP tools + search [Complexity: M]

#### [backend] Task 3.1: wp_session_search MCP tool

**Status:** todo

**Depends:** Task 1.2

Expose `wp_session_search` as a registered MCP tool on agent-kit's MCP server. Input: `{ query: string, limit?: number }`. Output: matching event snippets with timestamps. Delegates to `letta-client.searchEvents`.

This is the primary user-facing tool — agents call it to recall what they were doing.

**Files:**

- Create: `src/mcp/tools/ak-session-search.ts`
- Create: `src/mcp/tools/ak-session-search.test.ts`
- Modify: `src/mcp/server.ts` — register the tool

**Acceptance:**

- [ ] Tool registered with proper JSON schema
- [ ] Returns structured results, not raw Letta payloads
- [ ] Tests cover: happy path, empty results, Letta unreachable

#### [backend] Task 3.2: wp_session_snapshot + wp_session_restore MCP tools

**Status:** todo

**Depends:** Task 1.2

Manual snapshot/restore tools that agents can call on demand (not just at hook events). Useful for "save my state before I switch branches" workflows.

**Files:**

- Create: `src/mcp/tools/ak-session-snapshot.ts`
- Create: `src/mcp/tools/ak-session-restore.ts`
- Tests for each

**Acceptance:**

- [ ] Both tools registered
- [ ] snapshot returns a snapshot id; restore accepts that id
- [ ] Restore preserves agent's context-window state when invoked

#### [backend] Task 3.3: wp_session_capture MCP tool (manual capture)

**Status:** todo

**Depends:** Task 1.2

Manual event-capture tool for agents to record their own decisions/notes outside of tool-call events. Input: `{ content: string, tags?: string[] }`.

**Files:**

- Create: `src/mcp/tools/ak-session-capture.ts`
- Test

**Acceptance:**

- [ ] Tool registered, structured input
- [ ] Captured events visible via `wp_session_search`

### Phase 4: Migration + audit [Complexity: M]

#### [infra] Task 4.1: Hard migration — `wp setup` removes context-mode

**Status:** todo

**Depends:** Task 1.1

Per eng-review D7: when `wp setup --with session-memory` runs and detects context-mode entries in `.mcp.json`, remove them automatically. Write a timestamped backup file `.mcp.json.pre-session-memory-backup.{timestamp}.json` first. Print a one-line notice with the backup path.

Outside-voice flagged this as consent-sensitive. Mitigation: backup is non-optional, restore path is documented (one command: `wp setup --restore-mcp-backup <path>`).

**Files:**

- Create: `src/cli/commands/setup/migrate-context-mode.ts`
- Create: `src/cli/commands/setup/migrate-context-mode.test.ts`
- Modify: `src/cli/commands/setup/index.ts` — wire migration step

**Steps (TDD):**

1. Test: clean install (no context-mode) — no-op
2. Test: standard install — context-mode removed, backup written
3. Test: idempotent re-run — no double-remove
4. Test: malformed `.mcp.json` — preserved unchanged, warning logged
5. Test: rollback flag restores backup
6. Implement

**Acceptance:**

- [ ] All 5 test cases pass
- [ ] Backup file format documented in setup guide
- [ ] Rollback verified end-to-end

#### [qa] Task 4.2: gstack-routing.md rule update + new lane-2 rule

**Status:** todo

**Depends:** Task 1.1

Update `catalog/agent/rules/gstack-routing.md` to reflect the new lane-2 ownership (agent-kit owns `wp_session_*` instead of context-mode owning `ctx_*`). Add a new rule `catalog/agent/rules/session-memory.md` explaining when agents should call `wp_session_search` vs relying on auto-restore.

**Files:**

- Modify: `catalog/agent/rules/gstack-routing.md`
- Create: `catalog/agent/rules/session-memory.md`

**Acceptance:**

- [ ] Rule diff reviewed
- [ ] `wp audit docs-frontmatter` passes
- [ ] Rule referenced from README session-memory section

---

## Verification Gates

| Gate         | Command                                    | Success Criteria |
| ------------ | ------------------------------------------ | ---------------- |
| Type safety  | `wp_typecheck`                             | Zero errors |
| Lint         | `wp_lint --file <touched>`                 | Zero violations |
| Unit tests   | `wp_test --file <touched>`                 | All pass |
| Full QA      | `wp_qa`                                    | All pass |
| Hot path perf | bench harness in session-capture.test.ts  | p99 < 100ms (informational; v2 raises bar) |
| Smoke test   | `wp setup --with session-memory` in scratch repo + simulated compaction | Agent restores context correctly |
| Migration    | `wp setup` with prior context-mode install | context-mode removed, backup file present |
| Audit        | `wp_audit blueprint-lifecycle`             | Blueprint passes lifecycle check |

## Cross-Plan References

| Type       | Blueprint | Relationship |
| ---------- | --------- | ------------ |
| Upstream   | None      |              |
| Downstream | `ak-session-memory-v2-rust-ctx-rs-engine-replaces-letta-backend-while-preserving-v1-api-surface` | v2 replaces Letta backend while keeping `wp_session_*` MCP surface stable |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --------- | ---- | -------- | ---- |
| Docker not installed | Setup hangs or fails opaquely | Detect at setup time; print install URL + clean skip | 1.1 |
| Letta server unreachable mid-session | Hooks crash → all tool calls fail | All hooks log + return success (non-blocking) | 2.1, 2.2 |
| Postgres data corrupts | Session memory lost | Letta's own recovery; we don't add a layer; documented limitation | 1.3 |
| Two Claude Code sessions on same repo | Concurrent writes to same agent | Letta serializes; ordering not guaranteed; acceptable for v1 | 2.1 |
| PreCompact stalls > 5s | Silent loss of session continuity | 5s timeout + partial snapshot + log line (eng-review D14) | 2.2 |
| `.mcp.json` is malformed during migration | Setup destroys user's config | Migration reads + validates first; on parse error, preserve unchanged | 4.1 |
| Letta version drift | API breaking change | Pin Letta version in docker-compose template; document upgrade path | 1.1, 1.3 |
| User has FreeBSD / unsupported OS | Docker unavailable | Setup detects + skips; `wp_session_*` returns `unavailable` cleanly | 1.1, 3.1 |

## Non-goals

- Polyglot executor (`ctx_execute` / `ctx_execute_file` in 11 languages) — covered by v2 if needed; not in v1 scope.
- Cloud / multi-tenant session memory — strictly local Letta in v1.
- mem0 / mcp-memory-service / cognee adapters — explicitly chose Letta per DX1 decision.
- Migration tooling FROM Letta data shape TO ctx-rs data shape — covered by v2 blueprint.
- Performance work to hit `<2ms` hot path — v2 brings Rust FFI for that; v1's `<100ms` target is acceptable.
- Web-fetch caching equivalent of `ctx_fetch_and_index` — separate blueprint if demand surfaces.
- 13 of context-mode's 15 platform adapters (OpenCode, Cursor, VS Code Copilot, etc.) — Claude Code + Gemini CLI (stdio MCP) only.

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Letta's memory-hierarchy concepts leak into our public MCP surface | API churn when v2 swaps engines | `wp_session_*` tool shapes are designed in v1 to be Letta-agnostic; mapped internally |
| Postgres adds setup weight users won't tolerate | Adoption drops below context-mode | DX critique flagged this; mitigation = docker-compose template + clear opt-out path |
| Hot path 50-100ms regresses interactive feel | Users complain about lag | Document as v1 limitation; v2 fixes via FFI; consider async-fire-and-forget if real issue |
| Letta upstream changes default storage from Postgres | docker-compose template breaks | Pin Letta version; subscribe to Letta releases; quarterly bump cadence |
| User has context-mode for non-agent-kit reasons | Hard migration deletes their config | Backup file always written; rollback documented; eng-review TP4 acknowledged this |
| Letta server hangs during PreCompact | Session loss feels worse than no session memory | 5s cap + partial snapshot + observability log |

## Technology Choices

| Component | Technology | Version | Why |
| --------- | ---------- | ------- | --- |
| Memory backend | Letta self-hosted | latest stable (pin in docker-compose) | DX1: user picked memory-hierarchy semantics over flat FTS5 |
| Storage | PostgreSQL 16 | 16-alpine in docker-compose | Letta's first-class default; alpine for size |
| HTTP client | undici | bundled with Node 24 | Already in agent-kit's runtime; supports AbortSignal natively |
| Mock framework | msw or undici MockAgent | latest | Existing pattern in agent-kit tests |
| MCP SDK | `@modelcontextprotocol/sdk` | existing pinned version | Already used by agent-kit's MCP server |
| Hook entry pattern | `bin/ak-pre-compact`, etc. | existing | Mirrors current `ak-post-tool` / `ak-pretool-guard` shape |
| Setup orchestrator | Existing `src/cli/commands/setup/` | extend, don't replace | Lifts the `--with session-memory` flag onto existing infrastructure |
| Lifecycle audit | `wp_audit blueprint-lifecycle` | existing | Standard repo gate |
