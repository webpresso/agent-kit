---
type: blueprint
title: Structured blueprint MCP — SQLite-first multi-project agent operations
status: completed
complexity: XL
owner: ozby
historical_verification_gap_waiver: true
historical_verification_gap_rationale: Historical completed/parked record predates the durable per-task verification convention; retain lifecycle truth without fabricating retroactive evidence.
created: '2026-05-13'
last_updated: '2026-05-14'
progress: '12/12 tasks done'
depends_on:
  - blueprint-structured-store
tags:
  - agent-kit
  - blueprints
  - sqlite
  - mcp
  - devex
  - verification
  - worktrees
  - multi-project
reviews:
  - plan_refine: 2026-05-13
  - dx: 2026-05-13
  - critical_plan_refine: 2026-05-13
  - plan_refine_round2: 2026-05-13
---

# Structured blueprint MCP — SQLite-first multi-project agent operations

## Product wedge anchor

- **Stage outcome:** Agents stop treating blueprints as stale markdown blobs. The completed `blueprint-structured-store` work already created a SQLite projection, SQL templates, CLI DB verbs, and a DB-backed MCP server; this blueprint turns that existing work into the default agent-facing MCP contract.
- **Expanded operating scope:** MCP can see the current project, MCP client roots, configured workspace repos, and discovered git worktrees/nested blueprint projects through one small resolver. Agents operate on one project by default and intentionally widen to multiple projects/worktrees.
- **Consuming surface:** `wp mcp` tool list, structured blueprint MCP tools (`wp_blueprint_projects`, `wp_blueprint_list`, `wp_blueprint_get`, `wp_blueprint_context`, `wp_blueprint_create`, `wp_blueprint_task_verify`, plus existing query/validate/task/promote/finalize/depgraph), and maintainer smoke docs.
- **New user-visible capability:** A maintainer or agent can discover relevant projects and blueprints, fetch only needed context chunks, mark completion with verification evidence, and receive the next recommended context without manually reading or editing `_overview.md`.

## Critical investigation summary

The repo already has substantial SQLite blueprint infrastructure. This blueprint must **reuse and wire it**, not rebuild it. The critical refinement is that multi-worktree support changes the storage-scope decision: a SQLite projection derived from worktree markdown cannot be safely repo-global unless the schema is made project/worktree-aware.

| ID | Severity | Evidence | Implementation implication |
| -- | -------- | -------- | -------------------------- |
| F1 | HIGH | `src/blueprint/db/cold-start.ts` uses `getSurfacePath('blueprints/blueprints.db', 'repo', cwd)`, while older call sites hardcode `.agent/.blueprints.db`. `src/paths/state-root.ts` has separate `repo` and `worktree` scopes. | Centralize path resolution before MCP widening. Use a worktree-scoped projection DB for markdown-derived rows, because two worktrees of the same repo can have different checked-out blueprint files. Keep any cross-project registry separate from the projection DB. |
| F2 | HIGH | SQLite schema/migrations/ingester/query templates already exist in `src/blueprint/db/*`; CLI mutations still edit markdown then re-ingest. | Preserve markdown as canonical durable artifact. Do not add a second schema/parser. Add helpers around the existing projection. |
| F3 | HIGH | `src/mcp/blueprint-server.ts` registers structured DB-backed tools, but `src/mcp/server.ts` only auto-discovers `src/mcp/tools/*`, where legacy `wp_blueprint` remains. | Wire structured tools into the default `wp mcp` server and retire the stale file/action facade only after replacements cover normal workflows. |
| F4 | HIGH | `src/blueprint/db/workspace-config.ts` only reads static `~/.agent/workspace.yaml` entries shaped as `{ repos: [{ path }] }`. `src/cli/commands/worktree/router-dispatch.ts` already exports `parseWorktreePorcelain(raw: string): WorktreeEntry[]` and `resolveWorktreePath`. | Build an explicit project/worktree discovery module that imports the already-exported worktree parser; do not re-export or duplicate it. Do not make MCP infer all roots by ad hoc recursive filesystem scans. |
| F5 | HIGH | Installed `@modelcontextprotocol/sdk` is `1.29.0`; local SDK exposes `Server.listRoots()` and `RootsListChangedNotificationSchema`. `listRoots()` throws via `assertClientCapability()` if the client did not advertise roots capability. There is no convenience `onRootsListChanged` hook — handlers must be registered via `server.setNotificationHandler(RootsListChangedNotificationSchema, handler)`. | Add an optional MCP roots provider/cache with graceful fallback. If roots are unsupported or fail, default to current project + workspace config instead of failing tool listing. Register list-changed via `setNotificationHandler`, not a non-existent `onRootsListChanged` property. |
| F6 | HIGH | Existing `wp_blueprint_task_advance` can transition tasks to `done`; CLI mutation path can also set done without evidence. | Add verification-backed completion and refuse `done` through generic MCP advance. Persist evidence into markdown and re-ingest. |
| F7 | MEDIUM | `src/mcp/tools/_shared/project-root.ts` resolves one project root from `CLAUDE_PROJECT_DIR`, cwd, or upward markers. | Keep single-project default for safety. Multi-project listing is explicit via `scope: roots|workspace|all` or `project_id` selectors. |
| F8 | MEDIUM | `workspace_repos` table stores repo metadata only; it does not make blueprint query rows globally unique across projects/worktrees. | Aggregate by opening each selected project's projection DB and return `project_id` with every row. Do not merge multiple projects into one projection DB in this blueprint. |
| F9 | CRITICAL | `src/blueprint/db/cold-start.ts` uses `getSurfacePath('blueprints/.lock', 'repo', cwd)` for the advisory ingest lock with a 5s `proceeds anyway` escape, while Task 1.1 moves the projection DB to `'worktree'` scope. Mismatched lock+DB scopes leave concurrent writers unprotected; the 5s escape silently allows races during long ingests. The ingester (`src/blueprint/db/ingester.ts`) uses DELETE-then-INSERT inside a single `db.transaction()`, so partial reads during a competing ingest are possible. | Task 1.1 must explicitly resolve **both** projection DB scope **and** lock scope, choosing one of: (a) lock stays `'repo'` to serialize cross-worktree ingest of shared markdown; (b) lock moves to `'worktree'` and a separate `'repo'`-scoped markdown-mutation lock is added. Remove the silent 5s "proceeds anyway" escape on write paths. Add a concurrent-ingest test. |
| F10 | CRITICAL | Task 1.4 (verification helper) and Task 3.2 (`wp_blueprint_task_verify`) require "passed evidence" but the blueprint defines no evidence schema, validity rules, or anti-forgery posture. The product wedge ("agents stop marking tasks done without verification") collapses if evidence is `z.any().array().min(1)`. | Pin an explicit Evidence Contract (see new section below) before Task 1.4 begins, with required fields, validity rules per kind, and a canonical markdown serialization. |
| F11 | HIGH | `blueprints/{draft,planned,in-progress,completed}/` is git-tracked; a `git checkout other-branch` flips on-disk markdown without touching `blueprints/blueprints.db`. E1 only covers stale-after-mutation. | Add freshness invalidation on branch HEAD change: record `git rev-parse HEAD` in projection metadata at ingest time, refuse cached reads if current HEAD differs, return `next_action: 'reingest_project'`. |
| F12 | HIGH | The completed `blueprint-structured-store` upstream creates `.agent/.blueprints.db` in existing repos. Task 1.1's path change leaves those DBs as orphans after upgrade; the new path rebuilds silently with zero user signal and `wp audit blueprint-lifecycle` may double-count. | Task 1.1 must include a deprecation step: detect `.agent/.blueprints.db` in git repos, log a one-line deprecation warning pointing at the new path, optionally move (or symlink) the legacy file, and add a fixture test covering the upgrade path. |
| F13 | HIGH | `src/mcp/auto-discover.ts` only scans `src/mcp/tools/*.ts` for default-exported `ToolDescriptor`. `src/mcp/blueprint-server.ts` registers via `registrar.registerTool` and is **currently never called by `src/mcp/server.ts`** — the 8 structured tools (`wp_blueprint_query`, `_new`, `_validate`, `_task_next`, `_task_advance`, `_promote`, `_finalize`, `_depgraph`) exist but are not advertised. Task 2.1 must pick a single integration shape. | Task 2.1 picks shape: add `registerBlueprintServer(server, { cwd, getMcpRoots })` invocation inside `createServer` after auto-discover completes, with a hard-fail dedupe check on tool-name collisions. Do not split between auto-discover and explicit registration silently. |
| F14 | MEDIUM | `project_id = stable hash of real worktree path + optional repo common dir` is under-specified: macOS APFS case-insensitive `realpath` vs Linux case-sensitive can produce different IDs for the same logical project; recreating a worktree at the same path after `git worktree remove`+`add` reuses the ID for a semantically different worktree. | Pin a `project_id_v1` spec: `sha256(realpath(worktree) + '\0' + (repo_common_dir ?? '') + '\0' + os.platform())` with documented stability semantics. Add tests for case-folding behavior and worktree recreation. |
| F15 | MEDIUM | Task 3.3 enforces "mutating calls reject aggregate scope" as a runtime check; if mutation and read tools share a zod input base, a future refactor silently widens the surface. | Use two distinct zod input bases: `MutationTarget = { project_id: string }` (no `scope` field) vs `ReadTarget = { project_id?: string, scope?: 'current'\|'roots'\|'workspace'\|'all' }`. Acceptance: mutation input schemas do not contain a `scope` field at type level. |
| F16 | MEDIUM | Task 4.2 requires multi-worktree fixture repos plus MCP server plus duplicate-slug coverage at "M" effort. Real `git init` + `git worktree add` fixtures cost ~200-500ms each and the test will likely violate `catalog/agent/rules/no-timeout-as-fix.md` if it slips. | Either split into 4.2a (single-worktree happy path + fixture builder helper) and 4.2b (multi-project aggregate), or rely on Task 1.2's injected git/filesystem dependencies to run the smoke against an in-memory fixture. Pin a per-fixture-repo time budget and document it. |
| F17 | LOW | E5 says recursive scan is "depth/count capped, ignore-listed, timeout-bounded" but no cap values are pinned. | Pin values in `_overview.md`: `depth ≤ 3`, `count ≤ 200 projects`, `timeout 2s`, ignore-list `{node_modules, .git, dist, build, .next, target, .cache, .turbo, .pnpm-store}`. |
| F18 | LOW | Six tools all need to return `next_action` strings; no shared typing means drift between handlers and tests. | Add `src/blueprint/next-action.ts` with a `NextAction` discriminated union (`'rebuild_db' \| 'reingest_project' \| 'disambiguate_slug' \| 'verify_task' \| 'create_blueprint' \| 'configure_workspace' \| 'unsupported_roots'`) emitted as `{ kind, hint }`. Reference in Task 2.2 acceptance. |

