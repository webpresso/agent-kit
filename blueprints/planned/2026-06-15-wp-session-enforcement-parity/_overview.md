---
type: blueprint
title: "WP-native session-memory enforcement parity"
owner: ozby
status: planned
complexity: XL
created: '2026-06-15'
last_updated: '2026-06-15'
progress: '0% (planned; refined with agent-kit:plan-refine, autoresearch parity matrix, and eng-review hardening on 2026-06-15)'
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
continuity events, and prove the claim with host-smoke, audit, benchmark, and
public-package gates.

## Product wedge anchor

The repo already ships local `wp_session_*` tools and continuity storage. The
missing wedge is enforcement: agents can have the tools installed while still
seeing only dev-workflow routing guidance, and current hook matchers do not yet
cover the full context-mode-style surfaces. This blueprint turns the shipped tool
surface into the first-choice path without introducing a second public namespace,
a daemon, hosted memory, graph memory, or LLM-extracted personalization.

## Planning Summary

- Goal input: `Make agent-kit 100% for context-mode replacement behavior`
- Parity target: **WP-native coding-agent context-window enforcement parity**.
  Context-mode is behavior evidence; public guidance and tests use only
  `wp_session_*` names.
- Complexity: `XL`
- Output path:
  `blueprints/planned/2026-06-15-wp-session-enforcement-parity/_overview.md`
- Refinement scope: this blueprint plus lifecycle/alignment notes in related
  blueprints when source truth proves they are stale.
- Execution rule: verify source and security prerequisites first; never promote
  shell or web-fetch routing before command sandboxing and SSRF gates are green.

## Architecture Overview

```text
SessionStart / AGENTS / host rules
  -> combined wp_routing + wp_session context-window-protection guidance
  -> PreToolUse guard before raw context-heavy output enters the transcript
  -> wp_session_* MCP tools for bounded execution, indexing, search, restore
  -> PostToolUse/UserPromptSubmit/PreCompact/PostToolBatch continuity capture
  -> reference-parity + host-smoke + hook-doctor + package-safety gates
```

## Fact-Check Findings

