---
type: blueprint
title: "WP-native session-memory enforcement parity"
owner: ozby
status: planned
complexity: XL
created: '2026-06-15'
last_updated: '2026-06-15'
progress: '0% (planned; refined with agent-kit:plan-refine and autoresearch parity matrix on 2026-06-15)'
depends_on:
  - 2026-06-13-session-continuity-and-resume-parity
  - 2026-06-13-sandboxed-knowledge-tool-surface-parity
  - 2026-06-13-reference-parity-regression-and-host-smoke-gate
  - 2026-06-14-mcp-session-command-sandboxing
  - 2026-06-14-session-fetch-index-ssrf-protection
cross_repo_depends_on: []
tags:
  - session-memory
  - hooks
  - parity
  - mcp
  - context-budget
max_parallel_agents: 5
---

# WP-native session-memory enforcement parity

**Goal:** Make the session-memory replacement unavoidable in normal agent flows:
supported hosts should inject `wp_session_*` routing guidance, deny or nudge raw
large-context operations toward the matching `wp_session_*` tool, capture broad
continuity events, and prove the claim with host-smoke, audit, and benchmark
gates.

## Product wedge anchor

The repo already ships local `wp_session_*` tools and continuity storage. The
missing wedge is enforcement: agents still see a dev-workflow-only routing block
and Claude hook matchers intentionally omit `Read`, `Grep`, `WebFetch`, `Agent`,
and generic MCP calls. This blueprint turns the shipped tool surface into the
first-choice path without reintroducing a second public namespace or a daemon.

## Planning Summary

- Goal input: `Make agent-kit 100% for context-mode replacement behavior`
- Parity target: `WP-native full parity` — use context-mode as behavior evidence,
  but expose and enforce only `wp_session_*` public names.
- Complexity: `XL`
- Output path: `blueprints/planned/2026-06-15-wp-session-enforcement-parity/_overview.md`
- Refinement scope: this blueprint only; related blueprints are alignment inputs.
- Execution rule: before implementation, verify whether sibling planned
  blueprints have already landed in code and reconcile lifecycle state instead
  of duplicating completed work.

## Architecture Overview

```text
SessionStart / AGENTS / host rules
  -> combined wp_routing + wp_session context-window-protection guidance
  -> PreToolUse guard for raw large-context operations
  -> wp_session_* MCP tools for bounded execution, indexing, search, restore
  -> PostToolUse/UserPromptSubmit/PreCompact continuity capture
  -> reference-parity + host-smoke + package-safety gates
```

## Fact-Check Findings

