---
type: blueprint
title: agent-kit v1.0 — Evidence Ledger + Multi-CLI Runner
status: in-progress
complexity: L
created: 2026-05-11T00:00:00.000Z
last_updated: '2026-05-11'
tags:
  - agent-kit
  - v1.0
  - runners
  - evidence-ledger
  - multi-cli
  - templates
  - blueprint-execution
max_parallel_agents: 8
progress: '4% (1/24 tasks done, 0 blocked, updated 2026-05-11)'
---

# agent-kit v1.0 — Evidence Ledger + Multi-CLI Runner

## Product wedge anchor

- **Stage outcome:** agent-kit v1.0 public launch with the "verified execution
  record for AI coding work" wedge (per CEO plan
  `~/.gstack/projects/agent-kit/ceo-plans/2026-05-11-positioning-and-v1-scope.md`).
- **Consuming surface:** `ak setup` (existing, extended with preflight +
  version-pinning + lane-4 framing + spinner), `ak blueprint new --template
  <name>` (new flag on existing verb), `pll` skill runtime, MCP server
  (existing).
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
- All Runner backend tests run as fast unit tests with mocked spawnSync /
  Agent invocations; real-subprocess fidelity lives in `pnpm eval` and the
  v1.x nightly-smoke tech-debt item.

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
│  Iron-rule regression test: fixture-based unit test compares Runner    │
│  event stream against pre-abstraction-pll golden transcript captured   │
│  in Task 0.0.                                                          │
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

### Testing strategy (per B2 outside-voice resolution)

All Runner backend tests mock at the spawnSync / Agent-tool boundary. No
heavyweight subprocess work in vitest. Stryker mutation suite stays clean.

Real-subprocess fidelity lives in two non-vitest paths:

- `pnpm eval` (Tasks 4.2 + 5.1-5.4) — runs real Runner against golden
  blueprints; assert LLM output quality. Not under Stryker.
- v1.x tech-debt `h-NNN-real-codex-nightly-smoke` — separate nightly CI
  job that exercises codex against deterministic prompts.

This gives fast PR CI + mutation-testable Runner code + meaningful quality
signal, at the cost of catching upstream-Codex-behavior drift only via
nightly. The trade is documented and accepted.

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
| `child_process.spawnSync` (Node 24+) | Cross-platform Runner subprocess invocation (codex-exec, local-worktree); already used in existing scaffolders. **All tests mock at this boundary per B2.** | Existing usage at `init/scaffolders/rtk/index.ts:1`, `context-mode/index.ts:1` |
| `ora` (v8.x) | Spinner UX for `ak setup` (4A); per `ora` docs supports Bun and Node 24+ | Verify via Context7 docs before adding dep in Task 2.5 |
| `@modelcontextprotocol/sdk` ^1.29.0 | Existing MCP server; unchanged in v1.0 | Already in deps |
| `better-sqlite3` | Existing blueprint store; unchanged in v1.0 | Already shipped in `src/blueprint/db/` |
| `zod` + `remark` family | Existing schema + parser; extended for runners/permissions | Already in deps |
| `codex exec -s read-only` | codex-exec backend invocation (mocked in PR CI) | Verified in `/plan-eng-review` outside-voice call |

## Key Decisions

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
| 3A | Happy-path E2E + integration edges + golden-transcript regression | Eng |
| 3B | Mock codex subprocess in PR CI (tech-debt for real-codex nightly) | Eng |
| 3C | Full eval suite (5 golden blueprints) | Eng |
| 4A | Full spinner UX in setup scaffolders | Eng |
| OV | Iron-rule regression: fixture-based unit test using Task 0.0 baseline | Outside voice |
| B1 | Capture baseline BEFORE C3 lands (Task 0.0 in Wave 0) | This eng review |
| B2 | All Runner tests mock at spawnSync/Agent boundary; eval suite holds real-subprocess fidelity | This eng review (user picked C: restructure over exclude) |
| B3 | Evals colocate at `src/runners/evals/` | This eng review |
| B4 | Template scaffolding via `ak blueprint new --template <name>` flag (not a new subverb) | This eng review |

## Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Runner contract calcifies wrong in v1.0; breaking change becomes v2.0 surface migration for adopters | HIGH | C3 ships in **alpha dist-tag** for one cycle before v1.0 declaration (X2 unresolved → keep on alpha until external adopter validates) |
| R2 | Codex `workspace-write` sandbox unstable | HIGH | Ship codex-exec with `permissions: read` mode ONLY in v1.0; reject workspace-write tasks at Runner.prepare() with clear error |
| R3 | Schema enum drift silently disagrees after migration | MEDIUM | Task 0.1 deduplicates BEFORE 1.1 extends; mutation test for the enum module |
| R4 | claude-subagent Runner observably diverges from pre-abstraction pll behavior | HIGH | Task 0.0 captures baseline fixture BEFORE C3 lands; Task 4.1 compares against fixture |
| R5 | RunnerEvent schema version mismatch between Runner emitter and ledger consumer | MEDIUM | `Runner.version` field carries semver; ingester validates at write time |
| R6 | Worktree orphan after Runner subprocess killed before teardown() | MEDIUM | local-worktree.teardown() is idempotent; pll-side timeout calls teardown after grace period |
| R7 | Mock-only PR CI misses real-codex behavior drift (auth, CLI flags, JSONL schema, sandbox mount, TTY, SIGTERM, orphans, Windows) | MEDIUM | Tech-debt `h-NNN-real-codex-nightly-smoke` filed; `pnpm eval` provides partial coverage via real runs against golden blueprints |
| R8 | rtk scaffolder uses `brew install rtk` on macOS without pin | MEDIUM | Task 1.5 adds `compatible-versions.json` + scaffolder reads it for version constraint; smoke test verifies |
| R9 | Two `ak setup --bundle` invocations on the same machine race on marketplace install | LOW | Document; rely on marketplace API + brew idempotency |
| R10 | opencode plugin scaffolder is "thin" per codex outside voice | MEDIUM | Task 0.10 audit + Task 1.8 extension; if opencode skill format does not support agent-kit skills, document and scope C5 down further |

