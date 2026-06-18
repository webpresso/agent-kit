---
type: blueprint
title: "Sandboxed knowledge tool surface parity"
owner: ozby
status: planned
complexity: XL
created: '2026-06-13'
last_updated: '2026-06-13'
progress: '5% (plan-refine fact-check complete; implementation not started)'
depends_on:
  - 2026-06-13-session-continuity-and-resume-parity
cross_repo_depends_on: []
tags:
  - session-memory
  - mcp
  - search
  - sandbox
---

# Sandboxed knowledge tool surface parity

**Goal:** Complete the large-output, indexed-research, and continuity tooling
surface so agents can gather, index, search, inspect, and reset local memory
without flooding the host conversation.

## Planning Summary

- Goal input: `Complete the missing knowledge + sandbox tool surface`
- Complexity: `XL`
- Draft slug: `2026-06-13-sandboxed-knowledge-tool-surface-parity`
- Output path: `blueprints/planned/2026-06-13-sandboxed-knowledge-tool-surface-parity.md`
- Validation scope: MCP tool registry, indexed recall behavior, diagnostics/operator flows
- Refinement note (2026-06-13): verified current repo paths, command syntax, upstream/downstream blueprint relationships, and public-package safety gates. (F1-F8)

## Architecture Overview

```text
agent request
  -> wp_session_* MCP tool
  -> local file / fetch / index / search path
  -> local session-memory store
  -> bounded structured response with searchable large-output references
```

## Fact-Check Findings

| ID | Severity | Claim / Assumption | Verified Reality | Blueprint Fix |
| -- | -------- | ------------------ | ---------------- | ------------- |
| F1 | HIGH | Existing private execution files can be modified at `src/mcp/tools/_session-execute.ts` and `src/mcp/tools/_session-batch-execute.ts`. | Those files do not exist in this repo. Current MCP tools live as one file per descriptor under `src/mcp/tools/`. | Create first-class session tool files instead of modifying missing private helpers. |
| F2 | HIGH | `src/mcp/tools/session-execute-file.ts` already exists. | It does not exist. Current session-memory files are `fetch-index.ts`, `repo-hash.ts`, `session.ts`, `store.ts`, and `types.ts`. | Treat the runtime owner as a new file with tests in the execution task. |
| F3 | MEDIUM | Existing `session-restore.ts` and `session-search.ts` tools can be modified. | No session MCP tool files are currently present; only non-session compiled tools are registered. | Split tool creation from store semantics and add registry wiring only after handlers exist. |
| F4 | MEDIUM | Focused test commands use repeated `--files`. | `./bin/wp test --help` shows singular repeated `--file <path>`. | Use `./bin/wp test --file ... --file ...` in tasks and gates. |
| F5 | MEDIUM | `./bin/wp lint --file ...` is valid. | `./bin/wp lint` accepts positional file/directory arguments, not `--file`. | Use `./bin/wp lint --file <paths...>` in task TDD steps and gates. |
| F6 | HIGH | Multiple parallel tasks can edit `docs/guides/session-memory.md`, `README.md`, and `_registry.ts`. | Same-wave edits would create file conflicts and block parallel execution. | Move docs and registry/package proof into serialized integration tasks. |
| F7 | HIGH | Operator tools can be documented as public without package-surface proof. | This plan touches README/docs and the shipped MCP registry; public-package safety requires package/tarball surface checks and denied-content review. | Add explicit public-package safety notes and a package-surface proof task. |
| F8 | MEDIUM | Upstream continuity can be represented as only Task 1.1. | The upstream blueprint changes both storage schema and capture/restore semantics across multiple tasks. | Treat upstream blueprint readiness as the entry condition; do not start execution until storage/event shape is stable. |

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Tool namespace | stay under `wp_session_*` | Preserve repo naming and avoid a second public dialect. (F7) |
| Search model | unify indexed chunks + continuity events behind explicit source metadata | One answer path is easier to reason about and test, but provenance must prevent duplicate echoes. (F3) |
| Reset/ops model | ship stats, purge, and doctor; keep upgrade/dashboard claims as non-goals unless separately proven | Replacement claims need operator-grade observability, but dashboards are out of scope for this blueprint. (F7) |
| Runtime surface | bounded local file/fetch/index operations only | Host context protection is the product; unsupported modes must fail explicitly rather than stream raw output. (F1, F2) |
| Registry integration | wire descriptors after individual handlers pass focused tests | Avoid public registry churn and same-file conflicts while agents implement handlers independently. (F6) |
| Public package safety | no new dependency or release claim without package-surface/tarball proof | README/docs/registry changes are public-package surfaces and must not leak private paths or untested claims. (F7) |