| ID | Severity | Claim / assumption checked | Reality verified in repo | Blueprint fix |
| -- | -------- | -------------------------- | ------------------------ | ------------- |
| F1 | HIGH | Session-memory tools exist but are not being used because hooks do not enforce them. | `src/mcp/tools/session-*.ts` files exist on current `main`, and README lists `wp_session_*`, but `src/hooks/shared/routing-block.ts` lists only dev-workflow tools. | Task 1.1 adds first-class `wp_session_*` routing guidance and registry/routing consistency tests. |
| F2 | HIGH | Agent-kit has context-mode-equivalent hook breadth. | Claude defaults in `src/cli/commands/init/scaffolders/agent-hooks/index.ts` are `Bash|Write|Edit|MultiEdit` and `Write|Edit|MultiEdit`; current tests explicitly exclude `Read`, `Grep`, `WebFetch`, and `Agent`. | Task 1.2 broadens only host-supported matchers and replaces the anti-parity test with positive coverage. |
| F3 | HIGH | PreToolUse already points data-heavy commands to shipped session-memory tools. | `src/hooks/pretool-guard/dev-routing.ts` emits generic bounded guidance for `cat`, `grep`, `find`, `curl`, `git log`, and build output; tests still reference `ctx_execute` compatibility. | Task 1.3 changes guidance to concrete `wp_session_*` tools while preserving loop prevention for already-sandboxed calls. |
| F4 | MEDIUM | PostToolUse capture is broad enough once handlers exist. | `src/hooks/post-tool/lint-after-edit.ts` can classify reads/commands internally, but installed Claude PostToolUse only fires for edit/write matchers today. | Task 1.4 expands capture coverage and tests bounded summaries for read/search/shell/MCP events. |
| F5 | HIGH | Existing planned sibling blueprints can be used as-is. | `2026-06-13-sandboxed-knowledge-tool-surface-parity` still describes some files as missing, while current `main` contains the session tool files. | This blueprint treats sibling blueprints as intent/history and requires concrete source verification before implementation. |
| F6 | MEDIUM | Codex and Claude can share identical hook semantics. | Codex supports `Bash|apply_patch|Edit|Write|mcp__.*`; Claude supports native tool matchers like `Read`, `Grep`, `WebFetch`, and `Agent`. | Task 1.2 keeps host-specific matcher sets and updates capability docs instead of overclaiming uniformity. |
| F7 | HIGH | Public replacement claims are docs-only. | README, hook matrices, routing blocks, generated host fixtures, and package tarballs are public/package surfaces. | Task 3.1 serializes docs, parity matrix, package-surface, and secret/path gates after behavior tests pass. |

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Public namespace | `wp_session_*` only | Avoid a second dialect; context-mode names may remain test compatibility inputs but not user-facing guidance. |
| Enforcement style | Deny or explicit nudge before raw context enters the host | Session tools are valuable only when the model is routed before large output is read. |
| Host parity | Maximize per host, document degradations | Full Claude parity is feasible; Codex/Cursor/OpenCode differ and must not receive invalid config. |
| Storage/runtime | Reuse existing session-memory stores and MCP handlers | No new daemon, dependency, or parallel memory store. |
| Safety posture | Fail open for capture, fail closed for policy guard when hook binary is missing | Preserve agent operation while preventing silent bypass of mandatory routing. |
| Package posture | Treat routing docs, hook matchers, and parity claims as public package surfaces | Requires package-surface, tarball, secret, and path checks before release claims. |

## Technology and Public-Package Safety Notes

| Area | Choice | Safety / verification note |
| ---- | ------ | -------------------------- |
| Routing source | `src/hooks/shared/routing-block.ts` remains canonical | Add `wp_session_*` hierarchy and tests; avoid generated-surface hand edits. |
| Hook setup | Existing `WP_HOOK_SPECS` + host matcher sets | Keep one IR but host-specific matcher strings; no one-size-fits-all lifecycle claim. |
| PreToolUse guard | Existing `dev-routing.ts` / runner pipeline | Add session-memory redirects before validators; preserve already-sandboxed loop breaks. |
| Capture | Existing `post-tool`, `guard-switch`, `precompact`, `sessionstart` hooks | Expand event coverage with byte caps and redaction; capture failures remain no-op. |
| MCP tools | Existing `wp_session_*` descriptors | Registry/routing tests prove every tool named in guidance is registered. |
| Public package | README, docs, hook fixtures, package manifest/tarball | Run package-surface and secret/path gates before claim language ships. |

## Autoresearch Parity Matrix (2026-06-15)

`$autoresearch` produced the detailed supporting matrix in
[`parity-matrix.md`](./parity-matrix.md)
and compared the local agent-kit/context-mode behavior against the
relevant memory/context ecosystem: context-mode, Claude-Mem, Hindsight, Mem0,
Zep/Graphiti, Cognee, Redis Agent Memory Server, OpenAI Agents SDK Sessions,
LangMem/LangGraph, LlamaIndex Memory, AutoGen memory, and Letta/MemGPT-style
stateful agents.

| Capability axis | Closest comparators | Blueprint target |
| ---------------- | ------------------- | ---------------- |
| Hook-enforced coding-agent routing | context-mode | `wp_session_*` routing guidance is injected into supported host sessions and generated instruction surfaces. |
| Raw-output prevention before transcript pollution | context-mode | PreToolUse redirects high-volume `Bash`, `Read`, `Grep`, `WebFetch`, `Agent`, and MCP flows to concrete `wp_session_*` tools where each host supports matching. |
| Broad continuity capture | context-mode, Claude-Mem, Hindsight | PostToolUse/UserPromptSubmit/PreCompact capture bounded summaries of edits, reads, searches, commands, tool failures, decisions, and task state. |
| Progressive disclosure | Claude-Mem, context-mode, Mem0/Zep/Cognee patterns | `wp_session_search`/`restore` return compact previews and stable references; detailed content is fetched only by narrow query/reference. |
| Diagnostics and proof gates | context-mode doctor/stats, agent-kit audits | `wp_session_doctor`, host-smoke fixtures, reference-parity rows, package/tarball checks, and docs gates prove claims before release language changes. |
| Long-term semantic/graph learning | Mem0, Zep/Graphiti, Cognee, Letta | Explicit non-goal for this blueprint; no graph memory, hosted memory API, LLM extraction, personalization, or autonomous reflection is added here. |

