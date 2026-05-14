---
type: blueprint
status: parked
complexity: L
created: '2026-05-14'
last_updated: '2026-05-14'
progress: '0% (parked — eng-reviewed + codex-reviewed; awaits BP A + WAL BP completion)'
depends_on:
  - make-context-mode-an-opt-in-dependency-in-agent-kit-so-consumers-can-ship-without-the-elv2-plugin-loaded-by-default
  - harden-session-store-multi-window-wal-safety-with-deterministic-concurrency-tests-across-all-session-tools
  - token-savings-benchmark-harness-ak-bench-session-memory
tags: [session-memory, mit, ssrf, codex, parked]
---

# Replace context-mode plugin with v1 session-memory MIT stack — full MIT path

> **STATUS: PARKED 2026-05-14.** Per Codex outside-voice strategic
> finding (cross-model agreement with eng-review): the urgent ELv2
> compliance question is split into the upstream BP
> `make-context-mode-an-opt-in-dependency...`. This BP retains the
> larger "ship a real MIT replacement for `ctx_fetch_and_index`" scope,
> but is no longer urgent. Resume after BP A ships and the WAL engine
> BP completes its concurrency contract.

**Goal:** Rewrite v1 session-memory's fetch path with proper safety
guards (SSRF, body-size cap, content-type enforcement, composite cache
key, redirect hop validation) and expose it as
`ak_session_fetch_and_index` so agent-kit consumers have a fully MIT
path to fetch+index web content. This is engine surgery on the
safety-critical fetch path, not a thin wrapper around an existing
engine — the existing engine has none of the safety properties this BP
ships.

## Provenance

This blueprint went through plan-eng-review (5 sections) and
codex-outside-voice review on 2026-05-14. Key Codex findings folded in:

- **Strategic split:** urgent ELv2 risk separated into BP A (`make-
  context-mode-opt-in...`). This BP is no longer time-critical.
- **WAL test split:** moved out into engine-wide BP (`harden-session-
  store-multi-window-wal-safety...`).
- **Engine framing honest:** "engine already exists" was misleading;
  Task 1.6 rewrites the safety-critical fetch path. Complexity bumped
  from M to L.
- **Cap units specified:** 5 MB = decompressed body bytes, post-gzip,
  pre-text-decode (defends against the actual memory bomb shape).
- **SSRF primitive:** use a third-party MIT/Apache library
  (e.g., `request-filtering-agent` or `ssrf-req-filter`) for
  TOCTOU-safe per-hop validation rather than rolling our own DNS dance.
- **Bench gate restructured:** before/after delta + parity vs context-mode.
- **Cache key invalidated:** composite hash of url + normalized options
  + parser version (URL-only key would silently return wrong artifacts).

## Product wedge anchor

- **Stage outcome:** Once BP A ships, ozby/ingest-lens runs without
  context-mode by default but loses `ctx_fetch_and_index` access
  (or keeps it via opt-in). This BP closes the gap by providing a
  fully MIT replacement under the agent-kit MCP surface, so even
  consumers who never want ELv2 in their tree have a complete
  fetch+index story.
- **Consuming surface:** `ak_session_fetch_and_index` MCP tool, exposed
  by the agent-kit MCP server, invoked from Claude Code AND Codex CLI
  sessions during research/investigation flows.
- **New user-visible capability:** ingest-lens developers (and any
  third-party agent-kit consumer) can fetch+index web content into
  session memory using 100% MIT-licensed tooling, with no ELv2
  dependency anywhere in their tree AND no opt-in burden.

## Eng-review + outside-voice decisions (2026-05-14)

