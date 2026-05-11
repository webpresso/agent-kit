---
type: blueprint
title: agent-kit v1.0 — Evidence Ledger + Multi-CLI Runner
status: draft
complexity: L
created: 2026-05-11
last_updated: 2026-05-11
tags:
  - agent-kit
  - v1.0
  - runners
  - evidence-ledger
  - multi-cli
  - templates
  - blueprint-execution
max_parallel_agents: 8
---

# agent-kit v1.0 — Evidence Ledger + Multi-CLI Runner

## Product wedge anchor

- **Stage outcome:** agent-kit v1.0 public launch with the "verified execution
  record for AI coding work" wedge (per CEO plan
  `~/.gstack/projects/agent-kit/ceo-plans/2026-05-11-positioning-and-v1-scope.md`).
- **Consuming surface:** `ak setup` (existing, extended with preflight +
  version-pinning + lane-4 framing + spinner), `ak blueprint init <template>`
  (new), `pll` skill runtime, MCP server (existing).
- **New user-visible capability:** A consumer writes a blueprint, picks any
  of three Runner backends (claude-subagent, codex-exec, local-worktree),
  watches the Runner emit a versioned event stream that persists into the
  existing SQLite blueprint ledger; curated templates make first-blueprint
  authoring fast.

## Why this exists

The CEO plan locked positioning around **"agent-kit is the verified-execution
-record kit for AI coding work"** — not just a multi-CLI runner. The durable
moat is the evidence ledger: task graph, permissions, runner transcript,
diffs, audit checks, artifacts, completion proof.

Most of that ledger is already shipped:

- Blueprint lifecycle + audit composite (`ak audit *`) — checks ✓
- Lore commit protocol — provenance ✓
- Tech-debt lifecycle — admitted debt ✓
- Mutation engine + extraction-parity rule — proof tests pass ✓
- Blueprint SQLite store (`src/blueprint/db/`) — queryable state ✓
- Symlinker + multi-runtime asset compiler (completed) — multi-CLI surface ✓
- `ak setup` with `DEFAULT_PRESETS = [context-mode, omx, gstack, vision, rtk]`
  — bundling ✓

What v1.0 adds:

1. **Runner transcript** dimension — the versioned `RunnerEvent` stream from
   every blueprint task execution becomes part of the ledger.
2. **Three Runner backends** wrapping the existing pll/Claude Code surface
   and extending it to `codex exec` and CLI-agnostic `git worktree`.
3. **Template library** so first-time users don't have to invent a blueprint
   from scratch.
4. **DRY fix + schema migration** to deduplicate the existing
   `executionBackendSchema` and extend it for runner ids.
5. **Smaller refinements** to existing scaffolders: pin enforcement, lane-4
   framing copy, spinner UX, preflight check, codified gstack rule.

## Goals

- Land C1, C2, C3, C5, C6, C7, 2C, 1D, 4A as one coherent v1.0 alpha cycle.
- Maintain byte-identical observable behavior for the existing `pll` flow via
  the `claude-subagent` Runner backend (**iron rule**).
- Ship every cherry-pick as its own changeset under default dist-tag while
  C3 (Runner abstraction) goes through alpha dist-tag for one cycle.
- Persist all `RunnerEvent` streams to the existing SQLite blueprint store
  via `src/blueprint/db/ingester.ts` extension.

## Non-goals

- Replacing `context-mode`, `rtk`, or `gstack` with native ak features
  (lane-model violation).
- Bundling/redistributing `gstack` (lane-4 boundary; recommend-install only).
- codex-exec `workspace-write` sandbox mode in v1.0 alpha (deferred to v1.x
  via tech-debt item; current Codex public issue history shows hangs/panics
  on workspace-write that would block alpha quality).
- opencode as a Runner execution backend (deferred to v1.x; v1.0 ships
  opencode as a skill-sync target only).
- Resumable Runner execution (`capabilities.resumable = false` for all
  backends in v1.0; v1.x).
- Real-codex nightly smoke CI (mock-only in v1.0; tech-debt for v1.x).
- Public npm + Anthropic marketplace + landing page (deferred; soft-launch
  via current restricted GitHub Packages first).

## Errata vs CEO plan dated 2026-05-11

The CEO plan was written before Phase 2 codebase verification ran. The plan's
scope sizing assumed `ak setup --bundle` was net-new infrastructure. In fact
`ak setup` already exists at `src/cli/commands/init/index.ts` with
`DEFAULT_PRESETS = ['context-mode', 'omx', 'gstack', 'vision', 'rtk']` and
fully-shipped scaffolders for each. This Blueprint reflects the corrected
sizing: C2 is **S** (pin + smoke + framing + spinner) rather than **M**;
C5 is **XS-S** (extend existing opencode-plugin scaffolder); the rest are
unchanged. The CEO plan's strategic decisions (X1 wedge, X3 Runner contract,
X4 templates, X2 timing unresolved) still apply unchanged.

## Architecture

### Runner abstraction (locked per CEO X3)

```
                       ┌──────────────────────┐
                       │  Blueprint Task      │
                       │  (markdown frontmatter│
                       │   declares runners[]  │
                       │   and permissions)    │
                       └──────────┬───────────┘
                                  │
                                  ▼
                       ┌──────────────────────┐
                       │  pll / dag/local     │
                       │  (existing executor) │
                       └──────────┬───────────┘
                                  │ selectRunner(task, env, --runner)
                                  ▼
              ┌───────────────────┴───────────────────┐
              │                                       │
              ▼                                       ▼
  ┌─────────────────────┐               ┌─────────────────────┐
  │ Runner              │               │ RunnerExecution      │
  │  .id                │   prepare()   │  .handle              │
  │  .version           ├──────────────▶│  .snapshot()          │
  │  .capabilities      │               │  .run(signal)         │
  │  .prepare(task,ctx) │               │  .teardown()          │
  └─────────────────────┘               └──────────┬──────────┘
                                                   │
                                                   ▼
                                         AsyncIterable<RunnerEvent>
                                         │ started
                                         │ progress
                                         │ stdout / stderr
                                         │ artifact
                                         │ completed / failed / cancelled
                                         ▼
                                ┌──────────────────────┐
                                │  SQLite ingester     │
                                │  (runner_events tbl) │
                                └──────────┬───────────┘
                                           │
                                           ▼
                              Evidence Ledger (queryable)
```

### Three Runner backends (v1.0)

```
┌────────────────────────────────────────────────────────────────────────┐
│ claude-subagent                                                         │
│  Wraps existing in-process Claude Code subagent (Agent tool).           │
│  Used by default inside Claude Code sessions.                           │
│  Iron-rule regression test: byte-identical event/diff vs pre-abstraction │
│  pll.                                                                   │
├────────────────────────────────────────────────────────────────────────┤
│ codex-exec                                                              │
│  Spawns `codex exec <prompt> -C <repoRoot> -s read-only ...`            │
│  v1.0 alpha: read-only mode ONLY (Codex workspace-write sandbox has    │
│  known hangs/panics/.git-read-only issues per codex outside voice).    │
│  workspace-write deferred to v1.x via tech-debt.                       │
├────────────────────────────────────────────────────────────────────────┤
│ local-worktree                                                          │
│  CLI-agnostic: `git worktree add` + spawn user's chosen runner          │
│  via env detection.  Owns worktree lifecycle (create on prepare,       │
│  remove on teardown, idempotent).                                       │
└────────────────────────────────────────────────────────────────────────┘
```