## DRY / SOLID / KISS constraints

- **DRY:** Reuse existing DB migrations, ingester, SQL templates, markdown mutation flow, `resolveProjectRoot`, workspace config parsing, and worktree porcelain parser. Do not introduce a second blueprint parser, second project-root resolver, or parallel DB schema.
- **SOLID:** Keep one responsibility per seam: DB paths decide storage location, project resolution decides target worktree, context helpers shape chunks, markdown helpers edit verification, MCP handlers adapt those helpers to tools. Dependencies must be injectable in tests rather than hardwired shell calls.
- **KISS:** Default to current project. Multi-project and recursive discovery are opt-in read paths. No background indexer, watcher, long-lived cache, global merged DB, or hosted sync change in this blueprint. Prefer lazy discovery during tool calls with bounded limits over lifecycle machinery.

## Architecture decision: project/worktree-aware projection

**Decision:** Blueprint markdown remains canonical. SQLite remains a rebuildable operation projection. Because the projection reflects files in a checked-out worktree, the default projection DB for blueprint rows must be **worktree-scoped**. There is no new persistent global registry in this blueprint: discovery is lazy, de-duped, and returned as structured results. Query/read/mutation handlers operate on exactly one resolved project/worktree unless the tool is explicitly read-only aggregate.

**Project identity fields returned by MCP:**

```ts
type BlueprintProjectRef = {
  project_id: string        // project_id_v1 — see spec below
  label: string             // basename or configured name
  repo_path: string         // git toplevel or discovered project root
  worktree_path: string     // concrete filesystem root used for markdown + projection DB
  repo_key?: string         // state-root repo key when in git
  worktree_key?: string     // state-root worktree key when in git
  source: 'current' | 'mcp_roots' | 'workspace_config' | 'git_worktree' | 'recursive_scan'
  branch?: string
  has_blueprints: boolean
  db_path: string
  stale?: boolean
}
```

**Discovery sources, in priority order:**

1. Current project root from `CLAUDE_PROJECT_DIR`, explicit `cwd`, or upward marker resolution.
2. MCP client roots via `Server.listRoots()` when the client advertises roots capability.
3. Static workspace config from `~/.agent/workspace.yaml`.
4. Git worktrees for each git repo root via `git worktree list --porcelain`.
5. Optional bounded recursive scan under explicitly supplied roots only, capped by depth/count and ignoring `.git`, `node_modules`, build outputs, and hidden/vendor directories. This remains an on-demand read operation, not a persistent crawler.

**Default safety rule:** mutating tools require exactly one resolved `project_id` or `cwd`. Read-only aggregate tools can widen scope, but they must include `project_id` in every result and disambiguate duplicate blueprint slugs.

**Recursive scan bounds (F17):** explicit recursion is capped at `depth ≤ 3`, `count ≤ 200 projects`, `timeout 2s`, and ignores `{node_modules, .git, dist, build, .next, target, .cache, .turbo, .pnpm-store}` plus any path components starting with `.` other than `.agent`. Exceeding any cap returns a `summary` warning and a structured `failures[]` entry; the partial result set is still usable.

**`project_id_v1` spec (F14):**

```
project_id = sha256(realpath(worktree_path) + '\0' + (repo_common_dir ?? '') + '\0' + os.platform()).hex().slice(0, 16)
```

- `realpath` is taken via `fs.realpath` and may case-fold on macOS APFS; this is accepted and documented.
- Moving a worktree changes `project_id`; this is by design.
- Recreating a worktree at the same path after `git worktree remove`+`add` reuses the ID; clients must treat `branch` + `git rev-parse HEAD` (per F11) as the freshness signal.

## Evidence Contract (F10)

`wp_blueprint_task_verify` accepts evidence items conforming to:

```ts
type EvidenceKind = 'test' | 'integration' | 'audit' | 'manual'

type Evidence = {
  kind: EvidenceKind
  result: 'pass' | 'fail'
  command?: string            // shell or ak verb that produced the result
  exit_code?: number          // required when kind ∈ {'test','integration','audit'}
  log_excerpt?: string        // required when kind === 'manual' (non-empty, ≤ 4 KiB)
  ts: string                  // ISO 8601 UTC
  agent?: string              // optional caller identity (advisory)
}
```