| ID | Severity | Claim / assumption checked | Reality verified | Blueprint fix |
| -- | -------- | -------------------------- | ---------------- | ------------- |
| F1 | HIGH | Session-memory tools exist but are not being used because hooks do not enforce them. | `src/mcp/tools/session-*.ts` files and README list `wp_session_*`, but `src/hooks/shared/routing-block.ts` currently lists only dev-workflow tools. | Task 1.1 adds first-class `wp_session_*` routing guidance and registry/routing consistency tests. |
| F2 | HIGH | Agent-kit has context-mode-equivalent hook breadth. | Current Claude defaults are `Bash|Write|Edit|MultiEdit` and `Write|Edit|MultiEdit`; context-mode covers `Read`, `Grep`, `WebFetch`, `Agent`, broad MCP, and broad PostToolUse. | Task 1.2 broadens only host-supported matchers and replaces anti-parity expectations with positive coverage. |
| F3 | HIGH | PreToolUse already points data-heavy commands to shipped session-memory tools. | `src/hooks/pretool-guard/dev-routing.ts` emits generic bounded guidance for `cat`, `grep`, `find`, `curl`, `git log`, and build output; loop detection still references `ctx_execute` compatibility. | Task 1.3 changes guidance to concrete `wp_session_*` tools and makes loop identity WP-only. |
| F4 | MEDIUM | PostToolUse capture is broad enough once handlers exist. | `src/hooks/post-tool/lint-after-edit.ts` already classifies reads/edits/commands, but installed matchers and result-summary handling are narrower than the intended behavior. | Task 1.4 reuses existing capture and expands bounded metadata-first summaries. |
| F5 | HIGH | Existing planned sibling blueprints can be used as-is. | Several sibling plans are still `planned` even though source files already contain some intended artifacts. | Wave -1 verifies source truth and reconciles stale lifecycle notes before implementation duplicates work. |
| F6 | MEDIUM | Codex and Claude can share identical hook semantics. | Codex and Claude matcher grammars differ; Claude docs confirm native `Read`, `Grep`, `WebFetch`, `Agent`, MCP matching, `PostToolUse`, and `PostToolBatch`, while Codex has its own matcher reality. | Task 1.2 keeps host-specific matchers and documents degraded paths instead of emitting invalid config. |
| F7 | HIGH | Public replacement claims are docs-only. | README, docs, hook matrices, generated fixtures, and package tarballs are public/package surfaces. | Task 3.1 serializes docs and release-claim language behind parity, package-surface, secret, path, and tarball gates. |
| F8 | HIGH | Wave 0 can start with a soft note about concrete tools/lifecycle. | Command execution and fetch/index are security-sensitive; related blueprints are dependencies, not background notes. | Add Wave -1 preflight gates for tool/source, command/fetch safety, and typed capture contracts. |
| F9 | HIGH | Existing `ctx_*` sandbox loop detection can remain as compatibility. | Public values require one namespace; compatibility names in routing logic would keep a second dialect alive. | Use a WP-only `isSessionSandboxTool` predicate for `wp_session_execute`, `wp_session_batch_execute`, and host-prefixed MCP variants. |
| F10 | HIGH | PostToolBatch can remain deferred. | Claude Code exposes `PostToolBatch` after a batch of parallel tool calls and includes successful tool response payloads in hook schemas. | Include bounded PostToolBatch result summaries now; never store raw full outputs or secrets. |
| F11 | MEDIUM | Capture requires a storage rewrite. | Existing `buildContinuityEvent`, store, provenance, and preview caps already provide most behavior. | Reuse existing capture/storage; touch `hook-capture` only for missing tests or redaction gaps. |
| F12 | MEDIUM | Verification can use legacy `vp run` commands. | Current routing contract requires wp MCP/direct `./bin/wp`; `vp run` wrappers are explicitly forbidden for wp workflows. | Replace stale `vp run ...` verification with `./bin/wp audit ...`, `./bin/wp lint`, and `npm pack --dry-run --json`. |
| F13 | LOW | File action verbs can drift. | Existing blueprint task inventories mix future edits and stale wording. | Normalize task file inventories to `Create` and `Modify` only. |
| F14 | HIGH | Missing launcher blast radius is already covered by fail-closed PreToolUse. | Fail-closed protects policy, but users need a repair path that proves setup/doctor can restore hook health. | Host smoke must include missing-launcher denial plus `wp hooks doctor`/`--fix` repair evidence. |
| F15 | MEDIUM | Broad capture is safe by default. | PostToolUse/PostToolBatch fire on hot paths; shellouts or large payload persistence would add latency and leak risk. | Add no-shellout, byte-cap, redaction, fail-open, and burst-latency acceptance. |
| F16 | MEDIUM | Literal context-mode `mcp__` matcher syntax can be copied. | Host matcher syntaxes differ; Claude supports MCP tool-name matching, while current Codex config uses `mcp__.*`. | Use host-valid MCP matchers and test emitted fixtures per host. |

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Public namespace | `wp_session_*` only | Avoid a second dialect; context-mode names remain comparator/test input only, never public guidance. |
| Enforcement style | Deny or explicit nudge before raw context enters the host | Session tools are valuable only when the model is routed before large output is read. |
| Host parity | Maximize per host, document degradations | Claude, Codex, Cursor, and OpenCode differ; generated config must stay valid per host. |
| Storage/runtime | Reuse existing session-memory stores and MCP handlers | No new daemon, dependency, graph store, or parallel memory layer. |
| Capture scope | Metadata-first PostToolUse plus bounded PostToolBatch summaries | Capture enough continuity to resume/reason without storing raw full payloads or secrets. |
| Sandbox identity | WP-only `wp_session_*` loop detection | Keep the public and internal mental model clean after the port. |
| Safety posture | Fail open for capture, fail closed for missing policy guard | Preserve agent operation while preventing silent bypass of mandatory routing. |
| Package posture | Treat routing docs, hook matchers, and parity claims as public package surfaces | Requires package-surface, tarball, secret, and path checks before release claims. |

## Technology and Public-Package Safety Notes

| Area | Choice | Safety / verification note |
| ---- | ------ | -------------------------- |
| Routing source | `src/hooks/shared/routing-block.ts` remains canonical | Add a `wp_session_*` hierarchy and tests; avoid generated-surface hand edits. |
| Hook setup | Existing `WP_HOOK_SPECS` + host matcher sets | Keep one IR with host-specific matcher strings; add PostToolBatch only where host-supported. |
| PreToolUse guard | Existing `dev-routing.ts` / runner pipeline | Add session-memory redirects before raw-output validators; preserve dev-workflow priority. |
| Capture | Existing `post-tool`, `guard-switch`, `precompact`, `sessionstart`, and session-memory store | Reuse typed events, byte caps, and previews; capture failures remain no-op. |
| MCP tools | Existing `wp_session_*` descriptors | Registry/routing tests prove every tool named in guidance is registered. |
| Public package | README, docs, hook fixtures, package manifest/tarball | Run `wp audit package-surface`, `secrets-policy`, `absolute-path-policy`, hook audits, and tarball dry-run before claim language ships. |

## Autoresearch Parity Matrix (2026-06-15)

`$autoresearch` produced the detailed supporting matrix in
[`parity-matrix.md`](./parity-matrix.md)
and compared the local agent-kit/context-mode behavior against the relevant
memory/context ecosystem: context-mode, Claude-Mem, Hindsight, Mem0,
Zep/Graphiti, Cognee, Redis Agent Memory Server, OpenAI Agents SDK Sessions,
LangMem/LangGraph, LlamaIndex Memory, AutoGen memory, and Letta/MemGPT-style
stateful agents.