## Technology and Public-Package Safety Notes

| Area | Decision / Constraint | Evidence / Gate |
| ---- | --------------------- | --------------- |
| Runtime dependencies | Reuse Node/Bun built-ins, existing SQLite wrapper, and existing `fetchAndIndex` / session-memory stores; add no new dependency unless an implementation task proves the existing substrate cannot satisfy the behavior. | `.agent/rules/engineering-principles.md` requires YAGNI/KISS and dependency restraint. |
| Storage | Continue using the existing SQLite-backed `SessionMemoryStore` and `SessionMemorySessionStore`; do not create a parallel database or second continuity store. | Upstream blueprint names `src/session-memory/**` as storage owner; current code has WAL + busy timeout in both store classes. |
| Public tool contract | Public names, arguments, and bounded responses must be pinned in registry/server integration tests before README or guide claims are expanded. | `COMPILED_TOOL_REGISTRY` currently contains only non-session tools. (F3, F7) |
| Package surface | Any README/docs/registry/package-manifest change requires package-surface and secret/path checks before release claims. | Public package safety rule requires tarball/package review for docs/bin/exports/files surfaces. |
| Forbidden wording | Do not include the banned runtime/tool brand string in this blueprint or generated docs from this plan. | User instruction for this refinement. |

## Execution entry gate

This blueprint does not start on a fuzzy “ready enough” signal. Before Task 1.1
or Task 1.2 begins, the upstream continuity blueprint must have landed:

- typed session-memory contracts in `src/session-memory/types.ts`;
- stable restore/snapshot semantics in `src/session-memory/session.ts`; and
- an explicit schema-version rule for continuity-store upgrades.

If those artifacts are not landed or are still changing, this blueprint remains
blocked instead of inferring compatibility.

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| ---- | ----- | ------------ | -------------- | ---------------- |
| **Wave 0** | 1.1, 1.2 | Upstream continuity blueprint ready enough for stable storage/event shape | 2 agents | S-M |
| **Wave 1** | 2.1 | Wave 0 | 1 agent | M |
| **Wave 2** | 2.2, 2.3 | Task 2.1 | 2 agents | S-M |
| **Wave 3** | 3.1, 3.2 | Tool handlers complete | 2 agents | S |
| **Wave 4** | 3.3 | Tasks 3.1, 3.2 | 1 agent | S |
| **Critical path** | 1.1 → 2.1 → 2.2 → 3.1 → 3.3 | -- | 5 waves | XL |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ planned agents / 2 | 2 ready tasks for a 2-agent start |
| CPR | total_tasks / critical_path_length | ≥ 2.5 for broad parallel plans | 8 / 5 = 1.6 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 8 / 7 = 1.14 |
| CP | same-file overlaps per wave | 0 | 0 |
| Parallelization score | A-D score | B or better preferred | C: narrow by design because registry/docs/package proof must serialize public surfaces |

**Refinement delta:** The original 5-task chain had same-file conflicts in docs,
registry, and README/package proof surfaces. This revision splits handler work
from public registry/docs proof, raises Wave 0 width from one effective lane to
two lanes, and keeps conflict pressure at zero. CPR remains below target because
`src/session-memory/store.ts`, `src/session-memory/session.ts`,
`src/mcp/tools/_registry.ts`, and public docs are intentionally serialized to
protect shared contracts.

### Phase 1: first-class tool handler completion [Complexity: L]

#### [mcp] Task 1.1: Add direct index and fetch-index session tools

**Status:** todo

**Depends:** Upstream blueprint `2026-06-13-session-continuity-and-resume-parity` has landed typed session-memory contracts in `src/session-memory/types.ts` and stable restore/snapshot semantics in `src/session-memory/session.ts`.

Create the first public MCP handlers for indexing caller-provided text chunks
and fetching a URL into the local session-memory index. Reuse
`src/session-memory/store.ts` and `src/session-memory/fetch-index.ts`; do not
add a second index store, network cache, or ranking layer. Responses must be
bounded: return counts, sources, chunk IDs, and warnings, not full fetched bodies
or full indexed text. (F3, F7)