**Validity rules enforced by the verification helper:**

- At least one evidence item with `result === 'pass'` is required to transition to `done`.
- For `kind ∈ {'test', 'integration', 'audit'}`: `exit_code === 0` is required when `result === 'pass'`.
- For `kind === 'manual'`: a non-empty `log_excerpt` is required.
- Any evidence item with `result === 'fail'` rejects the transition with `next_action: 'verify_task'` and a summary of failing items.
- The helper canonicalizes evidence to stable JSON (sorted keys, normalized whitespace) and persists it inside the markdown verification block. Re-ingest then exposes it as a structured chunk via `wp_blueprint_context` scope `'verification'`.

**Anti-forgery posture:** evidence is **not** cryptographically attested in this blueprint; the helper trusts the calling agent. The Contract's job is to prevent trivially-empty evidence (`{ ok: true }`) and to make audit trails grep-able. Stronger attestation is out of scope; it will be tracked as a follow-up tech-debt item if needed.

## Non-goals

- Do not make SQLite the sole canonical store in this blueprint. Markdown remains the durable artifact and SQLite remains rebuildable.
- Do not replace the existing schema, migrations, parser, or query template system.
- Do not build a hosted platform-canonical sync path. Existing platform-first hooks stay optional.
- Do not recursively crawl arbitrary home directories by default. Recursive discovery is explicit, bounded, and read-only.
- Do not remove CLI `wp blueprint`; only replace the MCP facade behavior.

## Public MCP contract

All structured blueprint MCP responses must remain JSON text plus `structuredContent` where supported and follow a summary-first envelope:

```ts
type BlueprintToolEnvelope<T> = {
  summary: string
  failures: string[]
  next_action?: string
  bytes: number
  tokensSaved: number
  project?: BlueprintProjectRef
} & T
```

New and refined tool surface:

| Tool | Purpose | Notes |
| ---- | ------- | ----- |
| `wp_blueprint_projects` | List visible projects/worktrees and their blueprint/DB freshness. | Inputs: `scope: current|roots|workspace|all`, optional `include_worktrees`, `recursive`, `limit`. Defaults to current only. |
| `wp_blueprint_list` | List filtered blueprint summaries. | Inputs include `project_id` or read-only aggregate `scope`. Returns `project_id`, progress, freshness metadata, and duplicate-slug warnings. |
| `wp_blueprint_get` | Return one blueprint summary. | Requires `project_id` when slug is ambiguous. Includes lifecycle state, task rollup, risks, dependencies, source path/hash. |
| `wp_blueprint_context` | Return bounded chunks for agent work. | Inputs: `project_id`, `slug`, optional `task_id`, `scope`. Chunks include `chunk_id`, `kind`, `heading`, `text`, `source_path`, `content_hash`, `ingested_at`. |
| `wp_blueprint_create` | Create a draft blueprint markdown file and re-ingest. | Requires one target project. Replaces legacy MCP `action: new`; unlike `wp_blueprint_new`, it writes the draft. |
| `wp_blueprint_task_verify` | Mark a task done only with verification evidence. | Requires one target project and at least one passed evidence item; writes verification block, status, and re-ingests. |
| Existing structured tools | Query, validate, task_next, task_advance, promote, finalize, depgraph. | Keep names compatible unless a test proves rename is unavoidable. Add project selectors before making them default MCP surface. |

## Quick Reference (Execution Waves)

The original wave table coalesced tasks that share `src/mcp/blueprint-server.ts` writes; the table below reflects the actual file-conflict graph (R5/CP=0 in every wave).

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| ---- | ----- | ------------ | -------------- | ------ |
| **Wave 0** | 1.1, 1.2, 1.3, 1.4 | None | 4 agents | S-M |
| **Wave 1** | 2.1, 3.1 | Wave 0 (1.1, 1.2) | 2 agents | M |
| **Wave 2** | 2.2 | Wave 1 (2.1) + 1.3 | 1 agent | M |
| **Wave 3** | 3.2 | Wave 2 + 1.4 | 1 agent | S-M |
| **Wave 4** | 3.3 | Wave 3 + 3.1 | 1 agent | S |
| **Wave 5** | 4.1 | Wave 4 | 1 agent | S |
| **Wave 6** | 4.2a | Wave 3 + 4.1 | 1 agent | M |
| **Wave 7** | 4.2b | Wave 4 + 4.2a | 1 agent | S |
| **Wave 8** | 4.3 | Wave 7 | 1 agent | S |
| **Critical implementation path** | 1.1 → 2.1 → 2.2 → 3.2 → 3.3 → 4.1 → 4.2a → 4.2b → 4.3 | -- | 9 waves | L |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ planned agents / 2 | 4 |
| CPR | implementation_tasks / critical_path_length | ≥ 2.0 after KISS consolidation | 12/9 = 1.33 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | ~17/12 = 1.42 |
| CP | same-file overlaps per wave | 0 | 0 in every wave (MCP integration serialized through `blueprint-server.ts`) |
| Safety default | Mutating tools default to one project | Required | Enforced by zod input separation (F15) + task acceptance |

**Parallelization score: C.** The corrected dependency graph exposes a long critical path because Tasks 2.1, 2.2, 3.2, 3.3, and 4.1 all touch `src/mcp/blueprint-server.ts` or its consumers. This is the honest CP=0 cost; the prior B score in earlier reviews implicitly assumed parallel writes to the same file, which would violate the file-conflict rule. CPR is below the 2.0 target — accept the trade-off because the MCP integration genuinely cannot be parallelized without splitting `blueprint-server.ts` into per-tool modules, which is out of scope and a known KISS regression.

## Edge Cases

| ID | Severity | Edge case | Mitigation |
| -- | -------- | --------- | ---------- |
| E1 | HIGH | MCP reads a stale DB because markdown changed after last ingest. | Context/list/get responses include content hash and `ingested_at`; stale detection returns `next_action` to rebuild or re-ingest. |
| E2 | CRITICAL | Repo-scoped projection DB mixes divergent worktree markdown from the same git common dir. | Use worktree-scoped projection DB by default; aggregate across worktrees at query time with explicit `project_id`. |
| E3 | HIGH | Two DB path conventions split state between `.agent/.blueprints.db` and state-root. | Centralize path resolution and migrate call sites before registering structured tools in `wp mcp`. |
| E4 | HIGH | MCP roots are unsupported, change mid-session, or throw due missing client capability. | Wrap `server.listRoots()` behind optional provider/cache; listen for roots list-changed when possible; gracefully fall back to current/workspace roots. |
| E5 | HIGH | Recursive discovery indexes `node_modules`, build directories, hidden vendor repos, or an enormous home tree. | Recursive scan is explicit, depth/count capped, ignore-listed, timeout-bounded, and summarized with truncation failures. |
| E6 | HIGH | Duplicate blueprint slug appears across projects or worktrees. | Return choices and require `project_id` for mutating or ambiguous read operations. |
| E7 | HIGH | Agent marks task `done` without verification. | MCP refuses `done` through generic task advance; only `wp_blueprint_task_verify` can complete. |
| E8 | MEDIUM | Context chunks become too large and recreate markdown context bloat. | Enforce scope-specific chunk limits and return `tokensSaved`/`bytes`. |
| E9 | MEDIUM | Concurrent MCP calls ingest or mutate the same worktree projection. | Two-lock policy from Task 1.1 (worktree-scoped projection DB lock + repo-scoped markdown lock); no silent 5s "proceeds anyway" escape on write paths; read-only aggregate calls remain tolerant of per-project failures. (F9/R7) |
| E10 | MEDIUM | Private repo paths leak in broad multi-project results. | Default to current project only; aggregate scopes are explicit and can redact absolute paths in summary text while preserving structured `project_id`. |
| E11 | HIGH | `git checkout other-branch` flips on-disk markdown without invalidating the projection DB. | Record `git rev-parse HEAD` in projection metadata at ingest; refuse cached reads if current HEAD differs, returning `next_action: 'reingest_project'`. (F11) |
| E12 | HIGH | Legacy `.agent/.blueprints.db` left behind by completed `blueprint-structured-store` after path migration. | Detect legacy DB on first call; log one-line deprecation; offer move/symlink path; `wp audit blueprint-lifecycle` must not double-count. (F12) |
| E13 | HIGH | Mutation tool input schema accidentally gains a `scope` field via shared zod base, silently widening blast radius. | Separate zod input bases `MutationTarget` (no `scope`) and `ReadTarget` (optional `scope`). Test asserts mutation schemas lack `scope` at type level. (F15) |
| E14 | MEDIUM | Evidence forgery via trivial payloads. | Evidence Contract enforces per-kind required fields; trivial `{ ok: true }` payloads are rejected at zod parse time. (F10) |
| E15 | MEDIUM | Tool registration drift: structured tools exist but aren't advertised, or are advertised twice. | Single integration point `registerBlueprintServer(server, ...)` invoked after auto-discover; hard-fail on duplicate tool names. (F13) |
| E16 | LOW | `next_action` strings drift between handlers and agent routing logic. | Discriminated union `NextAction` in `src/blueprint/next-action.ts`; handlers return `{ kind, hint }`. (F18) |