**Parity boundary:** agent-kit should match context-mode on the **coding-agent
context-window enforcement** axis, not on every broader memory-platform feature.
Framework/platform memory systems inform vocabulary and future options, but the
current implementation should stay local, hook-driven, and WP-native.

**Research-driven blueprint additions:** keep the SSRF dependency for
`wp_session_fetch_and_index`; separate proof axes for tool existence, routing
text, matcher coverage, guard behavior, capture behavior, and package surface;
and require raw-output prevention tests to prove the guard fires before large
outputs enter the transcript.

## Cross-Plan Alignment

| Related plan | Relationship | Alignment rule |
| ------------ | ------------ | -------------- |
| `2026-06-13-session-continuity-and-resume-parity` | Upstream continuity/capture contract | Consume landed typed events, SessionStart restore, and PreCompact behavior; do not redesign storage. |
| `2026-06-13-sandboxed-knowledge-tool-surface-parity` | Upstream MCP tool surface | Consume concrete `wp_session_*` descriptors; if lifecycle state is stale, reconcile rather than duplicate files. |
| `2026-06-14-mcp-session-command-sandboxing` | Security dependency for shell execution tools | Do not promote raw shell routing to `wp_session_execute` unless injection/cwd validation remains green. |
| `2026-06-14-session-fetch-index-ssrf-protection` | Security dependency for web fetch routing | WebFetch/curl guidance must point only to SSRF-hardened `wp_session_fetch_and_index`. |
| `2026-06-13-reference-parity-regression-and-host-smoke-gate` | Downstream proof gate | Extend existing parity matrix/bench/host smoke instead of creating a separate proof system. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| ---- | ----- | ------------ | -------------- | ---------------- |
| **Wave 0** | 1.1, 1.2, 1.3, 1.4 | Concrete `wp_session_*` tool files present or sibling lifecycle reconciled | 4 agents | S-M |
| **Wave 1** | 2.1, 2.2 | Wave 0 behavior contracts | 2 agents | S-M |
| **Wave 2** | 3.1 | Tasks 2.1, 2.2 | 1 agent | S |
| **Critical path** | 1.1 → 2.1 → 3.1 | — | 3 waves | XL |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ planned agents / 2 | 4 for 5 planned agents |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 7 / 3 = 2.33 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 8 / 7 = 1.14 |
| CP | same-file overlaps per wave | 0 | 0 |
| Parallelization score | A-D score | B or better | B |

**Refinement delta:** The work is split by source ownership: routing text,
host matcher setup, pretool redirect behavior, posttool capture behavior,
integration proof, benchmark/audit proof, and docs/package claims. CPR misses the
2.5 target by a small margin because docs/package release claims intentionally
fan in after behavior proof.

## Phase 1: enforcement behavior [Complexity: XL]

#### [routing] Task 1.1: Add `wp_session_*` context-window routing guidance

**Status:** todo

**Depends:** Concrete `wp_session_*` MCP tool descriptors are present in
`src/mcp/tools/`; if not, finish or reconcile
`2026-06-13-sandboxed-knowledge-tool-surface-parity` first.

Update the canonical routing source so SessionStart, AGENTS, and generated host
instruction surfaces tell agents to use `wp_session_*` for context-saving work.
Keep the existing dev-workflow routing table, but add a separate session-memory
hierarchy: restore/search first, batch execute for shell gathering, execute-file
for read-to-analyze, fetch-and-index for network fetches, and capture/snapshot
for manual continuity. The text must use only `wp_session_*` public names and
must not tell users to call legacy context-mode names. (F1, F7)

**Files:**

