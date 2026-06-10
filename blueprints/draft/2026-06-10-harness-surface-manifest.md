---
type: blueprint
title: "Harness-surface manifest with editable/locked declaration"
owner: ozby
status: draft
complexity: M
created: "2026-06-10"
last_updated: "2026-06-10"
progress: "0% (draft)"
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
  capability rated ❌); precondition for the gated loop in the parent
  roadmap.
- **Consuming surface:** `wp audit harness-surfaces` (new audit kind) plus
  the manifest file itself, consumed by the weakness-mining and overlay
  blueprints.
- **New user-visible capability:** a consumer or agent can answer "what parts
  of this repo's harness may be changed, by whom" from one validated file
  instead of reading guard source code.

## Planning Summary

The Self-Harness pattern starts from a **declared editable interface** (see
`docs/research/papers/2026-self-harness.md`): self-improvement is only safe
when the edit boundary is explicit. Agent-kit's boundary today is implicit in
guard-hook code and conventions. This blueprint ships a machine-readable
manifest enumerating every harness surface with `editable | locked` and
`owner: kit | consumer`, and an audit that fails when manifest and reality
drift.

Locked set (non-negotiable, hard-coded in the audit, not just in the
manifest): pretool-guard and all guard hooks, permission policies
(`guard.scriptRoutes`, deny wording), and secret handling (`with-secrets`
contract). The audit fails if the manifest ever marks these editable.

## Phases

### Phase 1: Manifest schema and seed [Complexity: S]

#### [infra] Task 1.1: Define manifest schema and seed file

**Status:** todo

**Depends:** —

Zod schema + canonical manifest enumerating current surfaces: catalog rules,
catalog skills, AGENTS.md template sections, routing blocks, hook config
thresholds, config presets (tsconfig/vitest/oxlint/stryker), guard hooks,
permission policies, secret wrappers.

**Files:**

- Create: manifest file (location decided in-task; candidate
  `catalog/harness-surfaces.yaml`)
- Create: schema module under `src/`

**Acceptance:**

- [ ] Every surface class listed in the competitor doc's matrix appears in
      the manifest with `editable|locked` + `owner`
- [ ] Guard hooks, permission policies, secret handling are `locked`
- [ ] Schema round-trips via unit test

### Phase 2: Audit kind [Complexity: S]

#### [infra] Task 2.1: Add `harness-surfaces` audit kind

**Status:** todo

**Depends:** Task 1.1

Register in `src/mcp/tools/_shared/audit-kinds.ts` and the CLI audit
dispatch; validate manifest↔filesystem drift (surface listed but missing,
surface present but undeclared) and the hard-coded locked set.

**Files:**

- Modify: `src/mcp/tools/_shared/audit-kinds.ts`
- Modify: `src/cli/commands/audit.ts` (+ audit-core dispatch)
- Create: audit implementation + tests

**Acceptance:**

- [ ] `wp audit harness-surfaces` exits non-zero on drift and on any
      editable-marked locked surface
- [ ] `wp_audit` MCP enum includes the new kind
- [ ] Wired into the repo's own CI audit set

## Non-goals

- No edit *mechanism* — this blueprint declares the boundary; it does not act
  on it.
- No consumer-repo manifest generation yet (kit-repo first; consumer rollout
  is a follow-up once the schema settles).

## Cross-Plan References

| Reference | Relationship |
| --- | --- |
| `2026-06-10-self-improving-harness-roadmap` | Parent roadmap (Wave 1) |
| `docs/research/papers/2026-self-harness.md` | Declared-editable-surfaces pattern source |