## Risks

| ID | Severity | Risk | Mitigation |
| -- | -------- | ---- | ---------- |
| R1 | HIGH | Accidentally making SQLite canonical creates git review and recovery regressions. | Keep markdown-write + re-ingest invariant; tests assert mutations update `_overview.md`. |
| R2 | HIGH | Main MCP server registration causes startup failures in repos without blueprints. | Registration must be side-effect-light; missing DB/blueprints produce tool-call guidance, not tool-list failure. |
| R3 | HIGH | Multi-project mutation targets the wrong worktree. | Mutating tools require unambiguous `project_id` or `cwd`; duplicate slug responses never auto-pick. |
| R4 | HIGH | Recursive discovery becomes a privacy/performance footgun. | No default recursion; explicit scope, caps, ignore rules, timeout, and result truncation. |
| R5 | MEDIUM | Multiple implementation lanes conflict in `src/mcp/blueprint-server.ts`. | Keep helpers outside MCP, but avoid micro-handler proliferation; serialize the small MCP integration tasks. |
| R6 | MEDIUM | Docs promise tools before server advertises them. | Server integration test asserts `tools/list` includes new tools and excludes legacy facade before docs are considered done. |
| R7 | CRITICAL | Concurrent ingest/markdown writes corrupt projection rows because lock scope and DB scope diverged. | Explicit lock-scope decision in Task 1.1 with rationale; concurrent-ingest integration test; remove 5s "proceeds anyway" escape on write paths. (F9) |
| R8 | CRITICAL | Evidence semantics are theatre — agents satisfy verification with empty objects. | Evidence Contract is enforced at zod parse time; tests cover each kind's required fields and the `result === 'fail'` rejection path. (F10) |
| R9 | HIGH | Stale projection survives branch switch and serves wrong rows. | HEAD-pinned freshness check, returns `next_action: 'reingest_project'` on mismatch. (E11/F11) |
| R10 | HIGH | Legacy DB orphan post-upgrade hides ingest regressions. | Deprecation detection + audit double-count guard. (E12/F12) |

## Tasks

#### [db] Task 1.1: Centralize projection DB path policy with worktree safety and lock-scope decision

**Status:** done

**Depends:** None

Create one path helper for blueprint structured-store paths so CLI, MCP, audits, and cold-start agree. The helper must make the projection DB worktree-scoped for git repos because rows are derived from checked-out markdown; preserve legacy `.agent/.blueprints.db` fallback for non-git temp repos. Also pin the lock-scope policy and add a deprecation path for legacy DBs left behind by `blueprint-structured-store`.

**Lock-scope decision (F9/R7).** Adopt **two-lock** policy:

- **Projection DB lock** — `'worktree'` scope (`getSurfacePath('blueprints/blueprints.db.lock', 'worktree', cwd)`). Protects the SQLite file from same-worktree concurrent writers.
- **Markdown-mutation lock** — `'repo'` scope (`getSurfacePath('blueprints/markdown.lock', 'repo', cwd)`). Protects the git-tracked `blueprints/` markdown directory from cross-worktree races, because the directory itself is shared via git.
- Drop the silent "proceeds anyway after 5s" advisory escape on write paths. Read-only paths may still proceed without the lock.

**Legacy DB deprecation (F12/R10/E12).** If a git repo has `.agent/.blueprints.db` on first access:

- Log a one-line deprecation pointing at the new state-root path.
- Move (rename) the legacy file to the new path on first run, including `-wal`/`-shm` siblings if present; if the destination already exists, leave both untouched and surface a failure-style warning.
- Update `wp audit blueprint-lifecycle` (`src/audit/blueprint-lifecycle-sql.ts`) so it does not double-count when both files transiently exist during migration.

**Files:**

- Create: `src/blueprint/db/paths.ts`
- Create: `src/blueprint/db/paths.test.ts`
- Create: `src/blueprint/db/legacy-migration.ts`
- Create: `src/blueprint/db/legacy-migration.test.ts`
- Modify: `src/blueprint/db/cold-start.ts`
- Modify: `src/cli/commands/blueprint/db-commands.ts`
- Modify: `src/cli/commands/blueprint/mutations.ts`
- Modify: `src/audit/blueprint-lifecycle-sql.ts`

**Steps (TDD):**

1. Write failing tests for git worktree-scoped DB path, same-repo different-worktree different DB path, non-git `.agent/.blueprints.db` fallback, two-lock resolution (`worktree`-scoped DB lock + `repo`-scoped markdown lock), and legacy-DB detect/move/no-double-count.
2. Run: `pnpm exec vitest run src/blueprint/db/paths.test.ts src/blueprint/db/legacy-migration.test.ts` — verify FAIL.
3. Implement `resolveBlueprintProjectionDbPath(cwd)`, `resolveBlueprintProjectionDbLockPath(cwd)`, `resolveBlueprintMarkdownLockPath(cwd)` using `getSurfacePath(..., 'worktree' | 'repo', cwd)` with fallback semantics.
4. Implement `migrateLegacyAgentDb(cwd)` invoked once per process per repo (memoize), including `-wal`/`-shm` move.
5. Replace hardcoded DB paths in listed files. Remove the "proceeds anyway after 5s" advisory escape from write paths in `cold-start.ts` and `mutations.ts`.
6. Add a concurrent-ingest integration test that asserts two ingesters in the same worktree serialize via the projection lock, and two ingesters in different worktrees of the same repo serialize markdown reads via the markdown lock.
7. Run targeted path, lock, migration, and DB command tests — verify PASS.

**Acceptance:**

