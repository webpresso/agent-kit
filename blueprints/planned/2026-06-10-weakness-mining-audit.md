---
type: blueprint
title: "Weakness-mining audit over hook logs and session evidence"
owner: ozby
status: planned
complexity: L
created: "2026-06-10"
last_updated: "2026-06-11"
progress: "0% (planned; fact-check refined, tasks unstarted)"
parent_roadmap: 2026-06-10-self-improving-harness-roadmap
depends_on:
  - >-
    2026-06-10-harness-surface-manifest (planned) — mined patterns need the
    manifest's surface vocabulary

tags:
  - agent-kit
  - harness
  - audit
  - observability
---

# Weakness-mining audit over hook logs and session evidence

## Product wedge anchor

- **Stage outcome:** the "observability & tracing" ❌ row in
  `docs/research/2026-06-10-harness-competitor-analysis.md`.
- **Consuming surface:** `wp audit weakness-mining` plus optional
  `--draft-tech-debt` output that lands in the existing tech-debt lifecycle.
- **New user-visible capability:** a maintainer gets ranked recurring agent
  failure patterns with implicated harness surfaces instead of tribal-memory
  anecdotes.

## Planning Summary

This blueprint adapts the Self-Harness weakness-mining stage to agent-kit, but
it must start from what the repo actually records today.

Current-state facts:

- The only durable hook log currently written by default is the pretool log in
  `src/hooks/pretool-guard/logger.ts`, stored at a state-root path derived from
  `getSurfacePath('hooks/worktree/pretool-guard.log', 'worktree')` or an
  explicit `PRETOOL_LOG_DIR` override.
- Post-tool and stop hooks do **not** emit comparable durable log records yet.
- `wp tech-debt new --from-audit` already exists, but only for a small allowlist
  (`skill-sizes`, `broken-refs`, `memory-rotation`) in
  `src/cli/commands/tech-debt/router-dispatch.ts`.

That means the first job is an honest evidence inventory, not pretending a
full multi-hook schema already exists.

## Fact-Check Summary

| Claim | Reality | Fix applied to this plan |
| --- | --- | --- |
| Hook logs already live at `~/.webpresso/cache/agent-kit/hooks/<repo>.*.log` | Current durable hook log path is state-root/worktree keyed via `getSurfacePath(...)`; only pretool writes one today | Task 1.1 now targets the real pretool log and inventories the gap explicitly |
| Current hooks already emit the full Self-Harness signature | The pretool log captures status/tool/target/failures only; post-tool/stop do not add equivalent records | Task 1.2 scopes minimal evidence-enrichment as separate work if the reader proves it necessary |
| `--draft-tech-debt` can simply reuse an existing generic autofile path | The autofile path exists, but the supported-audit allowlist does not include `weakness-mining` yet | Task 3.1 extends or extracts the existing autofile helper instead of inventing a second tech-debt writer |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable |
| --- | --- | --- | --- |
| **Wave 0** | 1.1 | None | 1 agent |
| **Wave 1** | 1.2 | Task 1.1 | 1 agent |
| **Wave 2** | 2.1 | Task 1.2 | 1 agent |
| **Wave 3** | 3.1 | Task 2.1 | 1 agent |

## Phases

### Phase 1: Honest evidence inventory [Complexity: M]

#### [infra] Task 1.1: Read the current pretool log format and publish the record contract

- [ ] **Status:** todo
- **Depends on:** —
- **Files:**
  - Create: `src/audit/weakness-mining/read-pretool-log.ts`
  - Create: `src/audit/weakness-mining/read-pretool-log.test.ts`
  - Create: `src/audit/weakness-mining/__fixtures__/pretool-guard.log`
- **Change:** parse the actual pretool log lines produced by
  `src/hooks/pretool-guard/logger.ts`, preserve counts of skipped/unparseable
  lines, and publish the smallest stable internal record type the mining pass
  can rely on.
- **Verify:**
  - `wp test --file src/audit/weakness-mining/read-pretool-log.test.ts`
