---
type: blueprint
title: "Weakness-mining audit over hook logs and session evidence"
owner: ozby
status: draft
complexity: L
created: "2026-06-10"
last_updated: "2026-06-10"
progress: "0% (draft)"
parent_roadmap: 2026-06-10-self-improving-harness-roadmap
depends_on:
  - >-
    2026-06-10-harness-surface-manifest (draft) — patterns are tagged with the
    harness surface they implicate; tagging vocabulary comes from the manifest
tags:
  - agent-kit
  - harness
  - audit
  - observability
---

# Weakness-mining audit over hook logs and session evidence

## Product wedge anchor

- **Stage outcome:** the "observability & tracing" ❌ row in
  `docs/research/2026-06-10-harness-competitor-analysis.md` — hook logs are
  currently write-only.
- **Consuming surface:** `wp audit weakness-mining` (new audit kind) emitting
  a ranked failure-pattern report; `--draft-tech-debt` feeds the existing
  tech-debt lifecycle a maintainer already reviews via `wp tech-debt list`.
- **New user-visible capability:** a maintainer reads "your top recurring
  agent failure this month, with N occurrences and the harness surface it
  implicates" instead of discovering failure patterns one burned session at a
  time.

## Planning Summary

Adapts Self-Harness Weakness Mining (see
`docs/research/papers/2026-self-harness.md`) to agent-kit's evidence:
hook logs (default `~/.webpresso/cache/agent-kit/hooks/<repo>.*.log`), QA
outcome summaries, and — where present — session-memory exports. Failures
cluster by the paper's deterministic three-part signature, adapted as:
(what gate/verifier rejected, what agent behavior contributed, which reusable
mechanism — e.g. retry-loop, artifact-deletion, scope-creep). Clusters rank
by support; each cites its raw evidence lines and the implicated harness
surface from the manifest.

Advisory by design: output is a report plus optional auto-drafted tech-debt
items. No harness file is modified by this audit, ever.

## Phases

### Phase 1: Evidence readers [Complexity: M]

#### [infra] Task 1.1: Hook-log reader with stable record schema

**Status:** todo

**Depends:** —

Inventory what each hook bin actually writes today; define a parsed record
type; tolerate schema drift across agent-kit versions (skip-and-count
unparseable lines, never crash).

**Files:**

- Create: `src/audits/weakness-mining/` readers + tests with fixture logs

**Acceptance:**

- [ ] Parses current pretool-guard/post-tool/stop log formats from fixtures
- [ ] Unparseable lines are counted and reported, not fatal
- [ ] If current logs lack fields the signature needs, this task documents
      the gap and files the minimal log-enrichment change as its own task

#### [infra] Task 1.2: Clustering + ranking

**Status:** todo

**Depends:** Task 1.1

Exact-agreement clustering on the three-part signature; rank by support;
attach representative evidence and implicated surface tags.

**Acceptance:**

- [ ] Deterministic: same input → same clusters and order (unit-tested)
- [ ] Output schema versioned (JSON + human-readable rendering)

### Phase 2: Audit surface [Complexity: M]

#### [infra] Task 2.1: `wp audit weakness-mining` kind

**Status:** todo

**Depends:** Task 1.2

Register the audit kind (audit-kinds.ts + CLI dispatch). Summary-first
output per repo conventions; report-only exit semantics decided in-task
(likely exit 0 with findings — it's a mining report, not a violation gate).

**Acceptance:**

- [ ] `wp audit weakness-mining` produces the ranked report on a repo with
      real hook logs
- [ ] `wp_audit` MCP enum includes the kind

#### [infra] Task 2.2: `--draft-tech-debt` integration

**Status:** todo

**Depends:** Task 2.1

Reuse the `wp tech-debt new` creation path to draft `h-NNN` items from
top-ranked clusters (threshold-gated; idempotent — re-running must not
duplicate items for the same cluster signature).

**Acceptance:**

- [ ] Drafted items pass `wp audit tech-debt`
- [ ] Re-run produces zero duplicates (signature recorded in item
      frontmatter)

## Non-goals

- No proposal generation, no harness edits — mining only.
- No new telemetry collection beyond what hooks already write (log
  enrichment, if needed, is scoped inside Task 1.1's follow-up).
- No cross-repo aggregation yet (single-repo reports first; the cross-repo
  correlation model has its own permission requirements per
  `docs/cross-repo-correlation.md`).

## Cross-Plan References

| Reference | Relationship |
| --- | --- |
| `2026-06-10-self-improving-harness-roadmap` | Parent roadmap (Wave 1) |
| `2026-06-10-harness-surface-manifest` | Provides the surface-tag vocabulary |
| `docs/research/papers/2026-self-harness.md` | Clustering-signature source |
| `docs/research/papers/2026-meta-harness.md` | Keep evidence uncompressed for mining |