- [x] All DB call sites in this task use the shared helper.
- [x] Two git worktrees of one repo resolve different projection DB paths.
- [x] Non-git temp repo tests still use `.agent/.blueprints.db`.
- [x] Projection DB lock is `'worktree'`-scoped; markdown-mutation lock is `'repo'`-scoped; rationale documented in `paths.ts` block comment.
- [x] Write paths no longer fall through after a 5s lock-acquisition timeout; instead they return a typed `LockTimeoutError` with `next_action: 'reingest_project'`.
- [x] Legacy `.agent/.blueprints.db` is detected, moved with sibling WAL/SHM, and `wp audit blueprint-lifecycle` does not double-count during migration.
- [x] Concurrent-ingest integration test demonstrates serialization in both same-worktree and cross-worktree cases.
- [x] No schema or migration changes introduced.

#### [projects] Task 1.2: Add one reusable project resolver for current roots, workspace repos, worktrees, and bounded recursion

**Status:** done

**Depends:** None

Create one small resolver module that owns project identity, selector disambiguation, and discovery. Keep it lazy and injectable; do not add a persistent registry, watcher, or new root-resolution stack. Import the already-exported `parseWorktreePorcelain` and `resolveWorktreePath` from `src/cli/commands/worktree/router-dispatch.ts` (F4) — do **not** re-export or duplicate them.

**`project_id_v1` (F14):** `sha256(realpath(worktree_path) + '\0' + (repo_common_dir ?? '') + '\0' + os.platform()).hex().slice(0, 16)`. Document in module header that moving a worktree changes the ID and that worktree recreation at the same path reuses the ID; clients must use `branch` + HEAD commit (per E11) as the freshness signal.

**Recursive scan caps (F17):** `depth ≤ 3`, `count ≤ 200 projects`, `timeout 2s`, ignore-list `{node_modules, .git, dist, build, .next, target, .cache, .turbo, .pnpm-store}` plus any path components starting with `.` other than `.agent`. Exceeding any cap returns a `summary` warning and structured `failures[]` entries; partial results are still returned.

**Files:**

- Create: `src/blueprint/projects.ts`
- Create: `src/blueprint/projects.test.ts`
- Modify: `src/blueprint/db/workspace-config.ts` only if a tiny exported helper is needed
- Modify: `src/blueprint/index.ts`

(`src/cli/commands/worktree/router-dispatch.ts` does **not** need modification — its helpers are already exported.)

**Steps (TDD):**

1. Write failing tests for: current-root default, workspace config entries, MCP roots input, reuse of `parseWorktreePorcelain` (no duplicated parser), duplicate realpath de-dupe, duplicate slug disambiguation, missing repo tolerance, recursive cap enforcement (depth=3, count=200, timeout=2s), ignore-list behavior, `project_id_v1` stability across runs, `project_id_v1` macOS case-folding test (skip on Linux when fs is case-sensitive), and worktree-recreation-at-same-path ID reuse.
2. Run: `pnpm exec vitest run src/blueprint/projects.test.ts` — verify FAIL.
3. Implement `discoverBlueprintProjects(...)` and `resolveBlueprintProject(...)` with injected git/filesystem dependencies. Implement `projectIdV1(worktreePath, repoCommonDir)` next to it as a pure function with tests.
4. Use `resolveBlueprintProjectionDbPath(worktree_path)` from Task 1.1 where available.
5. Run targeted project tests — verify PASS.

**Acceptance:**

- [x] Current project is first and is the default target.
- [x] `project_id` follows the pinned `project_id_v1` formula; tests assert stability and platform-folding behavior.
- [x] Every project ref includes `source`, `repo_path`, `worktree_path`, `has_blueprints`, `db_path`, and optional `branch`/`repo_key`/`worktree_key`.
- [x] Duplicate blueprint slugs return candidate `project_id` values instead of guessing.
- [x] Recursive discovery enforces `depth ≤ 3`, `count ≤ 200`, `timeout 2s`, ignore-list pinned above; cap-exceeded returns partial results plus structured failures.
- [x] Imports `parseWorktreePorcelain` from `router-dispatch.ts` rather than re-parsing porcelain.
- [x] No persistent registry, daemon, or background indexer is introduced.

#### [context] Task 1.3: Build reusable blueprint context chunk assembler with HEAD-pinned freshness

**Status:** done

**Depends:** None

Create a pure helper that turns existing SQLite rows plus markdown task extraction into bounded, agent-ready chunks. This helper should not register MCP tools; it only owns chunk shaping and freshness metadata. Add HEAD-commit invalidation (E11/F11) so a branch switch surfaces as a stale-projection signal rather than silent wrong rows.

**Files:**

- Create: `src/blueprint/context.ts`
- Create: `src/blueprint/context.test.ts`
- Create: `src/blueprint/freshness.ts`
- Create: `src/blueprint/freshness.test.ts`
- Create: `src/blueprint/next-action.ts`
- Create: `src/blueprint/next-action.test.ts`
- Modify: `src/blueprint/index.ts`

**Steps (TDD):**

1. Write failing tests for `summary`, `next-task`, `task`, and `verification` scopes; tests for `NextAction` discriminated union (`rebuild_db`, `reingest_project`, `disambiguate_slug`, `verify_task`, `create_blueprint`, `configure_workspace`, `unsupported_roots`); freshness tests for HEAD-mismatch returning `next_action: 'reingest_project'`.
2. Run: `pnpm exec vitest run src/blueprint/context.test.ts src/blueprint/freshness.test.ts src/blueprint/next-action.test.ts` — verify FAIL.
3. Implement chunk shaping with `chunk_id`, `kind`, `heading`, `text`, `source_path`, `content_hash`, `ingested_at`, and `head_at_ingest` (when in a git repo).
4. Implement `checkFreshness(project, db)` returning `{ ok: true } | { ok: false, next_action: NextAction }` covering HEAD-mismatch, content_hash mismatch, and missing-DB cases.
5. Implement `NextAction` discriminated union with `{ kind, hint }` shape and exhaustive test coverage.
6. Enforce deterministic ordering and bounded text length per chunk.
7. Run: `pnpm exec vitest run src/blueprint/context.test.ts src/blueprint/freshness.test.ts src/blueprint/next-action.test.ts` — verify PASS.

**Acceptance:**

- [x] Chunks are deterministic for the same DB + markdown + HEAD input.
- [x] Chunks include `content_hash`, `ingested_at`, and `head_at_ingest` freshness metadata.
- [x] Missing task/slug returns a typed failure result, not a thrown raw error.
- [x] Branch HEAD mismatch returns `{ ok: false, next_action: { kind: 'reingest_project', ... } }` from `checkFreshness`.
- [x] `NextAction` is a single source of truth; tests assert exhaustiveness via a switch over `kind`.
- [x] Helper is usable by MCP without importing CLI modules.

#### [markdown] Task 1.4: Add verification block markdown helper with enforced Evidence Contract

**Status:** done

**Depends:** None

Add a focused markdown helper for inserting/updating a task-local `**Verification:**` section and setting status to `done`. Enforce the Evidence Contract (F10/R8/E14) at zod parse time so trivial payloads cannot satisfy verification. Keep the helper pure and covered before using it from MCP.

**Files:**

- Create: `src/blueprint/verification.ts`
- Create: `src/blueprint/verification.test.ts`
- Create: `src/blueprint/evidence.ts`
- Create: `src/blueprint/evidence.test.ts`
- Modify: `src/blueprint/index.ts`

**Steps (TDD):**