**Files:**

- Create: `src/mcp/tools/session-index.ts`
- Create: `src/mcp/tools/session-index.test.ts`
- Create: `src/mcp/tools/session-fetch-and-index.ts`
- Create: `src/mcp/tools/session-fetch-and-index.test.ts`
- Modify: `src/session-memory/fetch-index.test.ts`

**Steps (TDD):**

1. Write failing handler tests for `wp_session_index` and `wp_session_fetch_and_index` covering bounded responses, source metadata, invalid URLs, invalid/empty chunks, and no raw large-body echo.
2. Run: `./bin/wp test --file src/mcp/tools/session-index.test.ts --file src/mcp/tools/session-fetch-and-index.test.ts --file src/session-memory/fetch-index.test.ts` — verify FAIL.
3. Implement minimal tool descriptors and handlers over the existing store/fetch substrate.
4. Run: `./bin/wp test --file src/mcp/tools/session-index.test.ts --file src/mcp/tools/session-fetch-and-index.test.ts --file src/session-memory/fetch-index.test.ts` — verify PASS.
5. Refactor only if needed; keep handler complexity small and avoid shared abstractions until a second concrete caller requires them.
6. Run: `./bin/wp lint --file src/mcp/tools/session-index.ts --file src/mcp/tools/session-fetch-and-index.ts --file src/session-memory/fetch-index.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] Direct indexing and fetch/index handlers exist as first-class `wp_session_*` tool descriptors.
- [ ] Tests prove large fetched/indexed content is stored/searchable without entering the host response raw.
- [ ] Invalid URL, empty content, timeout/abort, and JSON/HTML/text inputs have deterministic bounded outcomes.
- [ ] No new dependency or parallel store is introduced.
- [ ] Focused tests, lint, and typecheck pass.

#### [runtime] Task 1.2: Add bounded local file execution/read surface

**Status:** todo

**Depends:** Upstream blueprint `2026-06-13-session-continuity-and-resume-parity` has landed typed session-memory contracts in `src/session-memory/types.ts`, stable restore/snapshot semantics in `src/session-memory/session.ts`, and an explicit schema-version rule.

Create the missing bounded local file-oriented execution surface as a new
session-memory runtime file and MCP handler. The tool may read or run approved
local-file analysis paths only under explicit repo-root validation, must cap
stdout/stderr/content previews, and must index overflow into session memory
instead of returning unbounded output. Unsupported platforms or denied paths
must return structured warnings/errors. In v1 the allowed operations must be
spelled out and test-pinned: read repo-root text files, derive bounded metadata
or previews from those files, and run local analysis only over explicitly
provided file content. No arbitrary cwd shelling, network access, or write path
belongs in this task. (F1, F2, F7)

**Files:**

- Create: `src/mcp/tools/session-execute-file.ts`
- Create: `src/mcp/tools/session-execute-file.test.ts`
- Create: `src/mcp/tools/session-execute-file.ts`
- Create: `src/mcp/tools/session-execute-file.test.ts`
- Modify: `src/session-memory/types.ts`

**Steps (TDD):**

1. Write failing runtime and tool tests for repo-root validation, explicit allowlisted operations, denied paths, bounded previews, overflow indexing, unsupported platform reporting, and command/file failures.
2. Run: `./bin/wp test --file src/session-memory/session-execute-file.test.ts --file src/mcp/tools/session-execute-file.test.ts` — verify FAIL.
3. Implement the smallest runtime contract and handler needed for local file analysis without broad shell-generalization.
4. Run: `./bin/wp test --file src/session-memory/session-execute-file.test.ts --file src/mcp/tools/session-execute-file.test.ts` — verify PASS.
5. Refactor only to remove duplication with existing path validation utilities; do not create unused adapters.
6. Run: `./bin/wp lint --file src/session-memory/session-execute-file.ts --file src/mcp/tools/session-execute-file.ts --file src/session-memory/types.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] Local file execution/read behavior is explicit, bounded, and test-covered.
- [ ] Large outputs become indexed references with previews, not raw host prompt payloads.
- [ ] The allowed operation set is test-pinned and excludes arbitrary shell, network, and write behavior.
- [ ] Path validation blocks traversal, non-repo roots, binary/oversized files, and unsupported modes.
- [ ] Unsupported platforms/fallbacks are clearly surfaced.
- [ ] Focused tests, lint, and typecheck pass.