| ID | Decision | Source | Where applied |
| --- | --- | --- | --- |
| D1 | This BP OWNS Codex packaging (stable bin entry + published `[mcp.servers.agent-kit]` toml block + fresh-install verification). | eng-review | Task 1.2 |
| D2 | SSRF: use third-party MIT/Apache library for TOCTOU-safe per-hop validation; `allowPrivateNetworks?: boolean` schema opt-in; restrict URL protocol to http/https. | eng-review + codex | Task 1.6 |
| D3 | Bench parity gate restructured: pre-BP and post-BP runs of v1; require post >= pre - 0.05 (no internal regression) AND v1-after >= context-mode - 0.05 (parity). | eng-review + codex | Task 1.8 (new) + frontmatter |
| D4 | Body-size cap: **5 MB of decompressed body bytes, post-gzip/brotli, pre-text-decode**, enforced via streaming consumption. `maxBytes?: number` schema opt-in. | eng-review + codex | Task 1.6 |
| D5 | Discovery integration test asserting every expected `ak_session_*` tool is auto-discovered. | eng-review | Task 1.7 |
| D6 | **Strategic split:** urgent ELv2 work moves to BP A. This BP focuses on shipping the full MIT replacement when not under deadline pressure. | codex outside-voice | frontmatter, status: parked |
| D7 | **WAL multi-window test split out** into engine-wide BP. This BP `depends_on` it but does not ship the test itself. | codex outside-voice | depends_on; Task 1.3 removed |
| D8 | **Cache key composite:** `hash(url + normalized_options + parser_version)`; schema migration to add `cache_key` column to `sources`. | codex outside-voice | Task 1.6 + new Task 1.9 |
| D9 | **Engine framing honest:** Goal section reframed as "rewrite fetch path with safety guards"; complexity M -> L. | codex outside-voice | Goal section, frontmatter |

## Architecture Overview

```text
BEFORE (post-BP-A):
  Claude Code / Codex (no context-mode loaded by default)
       ├── ak_session_search          (v1, MIT)        ← already exists
       ├── ak_session_execute         (v1, MIT)
       ├── ak_session_batch_execute   (v1, MIT)
       └── (no MIT fetch+index path)
       └── (opt-in: context-mode for ctx_fetch_and_index, ctx_doctor, etc.)

AFTER this BP:
  Claude Code / Codex
       ├── ak_session_fetch_and_index  (v1, MIT, SSRF-guarded, 5MB-capped,
       │                               composite-cache-keyed, redirect-validated)
       ├── ak_session_search           (v1, MIT)
       ├── ak_session_execute          (v1, MIT)
       ├── ak_session_batch_execute    (v1, MIT)
       └── (operator/long-tail ctx_* tools: still opt-in, never bundled)

DISCOVERY CONTRACT:
  src/mcp/auto-discover.ts  ──scans──>  src/mcp/tools/*.ts
                                         ↑
  src/mcp/discovery.integration.test.ts ──asserts: every ak_session_* tool present
```

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable |
| --- | --- | --- | --- |
| **Wave 0** | 1.4, 1.6, 1.9 | None | 3 agents |
| **Wave 1** | 1.1 | 1.6, 1.9 | 1 agent |
| **Wave 2** | 1.2, 1.7, 1.8 | 1.1 | 3 agents |
| **Wave 3** | 1.5 | 1.2 | 1 agent |
| **Critical path** | 1.6 → 1.1 → 1.8 → 1.5 | — | 4 waves |

### Phase 1: Engine surgery + MCP wrapper + parity verification [Complexity: L]

#### [backend] Task 1.6: Engine rewrite — SSRF guard + body-size cap + protocol allowlist

**Status:** todo

**Depends:** None

This is the safety-critical engine rewrite. Three patches to
`fetchAndIndex()`:

1. **SSRF guard via third-party MIT/Apache library.** Evaluate
   `request-filtering-agent` (MIT) and `ssrf-req-filter` (MIT) for
   maintenance health, license, and TOCTOU semantics. Pick one. Wire
   it as the HTTP agent so per-hop resolved-address validation is
   TOCTOU-safe (the address validated IS the address connected). Add
   `options.allowPrivateNetworks?: boolean` (default false) to the
   engine. **License gate:** chosen library MUST be MIT or Apache —
   reject any GPL/AGPL/ELv2 candidate (would defeat the wedge).
2. **Body-size cap = 5 MB decompressed bytes.** Replace
   `await response.text()` with a streaming reader that pipes
   `response.body` (already gzip/brotli-decompressed by the runtime)
   through a byte counter, rejecting (typed error) when accumulated
   bytes exceed `options.maxBytes ?? 5 * 1024 * 1024`. Cap fires
   BEFORE text decoding — text decode doubles memory cost and we want
   to short-circuit before that.
3. **Protocol allowlist.** Reject `file:`, `data:`, `gopher:`, `ftp:`,
   etc. at the engine boundary. Only `http:`/`https:` accepted.

Update existing `fetch-index.test.ts` for new behavior + add boundary
tests at 4.99 MB (pass) and 5.01 MB (fail), gzip-decompression cases,
and SSRF rejection cases (direct + via-redirect).

**Files:**

- Modify: `src/session-memory/fetch-index.ts`
- Modify: `src/session-memory/fetch-index.test.ts`
- Modify: `package.json` (add SSRF library dep)