### Schema migration shape (2C)

```
BEFORE (DRY violation):
  src/blueprint/execution/types.ts:20
    blueprintExecutionBackendSchema = z.enum(['omx-team', 'omx-pll-interactive'])
  src/blueprint/core/schema.ts:48
    executionBackendSchema = z.enum(['omx-team', 'omx-pll-interactive'])
  (same enum, two definitions — drift bug waiting to happen)

AFTER (single source of truth + extended):
  src/blueprint/types/execution-backend.ts (NEW)
    executionBackendSchema = z.enum([
      'omx-team', 'omx-pll-interactive',
      'claude-subagent', 'codex-exec', 'local-worktree',
    ])
  Both prior callsites import from this module.
  Migration 0002_runners.sql adds runner_id, runner_version, permissions
  columns to execution table; new runner_events table for the transcript.
```

## Technology Choices

| Choice | Used For | Verification |
|---|---|---|
| `child_process.spawnSync` (Node 24+) | Cross-platform Runner subprocess invocation (codex-exec, local-worktree); already used in existing scaffolders | Existing usage at `init/scaffolders/rtk/index.ts:1`, `context-mode/index.ts:1` |
| `ora` (v8.x) | Spinner UX for `ak setup` (4A); per `ora` docs supports Bun and Node 24+ | Verify via Context7 docs before adding dep in Task 2.5 |
| `@modelcontextprotocol/sdk` ^1.29.0 | Existing MCP server; unchanged in v1.0 | Already in deps |
| `better-sqlite3` | Existing blueprint store; unchanged in v1.0 | Already shipped in `src/blueprint/db/` |
| `zod` + `remark` family | Existing schema + parser; extended for runners/permissions | Already in deps |
| `codex exec -s read-only` | codex-exec backend invocation | Verified in `/plan-eng-review` outside-voice call (this conversation) |

## Key Decisions (carry-forward from CEO + Eng + Outside Voice)

| ID | Decision | Source |
|---|---|---|
| X1 | Wedge = "verified execution record for AI work" (evidence ledger) | CEO post-outside-voice pivot |
| X3 | Runner = managed-context shape (prepare → RunnerExecution.{run,teardown}) | Eng outside voice + accepted |
| X4 | Templates unblocked (structured-store completed) | Eng outside voice + accepted |
| 1A | Runner.execute() yields AsyncIterable<RunnerEvent> with AbortSignal | Eng |
| 1B | Cross-platform via `child_process.spawnSync` (no shell pipes) | Eng |
| 1C | Tasks declare `permissions: read \| workspace-write` in frontmatter | Eng |
| 1D | `ak setup` output explicitly frames lane 2/3/4 | Eng |
| 2A | Runner exports at top-level `./runners/*` subpath | Eng |
| 2C | Extend (+ deduplicate) executionBackendSchema; add ExecutionType migration | Eng + Phase 2 finding |
| 3A | E2E happy-path + integration edges + golden-transcript regression | Eng |
| 3B | Mock codex subprocess in PR CI (tech-debt for real-codex nightly) | Eng |
| 3C | Full eval suite (5 golden blueprints) | Eng |
| 4A | Full spinner UX in setup scaffolders | Eng |
| OV | Iron-rule regression: byte-identical event/diff vs pre-abstraction pll | Outside voice |

## Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Runner contract calcifies wrong in v1.0; breaking change becomes v2.0 surface migration for adopters | HIGH | C3 ships in **alpha dist-tag** for one cycle before v1.0 declaration (X2 unresolved → keep on alpha until external adopter validates) |
| R2 | Codex `workspace-write` sandbox unstable: hangs, panics, `.git` read-only failures, Windows sandbox issues | HIGH | Ship codex-exec with **`permissions: read` mode ONLY** in v1.0; reject workspace-write tasks at Runner.prepare() with clear error |
| R3 | Schema enum drift (executionBackendSchema at two sites) silently disagrees after migration | MEDIUM | Task 0.1 deduplicates BEFORE 1.1 extends; mutation test for the enum module |
| R4 | claude-subagent Runner observably diverges from pre-abstraction pll behavior | HIGH | Iron-rule regression test (Task 4.1) with golden RunnerEvent transcript fixtures |
| R5 | RunnerEvent schema version mismatch between Runner emitter and ledger consumer | MEDIUM | `Runner.version` field carries semver; ingester validates at write time |
| R6 | Worktree orphan after Runner subprocess killed before teardown() | MEDIUM | local-worktree.teardown() is idempotent; pll-side timeout calls teardown after grace period |
| R7 | Mock-only codex testing misses real-codex behavior drift (auth, CLI flags, JSONL schema, sandbox mount, TTY, SIGTERM, orphans, Windows) | MEDIUM | Tech-debt `h-NNN-real-codex-nightly-smoke` filed; v1.0 ships with mock-only acknowledged |
| R8 | rtk scaffolder uses `brew install rtk` on macOS without pin; new rtk releases could break agent-kit-vs-rtk compatibility | MEDIUM | Task 1.5 adds `compatible-versions.json` + scaffolder reads it for version constraint; smoke test (Task 3.3) verifies the pinned version actually installs |
| R9 | Two `ak setup --bundle` invocations on the same machine race on marketplace install | LOW | Document; rely on marketplace API + brew idempotency |
| R10 | opencode plugin scaffolder is "thin" per codex outside voice; opencode-runner is v1.x scope but skill-sync MUST work | MEDIUM | Task 0.10 audit + Task 1.8 extension; if opencode skill format does not support agent-kit skills, document and scope C5 down further |

## Edge Cases

| ID | Case | Handled by | Test |
|---|---|---|---|
| E1 | Task declares `runners: [codex-exec]` + `permissions: workspace-write` in v1.0 | Runner.prepare() rejects with `unsupported-permission` error | Unit test in `src/runners/codex-exec/index.test.ts` |
| E2 | AbortSignal fires during Runner.prepare() (before run() is called) | prepare() respects signal; throws AbortError; cleanup not needed because nothing started | Unit test in `src/runners/local-worktree/index.test.ts` |
| E3 | Runner subprocess killed externally (SIGKILL); teardown() called later | teardown() idempotent; logs orphan-cleanup if any | Integration test in `src/runners/codex-exec/index.integration.test.ts` |
| E4 | Worktree branch conflict: `git worktree add` fails because branch already checked out elsewhere | Runner.prepare() catches and yields `failed` event with clear error | Integration test in `src/runners/local-worktree/index.integration.test.ts` |
| E5 | `ak setup` re-run on a machine with rtk already installed at the pinned version | rtk scaffolder probes; `rtk-ok` with `installed: false`; no-op | Existing scaffolder test |
| E6 | `ak setup` re-run when pinned context-mode version is lower than what's installed | New: Task 1.5 detects version mismatch, prompts (or no-op based on `--strict`) | Unit test in `init/scaffolders/context-mode/index.test.ts` (extend) |
| E7 | RunnerEvent emitted before SQLite ingester is ready | Ingester buffers up to N events; flushes on first DB write | Unit test in `src/blueprint/db/ingester.test.ts` (extend) |
| E8 | Template task references a skill name that doesn't exist | `ak blueprint init <template>` validates skill names against `ak skills list` | Unit test in `src/cli/commands/blueprint/init.test.ts` |
| E9 | Two parallel Runners (different tasks) compete for the same worktree path | local-worktree generates UUID-suffixed paths; no collision | Unit test in `src/runners/local-worktree/path.test.ts` |
| E10 | Test for codex-exec runner runs in Stryker mutation context (cold-start bun) | Exclude `src/runners/codex-exec/index.integration.test.ts` from `vitest.stryker.config.ts` per existing exclusion pattern | `vitest.stryker.config.ts` update |