1. Write failing tests for the Evidence zod schema: each `kind` requires its kind-specific fields (`exit_code` for `'test'|'integration'|'audit'`, `log_excerpt` for `'manual'`), trivial `{ ok: true }` payloads fail parse, `result: 'fail'` rejects transitions, and canonical JSON serialization is stable across key order.
2. Write failing tests for the markdown helper: inserting verification after status, updating an existing verification block, preserving other task sections, lane-prefixed task headings, idempotent re-application, and rejection when any evidence item has `result: 'fail'`.
3. Run: `pnpm exec vitest run src/blueprint/evidence.test.ts src/blueprint/verification.test.ts` — verify FAIL.
4. Implement `Evidence` zod schema with kind-specific refinements; export `canonicalizeEvidence(evidence): string` for stable serialization.
5. Implement `applyVerification(markdown, taskId, evidence): Result<{ markdown, status }>` using existing task-heading utilities instead of ad hoc regex where possible. On any failed evidence item, return `{ ok: false, next_action: 'verify_task', failures }` without touching markdown.
6. Run: `pnpm exec vitest run src/blueprint/evidence.test.ts src/blueprint/verification.test.ts` — verify PASS.

**Acceptance:**

- [x] Evidence zod schema enforces per-kind required fields; `{ ok: true }` and similar trivial payloads fail parse.
- [x] Helper is idempotent for identical canonical evidence input.
- [x] Existing task content outside the target task is unchanged byte-for-byte (test asserts).
- [x] Status becomes `done` only when at least one evidence item has `result: 'pass'` AND zero items have `result: 'fail'`.
- [x] Any `result: 'fail'` evidence item rejects the transition with `next_action: 'verify_task'`.
- [x] Lane-prefixed headers (`[db] Task X.Y:`, `[mcp] Task X.Y:`, etc.) remain supported.
- [x] Canonical evidence serialization is stable (sorted keys, normalized whitespace) so re-ingest produces identical chunk text.

#### [mcp] Task 2.1: Register structured blueprint tools and lazy MCP roots input in the main server

**Status:** done

**Depends:** Task 1.1, Task 1.2

Wire the existing structured-store tool registrar into `createServer` so `wp mcp` advertises DB-backed blueprint tools by default. The current `registerBlueprintTools` in `src/mcp/blueprint-server.ts` is implemented but never invoked (F13). Pass an optional `getMcpRoots` dependency that calls `server.listRoots()` lazily, registers a `RootsListChangedNotificationSchema` handler via `server.setNotificationHandler(...)` (F5 — there is no convenience `onRootsListChanged` property), and catches unsupported-capability errors. Do not add cache invalidation machinery unless tests prove it necessary.

**Registration shape (F13/E15).** Single integration point:

- Add `registerBlueprintServer(server, { cwd, getMcpRoots })` invoked inside `createServer` **after** `auto-discover` completes.
- Hard-fail with a thrown error during registration if any tool name returned by `registerBlueprintServer` collides with an auto-discovered tool name. Do not silently shadow.
- Do **not** move `blueprint-server.ts` into `src/mcp/tools/` — keep its `registrar.registerTool` shape, but invoke it from `createServer` explicitly.

**Files:**

- Modify: `src/mcp/server.ts`
- Modify: `src/mcp/server.integration.test.ts`
- Modify: `src/mcp/blueprint-server.ts`
- Modify: `src/mcp/blueprint-server.test.ts`
- Modify: `src/mcp/auto-discover.ts` (only to expose registered tool names for the dedupe check, if not already exposed)

**Steps (TDD):**

1. Add failing integration assertion that `tools/list` includes the existing 8 structured tools (`wp_blueprint_query`, `_new`, `_validate`, `_task_next`, `_task_advance`, `_promote`, `_finalize`, `_depgraph`) plus the new `wp_blueprint_projects`.
2. Add failing test that registration throws if a tool-name collision exists with auto-discovered tools.
3. Add failing tests for roots-supported, roots-unsupported (capability check throws), and roots-list-changed notification rebinding the cache.
4. Run: `pnpm exec vitest run src/mcp/server.integration.test.ts src/mcp/blueprint-server.test.ts` — verify FAIL.
5. Add `cwd?: string` and optional `getMcpRoots` callback to server/blueprint registration. Register list-changed via `server.setNotificationHandler(RootsListChangedNotificationSchema, ...)`.
6. Ensure missing DB/blueprints/roots support returns tool-call guidance using `NextAction` from Task 1.3, not server startup failure.
7. Run targeted MCP tests — verify PASS.

**Acceptance:**

- [x] `wp mcp` advertises both the 8 existing structured tools and `wp_blueprint_projects`.
- [x] Registration hard-fails on tool-name collision; test asserts.
- [x] Fresh repo with no DB can still list tools; tool-call returns `next_action: 'rebuild_db'`.
- [x] Roots capability absence does not fail tool listing or current-project operation; `getMcpRoots()` returns an empty result with `unsupported_roots` warning.
- [x] Roots list-changed notification is handled via `setNotificationHandler` (no reliance on a non-existent `onRootsListChanged` property).
- [x] Existing non-blueprint MCP tools still list and call normally.

#### [mcp] Task 2.2: Add project-aware list/get/context/create handlers in the existing blueprint MCP surface

**Status:** done

**Depends:** Task 1.1, Task 1.2, Task 1.3, Task 2.1

Extend `src/mcp/blueprint-server.ts` with the high-level workflow tools. Keep handler code thin: resolve project, call existing DB/ingest/query/context helpers, return the summary-first envelope. Use the typed `MutationTarget`/`ReadTarget` zod input bases (F15/E13) so the type system, not a runtime check, prevents `scope` from leaking into mutation surfaces.

**Zod input separation (F15/E13).**

```ts
const MutationTarget = z.object({ project_id: z.string() })          // no scope field
const ReadTarget = z.object({
  project_id: z.string().optional(),
  scope: z.enum(['current', 'roots', 'workspace', 'all']).optional(),
})
```

- `wp_blueprint_list`, `wp_blueprint_get`, `wp_blueprint_context`, `wp_blueprint_projects` extend `ReadTarget`.
- `wp_blueprint_create` extends `MutationTarget`.
- Tests assert `MutationTarget`-derived schemas do not parse inputs containing `scope`.

**Files:**

- Modify: `src/mcp/blueprint-server.ts`
- Modify: `src/mcp/blueprint-server.test.ts`

**Steps (TDD):**

1. Add failing tests for `wp_blueprint_projects`, `wp_blueprint_list`, `wp_blueprint_get`, `wp_blueprint_context`, and `wp_blueprint_create` registration and golden response shapes.
2. Add failing test that `wp_blueprint_create` input schema rejects payloads containing a `scope` field.
3. Run: `pnpm exec vitest run src/mcp/blueprint-server.test.ts` — verify FAIL.
4. Implement handlers using existing DB schema, ingester, project resolver, and context helper. Use the `NextAction` discriminated union from Task 1.3 for all `next_action` values.
5. Add `next_action` guidance for missing DB (`rebuild_db`), stale rows (`reingest_project`), unknown slug (`disambiguate_slug` or omitted), unknown task, ambiguous slug (`disambiguate_slug`), and ambiguous project (`disambiguate_slug` with project candidates).
6. Run targeted tests — verify PASS.

**Acceptance:**

- [x] Project discovery defaults to current project and supports explicit wider read scopes.
- [x] List/get/context operate from SQLite projection and include project + freshness metadata (`content_hash`, `ingested_at`, `head_at_ingest`).
- [x] Create writes markdown under `blueprints/draft/<slug>/_overview.md` in one selected worktree and re-ingests it.
- [x] Mutation tool input schemas reject `scope` at zod parse time; test asserts.
- [x] All `next_action` values come from the `NextAction` discriminated union; no string literals leak into handler code.
- [x] No duplicate parser/schema or handler micro-framework is introduced.