| Capability axis | Closest comparators | Blueprint target |
| ---------------- | ------------------- | ---------------- |
| Hook-enforced coding-agent routing | context-mode | `wp_session_*` routing guidance is injected into supported host sessions and generated instruction surfaces. |
| Raw-output prevention before transcript pollution | context-mode | PreToolUse redirects high-volume `Bash`, `Read`, `Grep`, `WebFetch`, `Agent`, and MCP flows to concrete `wp_session_*` tools where each host supports matching. |
| Broad continuity capture | context-mode, Claude-Mem, Hindsight | PostToolUse/UserPromptSubmit/PreCompact/PostToolBatch capture bounded summaries of edits, reads, searches, commands, tool failures, decisions, and task state. |
| Progressive disclosure | Claude-Mem, context-mode, Mem0/Zep/Cognee patterns | `wp_session_search`/`restore` return compact previews and stable references; detailed content is fetched only by narrow query/reference. |
| Diagnostics and proof gates | context-mode doctor/stats, agent-kit audits | `wp_session_doctor`, `wp hooks doctor`, host-smoke fixtures, reference-parity rows, package/tarball checks, and docs gates prove claims before release language changes. |
| Long-term semantic/graph learning | Mem0, Zep/Graphiti, Cognee, Letta | Explicit non-goal; no graph memory, hosted memory API, LLM extraction, personalization, or autonomous reflection is added here. |

**Parity boundary:** agent-kit should match context-mode on the **coding-agent
context-window enforcement** axis, not on every broader memory-platform feature.
Framework/platform memory systems inform vocabulary and future options, but the
current implementation stays local, hook-driven, and WP-native.

## Cross-Plan Alignment

| Related plan | Relationship | Alignment rule |
| ------------ | ------------ | -------------- |
| `2026-06-13-session-continuity-and-resume-parity` | Upstream continuity/capture contract | Wave -1 verifies typed events, SessionStart restore, and PreCompact behavior; implementation reuses storage instead of redesigning it. |
| `2026-06-13-sandboxed-knowledge-tool-surface-parity` | Upstream MCP tool surface | Wave -1 consumes concrete `wp_session_*` descriptors; if lifecycle state is stale, reconcile before creating duplicate files. |
| `2026-06-14-mcp-session-command-sandboxing` | Security dependency for shell execution tools | Shell guidance cannot point to `wp_session_execute` until injection/cwd/consent validation remains green. |
| `2026-06-14-session-fetch-index-ssrf-protection` | Security dependency for web fetch routing | WebFetch/curl guidance must point only to SSRF-hardened `wp_session_fetch_and_index`. |
| `2026-06-13-reference-parity-regression-and-host-smoke-gate` | Downstream proof gate | Extend existing parity matrix/bench/host smoke instead of creating a separate proof system. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| ---- | ----- | ------------ | -------------- | ---------------- |
| **Wave -1** | 0.1, 0.2, 0.3 | None | 3 agents | XS-S |
| **Wave 0** | 1.1, 1.2, 1.3, 1.4, 1.5 | Wave -1 gates as listed per task | 5 agents | S-M |
| **Wave 1** | 2.1, 2.2 | Tasks 1.1-1.5 | 2 agents | S-M |
| **Wave 2** | 3.1 | Tasks 2.1, 2.2 | 1 agent | S |
| **Critical path** | 0.1 → 1.1 → 2.1 → 3.1 | — | 4 waves | XL |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in first executable wave | ≥ planned agents / 2 | 3 for 5 planned agents |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 11 / 4 = 2.75 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 16 / 11 = 1.45 |
| CP | same-file overlaps per wave | 0 | 0 |
| Parallelization score | A-D score | B or better | A |

**Refinement delta:** Wave -1 turns source/security assumptions into explicit
preflight gates. Wave 0 stays file-clustered by routing, host matcher setup,
PreToolUse redirects, PostToolUse capture, and a separate PostToolBatch handler so the
plan can run with 5 agents without same-file conflicts.

## Wave -1: preflight gates [Complexity: M]

#### [preflight] Task 0.1: Verify `wp_session_*` source and registry truth

**Status:** todo

**Depends:** None

Before editing routing text, prove the session-memory tool source exists and the
MCP registry exposes the public names the guidance will mention. Treat sibling
blueprint state as advisory; source and focused tests are the authority. If the
source is already complete but the sibling blueprint remains stale, record the
lifecycle drift instead of recreating files. (F5, F8)

**Files:**

- No source changes expected; update lifecycle/task notes only if source truth
  contradicts sibling blueprint state.

**Steps (TDD):**