## Cross-plan references

- **`blueprint-structured-store`** — COMPLETED. This Blueprint extends the
  existing schema in `src/blueprint/db/` with migration 0002 (runner_events
  table + runner_id/runner_version/permissions columns).
- **`agent-asset-compiler-multi-runtime`** — COMPLETED. Task 0.10 audits
  what the current `src/symlinker/consumers.ts` and `init/scaffolders/opencode
  -plugin/index.ts` do for opencode; Task 1.8 extends them if needed.
- **`agent-knowledge-graph-mcp`** — COMPLETED. Orthogonal to this Blueprint;
  no coordination needed.
- **CEO plan 2026-05-11** — strategic source of truth; this Blueprint
  supersedes its scope sizing per the Errata section above.

---

## Tasks

### Wave 0 — Foundations (no deps, all parallel — RW0 = 10)

#### [schema] Task 0.1: Deduplicate executionBackendSchema

**Status:** todo
**Depends:** None

The enum `z.enum(['omx-team', 'omx-pll-interactive'])` is defined in two
places: `src/blueprint/execution/types.ts:20` as `blueprintExecutionBackendSchema`
and `src/blueprint/core/schema.ts:48` as `executionBackendSchema`. Same
values, two definitions. Extract to a single module so subsequent tasks can
extend the enum without diverging.

**Files:**
- Create: `src/blueprint/types/execution-backend.ts`
- Create: `src/blueprint/types/execution-backend.test.ts`
- Modify: `src/blueprint/execution/types.ts` (re-export from the new module)
- Modify: `src/blueprint/core/schema.ts` (re-export from the new module)

**Steps (TDD):**
1. Write `execution-backend.test.ts` asserting the enum values match the
   current union exactly: `['omx-team', 'omx-pll-interactive']`.