## Edge Cases

| ID | Case | Handled by | Test |
|---|---|---|---|
| E1 | Task declares `runners: [codex-exec]` + `permissions: workspace-write` in v1.0 | Runner.prepare() rejects with `unsupported-permission` error | Unit test in `src/runners/codex-exec/index.test.ts` |
| E2 | AbortSignal fires during Runner.prepare() (before run() is called) | prepare() respects signal; throws AbortError; cleanup not needed because nothing started | Unit test in `src/runners/local-worktree/index.test.ts` |
| E3 | Runner subprocess killed externally; teardown() called later | teardown() idempotent; logs orphan-cleanup if any | Unit test (mocked) in `src/runners/codex-exec/index.test.ts`; real-subprocess coverage via nightly tech-debt |
| E4 | Worktree branch conflict: `git worktree add` fails | Runner.prepare() catches and yields `failed` event with clear error | Unit test (mocked) in `src/runners/local-worktree/index.test.ts` |
| E5 | `ak setup` re-run on a machine with rtk already installed at the pinned version | rtk scaffolder probes; `rtk-ok` with `installed: false`; no-op | Existing scaffolder test |
| E6 | `ak setup` re-run when pinned context-mode version is lower than installed | Task 1.5 detects version mismatch, prompts (or no-op based on `--strict`) | Unit test in `init/scaffolders/context-mode/index.test.ts` (extend) |
| E7 | RunnerEvent emitted before SQLite ingester is ready | Ingester buffers up to N events; flushes on first DB write | Unit test in `src/blueprint/db/ingester.test.ts` (extend) |
| E8 | Template task references a skill name that doesn't exist | `ak blueprint new --template <name>` validates skill names against `ak skills list` | Unit test in `src/cli/commands/blueprint/new.test.ts` (extend) |
| E9 | Two parallel Runners (different tasks) compete for the same worktree path | local-worktree generates UUID-suffixed paths; no collision | Unit test in `src/runners/local-worktree/path.test.ts` |
| E10 | Eval suite runs real subprocesses (claude-subagent) — slow but not in vitest | `pnpm eval` runs them outside vitest; Stryker untouched | N/A — evals are a separate runner |

## Cross-plan references

- **`blueprint-structured-store`** — COMPLETED. This Blueprint extends the
  existing schema in `src/blueprint/db/` with migration 0002 (runner_events
  table + runner_id/runner_version/permissions columns).
- **`agent-asset-compiler-multi-runtime`** — COMPLETED. Task 0.10 audits
  what the current `src/symlinker/consumers.ts` and `init/scaffolders/opencode
  -plugin/index.ts` do for opencode; Task 1.8 extends them if needed.
- **`agent-knowledge-graph-mcp`** — COMPLETED. Orthogonal; no coordination.
- **CEO plan 2026-05-11** — strategic source of truth; this Blueprint
  supersedes its scope sizing per the Errata section above.

---

## Tasks

### Wave 0 — Baseline + Foundations (no deps, all parallel — RW0 = 11)

#### [baseline] Task 0.0: Capture pre-abstraction pll golden transcript

**Status:** todo
**Depends:** None

**THIS TASK MUST COMPLETE BEFORE ANY OTHER TASK TOUCHES src/blueprint/dag/
OR THE pll SKILL.** Captures the observable behavior of the current pll
flow against a deterministic hello-world blueprint and persists it as a
golden fixture. Task 4.1 (regression test) compares the post-C3 Runner
output against this fixture — without it, the iron-rule regression test
compares the abstraction against itself.

