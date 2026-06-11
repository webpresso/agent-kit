---
type: blueprint
title: "Harness-surface manifest with editable/locked declaration"
owner: ozby
status: draft
complexity: M
created: "2026-06-10"
last_updated: "2026-06-11"
progress: "0% (draft; fact-check refined, tasks unstarted)"
parent_roadmap: 2026-06-10-self-improving-harness-roadmap
tags:
  - agent-kit
  - harness
  - audit
---

# Harness-surface manifest with editable/locked declaration

## Product wedge anchor

- **Stage outcome:** the "editable-surface declaration" gap in
  `docs/research/2026-06-10-harness-competitor-analysis.md` (compulsory
  capability rated ❌).
- **Consuming surface:** `wp audit harness-surfaces` plus the canonical
  manifest file consumed by the mining and overlay blueprints.
- **New user-visible capability:** a maintainer can answer "what harness
  surfaces are editable, locked, kit-owned, or consumer-owned" from one
  validated file instead of reading guard and sync source.

## Planning Summary

Self-Harness starts from a declared editable surface. Agent-kit's boundary is
currently implicit across guard code, sync rules, and conventions. This
blueprint adds a machine-readable manifest and a drift audit.

Two repo facts harden the plan:

1. Audit registration is split across **two** canonical entry points:
   `src/mcp/tools/_shared/audit-kinds.ts` (the MCP/pretool enum) and
   `src/cli/commands/audit.ts` (repo-audit registry + CLI exposure).
2. The manifest belongs under `catalog/agent/`, not a top-level loose file,
   because the repo's durable agent-owned assets already live there.

Locked surfaces stay hard-coded policy even if the manifest drifts:
pretool-guard and guard hooks, permission policies / deny wording, and secret
handling / `with-secrets` execution paths are never editable by an automated
harness path.

## Fact-Check Summary

| Claim | Reality | Fix applied to this plan |
| --- | --- | --- |
| Adding an audit kind is one-file work | New kinds must update `src/mcp/tools/_shared/audit-kinds.ts` **and** `src/cli/commands/audit.ts` (`REPO_AUDIT_REGISTRY`) | Task 2.1 names both files explicitly |
| `catalog/harness-surfaces.yaml` matches repo layout | Canonical agent assets live under `catalog/agent/` | Manifest location narrowed to `catalog/agent/harness-surfaces.yaml` |
| Locked surfaces can live only in the manifest | The repo already enforces some surfaces in code/policy | Audit must fail closed on locked-surface edits even if the manifest is wrong |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable |
| --- | --- | --- | --- |
| **Wave 0** | 1.1 | None | 1 agent |
| **Wave 1** | 2.1 | Task 1.1 | 1 agent |

## Phases

### Phase 1: Canonical manifest [Complexity: S]

#### [infra] Task 1.1: Define the manifest schema and seed the canonical file

- [ ] **Status:** todo
- **Depends on:** —
- **Files:**
  - Create: `catalog/agent/harness-surfaces.yaml`
  - Create: `src/audit/harness-surfaces.ts`
  - Create: `src/audit/harness-surfaces.test.ts`
- **Change:** add one small schema + reader module and seed the canonical
  manifest beside the rest of the catalog-owned agent assets. Enumerate current
  surface classes with `editable|locked` and `owner: kit|consumer`; encode the
  permanently locked set as first-class manifest rows, not prose.
- **Verify:**
  - `wp test --file src/audit/harness-surfaces.test.ts`
  - `wp audit docs-frontmatter`
- **Acceptance:** all of the following:
  - [ ] `catalog/agent/harness-surfaces.yaml` covers the current harness classes this roadmap touches
  - [ ] Guard hooks, permission policies, and secret handling are marked `locked`
  - [ ] Schema/reader tests prove invalid manifest entries fail closed

### Phase 2: Drift audit [Complexity: S]

#### [infra] Task 2.1: Register and wire `harness-surfaces` as a first-class audit kind

- [ ] **Status:** todo
- **Depends on:** Task 1.1
- **Files:**
  - Modify: `src/mcp/tools/_shared/audit-kinds.ts`
  - Modify: `src/cli/commands/audit.ts`
  - Modify: `src/cli/commands/audit-core.ts` (only if dispatch helper needs a new branch)
  - Create: `src/audit/harness-surfaces.integration.test.ts`
- **Change:** register the audit in both canonical surfaces, then implement
  drift checks for "declared but missing", "present but undeclared", and
  "locked but marked editable". Keep the audit small and summary-first; do not
  invent a second manifest registry.
- **Verify:**
  - `wp test --file src/audit/harness-surfaces.integration.test.ts`
  - `wp audit harness-surfaces`
  - `wp qa`
- **Acceptance:** all of the following:
  - [ ] `wp audit harness-surfaces` fails on manifest↔filesystem drift
  - [ ] `wp audit harness-surfaces` fails if any permanently locked surface is marked editable
  - [ ] `wp_audit` exposes `harness-surfaces` through the shared audit-kind enum

## Non-goals

- No edit mechanism — this blueprint declares and validates the boundary only.
- No consumer-repo manifest generation yet.
- No relaxation of the permanently locked set.

## Cross-Plan References

| Reference | Relationship |
| --- | --- |
| `2026-06-10-self-improving-harness-roadmap` | Parent roadmap (Wave 1) |
| `docs/research/papers/2026-self-harness.md` | Declared-editable-surfaces pattern source |
| `docs/research/2026-06-10-harness-competitor-analysis.md` | Capability gap this blueprint closes |