- Modify: `src/hooks/shared/routing-block.ts`
- Modify: `src/hooks/shared/instruction-surfaces.ts`
- Create: `src/hooks/shared/routing-block.test.ts`
- Modify: `src/hooks/sessionstart/index.test.ts`
- Modify: `src/mcp/server.integration.test.ts`

**Steps (TDD):**

1. Write failing tests proving the routing block names every shipped `wp_session_*` tool, includes context-window-protection guidance, and contains no legacy public tool names.
2. Run: `./bin/wp test --file src/hooks/shared/routing-block.test.ts --file src/hooks/sessionstart/index.test.ts --file src/mcp/server.integration.test.ts` — verify FAIL.
3. Implement the minimal routing/instruction-surface changes; keep the existing dev-workflow table intact.
4. Run: `./bin/wp test --file src/hooks/shared/routing-block.test.ts --file src/hooks/sessionstart/index.test.ts --file src/mcp/server.integration.test.ts` — verify PASS.
5. Run: `./bin/wp lint src/hooks/shared src/hooks/sessionstart/index.test.ts src/mcp/server.integration.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] SessionStart additional context includes both dev-workflow routing and `wp_session_*` context-window routing.
- [ ] Every public `wp_session_*` name in the routing block is registered by the MCP server.
- [ ] Routing guidance maps raw file analysis, shell gathering, web fetch, restore/search, capture, and snapshot use cases to concrete tools.
- [ ] No generated surfaces are hand-edited.
- [ ] Focused tests, lint, and typecheck pass.

#### [hooks] Task 1.2: Broaden host hook matchers without overclaiming parity

**Status:** todo

**Depends:** None

Replace the current Claude anti-parity matcher expectation with positive host
coverage. Claude should route supported context-heavy tools through PreToolUse
and broad PostToolUse capture. Codex should retain its host-realistic matcher
set and generic MCP coverage. Cursor/OpenCode capability rows must describe the
same behavior truthfully, with degraded paths documented instead of silently
emitted as invalid config. (F2, F6)

**Files:**

- Modify: `src/cli/commands/init/scaffolders/agent-hooks/index.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/index.test.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/emitters/claude.test.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts`

**Steps (TDD):**

1. Write failing tests that Claude generated settings include `Read`, `Grep`, `WebFetch`, `Agent`, and `mcp__.*` where supported, and that Codex/Cursor/OpenCode capability rows remain host-accurate.
2. Run: `./bin/wp test --file src/cli/commands/init/scaffolders/agent-hooks/index.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/emitters/claude.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts` — verify FAIL.
3. Update matcher constants and capability notes; do not modify generated local `.claude` or `.codex` files by hand.
4. Run: `./bin/wp test --file src/cli/commands/init/scaffolders/agent-hooks/index.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/emitters/claude.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts` — verify PASS.
5. Run: `./bin/wp lint src/cli/commands/init/scaffolders/agent-hooks` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] Claude PreToolUse covers context-heavy native tools and generic MCP calls.
- [ ] Claude PostToolUse fires for broad continuity capture without creating invalid hook config.
- [ ] Codex, Cursor, and OpenCode rows remain truthful about supported/degraded lifecycles.
- [ ] The old test asserting absence of `Read`, `Grep`, `WebFetch`, and `Agent` is replaced by positive parity coverage.
- [ ] Focused tests, lint, and typecheck pass.

#### [guard] Task 1.3: Route raw large-context operations to concrete `wp_session_*` tools

**Status:** todo

**Depends:** `wp_session_execute`, `wp_session_batch_execute`,
`wp_session_execute_file`, `wp_session_fetch_and_index`, and
`wp_session_search` handlers exist and pass their focused tests.

Upgrade `wp-pretool-guard` routing from generic bounded-output advice to concrete
session-memory tool guidance. Raw `cat`/large file analysis should point to
`wp_session_execute_file`; `grep`/`find`/`git log`/large shell gathering should
point to `wp_session_execute` or `wp_session_batch_execute`; `curl`/`wget` and
host web-fetch equivalents should point to `wp_session_fetch_and_index`; recall
or resume prompts should point to `wp_session_search` or `wp_session_restore`.
Preserve loop prevention for calls that are already inside a session-memory
sandbox and preserve dev-workflow `wp_test`/`wp_lint` priority. (F3)

**Files:**

- Modify: `src/hooks/pretool-guard/dev-routing.ts`
- Modify: `src/hooks/pretool-guard/dev-routing.test.ts`
- Modify: `src/hooks/pretool-guard/coordinated-routing.test.ts`
- Modify: `src/hooks/pretool-guard/runner.test.ts`

**Steps (TDD):**

1. Write failing tests for raw `cat`, `grep`, `find`, `git log`, `curl`, `wget`, and MCP payload routing to specific `wp_session_*` guidance.
2. Run: `./bin/wp test --file src/hooks/pretool-guard/dev-routing.test.ts --file src/hooks/pretool-guard/coordinated-routing.test.ts --file src/hooks/pretool-guard/runner.test.ts` — verify FAIL.
3. Implement the smallest routing changes; keep dev-workflow denials higher priority than session-memory nudges.
4. Run: `./bin/wp test --file src/hooks/pretool-guard/dev-routing.test.ts --file src/hooks/pretool-guard/coordinated-routing.test.ts --file src/hooks/pretool-guard/runner.test.ts` — verify PASS.
5. Run: `./bin/wp lint src/hooks/pretool-guard` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] Data-heavy raw commands deny/nudge with a concrete `wp_session_*` tool name.
- [ ] Already-session-sandboxed calls do not recurse into a deny loop.
- [ ] Dev-workflow tools still route to `wp_test`, `wp_lint`, `wp_typecheck`, `wp_qa`, `wp_e2e`, `wp_ci_act`, and `wp_worker_tail` first.
- [ ] Guidance is concise enough for PreToolUse host output.
- [ ] Focused tests, lint, and typecheck pass.

#### [capture] Task 1.4: Broaden PostToolUse continuity capture for read/search/shell/MCP events

**Status:** todo

**Depends:** Typed continuity events from
`2026-06-13-session-continuity-and-resume-parity` are present in source.

Ensure the post-tool hook records bounded continuity for the same broad surfaces
that enforcement now routes: reads, edits, shell commands, grep/search-style
operations, web-fetch/MCP summaries, and denied-route outcomes where host input
provides enough metadata. Capture must remain fail-open, byte-capped, and
redacted; it must not shell out or persist raw large payloads. (F4)

**Files:**

- Modify: `src/hooks/post-tool/lint-after-edit.ts`
- Modify: `src/hooks/post-tool/lint-after-edit.test.ts`
- Modify: `src/session-memory/hook-capture.ts`
- Modify: `src/session-memory/hook-capture.test.ts`

**Steps (TDD):**

1. Write failing tests for bounded read, command, search, web/MCP, and edit capture summaries with secret redaction and truncation.
2. Run: `./bin/wp test --file src/hooks/post-tool/lint-after-edit.test.ts --file src/session-memory/hook-capture.test.ts` — verify FAIL.
3. Implement minimal capture classification and summary generation; do not change storage schema unless the upstream typed-event contract requires it.
4. Run: `./bin/wp test --file src/hooks/post-tool/lint-after-edit.test.ts --file src/session-memory/hook-capture.test.ts` — verify PASS.
5. Run: `./bin/wp lint src/hooks/post-tool src/session-memory/hook-capture.ts src/session-memory/hook-capture.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] PostToolUse stores bounded continuity for reads, commands, edits, and MCP/web-style events where host payloads support it.
- [ ] Capture never persists full raw large output or secrets.
- [ ] Capture failures stay no-op and do not block host tool execution.
- [ ] Focused tests, lint, and typecheck pass.