### Phase 2: recall and operator tooling [Complexity: L]

#### [search] Task 2.1: Unify restore/search result semantics across events and indexed chunks

**Status:** todo

**Depends:** Task 1.1, Task 1.2

Close the split where continuity events and indexed chunks can be queried only
through separate local APIs. Add a shared result model that keeps source type,
provenance, score/tier, timestamp, and preview separate from full content. The
implementation must dedupe by stable provenance/content keys so the same event
or fetched body is not echoed twice, and it must preserve source filters for
operators who need only chunks or only continuity events. The dedupe contract
must be explicit and test-pinned: continuity events dedupe by stable event
identity, indexed chunks dedupe by stable source/content identity, and
cross-source ranking must preserve provenance instead of collapsing distinct
records accidentally. (F3, F6)

**Files:**

- Modify: `src/session-memory/session.ts`
- Modify: `src/session-memory/store.ts`
- Modify: `src/session-memory/types.ts`
- Modify: `src/session-memory/session.test.ts`
- Modify: `src/session-memory/store.test.ts`

**Steps (TDD):**

1. Write failing store/session tests for cross-source recall, source filtering, stable dedupe-key derivation, provenance metadata, ranking stability, empty queries, and malformed FTS tokens.
2. Run: `./bin/wp test --file src/session-memory/session.test.ts --file src/session-memory/store.test.ts` — verify FAIL.
3. Implement unified result semantics in the existing store classes without creating a second database or parallel search engine.
4. Run: `./bin/wp test --file src/session-memory/session.test.ts --file src/session-memory/store.test.ts` — verify PASS.
5. Refactor only around shared type/mapper code that has concrete use in both stores.
6. Run: `./bin/wp lint --file src/session-memory/session.ts --file src/session-memory/store.ts --file src/session-memory/types.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] Restore/search semantics are intentional, typed, and test-covered for both continuity events and indexed chunks.
- [ ] Cross-source results preserve provenance and avoid duplicate echoes.
- [ ] Stable dedupe keys are defined and tested for continuity events, indexed chunks, and cross-source collisions.
- [ ] Source scoping and result limits behave deterministically.
- [ ] Existing session-memory tests still pass or are intentionally replaced with stricter equivalents.
- [ ] Focused tests, lint, and typecheck pass.

#### [mcp] Task 2.2: Add public restore and search tools over unified recall

**Status:** todo

**Depends:** Task 2.1

Create the public MCP handlers that expose unified recall semantics without
leaking raw database details. `wp_session_restore` should favor continuity
reconstruction for resume use cases; `wp_session_search` should favor explicit
query-driven recall across indexed chunks and events. Both tools must expose
source filters, result limits, provenance, and bounded previews consistently.
(F3, F6)

**Files:**

- Create: `src/mcp/tools/session-restore.ts`
- Create: `src/mcp/tools/session-restore.test.ts`
- Create: `src/mcp/tools/session-search.ts`
- Create: `src/mcp/tools/session-search.test.ts`

**Steps (TDD):**

1. Write failing tool tests for restore/search argument validation, source scoping, bounded previews, provenance, no-result responses, and malformed query handling.
2. Run: `./bin/wp test --file src/mcp/tools/session-restore.test.ts --file src/mcp/tools/session-search.test.ts` — verify FAIL.
3. Implement minimal handlers over the unified store/session APIs from Task 2.1.
4. Run: `./bin/wp test --file src/mcp/tools/session-restore.test.ts --file src/mcp/tools/session-search.test.ts` — verify PASS.
5. Refactor only if descriptor/response boilerplate duplicates concrete patterns from Task 1.1.
6. Run: `./bin/wp lint --file src/mcp/tools/session-restore.ts --file src/mcp/tools/session-search.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] `wp_session_restore` and `wp_session_search` exist as public descriptors with stable argument/response contracts.
- [ ] Search/restore tools return bounded structured results with provenance and clear source labels.
- [ ] Query errors, empty results, and source filters are test-covered.
- [ ] Focused tests, lint, and typecheck pass.

#### [ops] Task 2.3: Add stats, purge, and doctor session-memory operator tools

**Status:** todo

**Depends:** Task 2.1