1. Run: `./bin/wp test --file src/mcp/tools/_registry.test.ts --file src/mcp/server.integration.test.ts` — verify PASS before dependent tasks start.
2. Inspect `src/mcp/tools/session-*.ts` and `docs/guides/session-memory.md` for the exact public `wp_session_*` names.
3. If tests fail because a tool is missing, stop dependent tasks and finish/reconcile `2026-06-13-sandboxed-knowledge-tool-surface-parity` first.
4. If source passes but lifecycle is stale, record the drift in the relevant blueprint task notes before proceeding.

**Acceptance:**

- [ ] Every `wp_session_*` tool referenced by this blueprint exists in source and is registered.
- [ ] Missing or stale sibling lifecycle state is explicitly reconciled or documented.
- [ ] No duplicate tool files are planned or created.

#### [preflight] Task 0.2: Verify command sandboxing and fetch/index safety gates

**Status:** todo

**Depends:** None

Before routing raw shell and web-fetch traffic into session-memory tools, prove
that command execution still enforces explicit consent, cwd/repo validation,
output caps, and SSRF protections. If either security blueprint has not landed,
this task blocks only the affected shell/fetch routing, not the rest of the
SessionStart guidance. (F8)

**Files:**

- No source changes expected; update lifecycle/task notes only if security gate
  status differs from the sibling blueprint state.

**Steps (TDD):**

1. Run: `./bin/wp test --file src/mcp/tools/session-execute.test.ts --file src/mcp/tools/session-batch-execute.test.ts --file src/mcp/tools/session-execute-file.test.ts` — verify execute consent, cwd/repo validation, and output-cap behavior PASS.
2. Run: `./bin/wp test --file src/mcp/tools/session-fetch-and-index.test.ts --file src/session-memory/fetch-index.test.ts --file src/session-memory/ip-guard.test.ts` — verify SSRF, URL normalization, byte cap, and warning behavior PASS.
3. Run: `./bin/wp audit reference-parity-matrix --json` and record current release-gate readiness.
4. If any security proof fails, block the corresponding routing subsection and reconcile the sibling security blueprint first.

**Acceptance:**

- [ ] Shell routing is allowed only after execute consent, cwd, and output-cap tests pass.
- [ ] WebFetch/curl routing is allowed only after SSRF/fetch safety tests pass.
- [ ] Failed preflight produces a clear blocked dependency, not partial unsafe guidance.

#### [preflight] Task 0.3: Verify typed continuity and capture contract

**Status:** todo

**Depends:** None

Before broadening capture, prove the existing typed continuity event store,
restore/search preview behavior, and PreCompact/UserPromptSubmit capture are the
right primitives to reuse. This prevents a storage rewrite and keeps the change
small. (F4, F11, F15)

**Files:**

- No source changes expected; update lifecycle/task notes only if capture
  contract state differs from the sibling blueprint state.

**Steps (TDD):**

1. Run: `./bin/wp test --file src/session-memory/session.test.ts --file src/session-memory/store.test.ts --file src/session-memory/hook-capture.test.ts` — verify typed continuity storage, preview/provenance, and byte-cap behavior PASS.
2. Run: `./bin/wp test --file src/hooks/guard-switch/index.test.ts --file src/hooks/sessionstart/index.test.ts --file src/hooks/precompact/index.test.ts` — verify UserPromptSubmit, SessionStart, and PreCompact continuity behavior PASS.
3. Verify existing capture APIs provide byte caps, summaries, provenance IDs, and fail-open behavior.
4. If the typed event contract is missing, block Tasks 1.4 and 1.5 and reconcile `2026-06-13-session-continuity-and-resume-parity` first.

**Acceptance:**

- [ ] Capture work reuses existing typed continuity/store primitives.
- [ ] Storage rewrite, new daemon, or new dependency is explicitly out of scope.
- [ ] Hot-path constraints are recorded for Tasks 1.4 and 1.5.

## Wave 0: enforcement behavior [Complexity: XL]

#### [routing] Task 1.1: Add `wp_session_*` context-window routing guidance

**Status:** todo

**Depends:** Task 0.1

Update the canonical routing source so SessionStart, AGENTS, and generated host
instruction surfaces tell agents to use `wp_session_*` for context-saving work.
Keep the existing dev-workflow routing table, but add a separate session-memory
hierarchy: restore/search first, batch execute for shell gathering, execute-file
for read-to-analyze, fetch-and-index for network fetches, capture/snapshot for
manual continuity, stats/doctor for diagnostics, and purge only for explicit
reset. The text must use only `wp_session_*` public names and must not tell users
to call legacy context-mode names. (F1, F7, F9)

**Files:**

- Modify: `src/hooks/shared/routing-block.ts`
- Modify: `src/hooks/shared/instruction-surfaces.ts`
- Modify: `src/hooks/shared/routing-block.test.ts`
- Modify: `src/hooks/sessionstart/index.test.ts`
- Modify: `src/mcp/server.integration.test.ts`