- **Acceptance:** all of the following:
  - [ ] Reader parses the current PASS/BLOCK/WARN/ERROR pretool format from fixtures
  - [ ] Unparseable lines are counted and surfaced, never fatal
  - [ ] The doc comment for the record contract names exactly which Self-Harness signature fields are still missing

#### [infra] Task 1.2: Add only the minimal extra evidence needed for clustering

- [ ] **Status:** todo
- **Depends on:** Task 1.1
- **Files:**
  - Modify: `src/hooks/pretool-guard/logger.ts` (only if more pretool fields are required)
  - Modify: `src/hooks/post-tool/**` or `src/hooks/stop/qa-changed-files.ts` (only if Task 1.1 proves a durable gap)
  - Create: `src/audit/weakness-mining/evidence-gap.test.ts`
- **Change:** if Task 1.1 proves the current record cannot support a useful
  three-part failure signature, add the smallest durable evidence enrichment
  needed. Keep it bounded, append-only, and compatible with old logs; do not
  invent a full telemetry platform.
- **Verify:**
  - `wp test --file src/audit/weakness-mining/evidence-gap.test.ts`
  - `wp qa`
- **Acceptance:** all of the following:
  - [ ] The mining input captures enough structure to label verifier/gate, contributing behavior, and implicated mechanism
  - [ ] Older logs still parse with degrade-to-warning behavior
  - [ ] No new timeout/retry behavior is introduced to hook execution

### Phase 2: Mining report [Complexity: M]

#### [infra] Task 2.1: Cluster, rank, and expose `wp audit weakness-mining`

- [ ] **Status:** todo
- **Depends on:** Task 1.2
- **Files:**
  - Create: `src/audit/weakness-mining/index.ts`
  - Create: `src/audit/weakness-mining/index.test.ts`
  - Modify: `src/mcp/tools/_shared/audit-kinds.ts`
  - Modify: `src/cli/commands/audit.ts`
- **Change:** implement deterministic exact-agreement clustering on the adapted
  three-part signature, attach manifest-backed surface tags, and render a
  summary-first report. Exit semantics should stay advisory unless the repo
  explicitly decides otherwise.
- **Verify:**
  - `wp test --file src/audit/weakness-mining/index.test.ts`
  - `wp audit weakness-mining`
- **Acceptance:** all of the following:
  - [ ] Same input yields identical clusters and ordering
  - [ ] Output includes machine-readable JSON and human-readable summary text
  - [ ] `wp_audit` exposes `weakness-mining` as a first-class audit kind

### Phase 3: Optional draft tech-debt output [Complexity: S]

#### [infra] Task 3.1: Extend the existing `--from-audit` autofile path for `--draft-tech-debt`

- [ ] **Status:** todo
- **Depends on:** Task 2.1
- **Files:**
  - Modify: `src/cli/commands/tech-debt/router-dispatch.ts`
  - Modify: `src/blueprint/tech-debt/schema.ts` (only if extra frontmatter becomes necessary)
  - Create: `src/cli/commands/tech-debt/router-dispatch.weakness-mining.test.ts`
- **Change:** reuse the existing content-hash idempotency pattern for
  auto-filed tech debt, but extend the allowlist to support weakness-mining
  findings without duplicating the writer logic.
- **Verify:**
  - `wp test --file src/cli/commands/tech-debt/router-dispatch.weakness-mining.test.ts`
  - `wp audit tech-debt`
- **Acceptance:** all of the following:
  - [ ] Re-running the autofile path creates zero duplicate items for the same cluster signature
  - [ ] Drafted items carry a stable idempotency key tied to the mining output
  - [ ] The autofile path remains compatible with existing `--from-audit` callers

## Non-goals

- No proposal generation and no harness edits.
- No assumption that all hooks already emit rich evidence.
- No cross-repo aggregation yet.

## Cross-Plan References

| Reference | Relationship |
| --- | --- |
| `2026-06-10-self-improving-harness-roadmap` | Parent roadmap (Wave 1) |
| `2026-06-10-harness-surface-manifest` | Provides the surface-tag vocabulary |
| `docs/research/papers/2026-self-harness.md` | Clustering-signature source |
| `docs/research/papers/2026-meta-harness.md` | Preserve raw evidence instead of over-compressing it |