#### [query] Task 3.1: Add read-only aggregate helpers across selected projects

**Status:** done

**Depends:** Task 1.1, Task 1.2

Add one non-MCP helper that runs list/query/next-task style reads across selected projects by opening each project's projection DB and unioning results in memory with per-project failures.

**Files:**

- Create: `src/blueprint/aggregate.ts`
- Create: `src/blueprint/aggregate.test.ts`
- Modify: `src/blueprint/index.ts`

**Steps (TDD):**

1. Write failing tests for unioned blueprint list, duplicate slug reporting, per-project DB failure isolation, and stable sort order.
2. Run: `pnpm exec vitest run src/blueprint/aggregate.test.ts` — verify FAIL.
3. Implement aggregate read helpers over per-project DBs without merging databases.
4. Run targeted tests — verify PASS.

**Acceptance:**

- [x] Aggregate reads include `project_id` on every result.
- [x] One broken/missing project DB does not fail the entire aggregate call.
- [x] Duplicate slugs are surfaced as warnings/failures.
- [x] No global cross-project projection DB is introduced.

#### [mcp] Task 3.2: Add verification-backed task completion with Evidence Contract

**Status:** done

**Depends:** Task 1.4, Task 2.2

Add `wp_blueprint_task_verify` as the MCP path for marking tasks done, with input parsed through the `Evidence[]` zod schema from Task 1.4 (F10/R8/E14). Use the `MutationTarget` zod base from Task 2.2 (no `scope`). Refuse `to: done` in `wp_blueprint_task_advance` with a clear `next_action: 'verify_task'`. Operation must be idempotent: re-calling `verify` with the same canonical evidence for a task already at `done` is a no-op success.

**Files:**

- Modify: `src/mcp/blueprint-server.ts`
- Modify: `src/mcp/blueprint-server.test.ts`

**Steps (TDD):**

1. Add failing tests that:
   - Generic advance refuses `done` with `next_action: 'verify_task'`.
   - `wp_blueprint_task_verify` input zod schema rejects `{ evidence: [{ ok: true }] }` and other trivial payloads.
   - `verify` refuses when zero `result: 'pass'` items exist.
   - `verify` refuses when any `result: 'fail'` item exists.
   - `verify` writes a canonical verification block to markdown.
   - `verify` re-ingests the selected project DB and returns next-context.
   - `verify` is idempotent: calling twice with the same canonical evidence does not duplicate the verification block and returns `status: 'done'` on the second call.
   - `verify` input rejects `scope` field at zod parse time.
2. Run: `pnpm exec vitest run src/mcp/blueprint-server.test.ts` — verify FAIL.
3. Implement `wp_blueprint_task_verify` using the markdown verification helper from Task 1.4, the canonical Evidence serializer, and existing re-ingest flow.
4. Return next recommended context bundle after successful verification using the chunk assembler from Task 1.3.
5. Run targeted tests — verify PASS.

**Acceptance:**

- [x] Generic MCP task advance cannot mark `done` and returns `next_action: 'verify_task'`.
- [x] Verification requires at least one evidence item with `result: 'pass'` AND zero items with `result: 'fail'`.
- [x] Evidence items violating per-kind required fields are rejected at zod parse time.
- [x] Verification block is persisted to markdown in the selected worktree in canonical form.
- [x] DB reflects the completed status after re-ingest, including `head_at_ingest`.
- [x] Idempotent: identical canonical evidence on an already-`done` task does not append a duplicate block and does not change `ingested_at`.
- [x] Response includes next suggested context or an explicit no-ready-task summary.
- [x] Tool input rejects `scope`; test asserts.

#### [mcp] Task 3.3: Wire aggregate reads into MCP and retire legacy facade

**Status:** done

**Depends:** Task 2.2, Task 3.1, Task 3.2

Allow read-only MCP list/query/task-next style operations to widen beyond one project when explicitly requested, then remove the legacy single-tool action facade. CLI `wp blueprint` remains unchanged.

**Files:**

- Modify: `src/mcp/blueprint-server.ts`
- Modify: `src/mcp/blueprint-server.test.ts`
- Modify: `src/mcp/server.integration.test.ts`
- Delete: `src/mcp/tools/blueprint.ts`
- Delete: `src/mcp/tools/blueprint.test.ts`

**Steps (TDD):**

1. Add failing tests for explicit aggregate read scope, duplicate slug warnings, mutation-scope refusal, and `tools/list` excluding `wp_blueprint`.
2. Run targeted MCP tests — verify FAIL.
3. Integrate aggregate helpers for read-only paths and remove the legacy tool/test.
4. Run targeted MCP tests — verify PASS.

**Acceptance:**

- [x] Aggregate read-only calls are explicit and bounded by discovery limits.
- [x] Mutating calls still reject aggregate scope.
- [x] Duplicate slugs never silently select a target.
- [x] `wp_blueprint` no longer appears in MCP tool listing, while structured replacements do.

#### [docs] Task 4.1: Document SQLite-first multi-project agent workflow and legacy mapping

**Status:** done

**Depends:** Task 2.2, Task 3.3

Update maintainer/agent docs so the happy path is discoverable in under two minutes. Include the investigation conclusion: SQLite is the operation surface/projection, markdown remains durable source of truth, and multi-project scope is explicit.

**Files:**

- Modify: `commands/blueprint.md`
- Modify: `docs/architecture.md`
- Modify: `docs/blueprint-db-cookbook.md`

**Steps (TDD):**

1. Add docs text for quick smoke path, project discovery, MCP roots/worktrees, and old→new MCP mapping.
2. Run: `pnpm run docs:check` — capture current result.
3. Fix docs-frontmatter/link issues caused by this change.
4. Run: `pnpm run docs:check` — verify PASS or document pre-existing unrelated failure.

**Acceptance:**

- [x] Docs explain that SQLite is derived but MCP is the normal agent operation surface.
- [x] Docs explain current-project default and explicit multi-project widening.
- [x] Docs include old `wp_blueprint` action mapping.
- [x] Docs include a maintainer smoke path.

#### [qa] Task 4.2a: Single-worktree end-to-end maintainer smoke + fixture helper

**Status:** done

**Depends:** Task 3.2, Task 4.1

Build the reusable fixture helper and prove the under-two-minute happy path on a single worktree before exercising multi-project aggregation. This addresses F16/R6 effort risk by pinning a per-fixture time budget and shaping the helper for reuse by 4.2b.

**Files:**

- Create: `src/mcp/__fixtures__/blueprint-fixture.ts`
- Create: `src/mcp/__fixtures__/blueprint-fixture.test.ts`
- Create: `src/mcp/blueprint-workflow.integration.test.ts`

**Steps (TDD):**

1. Build `buildBlueprintFixture(spec)` helper that uses the injected git/filesystem dependencies from Task 1.2 to construct a temp project + blueprint markdown without invoking real `git init`/`git worktree add` when in-memory dependencies are passed. When real-git mode is requested (for cross-process integration), each fixture must complete in ≤ 1s wall-clock.
2. Write failing fixture-helper tests (in-memory and real-git modes both ≤ 1s).
3. Write failing happy-path workflow test for one current project: discover → list → context → verify-fixture-task → next-context.
4. Run: `pnpm exec vitest run src/mcp/__fixtures__/blueprint-fixture.test.ts src/mcp/blueprint-workflow.integration.test.ts` — verify FAIL.
5. Implement any missing wiring; ensure happy-path test runs in ≤ 5s wall-clock.
6. Run: `pnpm exec vitest run src/mcp/__fixtures__/blueprint-fixture.test.ts src/mcp/blueprint-workflow.integration.test.ts` — verify PASS.