## Phase 2: replacement proof [Complexity: L]

#### [smoke] Task 2.1: Add host-smoke coverage for enforced session-memory routing

**Status:** todo

**Depends:** Task 1.1, Task 1.2, Task 1.3, Task 1.4

Extend existing host smoke fixtures so replacement behavior is exercised through
the same setup paths users run. The smoke must prove generated Claude/Codex
surfaces contain session-memory routing, PreToolUse catches representative raw
large-context operations, and PostToolUse capture remains bounded. Cursor and
OpenCode expectations must reflect the capability matrix rather than forcing
unsupported behavior. (F2, F6, F7)

**Files:**

- Modify: `src/__integration__/reference-parity-host-smoke.fixtures.ts`
- Modify: `src/__integration__/reference-parity-host-smoke.integration.test.ts`
- Modify: `src/cli/commands/init/host-smoke.e2e.test.ts`

**Steps (TDD):**

1. Write failing integration assertions for generated host routing text, matcher coverage, representative guard decisions, and degraded-host notes.
2. Run: `./bin/wp test --file src/__integration__/reference-parity-host-smoke.integration.test.ts --file src/cli/commands/init/host-smoke.e2e.test.ts` — verify FAIL.
3. Update fixtures and setup-smoke expectations only; do not hand-edit generated runtime surfaces.
4. Run: `./bin/wp test --file src/__integration__/reference-parity-host-smoke.integration.test.ts --file src/cli/commands/init/host-smoke.e2e.test.ts` — verify PASS.
5. Run: `./bin/wp lint src/__integration__/reference-parity-host-smoke.fixtures.ts src/__integration__/reference-parity-host-smoke.integration.test.ts src/cli/commands/init/host-smoke.e2e.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] Host smoke proves enforced `wp_session_*` routing for Claude and Codex.
- [ ] Degraded Cursor/OpenCode rows match capability matrix claims.
- [ ] Smoke remains fixture-backed and does not require live host credentials.
- [ ] Focused tests, lint, and typecheck pass.

#### [qa] Task 2.2: Extend reference parity and session-memory benchmark gates

**Status:** todo

**Depends:** Task 1.1, Task 1.2, Task 1.3, Task 1.4

Promote enforcement to a measured replacement axis. The reference parity matrix
and benchmark dry-run should distinguish “tool exists” from “agent is routed to
it before context flooding.” Add rows/threshold fields for routing injection,
PreToolUse session redirect, PostToolUse broad capture, and registry/routing
consistency. (F1, F7)

**Files:**

- Modify: `docs/bench/reference-parity-matrix.md`
- Modify: `src/audit/reference-parity-matrix.ts`
- Modify: `src/audit/reference-parity-matrix.test.ts`
- Modify: `src/cli/commands/bench/session-memory.ts`
- Modify: `src/cli/commands/bench/session-memory.test.ts`
- Modify: `src/__integration__/reference-parity-bench.integration.test.ts`

**Steps (TDD):**

1. Write failing parity/audit/bench tests for enforcement axes and release-claim blocking when any axis is open or degraded.
2. Run: `./bin/wp test --file src/audit/reference-parity-matrix.test.ts --file src/cli/commands/bench/session-memory.test.ts --file src/__integration__/reference-parity-bench.integration.test.ts` — verify FAIL.
3. Add enforcement rows and dry-run report fields without introducing live API or credential requirements.
4. Run: `./bin/wp test --file src/audit/reference-parity-matrix.test.ts --file src/cli/commands/bench/session-memory.test.ts --file src/__integration__/reference-parity-bench.integration.test.ts` — verify PASS.
5. Run: `./bin/wp bench session-memory --dry-run`, `./bin/wp audit reference-parity-matrix --json`, `./bin/wp lint docs/bench/reference-parity-matrix.md src/audit/reference-parity-matrix.ts src/audit/reference-parity-matrix.test.ts src/cli/commands/bench/session-memory.ts src/cli/commands/bench/session-memory.test.ts src/__integration__/reference-parity-bench.integration.test.ts`, and `./bin/wp typecheck`.

**Acceptance:**

- [ ] Reference parity distinguishes availability, enforcement, capture, and host support.
- [ ] Release-ready parity claims fail closed when enforcement evidence is missing.
- [ ] Benchmark dry-run reports enforcement axes without live credentials.
- [ ] Focused tests, bench dry-run, audit, lint, and typecheck pass.

## Phase 3: docs, public package, and lifecycle readiness [Complexity: M]

#### [docs] Task 3.1: Publish claim-safe docs and package-surface proof

**Status:** todo

**Depends:** Task 2.1, Task 2.2

Update public docs after behavior proof exists. README, session-memory guide,
hook matrix, and hooks doctor docs should explain that `wp_session_*` is the
canonical context-saving path, list host support truthfully, and link to parity
proof. Because this touches public package surfaces, run package/tarball and
secret/path gates before any release-facing full-parity language lands. (F5, F7)

**Files:**

- Modify: `README.md`
- Modify: `docs/guides/session-memory.md`
- Modify: `docs/hook-matrix.md`
- Modify: `docs/hooks-doctor.md`
- Modify: `CHANGELOG.md`

**Steps (TDD):**

1. Write or update docs/audit expectations so docs cannot claim full parity while reference-parity enforcement rows are open.
2. Run: `./bin/wp audit reference-parity-matrix --strict` — verify it fails before enforcement evidence is complete, or document the expected open rows in the task notes.
3. Update public docs and changelog language to match the proven host support matrix.
4. Run: `./bin/wp audit docs-frontmatter`, `./bin/wp audit blueprint-lifecycle`, `./bin/wp audit reference-parity-matrix --json`, `npm pack --dry-run --json`, `vp run lint:pkg`, `vp run verify:secrets`, `vp run verify:paths`, and `./bin/wp lint README.md docs/guides/session-memory.md docs/hook-matrix.md docs/hooks-doctor.md CHANGELOG.md`.
5. If any public-package or secret/path gate fails, fix the root cause before marking the task done.

**Acceptance:**

- [ ] Public docs name only `wp_session_*` for session-memory context-saving guidance.
- [ ] Docs accurately separate full, partial, degraded, and unsupported host behavior.
- [ ] Reference parity release gate backs any full-parity claim.
- [ ] Package tarball, package lint, secret, path, docs, blueprint, and lint gates pass.

## Edge Cases

| ID | Scenario | Expected handling | Severity |
| -- | -------- | ----------------- | -------- |
| E1 | `wp_session_*` MCP tools are not loaded in a host yet | Guidance tells the agent to load/use the Webpresso MCP surface or fall back only where a safe direct `wp` command exists; no raw large output fallback by default. | HIGH |
| E2 | PreToolUse sees a command already inside `wp_session_execute` or compatible sandbox call | Guard passes through to avoid recursion. | HIGH |
| E3 | Claude supports a matcher that Codex does not | Matcher sets diverge by host; capability matrix records the difference. | MEDIUM |
| E4 | PostToolUse receives a huge MCP/web payload | Capture stores a bounded summary/reference only, with truncation metadata. | HIGH |
| E5 | Web fetch target may be internal/private | Routing points to `wp_session_fetch_and_index`; SSRF hardening blueprint remains a dependency. | HIGH |
| E6 | Existing sibling blueprint lifecycle is stale relative to source | Implementation verifies source artifacts first and reconciles lifecycle rather than recreating files. | MEDIUM |
| E7 | Full parity docs are updated before proof is green | Reference parity strict gate fails closed. | HIGH |

## Risks and Mitigations

| Risk | Impact | Mitigation | Related finding |
| ---- | ------ | ---------- | --------------- |
| Over-broad hook matchers break host config | Users lose hook functionality or see invalid config | Fixture-backed host smoke and capability matrix tests before docs claim support. | F2, F6 |
| PreToolUse creates sandbox echo loops | Agents get stuck retrying the same denied operation | Explicit already-sandboxed pass-through tests in Task 1.3. | F3 |
| Docs outrun implementation | Public replacement claim becomes false | Serialize docs/package task after host smoke and reference parity pass. | F7 |
| Duplicate sibling-plan work | Rework and file conflicts | Entry gate verifies current source and treats stale planned blueprints as lifecycle drift. | F5 |
| New routing mentions unregistered tools | Agents follow broken guidance | Registry/routing consistency test in Task 1.1. | F1 |

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 7 |
| Critical | 0 |
| High | 5 |
| Medium | 2 |
| Low | 0 |
| Fixes applied to blueprint | 7/7 |
| Cross-plans aligned | 5 |
| Edge cases documented | 7 |
| Risks documented | 5 |
| Parallelization score | B |
| Critical path | 3 waves |
| Max parallel agents | 5 |
| Total tasks | 7 |
| Blueprint compliant | 7/7 |