**Steps (TDD):**

1. Spike: read READMEs of `request-filtering-agent` + `ssrf-req-filter`;
   verify MIT/Apache; confirm latest commit < 12 months old.
2. Write failing tests: (a) maxBytes 4.99/5.01 MB on decompressed body;
   (b) reject `http://127.0.0.1`; (c) reject 302 redirect to private
   IP via library's per-hop check; (d) reject `gopher://example.com`;
   (e) reject `file:///etc/passwd`; (f) accept legit redirect chain to
   different public host.
3. Run scoped vitest — expect FAIL.
4. Implement: install chosen SSRF library, plumb as agent; implement
   stream-with-cap helper.
5. Re-run — expect PASS.
6. Confirm pre-existing `fetch-index.test.ts` still passes.

**Acceptance:**

- [ ] All new boundary + SSRF tests pass
- [ ] All pre-existing `fetch-index.test.ts` tests pass unchanged
- [ ] `fetchAndIndex()` rejects `file:`, `data:`, `gopher:`, `ftp:` URLs
- [ ] Redirect to private destination rejected at the hop, not after
- [ ] SSRF library license verified MIT/Apache
- [ ] Scoped lint + typecheck pass

#### [backend] Task 1.9: Composite cache key + sources schema migration

**Status:** todo

**Depends:** None

Cache currently keyed by `sources.label = url`. With new options
(`maxBytes`, `allowPrivateNetworks`, future parser variants),
"same URL" no longer means "same indexed artifact." Returning
`cached: true` for an effectively-different request is a correctness
bug. Add a `cache_key` column to `sources`, populate as
`hash(url || normalized_options_json || parser_version)`. Lookups
match on `cache_key`, not `label`. Existing entries get backfilled
with `parser_version = 1` (current).

**Files:**

- Modify: `src/session-memory/store.ts` (SCHEMA_SQL + migration)
- Modify: `src/session-memory/fetch-index.ts` (cache lookup logic)
- Modify: `src/session-memory/store.test.ts` (schema test)

**Steps (TDD):**

1. Write failing test: insert a chunk for `url=X` with default options;
   then call again with `maxBytes=1024`; assert second call is NOT
   `cached: true`.
2. Implement composite key + schema migration.
3. Re-run — expect PASS.
4. Confirm existing cache hits still work for identical option sets.

**Acceptance:**

- [ ] `cache_key` column exists; populated on every insert
- [ ] Migration backfills existing entries with `parser_version = 1`
- [ ] Different options → different cache_key → not cached
- [ ] Same options → same cache_key → cached
- [ ] No regression in existing cache hit/miss behavior for default-options
      callers

#### [backend] Task 1.1: Add `ak_session_fetch_and_index` MCP tool wrapper

**Status:** todo

**Depends:** Task 1.6, Task 1.9

Wrap the (now hardened) `fetchAndIndex()` engine in an MCP
`ToolDescriptor`. Mirror `session-search.ts` shape exactly: zod
input/output schemas, `cwd` default, `repoHash` via `computeRepoHash`,
default export only.

**Files:**

- Create: `src/mcp/tools/session-fetch-and-index.ts`
- Create: `src/mcp/tools/session-fetch-and-index.test.ts`

**Steps (TDD):**

1. Copy `src/mcp/tools/session-search.ts` as structural template.
2. Replace `inputSchema` with: `{ url: z.string().url().refine(...http(s) only),
   cacheTtlMs?, maxBytes? (max 50 MB cap), allowPrivateNetworks?
   (default false), cwd? }`.
3. Replace `outputSchema` with zod equivalent of `FetchIndexResult`.
4. Tests: (a) happy path; (b) cache hit (same options); (c) cache miss
   (different options, same URL — proves D8 wired correctly);
   (d) invalid scheme rejected at schema layer; (e) SSRF rejection
   propagates from engine; (f) maxBytes rejection propagates.
5. Run scoped test — FAIL.
6. Implement handler.
7. Re-run — PASS.

**Acceptance:**

- [ ] `src/mcp/tools/session-fetch-and-index.ts` exists with default
      `ToolDescriptor` export
- [ ] Six passing tests
- [ ] Annotations: `readOnlyHint: false` (writes), `idempotentHint: false`
      (cache state changes call to call)
- [ ] Scoped lint + typecheck pass

#### [infra] Task 1.2: Codex CLI MCP packaging + ingest-lens audit

**Status:** todo

**Depends:** Task 1.1

agent-kit OWNS Codex distribution (D1). Three outputs:

1. **Stable bin entry + documented toml block.** Confirm
   `package.json:bin` declares an `agent-kit-mcp` (or equivalent)
   entry resolving to `src/mcp/cli.ts` after install. Add if missing.
   Publish a README snippet showing the exact `~/.codex/config.toml`
   block.
2. **Fresh-install verification.** In a clean tmpdir, install
   `@webpresso/agent-kit` via `npm pack` + `npm install <tarball>`,
   run the documented Codex toml against it, confirm
   `ak_session_fetch_and_index` appears in the Codex tool list.
3. **ingest-lens audit.** Document state in `codex-mcp-audit.md`.
   Do NOT modify ingest-lens here — file cross-repo issue if needed.

**Acceptance:**

- [ ] Stable bin entry exists; `npx @webpresso/agent-kit mcp` works
      from clean install
- [ ] `README.md` documents the Codex toml block
- [ ] Fresh-install Codex smoke shows the new tool in its list
- [ ] `codex-mcp-audit.md` records state + remediation

#### [docs] Task 1.4: Migration note + opt-in path for long-tail ctx_* tools

**Status:** todo

**Depends:** None

Document in `webpresso/agent-kit/README.md` and
`docs/migration/from-context-mode.md`:

| context-mode tool | ak_session_* equivalent | Notes |
| --- | --- | --- |
| `ctx_fetch_and_index` | `ak_session_fetch_and_index` | MIT, SSRF-guarded, 5 MB cap, composite cache key |
| `ctx_search` | `ak_session_search` | Three-tier (porter → trigram → Levenshtein) |
| `ctx_execute` | `ak_session_execute` | Sandboxed shell |
| `ctx_batch_execute` | `ak_session_batch_execute` | Parallel sandboxed shell + index |
| `ctx_doctor` / stats / purge / insight / upgrade | — (opt-in: keep context-mode) | Operator-only |

Doc must call out: SSRF guard default, 5 MB body cap default, cache
key now considers options, opt-in for private-network indexing.

**Acceptance:**

- [ ] README has session-memory section pointing at migration guide
- [ ] Migration guide exists with full mapping + safety notes
- [ ] `ak audit docs-frontmatter` passes

#### [infra] Task 1.5: Plugin manifest + canonical-export update

**Status:** todo

**Depends:** Task 1.2

Update `.claude-plugin/plugin.json` and any `catalog/` manifest that
lists session-memory MCP tools to advertise the new tool explicitly.

**Acceptance:**

- [ ] Tool reachable from a fresh Claude Code session AND fresh Codex
      session without manual config beyond the documented toml block
- [ ] `ak audit catalog-drift` clean

#### [qa] Task 1.7: MCP discovery integration test

**Status:** todo

**Depends:** Task 1.1

Boot `auto-discover.ts`, scan `src/mcp/tools/`, assert descriptor list
contains every expected `ak_session_*` tool by name. Catches silent
auto-discovery regressions for ALL session tools.

**Files:**

- Create: `src/mcp/discovery.integration.test.ts`

**Acceptance:**

- [ ] Test green when all expected tools present
- [ ] Test red when any expected tool name missing from discovery

#### [qa] Task 1.8: Pre/post-BP bench delta + parity vs context-mode

**Status:** todo

**Depends:** Task 1.1, sibling token-savings-benchmark BP completed

Per D3, the bench gate is meaningless if it only measures pre-BP-B v1.
This task runs the bench harness twice:

1. Against v1-current (baseline before BP B engine changes) — captures
   `Recall@5_pre`.
2. Against v1-after-BP-B (engine + cache + SSRF + cap shipped) —
   captures `Recall@5_post`.

Then asserts:

- `Recall@5_post >= Recall@5_pre - 0.05` (no internal regression from
  the rewrite)
- `Recall@5_post >= Recall@5_context-mode - 0.05` (parity vs the tool
  being replaced)

If either fails, escalate to `cheerio` / `@mozilla/readability` swap
(currently a non-goal) before merge.

**Files:**

- Create: `<this-blueprint-dir>/bench-results.md`

**Acceptance:**

- [ ] Both bench runs captured with raw output
- [ ] Both deltas pass the threshold
- [ ] Results committed to the blueprint dir for reproducibility

---

## Verification Gates