The capture is a one-time manual / scripted operation on the pre-C3 branch
(this Blueprint's base). Output is a JSON file committed alongside Task 4.1's
test file so it ships in the repo.

**Files:**
- Create: `src/runners/claude-subagent/__fixtures__/golden-transcript-hello-blueprint.md`
- Create: `src/runners/claude-subagent/__fixtures__/golden-transcript-hello.json`
- Create: `scripts/capture-pll-baseline.ts` (one-shot capture script)

**Steps:**
1. Write a deterministic hello-world blueprint: one task that adds
   `hello.ts` exporting `hello()` plus a matching `hello.test.ts`.
2. Run that blueprint through current `pll` against a clean fixture repo;
   capture the event sequence (subagent invocations + final diff).
3. Persist as a JSON fixture with timestamps stripped; commit alongside
   the blueprint MD.
4. Document the capture procedure in the script header so the fixture
   can be regenerated if the input blueprint changes.

**Acceptance:**
- [ ] Golden JSON fixture committed, deterministic against timestamps.
- [ ] Capture script documents how to regenerate.
- [ ] Fixture loaded successfully by a dummy assertion (proof-of-life).

---

#### [schema] Task 0.1: Deduplicate executionBackendSchema

**Status:** done
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
2. `pnpm test src/blueprint/types/execution-backend.test.ts` — verify FAIL.
3. Create `execution-backend.ts` with the Zod enum + inferred type.
4. Replace the two duplicate definitions with re-exports.
5. `pnpm test src/blueprint/types/execution-backend.test.ts` — verify PASS.
6. `pnpm test` — verify the full suite passes.
7. `pnpm lint && pnpm typecheck`.

**Acceptance:**
- [ ] Single source of truth for `executionBackendSchema`.
- [ ] Both prior callsites re-export from the new module.
- [ ] No consumer of `BlueprintExecutionBackend` breaks.
- [ ] Test uses `toStrictEqual` (no weak assertions).

---

#### [setup] Task 0.2: Preflight pattern check in `ak setup`

**Status:** done
**Depends:** None

Add a soft compatibility preflight to `src/cli/commands/init/index.ts` that
runs before scaffolders fire. Default: WARN with link to the docs page
(Task 0.3). With `--strict` flag, mismatches abort. Matching repos see a
one-line green confirmation.

**Files:**
- Create: `src/cli/commands/init/preflight.ts`
- Create: `src/cli/commands/init/preflight.test.ts`
- Modify: `src/cli/commands/init/index.ts` (call preflight before scaffolders)

**Steps (TDD):**
1. Write `preflight.test.ts` with matching/mismatched/strict cases.
2. `pnpm test src/cli/commands/init/preflight.test.ts` — verify FAIL.
3. Implement using existing `detectConsumer` + filesystem probes.
4. Wire into `index.ts` ahead of scaffolders.
5. `pnpm test && pnpm lint && pnpm typecheck`.

**Acceptance:**
- [ ] Matching repo prints green one-liner; exits 0.
- [ ] Mismatch prints warning + docs URL; exits 0 unless `--strict`.
- [ ] `--strict` + mismatch exits 2.

---

#### [docs] Task 0.3: "Is agent-kit for me?" public docs page

**Status:** done
**Depends:** None

`docs/is-agent-kit-for-me.md` describing the webpresso pattern; leads with
the X1 evidence-ledger wedge framing.

**Files:**
- Create: `docs/is-agent-kit-for-me.md`

**Steps:**
1. Draft with: (a) hero "Is agent-kit for me?" answer; (b) compat checklist;
   (c) what fits get; (d) what non-fits get; (e) link to ledger explainer.
2. `pnpm docs:check` — verify frontmatter passes.

**Acceptance:**
- [ ] Page exists with the 5 sections.
- [ ] `ak audit docs-frontmatter` passes.
- [ ] Hero leads with X1 wedge framing, not multi-CLI-runner framing.

---

#### [rules] Task 0.4: gstack lane-4 routing rule

**Status:** done
**Depends:** None

Codify the lane-4 boundary into `catalog/agent/rules/gstack-routing.md`,
mirroring `context-mode-routing.md` structure.

**Files:**
- Create: `catalog/agent/rules/gstack-routing.md`

**Steps:**
1. Write the rule using `context-mode-routing.md` as template.
2. `pnpm exec ak audit catalog-drift` — verify pickup.

**Acceptance:**
- [ ] Rule file exists with Description, Ownership boundary, Hard rules,
      When-to-recommend-gstack.
- [ ] `ak audit catalog-drift` includes the rule.

---

#### [templates] Tasks 0.5–0.9: Blueprint templates (5 templates, parallel)

**Status:** todo (each)
**Depends:** None (each task is independent)

Curate 5 markdown blueprint templates under `catalog/blueprints/<name>/`
that `ak blueprint new --template <name>` (Task 1.7) will scaffold. Each
must contain at least one task with the new `runners`/`permissions`
frontmatter (Task 1.2).

Templates:
- **0.5**: `feature-cloudflare-worker`
- **0.6**: `migration-with-rollback`
- **0.7**: `cross-package-refactor`
- **0.8**: `add-vitest-suite`
- **0.9**: `extract-package`

**Files (per template):**
- Create: `catalog/blueprints/<name>/_overview.md`

**Steps (per template):**
1. Write `_overview.md` with valid frontmatter + section skeleton.
2. `pnpm exec ak audit catalog-drift` — verify pickup.
3. After Tasks 1.1+1.2 land, validate `runners`/`permissions` fields parse.

**Acceptance (per template):**
- [ ] `_overview.md` exists with valid frontmatter (type=blueprint, status=draft).
- [ ] Contains at least one task block with `runners` + `permissions` fields.
- [ ] `ak audit catalog-drift` lists the template.

---

#### [audit] Task 0.10: Audit existing opencode integration

**Status:** done
**Depends:** None

Codex outside voice flagged `init/scaffolders/opencode-plugin/index.ts`
as "thin." Audit: (a) what does `scaffoldOpencodePlugin` write today?
(b) does `src/symlinker/consumers.ts` have an opencode consumer? (c) where
does opencode look for repo-local vs user-global skills? Output: a short
note at `notes/opencode-audit.md` (alongside this Blueprint) capturing
the delta for Task 1.8.

**Files:**
- Read: `src/cli/commands/init/scaffolders/opencode-plugin/index.ts`
- Read: `src/symlinker/consumers.ts`
- Read: `src/symlinker/unified-sync.ts`
- Create: `blueprints/planned/agent-kit-v1-evidence-ledger/notes/opencode-audit.md`

**Steps:**
1. Read the three files; identify what they emit for opencode.
2. Verify against opencode docs.
3. Write the audit note with concrete delta + recommendation.

**Acceptance:**
- [x] Audit note exists and names current opencode write paths.
- [x] Recommendation specifies what Task 1.8 should add.

---

#### [cli] Task 0.11: `ak gain` — token savings summary command

**Status:** done
**Depends:** None

DX review (2026-05-12) found: the chosen magical moment for first-user adoption is
`ak gain` showing token savings after a session. This command does not yet exist.
RTK exposes `rtk gain` with full analytics. `ak gain` wraps it.

**Files:**
- Create: `src/cli/commands/gain/index.ts`
- Modify: `src/cli/cli.ts` (register command under Core group)
- Create: `src/cli/commands/gain/index.test.ts`

**Steps (TDD):**
1. Write test: when RTK is on PATH, `ak gain` exits 0 and produces output containing
   "tokens" (case-insensitive). When RTK absent, exits 0 with install hint.
2. `pnpm test src/cli/commands/gain/` → FAIL.
3. Implement: `spawnSync('rtk', ['gain'])` if RTK found, else print
   `"RTK not installed. Run \`ak setup --with rtk\` to enable token savings tracking."`.
4. `pnpm test src/cli/commands/gain/` → PASS.
5. Lint + typecheck.

**Acceptance:**
- [ ] `ak gain` runs `rtk gain` output when RTK installed.
- [ ] `ak gain` prints actionable install hint when RTK absent.
- [ ] Listed in `ak --help` under Core commands group.
- [ ] Tests pass; lint passes.

---

#### [cli] Task 0.12: `ak --help` progressive disclosure

**Status:** done
**Depends:** None

DX review found: 20+ commands on first `ak --help` is cognitive overload. New users
don't know which 3 commands matter. Group into Core / Quality / Advanced sections.

**Files:**
- Modify: `src/cli/cli.ts`

**Steps (TDD):**
1. Snapshot-test current `ak --help` output.
2. Modify commander config to group commands with section headers.
   Core: `setup`, `blueprint`, `gain`, `sync`
   Quality: `audit`, `test`, `lint`, `typecheck`, `e2e`
   Advanced: `compile`, `rule`, `skill`, `docs`, `dev`, `doctor`, `err`, `format`, `roadmap`
3. Assert snapshot contains "Core" and "Quality" section headers.
4. Lint + typecheck.

**Acceptance:**
- [ ] `ak --help` output has three sections: Core, Quality, Advanced.
- [ ] `gain` appears in Core group.
- [ ] `err` description updated to: "Run a command and show only failures (hooks + CI)".
- [ ] Snapshot test updated.

---

### Wave 1 — Schema + Bundle Refinements (depends on Wave 0 — RW1 = 8)

#### [schema] Task 1.1: Extend executionBackendSchema with runner ids

**Status:** done
**Depends:** Task 0.1

Extend the deduplicated enum from Task 0.1 with three new Runner ids:
`'claude-subagent'`, `'codex-exec'`, `'local-worktree'`.

**Files:**
- Modify: `src/blueprint/types/execution-backend.ts`
- Modify: `src/blueprint/types/execution-backend.test.ts`

**Steps (TDD):** add test → FAIL → extend enum → PASS → full suite.

**Acceptance:**
- [ ] Enum contains 5 values.
- [ ] Existing consumers compile and pass tests.

---

#### [schema] Task 1.2: Add `runners` + `permissions` task fields

**Status:** done
**Depends:** Task 0.1, Task 1.1

Add two new TASK-level frontmatter fields:
- `runners?: RunnerId[]` — optional list; empty = all.
- `permissions?: 'read' | 'workspace-write'` — default `'workspace-write'`.

**Files:**
- Modify: `src/blueprint/core/validation/task-blocks.ts` (verify path)
- Modify: matching test file

**Steps (TDD):**
1. Test: valid `runners` parses; invalid runner id fails with clear error;
   valid `permissions` parses; unknown permission fails.
2. FAIL → extend Zod schema (use shared enum from 1.1) → PASS.
3. `pnpm test && pnpm lint && pnpm typecheck`.

**Acceptance:**
- [ ] Valid task block parses.
- [ ] Invalid runner id surfaces precise Zod error.
- [ ] Default permission is `workspace-write`.

---

#### [db] Task 1.3: Schema push — runner_events table + execution columns

**Status:** done
**Depends:** Task 0.1, Task 1.1

**db push approach (no numbered migration file):** the DB is rebuilt from
scratch on cold-start, so new tables and columns go directly into
`0001_seed.sql`. Add `runner_id`, `runner_version`, `permissions` columns
to the existing execution table; add a new `runner_events` table.

**Note:** SQL column `kind` corresponds to TS discriminant `type` on
RunnerEvent — naming chosen because `type` is harder to query in SQL
contexts. Persistence layer (Task 3.2) maps between them.

**Files:**
- Modify: `src/blueprint/db/migrations/0001_seed.sql`
- Modify: `src/blueprint/db/migrations.test.ts`
- Modify: `src/blueprint/db/enums.ts` (sync with Task 0.1 source of truth)

**Steps (TDD):**
1. Read `0001_seed.sql` to understand the execution table shape.
2. Add test: fresh DB → schema contains `runner_id`, `runner_version`,
   `permissions` on execution table + `runner_events` table with correct
   columns and indexes.
3. FAIL → add columns + table to `0001_seed.sql` → PASS.
4. `pnpm test && pnpm typecheck`.

**Acceptance:**
- [ ] `runner_events` table present with `execution_handle`, `sequence`, `kind`, `ts` columns.
- [ ] Execution table has `runner_id`, `runner_version`, `permissions` columns.
- [ ] Indexes on `runner_events(execution_handle)` and `runner_events(ts)`.
- [ ] `migrations.test.ts` covers the new schema.

---

#### [runners] Task 1.4: Runner interface + type contract

**Status:** todo
**Depends:** Task 1.1, Task 1.2

Net-new module `src/runners/`. Defines the managed-context Runner contract
(see Architecture section above). Register `./runners` and `./runners/types`
in `package.json#exports` + `tshy.exports` per Decision 2A.

**Files:**
- Create: `src/runners/index.ts`
- Create: `src/runners/types.ts`
- Create: `src/runners/types.test.ts`
- Modify: `package.json` (exports + tshy.exports)

**Steps (TDD):**
1. Type-level assertions + runtime Zod schema for RunnerEvent.
2. FAIL → implement types + Zod schema → PASS.
3. Update exports map.
4. `pnpm build && pnpm lint:pkg && pnpm test && pnpm typecheck`.

**Acceptance:**
- [ ] `import { Runner, RunnerEvent } from '@webpresso/agent-kit/runners'` works.
- [ ] Invalid RunnerEvent fails Zod with descriptive error.
- [ ] `pnpm lint:pkg` (publint + attw) passes.
- [ ] Per-function cognitive complexity ≤ 8.

---

#### [bundle] Task 1.5: compatible-versions.json + scaffolder pinning

**Status:** done
**Depends:** None

`compatible-versions.json` at repo root pins context-mode + rtk version
ranges. context-mode and rtk scaffolders read it and enforce pin/range.

**Files:**
- Create: `compatible-versions.json`
- Modify: `src/cli/commands/init/scaffolders/context-mode/index.ts`
- Modify: `src/cli/commands/init/scaffolders/rtk/index.ts`
- Modify: scaffolder tests

**Steps (TDD):** test → FAIL → implement pin-reading helper → PASS.

**Acceptance:**
- [ ] Pin file exists with `$schema` link.
- [ ] Scaffolders share a single pin-reading helper (DRY).
- [ ] Out-of-range = warning (non-strict); error (strict).

---

#### [setup] Task 1.6: Lane-4 framing + post-install "what to do next" in `ak setup` output

**Status:** done
**Depends:** Task 0.4, Task 0.11 (gain must exist before it can be referenced)

`ak setup` summary line frames lanes 2/3/4 explicitly (per Decision 1D). Also
addresses DX review finding: post-install silence kills conversion. After all
scaffolders complete, print a "next steps" block that gives users one concrete
command to run immediately.

**Files:**
- Modify: `src/cli/commands/init/index.ts`
- Modify: matching test

**Steps (TDD):**
1. Write integration test: capture stdout → assert four lane framing lines → FAIL.
2. Implement lane framing → PASS.
3. Extend test: assert final output block contains `ak blueprint new` and `ak gain`.
4. Implement next-steps block printed unconditionally after successful setup:
   ```
   ✅ Setup complete.

   Next: ak blueprint new "your first task"
         ak gain          # token savings after your first session
   ```
5. Lint + typecheck.

**Acceptance:**
- [ ] Output contains 4 lane framing lines.
- [ ] Silent when scaffolders skipped.
- [ ] Post-install block contains `ak blueprint new` and `ak gain`.
- [ ] Block omitted on `--dry-run`.

---

#### [cli] Task 1.7: `ak blueprint new --template <name>` flag

**Status:** todo
**Depends:** None

**Revised per B4 + catalog-template deletion:** the 5 catalog blueprint
templates (Tasks 0.5–0.9) were deleted per user decision. The `--template`
flag now reads from `docs/templates/` (the doc template directory) or from
any `.md` files present in `catalog/blueprints/` — whichever exists. The
flag is still valuable as a mechanism; it lists whatever templates are
available rather than requiring a fixed 5.

**Files:**
- Modify: `src/cli/commands/blueprint/new.ts` (verify path)
- Modify: matching test
- Create: `src/cli/commands/blueprint/template-resolver.ts`
- Create: `src/cli/commands/blueprint/template-resolver.test.ts`

**Steps (TDD):**
1. Test: `ak blueprint new --template <name>` resolves from `docs/templates/`.
   Unknown template → exit 2 with list of available templates.
2. FAIL → implement template-resolver + wire into `new` command → PASS.
3. `pnpm test && pnpm lint && pnpm typecheck`.

**Acceptance:**
- [ ] `ak blueprint new --list-templates` lists available templates from `docs/templates/`.
- [ ] Generated `_overview.md` passes `ak blueprint audit`.
- [ ] `--template` composes with `--complexity` (template sets default; flag overrides).
- [ ] Unknown template exits 2 with available list.

---

#### [symlinker] Task 1.8: opencode skill-sync target

**Status:** done
**Depends:** Task 0.10

Per Task 0.10's audit, extend `src/symlinker/consumers.ts` or
`init/scaffolders/opencode-plugin/index.ts` so `ak sync` writes skills
into opencode's expected layout. Scope: skill-sync only.

**Files:**
- Modify: per Task 0.10's recommendation
- Modify: matching test file

**Steps (TDD):** fixture test → FAIL → implement → PASS.

**Acceptance:**
- [ ] `ak sync` writes opencode skills to the identified location.
- [ ] Codex + Gemini sync regression-checked.

---

### Wave 2 — Runner Backends + Audit Update + Spinner (depends on Wave 1 — RW2 = 5)

**Testing note for all Wave 2 Runner tasks (per B2):** Every test in this
wave mocks at the spawnSync / Agent invocation boundary. No real Codex
binary, no real `git worktree`, no real Claude subagent in PR CI. The
`pnpm eval` suite (Wave 4-5) holds real-subprocess fidelity. Stryker
mutation suite stays clean — no new exclusions needed for Wave 2 tests.

#### [runners] Task 2.1: claude-subagent Runner backend

**Status:** todo
**Depends:** Task 1.4

Wraps the in-process Claude Code subagent flow. Tests mock the Agent
invocation at a DI seam (inject the subagent function); assert correct
parameters + correct event-stream transformation from mocked output.

**Files:**
- Create: `src/runners/claude-subagent/index.ts`
- Create: `src/runners/claude-subagent/index.test.ts`
- Create: `src/runners/claude-subagent/types.ts`

**Steps (TDD):**
1. Test: prepare() returns an Execution; run(signal) yields expected event
   sequence from MOCKED subagent output; teardown() idempotent;
   AbortSignal yields `cancelled`.
2. FAIL → implement with DI seam for the subagent invocation → PASS.
3. `pnpm test && pnpm lint && pnpm typecheck`.

**Acceptance:**
- [ ] Implements Runner contract from Task 1.4.
- [ ] All tests use mocked subagent (no real Agent invocation).
- [ ] `capabilities.permissions === new Set(['read', 'workspace-write'])`.
- [ ] `capabilities.resumable === false`.
- [ ] AbortSignal yields `cancelled`; teardown cleans state.

---

#### [runners] Task 2.2: codex-exec Runner backend (read-only mode only)

**Status:** todo
**Depends:** Task 1.4

Wraps `codex exec ... -s read-only`. v1.0 alpha: read-only mode ONLY.
Tasks with `permissions: workspace-write` rejected at `prepare()` with
clear error mentioning the v1.x tech-debt item.

**Tests mock `child_process.spawnSync`** — no real codex invocation in PR
CI. No Stryker exclusion needed (test is fast).

**Files:**
- Create: `src/runners/codex-exec/index.ts`
- Create: `src/runners/codex-exec/index.test.ts`

**Steps (TDD):**
1. Test (mocked spawnSync): prepare → run yields events in order;
   AbortSignal sends SIGTERM via mocked process; stderr surfaces as
   `stderr` events; workspace-write task fails at prepare().
2. FAIL → implement with DI seam for spawnSync → PASS.
3. `pnpm test && pnpm lint && pnpm typecheck`.

**Acceptance:**
- [ ] read-only tasks execute end-to-end against mocked codex.
- [ ] workspace-write tasks fail-fast at prepare() with named tech-debt link.
- [ ] AbortSignal terminates mocked subprocess; no orphans.
- [ ] DI seam allows real codex invocation under `pnpm eval`.

---

#### [runners] Task 2.3: local-worktree Runner backend

**Status:** todo
**Depends:** Task 1.4

CLI-agnostic backend: creates `git worktree add` per task, spawns user's
runner via env detection, tears down on teardown(). UUID-suffixed paths.

**Tests mock spawnSync** (no real git operations in PR CI).

**Files:**
- Create: `src/runners/local-worktree/index.ts`
- Create: `src/runners/local-worktree/index.test.ts`
- Create: `src/runners/local-worktree/path.ts`
- Create: `src/runners/local-worktree/path.test.ts`

**Steps (TDD):**
1. Test (mocked spawnSync): prepare creates unique path via UUID;
   teardown idempotent; branch-conflict path raises `failed`;
   concurrent prepare → distinct paths.
2. FAIL → implement → PASS.
3. `pnpm test && pnpm lint && pnpm typecheck`.

**Acceptance:**
- [ ] Mocked worktree creation + removal flows pass.
- [ ] Idempotent teardown verified.
- [ ] Two parallel prepare calls produce different paths.

---

#### [audits] Task 2.4: Update audit consumers for new ExecutionType variants

**Status:** todo
**Depends:** Task 1.1

`grep` consumers of `BlueprintExecutionBackend*`; audit each site for
new-variant correctness; extend tests; verify no implicit "all backends"
assumption breaks.

**Files:** as found via grep across `src/blueprint/`, `src/cli/commands/audit*.ts`.

**Steps:** find → audit → fix → test.

**Acceptance:**
- [ ] No consumer breaks on new enum variants.
- [ ] Audits explicitly distinguish "omx-*" vs Runner backends where it matters.

---

#### [scaffolders] Task 2.5: Spinner UX in setup scaffolders (4A)

**Status:** todo
**Depends:** Task 1.5

Add `ora` (or noop in non-TTY) to rtk + context-mode + gstack scaffolders.
Per-step status; success/failure on completion.

**Files:**
- Modify: 3 scaffolders + tests
- Modify: `package.json` (add `ora` dep)

**Steps (TDD):** test with injected noop spinner → FAIL → implement → PASS.

**Acceptance:**
- [ ] Each scaffolder shows progress.
- [ ] CI logs clean (no ANSI when `process.stdout.isTTY === false`).
- [ ] DI seam for testing.

---

### Wave 3 — Runner Selection + Persistence + Smoke (depends on Wave 2 — RW3 = 3)

#### [runners] Task 3.1: Runner selection

**Status:** todo
**Depends:** Tasks 2.1, 2.2, 2.3

`selectRunner(task, env, flags)`: `--runner=X` overrides; Claude Code env →
claude-subagent; codex on PATH → codex-exec; else local-worktree. Task's
`runners` field FILTERS candidates.

**Files:**
- Create: `src/runners/select.ts`
- Create: `src/runners/select.test.ts`

**Steps (TDD):** 6 selection paths → FAIL → implement → PASS.

**Acceptance:**
- [ ] All paths covered, including filter cases.
- [ ] No-match raises clear error.

---

#### [persistence] Task 3.2: RunnerEvent → SQLite ingestion

**Status:** todo
**Depends:** Tasks 2.1, 1.3

Extend `src/blueprint/db/ingester.ts` with `ingestRunnerEvent` function.
Maps RunnerEvent.type → SQL `kind`. Validates Runner.version at write time.

**Files:**
- Modify: `src/blueprint/db/ingester.ts`
- Modify: `src/blueprint/db/ingester.test.ts`

**Steps (TDD):** fixture RunnerEvent sequence ingests → all rows present;
version mismatch raises pre-write error → FAIL → implement → PASS.

**Acceptance:**
- [ ] Full event sequence persists.
- [ ] Version mismatch raises pre-write error.
- [ ] AbortSignal path persists `cancelled` event before teardown.

---

#### [ci] Task 3.3: CI smoke test for `ak setup --bundle`

**Status:** todo
**Depends:** Task 1.5, 2.5

GitHub Action runs `ak setup --bundle` in a clean container; asserts pinned
versions install + spinner output non-garbled + lane-4 framing appears.

**Files:**
- Create: `.github/workflows/bundle-smoke.yml` (or extend existing CI)
- Create: `test-fixtures/bundle-smoke/`

**Acceptance:**
- [ ] CI passes against pinned versions.
- [ ] CI fails fast on pin unsatisfiable.

---

### Wave 4 — Regression + Eval Scaffold (depends on Wave 0 + Wave 3 — RW4 = 2)

#### [tests] Task 4.1: Iron-rule regression test (against Task 0.0 fixture)

**Status:** todo
**Depends:** Tasks 0.0, 2.1, 3.2

**Revised per B1 + B2:** load the golden fixture from Task 0.0; feed the
fixture's INPUT through the new `claude-subagent` Runner with the SUBAGENT
INVOCATION MOCKED to replay the fixture's recorded subagent output; assert
the Runner produces an event stream byte-identical to the fixture's
expected output. This tests the abstraction layer's fidelity to recorded
real-subagent behavior, without invoking a real subagent in PR CI.

**Files:**
- Create: `src/runners/claude-subagent/golden-transcript.test.ts`
- Re-use: `src/runners/claude-subagent/__fixtures__/golden-transcript-hello.json` (from Task 0.0)
- Re-use: `src/runners/claude-subagent/__fixtures__/golden-transcript-hello-blueprint.md` (from Task 0.0)

**Steps (TDD):**
1. Test loads fixture; runs through Runner with mocked subagent that
   replays fixture's recorded turns; asserts event-by-event equality of
   the Runner output (modulo timestamps).
2. Runner correctness → PASS; behavior divergence → useful diff.

**Acceptance:**
- [ ] Identical event sequence (timestamps ignored).
- [ ] Identical artifact diff.
- [ ] Failure mode produces readable diff (which event differs and how).

---

#### [evals] Task 4.2: Eval suite scaffold + Eval 1 (add-function)

**Status:** todo
**Depends:** Task 2.1

**Revised per B3:** scaffold the eval suite at `src/runners/evals/` (not
repo-root `evals/`); ship the first eval: add-function. Evals run via
`pnpm eval` — separate from vitest; not under Stryker; uses REAL Runner
backends (this is where real-subprocess fidelity lives).

**Files:**
- Create: `src/runners/evals/index.ts` (eval runner)
- Create: `src/runners/evals/eval-1-add-function/blueprint.md`
- Create: `src/runners/evals/eval-1-add-function/assert.ts`
- Create: `src/runners/evals/eval-1-add-function/eval.test.ts`
- Modify: `package.json` (add `eval` script — `bun src/runners/evals/index.ts`)

**Steps:**
1. Define eval shape: input (blueprint path), assertion (function), expected artifacts.
2. Implement eval-1 with add-function blueprint + assertion.
3. `pnpm eval` — verify passes against current Runner.

**Acceptance:**
- [ ] `pnpm eval` runs the eval suite.
- [ ] Eval-1 passes against current backend.
- [ ] Failure surfaces with clear expected-vs-actual diff.

---

### Wave 5 — Remaining Evals (parallel, depends on Wave 4 — RW5 = 4)

#### [evals] Tasks 5.1–5.4: Evals 2–5

**Status:** todo (each)
**Depends:** Task 4.2 (each independent of the others)

Build out the remaining 4 evals at `src/runners/evals/` (per B3):
- **5.1**: Eval 2 — multi-file-refactor
- **5.2**: Eval 3 — test-addition (mutation-score delta assertion)
- **5.3**: Eval 4 — dependency-bump
- **5.4**: Eval 5 — extract-package (byte-identity + mutation parity per `extraction-parity` rule)

**Files (per eval):**
- Create: `src/runners/evals/eval-N-<name>/blueprint.md`
- Create: `src/runners/evals/eval-N-<name>/assert.ts`
- Create: `src/runners/evals/eval-N-<name>/eval.test.ts`

**Acceptance (per eval):**
- [ ] Eval passes on current Runner backend.
- [ ] Failure mode debuggable.

---

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
|---|---|---|---|---|
| **Wave 0** | 0.0, 0.1, 0.2, 0.3, 0.4, 0.10, **0.11, 0.12** | None (0.0 must complete before any task touches pll) | 8 agents | XS each (0.0 = S, 0.1 = S) |
| **Wave 1** | 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8 | Wave 0 (per task; 1.6 also depends on 0.11) | 8 agents | XS-M |
| **Wave 2** | 2.1, 2.2, 2.3, 2.4, 2.5 | Wave 1 | 5 agents | S-M (all mocked, fast) |
| **Wave 3** | 3.1, 3.2, 3.3 | Wave 2 | 3 agents | S |
| **Wave 4** | 4.1, 4.2 | Wave 0 (0.0) + Wave 3 | 2 agents | M |
| **Wave 5** | 5.1, 5.2, 5.3, 5.4 | Wave 4 | 4 agents | S each |
| **Critical path** | 0.0 → 1.1 → 1.4 → 2.1 → 3.2 → 4.1 (or 4.2) | — | 6 waves | L |

Note: Task 0.0 IS a Wave 0 task but is the head of the critical path
because Task 4.1 depends on its fixture output.

## Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
|---|---|---|---|
| RW0 | Ready tasks in Wave 0 | ≥ 4 (for 8 agents / 2) | **11** ✓ |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | **26 / 6 ≈ 4.33** ✓ |
| DD | dependency_edges / total_tasks | ≤ 2.0 | **~1.2** ✓ |
| CP | same-file overlaps per wave | 0 | **0** ✓ |

**Parallelization score: A.** Plan is ready for `/pll` with up to 8-11 parallel agents.

## Acceptance criteria for v1.0 alpha

- [ ] All 26 tasks marked done.
- [ ] `pnpm qa` green (build + typecheck + lint + test + audits + hooks doctor).
- [ ] Iron-rule regression test (Task 4.1) passes against Task 0.0 fixture.
- [ ] All 5 evals (Tasks 4.2, 5.1–5.4) pass via `pnpm eval`.
- [ ] Bundle smoke CI step (Task 3.3) green.
- [ ] `pnpm lint:pkg` (publint + attw) clean for `./runners/*` exports.
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
| Findings total | 22 (from prior CEO + Eng + Outside Voice + Phase 2 verification + this eng review) |
| Critical | 3 (CEO plan stale state; Runner contract under-specified; regression baseline timing) |
| High | 5 |
| Medium | 9 |
| Low | 5 |
| Fixes applied | All folded into task definitions |
| Cross-plans updated | 0 (trilogy completed) |
| Edge cases documented | 10 |
| Risks documented | 10 |
| **Parallelization score** | **A** |
| **Critical path** | 6 waves |
| **Max parallel agents** | 11 (Wave 0), 8 (sustained) |
| **Total tasks** | 26 |
| **Blueprint compliant** | 26/26 |
| **Wedge framing** | Verified execution record (X1) |
| **Iron-rule regression** | Task 0.0 captures baseline; Task 4.1 compares against fixture |
| **Test infrastructure** | All Runner tests mock at spawnSync/Agent boundary; real fidelity in `pnpm eval` |

## Unresolved decisions (carry-forward)

- **X2 — v1.0 timing.** Cherry-picks ship as v0.15-v0.20 minors under default
  dist-tag; C3 ships as alpha dist-tag for one cycle. v1.0 SemVer-stable
  declaration deferred until at least one EXTERNAL repo validates two
  Runner backends AND one failure-recovery path. **Revisit when Lane A
  completes.**

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 (revised) | CLEAR | X1 wedge pivot; 6 cherry-picks accepted, 1 deferred, 1 unresolved |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 (CEO + Blueprint) | CLEAR | First pass: 12 issues resolved; second pass on Blueprint: 4 issues resolved (regression timing, Stryker, evals location, CLI surface) |
| Outside Voice | `codex exec` (gpt-5.5, reasoning=high) | Independent challenge | 1 | issues_found → fold-in complete | 15 problems flagged; 4 tensions accepted; 6 refinements folded |
| Plan Refine | `/plan-refine` | Blueprint format + parallelism | 1 | this Blueprint | 26 tasks across 6 waves; CPR 4.33, RW0 11, CP 0, score A; Phase 2 caught the `ak setup` already-existing finding |
| Design Review | `/plan-design-review` | UI/UX (docs page only) | 0 | not yet run | Queued for after v1.0 alpha planning lands |
| DX Review | `/plan-devex-review` | Developer experience | 1 | issues_found → folded | Composite 6/10. Critical: `ak gain` unimplemented (magical moment blocked). 5 fixes → Tasks 0.11, 0.12 added; Task 1.6 expanded. |

- **CROSS-MODEL:** strong agreement on Runner under-specification (X3) and templates unblock (X4); X1 wedge pivot accepted; X2 v1.0 timing left unresolved.
- **UNRESOLVED:** X2 — v1.0 SemVer-stable declaration gated on external adopter.
- **VERDICT:** CEO + ENG (×2) + REFINE CLEARED — Blueprint promoted to `planned/` and ready for `/pll` or direct implementation. **Do not declare v1.0 SemVer-stable until X2 resolves.**