**Steps (TDD):**

1. Write failing tests proving the routing block names every shipped public `wp_session_*` tool, includes context-window-protection guidance, and contains no legacy public `ctx_*` names.
2. Run: `./bin/wp test --file src/hooks/shared/routing-block.test.ts --file src/hooks/sessionstart/index.test.ts --file src/mcp/server.integration.test.ts` — verify FAIL.
3. Implement the minimal routing/instruction-surface changes; keep the existing dev-workflow table intact.
4. Run: `./bin/wp test --file src/hooks/shared/routing-block.test.ts --file src/hooks/sessionstart/index.test.ts --file src/mcp/server.integration.test.ts` — verify PASS.
5. Run: `./bin/wp lint src/hooks/shared src/hooks/sessionstart/index.test.ts src/mcp/server.integration.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] SessionStart additional context includes both dev-workflow routing and `wp_session_*` context-window routing.
- [ ] Every public `wp_session_*` name in the routing block is registered by the MCP server.
- [ ] Routing maps raw file analysis, shell gathering, web fetch, restore/search, capture, snapshot, diagnostics, and purge to concrete tools.
- [ ] No `ctx_*` names appear in public guidance.
- [ ] Focused tests, lint, and typecheck pass.

#### [hooks] Task 1.2: Broaden host hook matchers and managed lifecycle specs

**Status:** todo

**Depends:** Task 0.1

Replace the current Claude anti-parity matcher expectation with positive,
host-valid coverage. Claude should route supported context-heavy tools through
PreToolUse, broad PostToolUse, and PostToolBatch capture. Codex should retain its
host-realistic matcher set and generic MCP coverage. Cursor/OpenCode capability
rows must describe the same behavior truthfully, with degraded paths documented
instead of silently emitted as invalid config. (F2, F6, F10, F16)

**Files:**

- Modify: `src/cli/commands/init/scaffolders/agent-hooks/ir.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/index.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/index.test.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/emitters/claude.test.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts`

**Steps (TDD):**

1. Write failing tests that Claude generated settings include host-valid `Read`, `Grep`, `WebFetch`, `Agent`, MCP matching, broad PostToolUse, and PostToolBatch where supported.
2. Write failing tests that Codex/Cursor/OpenCode capability rows remain host-accurate and do not copy invalid Claude matcher syntax.
3. Run: `./bin/wp test --file src/cli/commands/init/scaffolders/agent-hooks/index.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/emitters/claude.test.ts --file src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.test.ts` — verify FAIL.
4. Update matcher constants, managed hook specs, launcher generation, and capability notes; do not modify generated local `.claude` or `.codex` files by hand.
5. Run the same focused tests — verify PASS.
6. Run: `./bin/wp lint src/cli/commands/init/scaffolders/agent-hooks` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] Claude PreToolUse covers context-heavy native tools and generic MCP calls with valid matcher syntax.
- [ ] Claude PostToolUse and PostToolBatch are emitted only where the host supports them.
- [ ] Codex, Cursor, and OpenCode rows remain truthful about supported/degraded lifecycles.
- [ ] The old test asserting absence of `Read`, `Grep`, `WebFetch`, and `Agent` is replaced by positive parity coverage.
- [ ] Focused tests, lint, and typecheck pass.

#### [guard] Task 1.3: Route raw large-context operations to concrete `wp_session_*` tools

**Status:** todo

**Depends:** Task 0.1, Task 0.2

Upgrade `wp-pretool-guard` routing from generic bounded-output advice to concrete
session-memory tool guidance. Raw `cat`/large file analysis should point to
`wp_session_execute_file`; `grep`/`find`/`git log`/large shell gathering should
point to `wp_session_execute` or `wp_session_batch_execute`; `curl`/`wget` and
host web-fetch equivalents should point to `wp_session_fetch_and_index`; recall
or resume prompts should point to `wp_session_search` or `wp_session_restore`.
Loop prevention must recognize only WP session-memory tool identities and their
host-prefixed MCP variants. Dev-workflow tools keep priority. (F3, F8, F9)

**Files:**

- Modify: `src/hooks/pretool-guard/dev-routing.ts`
- Modify: `src/hooks/pretool-guard/dev-routing.test.ts`
- Modify: `src/hooks/pretool-guard/coordinated-routing.test.ts`
- Modify: `src/hooks/pretool-guard/runner.test.ts`

**Steps (TDD):**

1. Write failing tests for raw `cat`, `grep`, `find`, `git log`, `curl`, `wget`, and MCP payload routing to specific `wp_session_*` guidance.
2. Write failing tests proving `ctx_execute`/`ctx_batch_execute` are not public loop-bypass names and WP-prefixed MCP session tools are bypassed to avoid recursion.
3. Run: `./bin/wp test --file src/hooks/pretool-guard/dev-routing.test.ts --file src/hooks/pretool-guard/coordinated-routing.test.ts --file src/hooks/pretool-guard/runner.test.ts` — verify FAIL.
4. Implement the smallest routing changes; keep dev-workflow denials higher priority than session-memory nudges.
5. Run the same focused tests — verify PASS.
6. Run: `./bin/wp lint src/hooks/pretool-guard` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] Data-heavy raw commands deny/nudge with a concrete `wp_session_*` tool name.
- [ ] Already-WP-session-sandboxed calls do not recurse into a deny loop.
- [ ] Legacy `ctx_*` names are not advertised as public loop identity.
- [ ] Dev-workflow tools still route to `wp_test`, `wp_lint`, `wp_typecheck`, `wp_qa`, `wp_e2e`, `wp_ci_act`, and `wp_worker_tail` first.
- [ ] Focused tests, lint, and typecheck pass.

#### [capture] Task 1.4: Broaden PostToolUse continuity capture by reusing existing storage

**Status:** todo

**Depends:** Task 0.3

Ensure the post-tool hook records bounded continuity for the same broad surfaces
that enforcement now routes: reads, edits, shell commands, grep/search-style
operations, web-fetch/MCP metadata, and denied-route outcomes where host input
provides enough metadata. Capture must remain fail-open, byte-capped, redacted,
and no-shellout. Reuse existing `buildContinuityEvent` and store behavior; change
storage only if a focused test proves a contract gap. (F4, F11, F15)

**Files:**

- Modify: `src/hooks/post-tool/lint-after-edit.ts`
- Modify: `src/hooks/post-tool/lint-after-edit.test.ts`
- Modify: `src/session-memory/hook-capture.test.ts`

**Steps (TDD):**

1. Write failing tests for bounded read, command, search, web/MCP metadata, denied-route, and edit capture summaries with secret redaction and truncation.
2. Run: `./bin/wp test --file src/hooks/post-tool/lint-after-edit.test.ts --file src/session-memory/hook-capture.test.ts` — verify FAIL.
3. Implement minimal capture classification and summary generation without adding shellouts or a storage rewrite.
4. Run the same focused tests — verify PASS.
5. Run: `./bin/wp lint src/hooks/post-tool src/session-memory/hook-capture.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] PostToolUse stores bounded continuity for reads, commands, edits, and MCP/web-style metadata where host payloads support it.
- [ ] Capture never persists full raw large output or secrets.
- [ ] Capture failures stay no-op and do not block host tool execution.
- [ ] Hot-path code performs no shellouts.
- [ ] Focused tests, lint, and typecheck pass.