Add local-only operator tools for explaining, checking, and resetting the
session-memory layer. Keep the surface limited to stats, purge, and doctor;
upgrade/help/dashboard-style tools are non-goals in this blueprint unless a
separate plan creates product requirements and UI/CLI ownership. Purge must be
explicit, dry-run capable, scoped where possible, and safe by default. (F6, F7)

**Files:**

- Create: `src/mcp/tools/session-stats.ts`
- Create: `src/mcp/tools/session-stats.test.ts`
- Create: `src/mcp/tools/session-purge.ts`
- Create: `src/mcp/tools/session-purge.test.ts`
- Create: `src/mcp/tools/session-doctor.ts`
- Create: `src/mcp/tools/session-doctor.test.ts`
- Modify: `src/session-memory/session.ts`
- Modify: `src/session-memory/store.ts`

**Steps (TDD):**

1. Write failing tests for stats counts, doctor diagnostics, dry-run purge, confirmed purge, scoped purge, busy/locked database warnings, and bounded diagnostic output.
2. Run: `./bin/wp test --file src/mcp/tools/session-stats.test.ts --file src/mcp/tools/session-purge.test.ts --file src/mcp/tools/session-doctor.test.ts --file src/session-memory/session.test.ts --file src/session-memory/store.test.ts` — verify FAIL.
3. Implement minimal store/session helper methods and tool handlers; prefer explicit local SQL over a new operations framework.
4. Run: `./bin/wp test --file src/mcp/tools/session-stats.test.ts --file src/mcp/tools/session-purge.test.ts --file src/mcp/tools/session-doctor.test.ts --file src/session-memory/session.test.ts --file src/session-memory/store.test.ts` — verify PASS.
5. Refactor only to remove confirmed duplication between stats/doctor/purge helpers.
6. Run: `./bin/wp lint --file src/mcp/tools/session-stats.ts --file src/mcp/tools/session-purge.ts --file src/mcp/tools/session-doctor.ts --file src/session-memory/session.ts --file src/session-memory/store.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] Stats, purge, and doctor tools exist and are discoverable after registry integration.
- [ ] Purge defaults to dry-run or explicit confirmation and cannot silently erase all local history.
- [ ] Doctor reports missing/corrupt/locked store states without hanging the MCP transport.
- [ ] Upgrade/help/dashboard tools are explicitly deferred rather than half-shipped.
- [ ] Focused tests, lint, and typecheck pass.

### Phase 3: public registry, docs, and release proof [Complexity: M]

#### [registry] Task 3.1: Wire completed session tools into the compiled MCP registry

**Status:** todo

**Depends:** Task 1.1, Task 1.2, Task 2.2, Task 2.3

After all handlers pass focused tests, expose them through the single compiled
MCP registry and server integration surface. Do not edit registry entries in
handler tasks; this task owns the shared public descriptor list and prevents
same-file conflicts. (F3, F6, F7)

**Files:**

- Modify: `src/mcp/tools/_registry.ts`
- Modify: `src/mcp/tools/_registry.test.ts`
- Modify: `src/mcp/server.integration.test.ts`

**Steps (TDD):**

1. Add failing registry/server integration tests for every planned `wp_session_*` descriptor and for duplicate/missing public names.
2. Run: `./bin/wp test --file src/mcp/tools/_registry.test.ts --file src/mcp/server.integration.test.ts` — verify FAIL.
3. Import and register the completed descriptors in `COMPILED_TOOL_REGISTRY`.
4. Run: `./bin/wp test --file src/mcp/tools/_registry.test.ts --file src/mcp/server.integration.test.ts` — verify PASS.
5. Refactor only to preserve the existing registry pattern.
6. Run: `./bin/wp lint --file src/mcp/tools/_registry.ts --file src/mcp/tools/_registry.test.ts --file src/mcp/server.integration.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] MCP server exposes the full planned session-memory tool surface.
- [ ] Registry tests pin exact public tool names and prevent accidental omissions.
- [ ] No docs claim a tool that is absent from registry/server integration tests.
- [ ] Focused tests, lint, and typecheck pass.

#### [docs] Task 3.2: Align operator docs with the tested session-memory tool surface

**Status:** todo

**Depends:** Task 1.1, Task 1.2, Task 2.2, Task 2.3

Update public docs only after handler contracts exist. The docs must describe
what each tool does, argument examples, result bounds, local-only storage,
reset safety, unsupported modes, and non-goals. Avoid private machine paths,
internal-only roadmap rationale, and unproven replacement claims. (F4, F5, F7)