2. `pnpm test src/blueprint/types/execution-backend.test.ts` — verify FAIL
   (module doesn't exist).
3. Create `execution-backend.ts` with the Zod enum + inferred type.
4. Replace the two duplicate definitions with re-exports from the new module.
5. `pnpm test src/blueprint/types/execution-backend.test.ts` — verify PASS.
6. `pnpm test` — verify the full suite passes (no consumer broke).
7. `pnpm lint && pnpm typecheck` — verify clean.

**Acceptance:**
- [ ] Single source of truth for `executionBackendSchema` in
      `src/blueprint/types/execution-backend.ts`.
- [ ] Both prior callsites re-export from the new module.
- [ ] No consumer of `BlueprintExecutionBackend` or
      `BlueprintExecutionBackendValue` breaks.
- [ ] Test asserts the enum values explicitly (no `toBeDefined`-style weak
      assertion).

---

#### [setup] Task 0.2: Preflight pattern check in `ak setup`

**Status:** todo
**Depends:** None

Add a soft compatibility preflight to `src/cli/commands/init/index.ts` that
runs before scaffolders fire. Checks: TS workspace, pnpm ≥ 10, Node ≥ 24,
Workers OR Vite shape (per existing `detectConsumer`), presence of
`blueprints/` directory. Default: WARN with link to the new docs page (Task
0.3). With `--strict` flag, mismatches abort. Matching repos see a one-line
green confirmation.

**Files:**
- Create: `src/cli/commands/init/preflight.ts`
- Create: `src/cli/commands/init/preflight.test.ts`
- Modify: `src/cli/commands/init/index.ts` (call preflight before scaffolders)

**Steps (TDD):**
1. Write `preflight.test.ts`: matching repo → returns `{ status: 'ok', mismatches: [] }`;
   mismatched repo → returns `{ status: 'warn', mismatches: [...] }`; with
   `strict: true` and mismatches → returns `{ status: 'fail', mismatches: [...] }`.
2. `pnpm test src/cli/commands/init/preflight.test.ts` — verify FAIL.
3. Implement `preflight.ts` using existing `detectConsumer` + filesystem
   probes (`existsSync('tsconfig.json')`, etc.).
4. Wire into `index.ts` ahead of `scaffold*` calls; in `warn` mode print the
   list; in `fail` mode (`--strict`) print + exit 2.
5. `pnpm test` — verify all tests pass.
6. `pnpm lint && pnpm typecheck`.

**Acceptance:**
- [ ] `ak setup` in a webpresso-pattern repo prints a one-line green confirmation.
- [ ] `ak setup` in a non-matching repo prints a yellow warning + docs URL.
- [ ] `ak setup --strict` aborts with exit code 2 in a non-matching repo.
- [ ] Test uses `toStrictEqual` (not `toMatchObject` or weak assertions).

---

#### [docs] Task 0.3: "Is agent-kit for me?" public docs page

**Status:** todo
**Depends:** None

Write `docs/is-agent-kit-for-me.md` describing the webpresso pattern: TS +
pnpm ≥ 10 + Node ≥ 24 + Workers/Vite + blueprint lifecycle + lore commits.
Lead with the wedge framing (verified execution record for AI work) per X1.
This page IS the target of Task 0.2's warning link. Will go through
/plan-design-review before v1.0 alpha ship.

**Files:**
- Create: `docs/is-agent-kit-for-me.md`

**Steps:**
1. Draft the page with: (a) Hero "Is agent-kit for me?" answer (60s read);
   (b) the 5-item compatibility checklist; (c) what you get if you fit;
   (d) what you get if you don't (still usable, but defaults may not fit);
   (e) link to /plan-ceo-review-style "evidence ledger" explainer.
2. `pnpm docs:check` (`ak audit docs-frontmatter`) — verify frontmatter passes.

**Acceptance:**
- [ ] Page exists with the 5 sections above.
- [ ] `ak audit docs-frontmatter` passes.
- [ ] Page references X1 wedge framing in the hero, not the
      multi-CLI-runner framing.

---

#### [rules] Task 0.4: gstack lane-4 routing rule

**Status:** todo
**Depends:** None

Codify the lane-4 boundary already added to `catalog/agent/rules/rtk-routing.md`
into its own dedicated rule. Mirror structure of `context-mode-routing.md`
and `rtk-routing.md`. Document: gstack lives at `~/.claude/skills/gstack/`,
is NOT bundled or redistributed, `ak setup` recommends install but never
clones on the user's behalf into a non-`~/.claude/skills/` path.

**Files:**
- Create: `catalog/agent/rules/gstack-routing.md`

**Steps:**
1. Write the rule using `context-mode-routing.md` as the template.
2. `pnpm exec ak audit catalog-drift` — verify it's picked up.

**Acceptance:**
- [ ] Rule file exists with sections: Description, Ownership boundary,
      Hard rules, "When to recommend gstack."
- [ ] `ak audit catalog-drift` includes the new rule in its inventory.

---

#### [templates] Task 0.5–0.9: Blueprint templates (5 templates, parallel)

**Status:** todo (each)
**Depends:** None (each task is independent)

Curate 5 blueprint templates under `catalog/blueprints/<name>/` that
`ak blueprint init <template>` (Task 1.7) will scaffold. Each template is a
markdown `_overview.md` skeleton matching the current schema, with placeholder
sections for Product wedge anchor, Goals, Tasks, Quick Reference. Each
template must include AT LEAST one task with the new `runners`/`permissions`
frontmatter (Task 1.2) so users learn the format.

Templates:
- **0.5**: `feature-cloudflare-worker` — blueprint for adding a Worker route + handler + tests
- **0.6**: `migration-with-rollback` — DB migration blueprint with explicit rollback steps
- **0.7**: `cross-package-refactor` — refactor blueprint with byte-identity parity rule applied
- **0.8**: `add-vitest-suite` — blueprint for adding a fresh test suite to an untested module
- **0.9**: `extract-package` — blueprint for extracting a module to a new internal package

**Files (per template):**
- Create: `catalog/blueprints/<name>/_overview.md`

**Steps (per template):**
1. Write the `_overview.md` with frontmatter + section skeleton.
2. `pnpm exec ak audit catalog-drift` — verify the template is picked up.
3. Manually parse with `ak blueprint audit <template-path>` to confirm
   frontmatter passes the schema (after Tasks 1.1 + 1.2 land, also verify
   the `runners`/`permissions` fields parse correctly).

**Acceptance (per template):**
- [ ] `_overview.md` exists with valid frontmatter (type=blueprint, status=draft).
- [ ] Contains at least one task block with `runners` + `permissions` fields.
- [ ] `ak audit catalog-drift` lists the template.

---

#### [audit] Task 0.10: Audit existing opencode integration

**Status:** todo
**Depends:** None

Codex outside voice flagged that the current `init/scaffolders/opencode-plugin/
index.ts` "only emits dev-link warnings and compaction context." Audit:
(a) what does `scaffoldOpencodePlugin` write today? (b) does
`src/symlinker/consumers.ts` have an opencode consumer? (c) where does
opencode look for repo-local skills vs user-global skills?
Output: a short note at `blueprints/draft/agent-kit-v1-evidence-ledger/notes/
opencode-audit.md` capturing what exists and the delta needed for skill-sync.

**Files:**
- Read: `src/cli/commands/init/scaffolders/opencode-plugin/index.ts`
- Read: `src/symlinker/consumers.ts`
- Read: `src/symlinker/unified-sync.ts`
- Create: `blueprints/draft/agent-kit-v1-evidence-ledger/notes/opencode-audit.md`

**Steps:**
1. Read the three files; identify what they emit for opencode.
2. Verify against opencode docs: where does opencode load skills from?
   (Anthropic skills spec path `~/.config/opencode/` or repo-local
   `.opencode/skills/` per `joshuadavidthomas/opencode-agent-skills`?)
3. Write the audit note with concrete delta + recommendation for Task 1.8.

**Acceptance:**
- [ ] Audit note exists and names the current opencode write paths.
- [ ] Recommendation specifies what Task 1.8 should add (file paths + content).

---

### Wave 1 — Schema + Bundle Refinements (depends on Wave 0 — RW1 = 8)

#### [schema] Task 1.1: Extend executionBackendSchema with runner ids

**Status:** todo
**Depends:** Task 0.1

Extend the deduplicated enum from Task 0.1 with the three new Runner ids:
`'claude-subagent'`, `'codex-exec'`, `'local-worktree'`. The enum is now the
SHARED source of truth for both blueprint execution backends (omx-*) and
Runner ids.

**Files:**
- Modify: `src/blueprint/types/execution-backend.ts`
- Modify: `src/blueprint/types/execution-backend.test.ts`

**Steps (TDD):**
1. Add a test asserting the new enum values are present.
2. `pnpm test src/blueprint/types/execution-backend.test.ts` — verify FAIL.
3. Add the three new values to the enum.
4. `pnpm test src/blueprint/types/execution-backend.test.ts` — verify PASS.
5. `pnpm test` — full suite passes.
6. `pnpm lint && pnpm typecheck`.

**Acceptance:**
- [ ] Enum contains 5 values: omx-team, omx-pll-interactive, claude-subagent, codex-exec, local-worktree.
- [ ] Existing consumers (audit, parsers) still compile and pass tests.

---

#### [schema] Task 1.2: Add `runners` + `permissions` task fields

**Status:** todo
**Depends:** Task 0.1, Task 1.1

Add two new TASK-level frontmatter fields to the blueprint schema:
- `runners?: RunnerId[]` — optional list of Runner ids this task is compatible
  with. Empty/missing = compatible with all.
- `permissions?: 'read' | 'workspace-write'` — required permission level
  for execution. Default: `'workspace-write'` (current behavior). Tasks
  setting `'read'` opt into stricter sandboxing.

Updates Zod schema in `src/blueprint/core/validation/task-blocks.ts` (or
`task-sections.ts` — whichever owns task-block schema).

**Files:**
- Modify: `src/blueprint/core/validation/task-blocks.ts` (or sections — verify path)
- Modify: `src/blueprint/core/validation/task-blocks.test.ts`

**Steps (TDD):**
1. Write test: a task block with `runners: [claude-subagent]` parses; a
   task block with `runners: [invalid-id]` fails with clear error; a task
   with `permissions: read` parses; an unknown permission fails.
2. `pnpm test` — verify the new tests FAIL.
3. Extend the Zod schema with the two optional fields, referencing the
   shared enum from Task 1.1 for `runners` and a `z.enum(['read', 'workspace-write'])` for `permissions`.
4. `pnpm test` — verify PASS.
5. `pnpm lint && pnpm typecheck`.

**Acceptance:**
- [ ] Task block with valid `runners` + `permissions` parses cleanly.
- [ ] Invalid runner id surfaces a precise Zod error with line context.
- [ ] Default permission is `workspace-write` when omitted (existing behavior).

---

#### [db] Task 1.3: Migration 0002 — runner_events table + execution columns

**Status:** todo
**Depends:** Task 0.1, Task 1.1

Migration `0002_runners.sql` in `src/blueprint/db/migrations/`:
- Add `runner_id`, `runner_version`, `permissions` columns to the existing
  execution table (with CHECK constraints matching the enum).
- New table `runner_events` keyed by execution handle + monotonic sequence
  number, with columns matching the `RunnerEvent` variants (`type`,
  `ts`, `chunk`/`message`/`path`/`exit_code`/`error` columns nullable per
  variant). `kind` column with CHECK against the event types.

**Files:**
- Create: `src/blueprint/db/migrations/0002_runners.sql`
- Modify: `src/blueprint/db/migrations.test.ts` (add test asserting 0002 applies cleanly on top of 0001)
- Modify: `src/blueprint/db/enums.ts` (if it contains the executionBackend enum — sync with Task 0.1's source of truth)

**Steps (TDD):**
1. Test: empty DB → run 0001 then 0002 → schema contains `runner_events`
   table with expected columns and the new execution columns.
2. `pnpm test src/blueprint/db/migrations.test.ts` — verify FAIL.
3. Write the SQL migration.
4. Re-run; verify PASS.
5. `pnpm lint && pnpm typecheck`.

**Acceptance:**
- [ ] Migration 0002 applies cleanly on a fresh DB after 0001.
- [ ] Migration is idempotent (re-running is a no-op via schema_version).
- [ ] `runner_events` table has indexes on `execution_handle` and `ts`.

---

#### [runners] Task 1.4: Runner interface + type contract

**Status:** todo
**Depends:** Task 1.1, Task 1.2

Net-new module `src/runners/`. Defines the X3-locked managed-context Runner
contract:

```ts
interface Runner {
  readonly id: RunnerId
  readonly version: string                  // semver of the Runner protocol
  readonly capabilities: RunnerCapabilities
  prepare(task: BlueprintTask, ctx: RunnerContext): Promise<RunnerExecution>
}
interface RunnerExecution {
  readonly handle: string
  snapshot(): RunnerSnapshot
  run(signal: AbortSignal): AsyncIterable<RunnerEvent>
  teardown(): Promise<void>      // idempotent
}
type RunnerEvent =
  | { type: 'started'; ts: number }
  | { type: 'progress'; message: string; ts: number }
  | { type: 'stdout'; chunk: string; ts: number }
  | { type: 'stderr'; chunk: string; ts: number }
  | { type: 'artifact'; path: string; kind: string; ts: number }
  | { type: 'completed'; exitCode: number; ts: number }
  | { type: 'failed'; error: string; exitCode: number; ts: number }
  | { type: 'cancelled'; ts: number }
```

Also: register `./runners` and `./runners/types` in `package.json#exports`
and `tshy.exports` per Decision 2A.

**Files:**
- Create: `src/runners/index.ts`
- Create: `src/runners/types.ts`
- Create: `src/runners/types.test.ts`
- Modify: `package.json` (exports + tshy.exports — 2A subpath)

**Steps (TDD):**
1. Test: type-level assertions (e.g., `type _A = Expect<Equal<...>>`) that
   the RunnerEvent union is exhaustive; runtime test that
   `RunnerEventSchema.safeParse` accepts all valid events and rejects shape-bad
   ones. Use `zod` for runtime validation alongside the TS types.
2. `pnpm test src/runners/types.test.ts` — verify FAIL.
3. Implement types + Zod schema for runtime validation.
4. Update `package.json` exports + `tshy.exports` for `./runners` and
   `./runners/types`.
5. `pnpm build` — verify the new exports build.
6. `pnpm lint:pkg` (publint + attw) — verify exports map is clean.
7. `pnpm test && pnpm typecheck`.

**Acceptance:**
- [ ] `import { Runner, RunnerEvent } from '@webpresso/agent-kit/runners'` works.
- [ ] `RunnerEventSchema.safeParse({...invalid...}).success === false` with descriptive error.
- [ ] `pnpm lint:pkg` passes (attw + publint).
- [ ] Cognitive complexity per function ≤ 8 (lint enforces).

---

#### [bundle] Task 1.5: compatible-versions.json + scaffolder pinning

**Status:** todo
**Depends:** None (independent file + scaffolder edits)

Create `compatible-versions.json` at repo root tracking pinned versions of
context-mode (Claude Code marketplace plugin) and rtk (binary) that agent-kit
v1.0 alpha is tested against. Extend `init/scaffolders/context-mode/index.ts`
and `init/scaffolders/rtk/index.ts` to read this file and enforce the
pin/range during install.

**Files:**
- Create: `compatible-versions.json` (with schema: `{ context_mode: { range: "^X.Y.Z" }, rtk: { range: "^A.B.C" } }`)
- Modify: `src/cli/commands/init/scaffolders/context-mode/index.ts` (read pin; pass version to marketplace install if supported, else log warning on mismatch)
- Modify: `src/cli/commands/init/scaffolders/rtk/index.ts` (read pin; verify `rtk --version` is within range; on mismatch, log warning unless `--strict`)
- Modify: scaffolder tests

**Steps (TDD):**
1. Write tests: scaffolder reads the pin and reports version mismatch when
   installed version is outside the range. With `--strict` flag, exit with
   error; without, log warning.
2. `pnpm test` — verify FAIL.
3. Implement pin-reading helper (shared) and wire into both scaffolders.
4. `pnpm test && pnpm lint && pnpm typecheck`.

**Acceptance:**
- [ ] `compatible-versions.json` exists with schema and one initial pin set.
- [ ] Scaffolders read the file via a shared helper (DRY).
- [ ] Version mismatch in non-`--strict` mode = warning; in `--strict` = error.
- [ ] Schema documented in the JSON file via JSON-Schema `$schema` link.

---

#### [setup] Task 1.6: Lane-4 framing in `ak setup` output

**Status:** todo
**Depends:** Task 0.4

After scaffolders complete, `ak setup` prints a summary line that
EXPLICITLY frames lanes:
- "Lane 2 (context-mode) — installed at v<X>"
- "Lane 3 (rtk) — installed at v<Y>"
- "Lane 4 (gstack) — cloned to ~/.claude/skills/gstack/ (Garry Tan's project; we don't redistribute upstream tools, we recommend them)"

Per the X1 wedge framing, this output line is the first place a user
encounters the lane model.

**Files:**
- Modify: `src/cli/commands/init/index.ts` (extend `summarizeResults` or add
  a `printBundleSummary` function)
- Modify: `src/cli/commands/init/index.test.ts` (or related test) — assert
  the output contains the four-line framing

**Steps (TDD):**
1. Test: integration test runs `ak setup` against a fixture repo; captures
   stdout; asserts the four lane-framing lines appear.
2. `pnpm test` — verify FAIL.
3. Implement the output formatter referencing scaffolder result types
   (e.g., `EnsureRtkResult.kind === 'rtk-ok'` → version line).
4. `pnpm test && pnpm lint && pnpm typecheck`.

**Acceptance:**
- [ ] `ak setup` output includes the four lane lines.
- [ ] Output is silent when scaffolders are skipped (e.g., `--with-rtk=false`).

---

#### [cli] Task 1.7: `ak blueprint init <template>` command

**Status:** todo
**Depends:** Tasks 0.5, 0.6, 0.7, 0.8, 0.9

New CLI verb: `ak blueprint init <template> [--out <dir>]`. Lists available
templates from `catalog/blueprints/`; copies selected template into
`blueprints/draft/<derived-slug>/` with placeholders pre-filled
(date, slug-from-flag, owner-from-git).

**Files:**
- Create: `src/cli/commands/blueprint/init.ts`
- Create: `src/cli/commands/blueprint/init.test.ts`
- Modify: `src/cli/commands/blueprint/index.ts` (register the `init` subverb)
- Modify: `src/cli/cli.ts` (help text)

**Steps (TDD):**
1. Test: `ak blueprint init feature-cloudflare-worker --out blueprints/draft/`
   creates a new `_overview.md` with placeholders filled. Unknown template →
   exit 2 with list of available templates.
2. `pnpm test src/cli/commands/blueprint/init.test.ts` — verify FAIL.
3. Implement using existing catalog loaders.
4. `pnpm test && pnpm lint && pnpm typecheck`.

**Acceptance:**
- [ ] All 5 templates from Tasks 0.5–0.9 are listed by `ak blueprint init --list`.
- [ ] Generated `_overview.md` passes `ak blueprint audit`.

---

#### [symlinker] Task 1.8: opencode skill-sync target

**Status:** todo
**Depends:** Task 0.10

Per the audit note from Task 0.10, extend either `src/symlinker/consumers.ts`
or `src/cli/commands/init/scaffolders/opencode-plugin/index.ts` (whichever
Task 0.10 recommends) so `ak sync` (and `ak setup`) writes the agent-kit skills
into opencode's expected layout. Scope: skill-SYNC only, not a Runner
execution backend (deferred to v1.x per CEO plan).

**Files:**
- Modify: per Task 0.10's recommendation
- Modify: matching test file

**Steps (TDD):**
1. Test: running symlinker against a fixture repo writes skill files to the
   expected opencode location with the expected format.
2. `pnpm test` — verify FAIL.
3. Implement the extension.
4. `pnpm test && pnpm lint && pnpm typecheck`.

**Acceptance:**
- [ ] `ak sync` writes opencode skills to the location identified by Task 0.10.
- [ ] Existing Codex + Gemini sync continues to work (regression check).

---

### Wave 2 — Runner Backends + Audit Update + Spinner (depends on Wave 1 — RW2 = 5)

#### [runners] Task 2.1: claude-subagent Runner backend

**Status:** todo
**Depends:** Task 1.4

The default backend: wraps the in-process Claude Code subagent flow. Must
preserve byte-identical observable behavior vs the pre-abstraction `pll` skill
(IRON RULE; regression test in Task 4.1).

**Files:**
- Create: `src/runners/claude-subagent/index.ts`
- Create: `src/runners/claude-subagent/index.test.ts`
- Create: `src/runners/claude-subagent/types.ts` (backend-private types)

**Steps (TDD):**
1. Test: `Runner.prepare(task)` returns an Execution; `run(signal)` yields
   the expected `started → ... → completed` event sequence; `teardown()` is
   idempotent.
2. `pnpm test src/runners/claude-subagent/index.test.ts` — verify FAIL.
3. Implement using the existing pll/Agent surface (Task 1.4 contract).
4. `pnpm test && pnpm lint && pnpm typecheck`.

**Acceptance:**
- [ ] Implements the Runner contract from Task 1.4.
- [ ] `capabilities.permissions === new Set(['read', 'workspace-write'])`.
- [ ] `capabilities.resumable === false` (v1.0).
- [ ] AbortSignal mid-`run` yields `cancelled` event; `teardown()` cleans subagent state.

---

#### [runners] Task 2.2: codex-exec Runner backend (read-only mode only)

**Status:** todo
**Depends:** Task 1.4

Wraps `codex exec <prompt> -C <repoRoot> -s read-only ...` as a Runner.
**v1.0 alpha: read-only mode ONLY.** Tasks declaring `permissions:
workspace-write` are rejected at `prepare()` with a clear error pointing at
the tech-debt item for v1.x workspace-write support.

Per Stryker exclusions guidance: this test file MUST be added to
`vitest.stryker.config.ts` exclusions (bun cold-start + subprocess weight).

**Files:**
- Create: `src/runners/codex-exec/index.ts`
- Create: `src/runners/codex-exec/index.test.ts`
- Create: `src/runners/codex-exec/index.integration.test.ts`
- Modify: `vitest.stryker.config.ts` (exclude the integration test)

**Steps (TDD):**
1. Unit test (mocked `spawnSync`): prepare → run yields events in order;
   AbortSignal sends SIGTERM; codex stderr lines surface as `stderr` events.
2. Unit test: `permissions: workspace-write` task → prepare() throws with
   error mentioning `workspace-write deferred to v1.x`.
3. Integration test (real `codex exec` against a deterministic prompt, but
   mocked in CI per Eng 3B): full execution.
4. `pnpm test` — verify FAIL.
5. Implement using `child_process.spawnSync`.
6. Add the integration test to `vitest.stryker.config.ts` exclusions.
7. `pnpm test && pnpm lint && pnpm typecheck`.

**Acceptance:**
- [ ] read-only mode tasks execute end-to-end.
- [ ] workspace-write tasks fail-fast at prepare() with named tech-debt link.
- [ ] AbortSignal terminates the codex subprocess (no orphans).
- [ ] Stryker exclusion in place.

---

#### [runners] Task 2.3: local-worktree Runner backend

**Status:** todo
**Depends:** Task 1.4

CLI-agnostic backend: creates a `git worktree add` for each task, spawns the
user's selected runner (env-detected: codex if available, otherwise just a
shell context), tears down the worktree on teardown(). Worktree paths are
UUID-suffixed to prevent collisions across parallel runs.

**Files:**
- Create: `src/runners/local-worktree/index.ts`
- Create: `src/runners/local-worktree/index.test.ts`
- Create: `src/runners/local-worktree/path.ts` (UUID path helper)
- Create: `src/runners/local-worktree/path.test.ts`

**Steps (TDD):**
1. Test: prepare() creates worktree at unique path; teardown() removes it;
   teardown() is idempotent (second call is no-op); concurrent prepare() calls
   produce distinct paths.
2. `pnpm test` — verify FAIL.
3. Implement using `spawnSync('git', ['worktree', 'add'/'remove', ...])`.
4. `pnpm test && pnpm lint && pnpm typecheck`.

**Acceptance:**
- [ ] Worktree creation + removal works.
- [ ] No orphan worktrees after process kill (best-effort cleanup hook).
- [ ] Two parallel prepare() calls produce different paths.

---

#### [audits] Task 2.4: Update audit consumers for new ExecutionType variants

**Status:** todo
**Depends:** Task 1.1

Consumers of `BlueprintExecutionBackendValue` across the codebase may need
updates when the enum gains three new variants. Find via grep, audit each
site, update tests and code as needed.

**Files:**
- Modify: as found via grep across `src/blueprint/`, `src/cli/commands/audit*.ts`, etc.
- Modify: matching tests

**Steps (TDD):**
1. `grep -rn 'BlueprintExecutionBackend' src/` to find all consumers.
2. For each consumer: assess whether the new enum variants change behavior.
3. Write/extend tests for each affected consumer.
4. `pnpm test && pnpm lint && pnpm typecheck`.

**Acceptance:**
- [ ] No consumer breaks on the new enum variants.
- [ ] Audits that legitimately distinguish "omx-*" vs "Runner-*" do so
      explicitly (no implicit "all backends" assumption).

---

#### [scaffolders] Task 2.5: Spinner UX in setup scaffolders (4A)

**Status:** todo
**Depends:** Task 1.5

Add `ora` (or equivalent) spinner with per-step status to existing rtk +
context-mode + gstack scaffolders. Each scaffolder shows: spinner during
operation, success/failure line on completion. For long network ops (brew
install, git clone), pass through stderr so users see progress.

Verify `ora` compatibility with Bun (per technology table).

**Files:**
- Modify: `src/cli/commands/init/scaffolders/context-mode/index.ts`
- Modify: `src/cli/commands/init/scaffolders/rtk/index.ts`
- Modify: `src/cli/commands/init/scaffolders/gstack/index.ts`
- Modify: respective test files
- Modify: `package.json` (add `ora` dep)

**Steps (TDD):**
1. Test: scaffolder writes spinner-start + spinner-success lines to a
   capturable test sink in test mode.
2. `pnpm test` — verify FAIL.
3. Implement using `ora`; for tests inject a noop spinner.
4. `pnpm test && pnpm lint && pnpm typecheck`.

**Acceptance:**
- [ ] Each scaffolder shows progress during install.
- [ ] CI logs are clean (no ANSI spinner garbage when `process.stdout.isTTY` is false).
- [ ] Tests inject a noop spinner via DI seam.

---

### Wave 3 — Runner Selection + Persistence + Smoke (depends on Wave 2 — RW3 = 3)

#### [runners] Task 3.1: Runner selection (env detection + --runner flag)

**Status:** todo
**Depends:** Tasks 2.1, 2.2, 2.3

`selectRunner(task, env, flags)`: chooses the right backend. Logic:
- `--runner=X` flag overrides everything.
- If running inside a Claude Code session (env detection) → `claude-subagent`.
- Else if `codex` CLI on PATH → `codex-exec`.
- Else → `local-worktree`.
- Task's `runners` field FILTERS the candidate list: if `runners:
  [codex-exec, local-worktree]`, claude-subagent is never picked.

**Files:**
- Create: `src/runners/select.ts`
- Create: `src/runners/select.test.ts`

**Steps (TDD):**
1. Test the 4 selection paths (flag override, claude-subagent default, codex
   fallback, local-worktree fallback). Plus 2 filter cases.
2. `pnpm test src/runners/select.test.ts` — verify FAIL.
3. Implement using env-detection helpers + `command -v` equivalents
   (via spawnSync per Eng 1B).
4. `pnpm test && pnpm lint && pnpm typecheck`.

**Acceptance:**
- [ ] All 6 selection paths covered.
- [ ] Task's `runners` field filters candidates correctly.
- [ ] Selection failure (no backend matches the task's runners list) yields a clear error.

---

#### [persistence] Task 3.2: RunnerEvent → SQLite ingestion

**Status:** todo
**Depends:** Tasks 2.1, 1.3

Wire `RunnerEvent` stream emitted by Runner backends into the existing
`src/blueprint/db/ingester.ts`. Each event becomes a row in `runner_events`
table (created in Task 1.3). Validates Runner.version compatibility against
schema version at write time.

**Files:**
- Modify: `src/blueprint/db/ingester.ts` (add ingestRunnerEvent function)
- Modify: `src/blueprint/db/ingester.test.ts`

**Steps (TDD):**
1. Test: a complete RunnerEvent sequence (started → progress → completed)
   from a fixture Runner ingests cleanly; each event becomes a row keyed by
   handle + sequence.
2. Test: a Runner with mismatched protocol version surfaces a clear error
   from the ingester.
3. `pnpm test src/blueprint/db/ingester.test.ts` — verify FAIL.
4. Implement.
5. `pnpm test && pnpm lint && pnpm typecheck`.

**Acceptance:**
- [ ] Full event sequence persists in `runner_events`.
- [ ] Version mismatch raises a precise error before any partial write.
- [ ] No data loss on the AbortSignal path: `cancelled` event is the last
      row before teardown.

---

#### [ci] Task 3.3: CI smoke test for `ak setup --bundle`

**Status:** todo
**Depends:** Task 1.5, 2.5

CI step that boots a clean Docker container (Node 24, no plugins installed)
and runs `ak setup --bundle` against a fresh fixture repo. Asserts:
context-mode and rtk install at the pinned versions; spinner output is
non-garbled; lane-4 framing line appears in stdout.

**Files:**
- Create: `.github/workflows/bundle-smoke.yml` (or extend existing CI)
- Create: `test-fixtures/bundle-smoke/` (fixture repo)

**Steps:**
1. Write the GitHub Action with Docker image (or matrix on Ubuntu).
2. Run on every PR that touches `init/scaffolders/` or `compatible-versions.json`.
3. Smoke assertion script verifies expected outputs.

**Acceptance:**
- [ ] CI step passes on a clean container with the pinned versions.
- [ ] CI step fails fast if version pin can't be satisfied.

---

### Wave 4 — Regression + Eval Scaffold (depends on Wave 3 — RW4 = 2)

#### [tests] Task 4.1: Iron-rule regression test (golden transcript)

**Status:** todo
**Depends:** Tasks 2.1, 3.2

Golden-transcript fixture test for the `claude-subagent` Runner. Capture
the RunnerEvent stream from a known-good blueprint task under the
pre-abstraction pll flow, persist it as a golden fixture, then re-run via
the new Runner backend and assert byte-identical event sequence + final
artifact diff. This is the IRON RULE test from the eng review.

**Files:**
- Create: `src/runners/claude-subagent/golden-transcript.test.ts`
- Create: `src/runners/claude-subagent/__fixtures__/golden-transcript-hello.json`
- Create: `src/runners/claude-subagent/__fixtures__/golden-transcript-hello-blueprint.md`

**Steps (TDD):**
1. Capture a transcript from the pre-Runner-abstraction pll path against
   the hello-world blueprint fixture.
2. Persist as JSON golden + the blueprint as md.
3. Write the regression test: load fixture, run through `claude-subagent`
   Runner, assert event-by-event equality (modulo timestamps).
4. `pnpm test` — verify PASS on a correctly-implemented Runner; FAIL with a
   useful diff when behavior diverges.

**Acceptance:**
- [ ] Test asserts identical event sequence (ignoring timestamps).
- [ ] Test asserts identical artifact diff (file diff).
- [ ] Failure mode produces a readable diff (which event differs and how).

---

#### [evals] Task 4.2: Eval suite scaffold + Eval 1 (add-function)

**Status:** todo
**Depends:** Task 2.1

Scaffold the LLM eval suite (per Eng 3C) and ship the first eval:
**add-function**. Feeds the `claude-subagent` Runner a deterministic blueprint
("add `hello.ts` with a `hello()` function and a matching test"); asserts
files exist, exports match, test passes via `pnpm test`.

**Files:**
- Create: `evals/runner-quality/index.ts` (eval runner)
- Create: `evals/runner-quality/eval-1-add-function/blueprint.md`
- Create: `evals/runner-quality/eval-1-add-function/assert.ts`
- Create: `evals/runner-quality/eval-1-add-function/eval.test.ts`
- Modify: `package.json` (add `eval` script)

**Steps:**
1. Define eval shape: input (blueprint path), assertion (function), expected
   artifacts.
2. Implement eval-1 with the add-function blueprint + assertion.
3. Run `pnpm eval` — verify the eval passes against current pll.

**Acceptance:**
- [ ] `pnpm eval` runs the eval suite (one eval in this task).
- [ ] Eval-1 passes on current Runner backend.
- [ ] Eval failure surfaces with clear diff between expected and actual artifacts.

---

### Wave 5 — Remaining Evals (parallel, depends on Wave 4 — RW5 = 4)

#### [evals] Tasks 5.1–5.4: Evals 2–5

**Status:** todo (each)
**Depends:** Task 4.2 (each task is independent of the others)

Build out the remaining 4 evals per Eng 3C:
- **5.1**: Eval 2 — multi-file-refactor (rename symbol across 3 files; assert no broken references via typecheck)
- **5.2**: Eval 3 — test-addition (add tests for untested function; assert mutation score improves)
- **5.3**: Eval 4 — dependency-bump (bump dep + update call-site; assert lockfile + call-site both change)
- **5.4**: Eval 5 — extract-package (move module to new package; assert byte-identity + mutation parity per `extraction-parity` rule)

**Files (per eval):**
- Create: `evals/runner-quality/eval-N-<name>/blueprint.md`
- Create: `evals/runner-quality/eval-N-<name>/assert.ts`
- Create: `evals/runner-quality/eval-N-<name>/eval.test.ts`

**Steps (per eval):**
1. Write the blueprint that the eval runs.
2. Write the assertion function.
3. Add to `pnpm eval` registry.
4. Run; verify passes against current Runner backend.

**Acceptance (per eval):**
- [ ] Eval passes on current Runner backend.
- [ ] Eval failure mode is debuggable.

---

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
|---|---|---|---|---|
| **Wave 0** | 0.1, 0.2, 0.3, 0.4, 0.5–0.9 (×5 templates), 0.10 | None | 10 agents | XS each (except 0.1 = S) |
| **Wave 1** | 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8 | Wave 0 (partial per task) | 8 agents | XS-M |
| **Wave 2** | 2.1, 2.2, 2.3, 2.4, 2.5 | Wave 1 | 5 agents | S-M |
| **Wave 3** | 3.1, 3.2, 3.3 | Wave 2 | 3 agents | S |
| **Wave 4** | 4.1, 4.2 | Wave 3 | 2 agents | M |
| **Wave 5** | 5.1, 5.2, 5.3, 5.4 | Wave 4 | 4 agents | S each |
| **Critical path** | 0.1 → 1.1 → 1.4 → 2.1 → 3.2 → 4.1 | — | 6 waves | L |

## Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
|---|---|---|---|
| RW0 | Ready tasks in Wave 0 | ≥ 4 (for 8 agents / 2) | **10** ✓ |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | **25 / 6 ≈ 4.17** ✓ |
| DD | dependency_edges / total_tasks | ≤ 2.0 | **~1.2** ✓ |
| CP | same-file overlaps per wave | 0 | **0** ✓ |

**Parallelization score: A.** Plan is ready for `/pll` with up to 8-10 parallel agents.

## Acceptance criteria for v1.0 alpha

- [ ] All 25 tasks marked done.
- [ ] `pnpm qa` green (build + typecheck + lint + test + audits + hooks doctor).
- [ ] Iron-rule regression test (Task 4.1) passes byte-identically.
- [ ] All 5 evals (Tasks 4.2, 5.1–5.4) pass.
- [ ] Bundle smoke CI step (Task 3.3) green.
- [ ] `pnpm lint:pkg` (publint + attw) clean for the new `./runners/*` subpath exports.
- [ ] CEO plan errata section points at this Blueprint.
- [ ] Five tech-debt items filed:
  - `h-NNN-codex-exec-workspace-write`
  - `h-NNN-opencode-runner-backend`
  - `h-NNN-real-codex-nightly-smoke`
  - `h-NNN-resumable-runner`
  - `h-NNN-public-distribution-flip` (C4 deferred)
- [ ] Each cherry-pick lands as its own changeset; C3 (Runner abstraction)
      under alpha dist-tag for one cycle.
- [ ] v1.0 declaration deferred until X2 resolves (external adopter validates
      two backends + one failure-recovery path).

## Refinement Summary

| Metric | Value |
|---|---|
| Findings total | 18 (from prior CEO + Eng + Outside Voice + Phase 2 verification) |
| Critical | 2 (CEO plan stale state; Runner contract under-specified) |
| High | 5 |
| Medium | 8 |
| Low | 3 |
| Fixes applied | All folded into task definitions |
| Cross-plans updated | 0 (trilogy completed; no in-flight planned coordination) |
| Edge cases documented | 10 |
| Risks documented | 10 |
| **Parallelization score** | **A** |
| **Critical path** | 6 waves |
| **Max parallel agents** | 10 (Wave 0), 8 (sustained) |
| **Total tasks** | 25 |
| **Blueprint compliant** | 25/25 (Status, Depends, Files, Steps, Acceptance on every task) |
| **Wedge framing** | Verified execution record (X1) |
| **Iron-rule regression** | Captured as Task 4.1 |

## Unresolved decisions (carry-forward from CEO + Eng review)

- **X2 — v1.0 timing.** Cherry-picks ship as v0.15-v0.20 minors under default
  dist-tag; C3 ships as alpha dist-tag for one cycle. v1.0 SemVer-stable
  declaration deferred until at least one EXTERNAL repo validates two
  Runner backends AND one failure-recovery path. **Revisit when Lane A
  completes.**

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 (revised) | CLEAR | X1 wedge pivot to evidence ledger; 6 cherry-picks accepted, 1 deferred, 1 unresolved |
| Eng Review | `/plan-eng-review` | Architecture & tests | 1 | CLEAR | 12 issues resolved, 0 critical gaps; complexity-gate staged via per-cherry-pick changesets |
| Outside Voice | `codex exec` (gpt-5.5, reasoning=high) | Independent challenge | 1 | issues_found → fold-in complete | 15 problems flagged; 4 surfaced as tensions (X1/X2/X3/X4); X1+X3+X4 accepted, X2 unresolved; 6 refinements folded as implementation notes |
| Plan Refine | `/plan-refine` | Blueprint-format enforcement + parallelism | 1 | this Blueprint | 25 tasks across 6 waves; CPR 4.17, RW0 10, CP 0, score A; Phase 2 caught the `ak setup` already-existing finding that resized the plan |

- **CROSS-MODEL:** strong agreement on Runner under-specification (X3) and templates unblock (X4); user accepted X1 wedge pivot and X3 contract; X2 v1.0 timing left unresolved per user choice.
- **UNRESOLVED:** X2 — v1.0 SemVer-stable declaration gated on external adopter.
- **VERDICT:** CEO + ENG + REFINE CLEARED — ready for `/pll` or direct implementation. **Do not declare v1.0 SemVer-stable until X2 resolves.**