| Gate | Command | Success Criteria |
| --- | --- | --- |
| Type safety | `ak_typecheck` | Zero errors |
| Lint | `ak_lint` (scoped) | Zero violations |
| Unit tests | `ak_test` (scoped) | All pass |
| Integration | discovery test | Green |
| Full QA | `ak_qa` | Pass |
| Audit | `ak_audit` (blueprint-lifecycle, docs-frontmatter, catalog-drift) | All pass |
| Bench parity (gate, D3) | Task 1.8 | post >= pre - 0.05 AND post >= context-mode - 0.05 |
| WAL safety (gate, D7) | upstream BP `harden-session-store-multi-window-wal-safety...` completed | Both integration tests 10/10 green there |

## Cross-Plan References

| Type | Blueprint | Relationship |
| --- | --- | --- |
| **Hard upstream (urgent path)** | `make-context-mode-an-opt-in-dependency...` (BP A) | Ships ELv2 risk removal first; this BP is no longer urgent |
| **Hard upstream (engine reliability)** | `harden-session-store-multi-window-wal-safety...` | Owns WAL multi-window contract for ALL session-* tools |
| **Hard upstream (parity baseline)** | `token-savings-benchmark-harness-ak-bench-session-memory` | Provides the bench harness Task 1.8 runs |
| Downstream | ozby/ingest-lens (cross-repo) | Drops the context-mode opt-in entirely once this BP lands |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --- | --- | --- | --- |
| Massive HTML page (>5MB decompressed) | Memory bomb in `response.text()` | Stream-read with 5 MB hard cap (D4) | 1.6 |
| Redirect to internal address (SSRF) | Cred exfil via cloud metadata | Third-party SSRF lib at agent layer (D2) | 1.6 |
| Non-http(s) scheme | Local file read / data exfil | URL protocol restricted at engine + schema layer | 1.1 + 1.6 |
| Same URL, different options → cache miscoded as hit | Wrong artifact returned | Composite cache key (D8) | 1.9 |
| URL with auth-required content | Currently no header passing; silent fetch failure | Documented; `headers?` follow-up if requested | 1.4 |
| Auto-discovery silently drops new tool | Tool ships invisible | Discovery integration test (D5) | 1.7 |
| HTML stripper drops semantic structure | Search recall degrades vs context-mode | D3 bench gate; if regression > 0.05, escalate to cheerio | 1.8 |
| Codex CLI consumer can't find MCP server | Wedge fails for Codex users | Stable bin entry + fresh-install smoke (D1) | 1.2 |
| SSRF library becomes unmaintained | Stale security primitive | Pin version; Task 1.6 spike includes maintenance check; track in TODOs |

## Non-goals

- Replacing the long-tail ctx_* operator tools (doctor/stats/purge/insight/
  upgrade). User accepted "lag context-mode features long-term."
- Modifying ozby/ingest-lens. Cross-repo handoff via separate issue.
- Adding cheerio / @mozilla/readability / turndown. Existing regex stripper
  is the baseline; library swap only if D3 bench gate fails.
- Auth-header passthrough on fetch.
- Cache-purge MCP tool (operator long-tail).
- Migration tooling that strips context-mode from consumer `package.json`
  files. Document the swap; do not script the removal. (BP A handles the
  agent-kit-side default removal; consumer is responsible for their own
  package.json.)
- Owning multi-window WAL safety — handled by `harden-session-store-
  multi-window-wal-safety...` BP.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Regex HTML stripper produces materially worse search recall than context-mode's parser | Medium — degrades `ak_session_search` hits | D3 hard gate via Task 1.8 pre/post bench. If parity fails, add cheerio. |
| Codex CLI distribution gap not solvable from agent-kit alone | High — wedge fails for Codex users | D1 expanded scope: stable bin + fresh-install smoke. |
| SSRF guard breaks legitimate localhost docs workflows | Medium — internal wiki indexing fails | `allowPrivateNetworks?: boolean` opt-in (D2) |
| Two concurrent hook processes drop writes under load | Medium — invisible session-memory loss | Upstream WAL BP gates this |
| Operator tools turn out to be load-bearing | Low — user explicitly accepted lag | Migration guide tells consumers to keep context-mode opt-in |
| Plugin manifest lags auto-discovery | Medium — tool invisible in some vendor | Task 1.5 + 1.7 |
| 5 MB cap breaks legit large-doc indexing | Low — escape via `maxBytes` schema field (max 50 MB enforced) | Documented in migration guide |
| SSRF library has a CVE in its own lifetime | Medium | Pin version; subscribe to advisories; have a swap plan |

## Technology Choices