**Acceptance:**

- [x] Fixture helper supports both in-memory and real-git modes; both budgets enforced via test assertions.
- [x] Single-worktree happy path runs in ≤ 5s wall-clock; test asserts.
- [x] Test verifies markdown persistence (canonical Verification block) and selected-project DB re-ingest.
- [x] Test does not depend on external platform credentials.
- [x] No `hookTimeout`/`testTimeout` bumps introduced (per `catalog/agent/rules/no-timeout-as-fix.md`).

#### [qa] Task 4.2b: Multi-project aggregate smoke + duplicate-slug coverage

**Status:** done

**Depends:** Task 3.3, Task 4.2a

Extend the workflow smoke to multi-project aggregate using the helper from 4.2a. Cover the duplicate-slug disambiguation path and verify cross-worktree read scoping.

**Files:**

- Modify: `src/mcp/blueprint-workflow.integration.test.ts`
- Modify: `src/mcp/server.integration.test.ts` only if shared helpers must move

**Steps (TDD):**

1. Write failing tests using `buildBlueprintFixture` for: two-project discovery (one workspace-config project, one current), duplicate-slug across projects returns `next_action: 'disambiguate_slug'` with candidate `project_id`s, aggregate read scope `scope: 'all'` returns rows from both projects each tagged with `project_id`, one broken project DB does not fail the aggregate call.
2. Run: `pnpm exec vitest run src/mcp/blueprint-workflow.integration.test.ts` — verify FAIL.
3. Implement any remaining wiring uncovered.
4. Run targeted MCP suite — verify PASS in ≤ 10s wall-clock.

**Acceptance:**

- [x] Aggregate smoke covers one current project plus one additional project or worktree.
- [x] Duplicate-slug case returns disambiguation with candidate `project_id`s and does not auto-select.
- [x] Aggregate read tolerates one broken project DB and surfaces it as a structured failure.
- [x] Total integration-test wall-clock for this task ≤ 10s; test asserts.
- [x] No `hookTimeout`/`testTimeout` bumps introduced.

#### [audit] Task 4.3: Run final verification and blueprint audit

**Status:** done

**Depends:** Task 4.2b

Run final quality gates and verify the new blueprint itself remains lifecycle-compliant.

**Files:**

- Modify: `blueprints/planned/structured-blueprint-mcp-sqlite-first-agent-ops/_overview.md` only if audit reveals blueprint-format issues.

**Steps (TDD):**

1. Run targeted tests for every file created or modified by this blueprint:
   - `src/blueprint/db/paths.test.ts`, `src/blueprint/db/legacy-migration.test.ts`
   - `src/blueprint/projects.test.ts`
   - `src/blueprint/context.test.ts`, `src/blueprint/freshness.test.ts`, `src/blueprint/next-action.test.ts`
   - `src/blueprint/evidence.test.ts`, `src/blueprint/verification.test.ts`
   - `src/blueprint/aggregate.test.ts`
   - `src/mcp/server.integration.test.ts`, `src/mcp/blueprint-server.test.ts`
   - `src/mcp/__fixtures__/blueprint-fixture.test.ts`, `src/mcp/blueprint-workflow.integration.test.ts`
2. Run: `pnpm run typecheck`.
3. Run: `pnpm run lint`.
4. Run the strict blueprint audit through the `wp` CLI facade.
5. Fix only regressions caused by this blueprint's implementation; document pre-existing unrelated audit failures separately.

**Acceptance:**

- [x] Targeted tests pass.
- [x] Typecheck passes.
- [x] Lint passes.
- [x] Blueprint audit passes or pre-existing unrelated failures are listed with evidence.
- [x] Final report names changed files, validation output, and remaining risks.

**Final report (2026-05-14):**

- **Targeted MCP tests:** `pnpm vitest run src/mcp/blueprint-server.test.ts src/mcp/server.integration.test.ts src/mcp/__fixtures__/blueprint-fixture.test.ts src/mcp/blueprint-workflow.integration.test.ts` — `84 passed`.
- **Typecheck:** `pnpm run typecheck` — pass.
- **Lint:** `pnpm run lint` — pass.
- **Docs frontmatter:** `pnpm run docs:check` — pass.
- **Blueprint lifecycle audit:** strict `wp` CLI blueprint audit for
  `structured-blueprint-mcp-sqlite-first-agent-ops` — pass.
- **Changed files (this blueprint):** `src/blueprint/db/paths.ts`, `src/blueprint/db/paths.test.ts`, `src/blueprint/db/legacy-migration.ts`, `src/blueprint/db/legacy-migration.test.ts`, `src/blueprint/projects.ts`, `src/blueprint/projects.test.ts`, `src/blueprint/context.ts`, `src/blueprint/context.test.ts`, `src/blueprint/freshness.ts`, `src/blueprint/freshness.test.ts`, `src/blueprint/next-action.ts`, `src/blueprint/next-action.test.ts`, `src/blueprint/evidence.ts`, `src/blueprint/evidence.test.ts`, `src/blueprint/verification.ts`, `src/blueprint/verification.test.ts`, `src/blueprint/aggregate.ts`, `src/blueprint/aggregate.test.ts`, `src/mcp/blueprint-server.ts`, `src/mcp/blueprint-server.test.ts`, `src/mcp/__fixtures__/blueprint-fixture.ts`, `src/mcp/__fixtures__/blueprint-fixture.test.ts`, `src/mcp/blueprint-workflow.integration.test.ts`.
- **Remaining risks:** Read-context assembly still preserves the existing MCP payload shape instead of exposing the richer `src/blueprint/context.ts` chunk schema directly; this is an intentional compatibility tradeoff, not a known failing path.

## Refinement Summary

Round 2 (2026-05-13) added findings F9–F18 from a fresh adversarial pass plus codebase verification against the actually-installed MCP SDK and live `src/blueprint/db/` / `src/mcp/` modules.

| Metric | Value |
| ------ | ----- |
| Findings incorporated (cumulative) | 18 |
| Critical | F9 (lock scope), F10 (evidence schema), 2 edge cases (E2, E14 enforcement), 2 risks (R7, R8) |
| High | F1–F6, F11–F13 (9 findings), 9 edge cases, 4 risks |
| Medium | F7, F8, F14–F16 (5 findings), 4 edge cases |
| Low | F17 (recursion caps), F18 (next_action union) |
| Fixes planned | 12/12 (Task 4.2 split into 4.2a/4.2b) |
| Cross-plans updated | 0 (upstream `blueprint-structured-store` already completed) |
| Edge cases documented | 16 (E1–E16) |
| Risks documented | 10 (R1–R10) |
| Parallelization score | C (corrected file-conflict graph — see Parallel Metrics Snapshot for trade-off rationale) |
| Critical implementation path | 9 waves |
| Max parallel agents | 4 (Wave 0 only; integration waves are serialized through `blueprint-server.ts`) |
| Total tasks | 12 |
| New artefacts pinned | Evidence Contract; `project_id_v1` spec; recursive scan caps; `NextAction` discriminated union; two-lock policy; legacy DB migration |
| Blueprint compliant | Pending targeted audit |
## Historical verification note

This blueprint contains done tasks recorded before the current per-task `**Verification:**` convention was consistently enforced. It remains a truthful historical record, but should not be treated as having retroactively reconstructed evidence beyond the repository and audit state captured elsewhere.