**Files:**

- Modify: `docs/guides/session-memory.md`
- Modify: `README.md`

**Steps (TDD):**

1. Add or identify failing docs/readme checks that prove the old public guidance omits the new tested tools or overclaims unsupported behavior.
2. Run: `./bin/wp audit docs-frontmatter` and `./bin/wp test --file src/mcp/tools/_registry.test.ts` — record the expected docs gap/failure where applicable.
3. Update docs with tested tool names, bounded response examples, safety notes, and explicit non-goals.
4. Run: `./bin/wp audit docs-frontmatter` and `./bin/wp test --file src/mcp/tools/_registry.test.ts` — verify PASS.
5. Review changed docs for denied public-package content: secrets, absolute local paths, private repo aliases, raw generated surfaces, or untested claims.
6. Run: `./bin/wp lint --file docs/guides/session-memory.md --file README.md` and `./bin/wp typecheck`.

**Acceptance:**

- [ ] Guide and README mention only tested, registered `wp_session_*` tools.
- [ ] Docs explain reset/purge safety, local storage, bounded outputs, and unsupported modes.
- [ ] Docs contain no private path examples, secret-shaped fixtures, or unproven full-replacement claims.
- [ ] Docs/audit checks, lint, and typecheck pass.

#### [qa] Task 3.3: Lock package-surface and blueprint lifecycle proof

**Status:** todo

**Depends:** Task 3.1, Task 3.2

Prove the expanded public tool surface is shippable and lifecycle-compliant.
This task owns package-surface tests and final audit commands; do not use docs
or registry edits here except to report follow-up if a gate identifies a needed
change outside this task's files. (F4, F5, F7)

**Files:**

- Modify: `src/build/package-manifest.test.ts`

**Steps (TDD):**

1. Add failing package-manifest/package-surface assertions if the new public docs or tool files would be omitted from the packed package or include denied content.
2. Run: `./bin/wp test --file src/build/package-manifest.test.ts` — verify FAIL if coverage was missing.
3. Implement the smallest package-manifest test updates needed to pin the intended public surface; report any required package config change rather than editing it in this task.
4. Run: `./bin/wp test --file src/build/package-manifest.test.ts` — verify PASS.
5. Run dry package checks: `npm pack --dry-run --json` and review the file list for denied public-package content.
6. Run: `./bin/wp audit package-surface`, `./bin/wp audit blueprint-lifecycle`, `./bin/wp lint --file src/build/package-manifest.test.ts`, and `./bin/wp typecheck`.

**Acceptance:**

- [ ] Package-manifest tests pin the intended shipped public contract.
- [ ] Dry tarball/package-surface review finds no denied docs, secrets, local absolute paths, or untested generated surfaces.
- [ ] Blueprint lifecycle audit passes after implementation evidence is recorded.
- [ ] Any required package config or release workflow change outside `src/build/package-manifest.test.ts` is reported as follow-up, not silently edited here.

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Type safety | `./bin/wp typecheck` | Zero errors |
| Lint | `./bin/wp lint --file src/mcp/tools --file src/session-memory --file docs/guides/session-memory.md --file README.md --file src/build/package-manifest.test.ts` | Zero violations |
| Focused tests | `./bin/wp test --file src/mcp/tools/_registry.test.ts --file src/mcp/server.integration.test.ts --file src/session-memory/store.test.ts --file src/session-memory/session.test.ts --file src/session-memory/fetch-index.test.ts --file src/build/package-manifest.test.ts` | All pass |
| Package surface | `./bin/wp audit package-surface` and `npm pack --dry-run --json` | Audit passes and tarball file list contains only intentional public files |
| Secret/path safety | `vp run verify:secrets` and `vp run verify:paths` | No secret-bearing or hardcoded local-path leaks |
| Blueprint lifecycle | `./bin/wp audit blueprint-lifecycle` | Pass |

## Cross-Plan References