| Component | Technology | Version | Why |
| --- | --- | --- | --- |
| HTTP client | Native `fetch` + custom MIT/Apache SSRF agent | Node 24+ | Built-in fetch; SSRF library handles the unsafe primitive (D2) |
| HTML→Markdown | Regex stripper (existing) | n/a | Bench-gated baseline (D3) |
| MCP framework | Existing `ToolDescriptor` shape | n/a | Auto-discovery handles registration |
| Cache | SQLite `sources` table with composite `cache_key` column | better-sqlite3 / bun:sqlite | Reuses cache; D8 fixes invalidation |
| Body-size cap | Streaming `ReadableStream` chunk accumulation, 5 MB decompressed | Node 24+ | Native; no `node-fetch` dep |
| SSRF guard | `request-filtering-agent` OR `ssrf-req-filter` (final pick at Task 1.6 spike) | latest MIT/Apache | TOCTOU-safe per-hop; Codex's correct push back on rolling our own |
| Test runner | vitest | repo pinned | Existing |

## What already exists (eng-review §1)

- Six existing `ak_session_*` MCP tools — established pattern for
  Task 1.1 to mirror.
- `auto-discover.ts` registration mechanism.
- `splitIntoChunks` paragraph-boundary splitter.
- WAL mode + `busy_timeout = 250` already applied.
- (NOTE: the existing `fetchAndIndex` engine is being REWRITTEN in
  Task 1.6 — it has no SSRF guard, no streaming cap, no protocol
  allowlist, no composite cache key. The "engine already exists"
  framing was incorrect; corrected per Codex finding D9.)

## NOT in scope (eng-review §6)

- Long-tail ctx_* operator tools → opt-in path (documented)
- ozby/ingest-lens code changes → tracked as separate cross-repo issue
- cheerio / readability swap → only if D3 bench gate fails
- Auth-header passthrough → follow-up TODO
- Cache-purge MCP tool → follow-up TODO
- Bundle-vs-separate-package decision for session-memory → defer to
  extraction roadmap
- WAL multi-window concurrency safety → upstream WAL BP

## Failure modes (eng-review §3)

| Failure mode | Test? | Error handling? | UX |
| --- | --- | --- | --- |
| URL is `gopher:` / `file:` | Yes (1.1, 1.6) | Schema + engine rejection | Clear "http(s) only" error |
| URL resolves to private IP | Yes (1.6) | Library rejection | Clear "private network blocked; use allowPrivateNetworks" |
| 302 redirect to private IP | Yes (1.6) | Library per-hop rejection | Same as above |
| Decompressed response > 5 MB | Yes (1.6) | Typed error | Clear "exceeded maxBytes" |
| 15s timeout exceeded | Inherited | AbortError surfaces | Timeout error |
| Same URL, different options | Yes (1.9, 1.1) | Composite key forces re-fetch | Returns fresh artifact, not stale cache |
| Auto-discovery silently drops the tool | Yes (1.7) | N/A — test is the guard | Caught at CI |

No critical gaps remain.

## Worktree parallelization strategy

| Step | Modules touched | Depends on |
| --- | --- | --- |
| 1.4 | `README.md`, `docs/migration/` | — |
| 1.6 | `src/session-memory/`, `package.json` (SSRF dep) | — |
| 1.9 | `src/session-memory/` (schema + cache lookup) | — |
| 1.1 | `src/mcp/tools/` | 1.6, 1.9 |
| 1.2 | `package.json` (bin), `README.md`, blueprint dir | 1.1 |
| 1.7 | `src/mcp/` | 1.1 |
| 1.8 | blueprint dir | 1.1, sibling bench BP |
| 1.5 | `.claude-plugin/`, `catalog/` | 1.2 |

**Conflict flags:**

- 1.6 + 1.9 both touch `src/session-memory/store.ts` and
  `src/session-memory/fetch-index.ts`. Coordinate (probably do 1.6 →
  1.9 sequentially even though waves allow parallel).
- 1.4 + 1.2 both touch `README.md`. Coordinate edits in the same
  agent run to avoid merge churn.

## TODOs proposed for follow-up

- [ ] cheerio / readability HTML→MD swap (only if D3 bench fails)
- [ ] Auth-header passthrough on `ak_session_fetch_and_index`
- [ ] Cache-purge MCP tool
- [ ] DRY: extract `cwd → repoHash → dbPath` helper used by every session-* tool
- [ ] Bundle-vs-separate-package decision for `@webpresso/session-memory`
- [ ] CVE/maintenance watch for chosen SSRF library