#### [capture] Task 1.5: Add bounded PostToolBatch result summaries

**Status:** todo

**Depends:** Task 0.3

Add a bounded, PostToolBatch-specific handler path so parallel tool batches
produce durable continuity without storing raw full results. Summaries should
record tool names, success/failure counts, result sizes, truncation metadata, and
safe previews only. Keep this file cluster independent from the PostToolUse
`lint-after-edit.*` files; Task 1.2 owns host hook emission, Task 1.5 owns the
batch handler and summarizer. Integration proof happens in Task 2.1. (F10, F15)

**Files:**

- Create: `src/hooks/post-tool/posttoolbatch.ts`
- Create: `src/hooks/post-tool/posttoolbatch.test.ts`
- Create: `src/hooks/post-tool/batch-summary.ts`
- Create: `src/hooks/post-tool/batch-summary.test.ts`
- Modify: `src/hooks/shared/types.ts`

**Steps (TDD):**

1. Write failing tests for `PostToolBatch` inputs containing multiple successful and failed tool results.
2. Write negative tests proving raw `stdout`, web payloads, MCP text, and secret-like strings are not persisted beyond configured preview caps.
3. Run: `./bin/wp test --file src/hooks/post-tool/batch-summary.test.ts --file src/hooks/post-tool/posttoolbatch.test.ts` — verify FAIL.
4. Implement a small batch summarizer plus a dedicated PostToolBatch hook handler; Task 1.2 wires host emission independently.
5. Run the same focused tests — verify PASS.
6. Run: `./bin/wp lint src/hooks/post-tool/posttoolbatch.ts src/hooks/post-tool/posttoolbatch.test.ts src/hooks/post-tool/batch-summary.ts src/hooks/post-tool/batch-summary.test.ts src/hooks/shared/types.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] PostToolBatch continuity captures bounded result metadata and safe previews.
- [ ] Raw full payloads, large outputs, and secrets are not persisted.
- [ ] Batch capture remains fail-open and no-shellout.
- [ ] Focused tests, lint, and typecheck pass.

## Wave 1: replacement proof [Complexity: L]

#### [smoke] Task 2.1: Add host-smoke and repair-path coverage for enforced routing

**Status:** todo

**Depends:** Task 1.1, Task 1.2, Task 1.3, Task 1.4, Task 1.5

Extend existing host smoke fixtures so replacement behavior is exercised through
the same setup paths users run. The smoke must prove generated Claude/Codex
surfaces contain session-memory routing, PreToolUse catches representative raw
large-context operations, PostToolUse/PostToolBatch capture remains bounded, and
a missing policy launcher fails closed with a discoverable `wp hooks doctor` or
`wp hooks doctor --fix` repair path. Cursor and OpenCode expectations must match
the capability matrix. (F2, F6, F7, F14, F16)

**Files:**

- Modify: `src/__integration__/reference-parity-host-smoke.fixtures.ts`
- Modify: `src/__integration__/reference-parity-host-smoke.integration.test.ts`
- Modify: `src/cli/commands/init/host-smoke.e2e.test.ts`
- Modify: `src/hooks/doctor.test.ts`

**Steps (TDD):**

1. Write failing integration assertions for generated host routing text, matcher coverage, representative guard decisions, degraded-host notes, and missing-launcher repair guidance.
2. Run: `./bin/wp test --file src/__integration__/reference-parity-host-smoke.integration.test.ts --file src/cli/commands/init/host-smoke.e2e.test.ts --file src/hooks/doctor.test.ts` — verify FAIL.
3. Update fixtures and setup/doctor expectations only; do not hand-edit generated runtime surfaces.
4. Run the same focused tests — verify PASS.
5. Run: `./bin/wp hooks doctor --skip-mcp`, `./bin/wp lint src/__integration__ src/cli/commands/init/host-smoke.e2e.test.ts src/hooks/doctor.test.ts`, and `./bin/wp typecheck`.

**Acceptance:**

- [ ] Host smoke proves enforced `wp_session_*` routing for Claude and Codex.
- [ ] Degraded Cursor/OpenCode rows match capability matrix claims.
- [ ] Missing PreToolUse launcher failure is explicit and repairable through hook doctor guidance.
- [ ] Smoke remains fixture-backed and does not require live host credentials.
- [ ] Focused tests, hook doctor, lint, and typecheck pass.

#### [qa] Task 2.2: Extend reference parity and session-memory benchmark gates

**Status:** todo

**Depends:** Task 1.1, Task 1.2, Task 1.3, Task 1.4, Task 1.5

Promote enforcement to a measured replacement axis. The reference parity matrix
and benchmark dry-run should distinguish “tool exists” from “agent is routed to
it before context flooding.” Add rows/threshold fields for routing injection,
PreToolUse session redirect, PostToolUse broad capture, PostToolBatch bounded
summaries, registry/routing consistency, and repair-path evidence. (F1, F7, F10,
F14)

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
4. Run the same focused tests — verify PASS.
5. Run: `./bin/wp bench session-memory --dry-run`, `./bin/wp audit reference-parity-matrix --json`, `./bin/wp lint docs/bench/reference-parity-matrix.md src/audit/reference-parity-matrix.ts src/audit/reference-parity-matrix.test.ts src/cli/commands/bench/session-memory.ts src/cli/commands/bench/session-memory.test.ts src/__integration__/reference-parity-bench.integration.test.ts`, and `./bin/wp typecheck`.

**Acceptance:**

- [ ] Reference parity distinguishes availability, enforcement, capture, batch summaries, repairability, and host support.
- [ ] Release-ready parity claims fail closed when enforcement evidence is missing.
- [ ] Benchmark dry-run reports enforcement axes without live credentials.
- [ ] Focused tests, bench dry-run, audit, lint, and typecheck pass.

## Wave 2: docs, public package, and lifecycle readiness [Complexity: M]

#### [docs] Task 3.1: Publish claim-safe docs and package-surface proof

**Status:** todo

**Depends:** Task 2.1, Task 2.2

Update public docs only after behavior proof exists. README, session-memory guide,
hook matrix, hooks doctor docs, benchmark docs, and changelog should explain that
`wp_session_*` is the canonical context-saving path, list host support truthfully,
and link to parity proof. Because this touches public package surfaces, run
package/tarball and secret/path gates before any release-facing full-parity
language lands. (F5, F7, F12)

**Files:**

- Modify: `README.md`
- Modify: `docs/guides/session-memory.md`
- Modify: `docs/hook-matrix.md`
- Modify: `docs/hooks-doctor.md`
- Modify: `docs/bench/session-memory-methodology.md`
- Modify: `CHANGELOG.md`

**Steps (TDD):**

1. Write or update docs/audit expectations so docs cannot claim full parity while reference-parity enforcement rows are open.
2. Run: `./bin/wp audit reference-parity-matrix --strict` — verify it fails before enforcement evidence is complete, or document the expected open rows in the task notes.
3. Update public docs and changelog language to match the proven host support matrix.
4. Run: `./bin/wp audit docs-frontmatter`, `./bin/wp audit blueprint-lifecycle`, `./bin/wp audit reference-parity-matrix --strict`, `./bin/wp audit package-surface`, `./bin/wp audit secrets-policy`, `./bin/wp audit absolute-path-policy`, `./bin/wp audit hook-surface`, `./bin/wp audit hook-vendor-drift`, `npm pack --dry-run --json`, and `./bin/wp lint README.md docs/guides/session-memory.md docs/hook-matrix.md docs/hooks-doctor.md docs/bench/session-memory-methodology.md CHANGELOG.md`.
5. If any public-package or secret/path gate fails, fix the root cause before marking the task done.

**Acceptance:**

- [ ] Public docs name only `wp_session_*` for session-memory context-saving guidance.
- [ ] Docs accurately separate full, partial, degraded, and unsupported host behavior.
- [ ] Reference parity strict gate backs any full-parity claim.
- [ ] Package tarball, package-surface, secret, path, hook, docs, blueprint, and lint gates pass.

## Edge Cases

| ID | Scenario | Expected handling | Severity | Findings |
| -- | -------- | ----------------- | -------- | -------- |
| E1 | `wp_session_*` MCP tools are not loaded in a host yet | Guidance tells the agent to load/use the Webpresso MCP surface or fall back only where a safe direct `wp` command exists; no raw large output fallback by default. | HIGH | F1, F5 |
| E2 | PreToolUse sees a command already inside `wp_session_execute` or `wp_session_batch_execute` | Guard passes through to avoid recursion. | HIGH | F3, F9 |
| E3 | Claude supports a matcher that Codex does not | Matcher sets diverge by host; capability matrix records the difference. | MEDIUM | F6, F16 |
| E4 | PostToolUse receives a huge MCP/web payload | Capture stores bounded metadata and safe previews only, with truncation metadata. | HIGH | F4, F15 |
| E5 | PostToolBatch receives multiple large successful results | Batch capture records counts, tool names, sizes, warnings, and capped previews only. | HIGH | F10, F15 |
| E6 | Web fetch target may be internal/private | Routing points to `wp_session_fetch_and_index` only after SSRF hardening proof is green. | HIGH | F8 |
| E7 | Existing sibling blueprint lifecycle is stale relative to source | Implementation verifies source artifacts first and reconciles lifecycle rather than recreating files. | MEDIUM | F5, F8 |
| E8 | Full parity docs are updated before proof is green | Reference parity strict gate fails closed. | HIGH | F7, F12 |
| E9 | PreToolUse launcher is missing or non-executable | Guard fails closed with a concise denial and hook doctor provides a repair path. | HIGH | F14 |
| E10 | Broad capture adds latency to every tool call | Capture code has no shellouts, uses byte caps, and has focused burst/hot-path tests. | MEDIUM | F15 |

## Risks and Mitigations

| Risk | Impact | Mitigation | Related finding |
| ---- | ------ | ---------- | --------------- |
| Over-broad hook matchers break host config | Users lose hook functionality or see invalid config | Fixture-backed host smoke and capability matrix tests before docs claim support. | F2, F6, F16 |
| PreToolUse creates sandbox echo loops | Agents get stuck retrying the same denied operation | WP-only already-sandboxed pass-through tests in Task 1.3. | F3, F9 |
| Shell/fetch routing ships before security gates | Unsafe command or network behavior becomes recommended path | Wave -1 security preflight blocks unsafe subsections. | F8 |
| Capture leaks raw payloads or secrets | Public trust and local privacy regress | Negative payload/secret tests, byte caps, redaction, and package-safety gates. | F10, F15 |
| Docs outrun implementation | Public replacement claim becomes false | Serialize docs/package task after host smoke and reference parity pass. | F7, F12 |
| Duplicate sibling-plan work | Rework and file conflicts | Entry gate verifies current source and treats stale planned blueprints as lifecycle drift. | F5 |
| Missing launcher silently disables enforcement | Users think routing is active while policy is bypassed | Fail-closed missing-guard denial plus hook doctor repair smoke. | F14 |
| New routing mentions unregistered tools | Agents follow broken guidance | Registry/routing consistency test in Task 1.1. | F1 |

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 16 |
| Critical | 0 |
| High | 9 |
| Medium | 6 |
| Low | 1 |
| Fixes applied to blueprint | 16/16 |
| Cross-plans aligned | 5 |
| Edge cases documented | 10 |
| Risks documented | 8 |
| Parallelization score | A |
| Critical path | 4 waves |
| Max parallel agents | 5 |
| Total tasks | 11 |
| Blueprint compliant | 11/11 |