| Type | Blueprint | Relationship |
| ---- | --------- | ------------ |
| Upstream | `2026-06-13-session-continuity-and-resume-parity` | Supplies stable continuity storage/event shape and hook-driven capture/restore inputs; this blueprint should not start until that interface is ready. (F8) |
| Downstream | `2026-06-13-reference-parity-regression-and-host-smoke-gate` | Consumes the completed tool surface for host smoke, parity matrix, and release claim gates. |
| Related public surface | `2026-06-13-multi-host-plugin-and-instruction-surface-expansion` | If host plugin packaging changes which MCP tools are exposed, coordinate package-surface tests before claiming parity. |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --------- | ---- | -------- | ---- |
| Large HTML/JSON/text fetches exceed host-safe response size. (F7) | Unbounded memory growth or host prompt flooding | Chunk/index fetched body, return counts/previews/IDs, cap response size, and test no raw large-body echo. | 1.1 |
| Fetch timeout, abort, non-2xx response, invalid URL, or malformed JSON body. (F7) | Hanging MCP call or uncaught parser failure | Use bounded timeout/abort behavior, structured warnings, and no cache/index write on invalid content. | 1.1 |
| Local file path traversal, symlink escape, binary file, oversized file, or unsupported execution mode. (F1, F2) | Host data leak, unsafe command behavior, or unusable fallback | Validate against repo root, cap previews, deny unsupported modes explicitly, and index overflow only when safe. | 1.2 |
| Search result duplication across continuity event and indexed chunk. (F3) | Confusing recall output and repeated context | Dedupe by provenance/content key before ranking; include source/tier metadata. | 2.1, 2.2 |
| FTS query tokens include punctuation, quotes, or empty strings. (F3) | SQLite query errors or empty false negatives | Escape/tokenize queries and test malformed/empty cases in store and tools. | 2.1, 2.2 |
| Purge defaults erase all history. (F7) | Local data loss | Require dry-run or explicit confirmation; support scoped purge and report deleted counts. | 2.3 |
| Store is missing, corrupt, locked, or busy. (F7) | Doctor/purge hangs or throws raw stack traces | Return bounded diagnostics with warnings and remediation hints; honor existing busy-timeout policy. | 2.3 |
| Registry/docs drift from implemented handlers. (F6) | Public docs claim unavailable tools | Serialize registry/docs tasks and pin registry/server integration tests before docs claims. | 3.1, 3.2 |
| Package tarball includes private docs, absolute paths, or untested surfaces. (F7) | Public package disclosure leak | Run package-surface audit, dry tarball review, secret/path checks, and denied-content review. | 3.3 |

## Non-goals

- Shipping a browser dashboard in this blueprint
- Adding cloud/network telemetry
- Creating a second session-memory database, search engine, or continuity store
- Adding new dependencies unless an implementation task proves the existing substrate cannot satisfy the tested behavior
- Hiding unsupported runtime/platform gaps behind silent fallbacks
- Claiming full replacement/parity in public docs before downstream smoke and benchmark gates prove it

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Expanded tool surface becomes incoherent. (F3, F6) | Hard-to-route agent behavior | Keep one registry, one guide, one integration suite, and one typed result model. |
| Execution scope grows into a general shell or dashboard product. (F1, F2) | Unsafe scope creep and weak tests | Limit Task 1.2 to bounded local file analysis and document dashboard/upgrade surfaces as non-goals. |
| Shared store files serialize too much implementation work. (F6) | Lower parallel speedup | Keep handler creation parallel, serialize only store semantics and public registry/docs proof, and maintain CP=0 per wave. |
| Purge/reset flows drift from docs. (F7) | Operator confusion or data loss | Pin with explicit tool tests, dry-run behavior, README/guide safety notes, and doctor diagnostics. |
| Public package leak through docs/README/registry changes. (F7) | Disclosure of private paths or untested public API | Require package-surface audit, dry tarball review, `verify:secrets`, and `verify:paths`. |
| Upstream continuity schema changes after this implementation starts. (F8) | Rework across search/tool handlers | Start only after upstream storage/event shape is ready; keep unified result APIs narrow and typed. |

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 8 |
| Critical | 0 |
| High | 4 |
| Medium | 4 |
| Low | 0 |
| Fixes applied | 8/8 |
| Cross-plans updated | 0 (read-only alignment; user limited ownership to this file) |
| Edge cases documented | 9 |
| Risks documented | 6 |
| Parallelization score | C (2 tasks in Wave 0, CP=0; narrow shared public surfaces remain serialized) |
| Critical path | 5 waves |
| Max parallel agents | 2 |
| Total tasks | 8 |
| Blueprint compliant | 8/8 |
