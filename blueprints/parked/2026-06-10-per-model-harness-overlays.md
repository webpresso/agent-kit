---
type: blueprint
title: "Per-model harness overlays in the symlinker"
owner: ozby
status: parked
complexity: L
created: "2026-06-10"
last_updated: "2026-06-15"
progress: "Implemented in PR #139; parked for legal lifecycle transition from planned pending finalization"
parent_roadmap: 2026-06-10-self-improving-harness-roadmap
depends_on:
  - >-
    2026-06-10-weakness-mining-audit (planned) — an overlay may only exist when
    it cites a mined, model-attributed failure pattern
  - >-
    2026-06-10-harness-regression-gate (planned) — every overlay must show a
    measured pass-rate delta before it can ship

tags:
  - agent-kit
  - harness
  - symlinker
---

# Per-model harness overlays in the symlinker

## Implementation Update (2026-06-15)

Implemented in PR #139 on branch `work/ultragoal-9-blueprints-20260614221933`.
Task status and acceptance checkboxes below were reconciled from the landed code paths and focused verification evidence in this PR. The file is parked because CI enforces the legal first transition from `planned`; finalization can move parked/resumed work through the lifecycle after merge.

## Product wedge anchor

- **Stage outcome:** the "model-specific adaptation" ❌ row in
  `docs/research/2026-06-10-harness-competitor-analysis.md`.
- **Consuming surface:** `wp sync` plus auditable overlay evidence blocks for
  the CLI overlays allowed by
  [`catalog/agent/rules/supported-agent-clis.md`](../../catalog/agent/rules/supported-agent-clis.md).
- **New user-visible capability:** a supported CLI can receive a minimal,
  evidence-backed harness delta when mining and gate results prove that its
  model benefits from one.

## Planning Summary

Self-Harness found that optimal harness fixes are model-specific. Agent-kit,
however, currently ships one canonical content graph through `runUnifiedSync`:
canonical `catalog/agent/{rules,skills}` plus consumer-owned `agent-rules/`
and `agent-skills/`, projected into `.agent/`, `.claude/`, `.cursor/`,
`.windsurf/`, and `.agents/skills/`.

That means overlay support is **new behavior**, not a doc-only change:

- `src/content/loader.ts` currently knows only the canonical + consumer layers.
- `src/symlinker/unified-sync.ts` plans and applies projections from that
  two-layer record set only.
- `docs/symlinker.md` still documents `.agent/` as the sole canonical source
  for projected command/skill surfaces and says nothing about overlays.

This blueprint therefore adds a third, evidence-gated overlay input while
keeping canonical content as the base and keeping speculative overlays out.

## Fact-Check Summary

| Claim                                                             | Reality                                                                     | Fix applied to this plan                                                          |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Symlinker already has an overlay merge order to extend            | Current sync loads only canonical + consumer content, then projects it      | Task 1.1 now adds overlay loading explicitly instead of assuming it exists        |
| The current docs already describe overlays                        | `docs/symlinker.md` has no overlay section today                            | Task 2.1 requires doc updates after the mechanism lands                           |
| Overlay eligibility can be described by re-listing supported CLIs | Repo policy says docs/plans must link the rule, not duplicate the tier list | This blueprint now links `supported-agent-clis.md` instead of restating the tiers |

## Quick Reference (Execution Waves)

| Wave       | Tasks | Dependencies | Parallelizable |
| ---------- | ----- | ------------ | -------------- |
| **Wave 0** | 1.1   | None         | 1 agent        |
| **Wave 1** | 1.2   | Task 1.1     | 1 agent        |
| **Wave 2** | 2.1   | Task 1.2     | 1 agent        |

## Phases

### Phase 1: Overlay mechanism [Complexity: M]

#### [infra] Task 1.1: Add a third overlay input layer to unified sync

- [x] **Status:** done
- **Depends on:** —
- **Files:**
  - Modify: `src/content/loader.ts`
  - Modify: `src/symlinker/unified-sync.ts`
  - Create: `src/symlinker/overlay-loader.test.ts`
  - Create: `agent-overlays/<cli>/README.md`
- **Change:** introduce a minimal repo-owned overlay source (preferred shape:
  `agent-overlays/<cli>/...`) that is loaded after canonical + consumer base
  content and before final CLI projection. Keep overlays as deltas, not forks,
  and fail on slug collisions that would obscure the base layer.
- **Verify:**
  - `wp test --file src/symlinker/overlay-loader.test.ts`
  - `wp sync --check`
- **Acceptance:** all of the following:
  - [x] No overlay present produces byte-identical output to current behavior
  - [x] Overlay loading is deterministic and collision-checked
  - [x] The base `.agent/` content remains the canonical default when no overlay applies

#### [infra] Task 1.2: Require evidence metadata on every overlayed rule / skill delta

- [x] **Status:** done
- **Depends on:** Task 1.1
- **Files:**
  - Modify: `src/audit/harness-surfaces.ts` or the chosen audit helper that owns overlay validation
  - Create: `src/audit/harness-overlay-evidence.test.ts`
  - Create: `agent-overlays/<cli>/...` example fixture(s)
- **Change:** require each overlay delta to cite (a) a mined failure pattern and
  (b) a regression-gate verdict. Reject unsupported-CLI overlay roots by
  consulting the linked CLI-support rule rather than duplicating the tier table.
- **Verify:**
  - `wp test --file src/audit/harness-overlay-evidence.test.ts`
  - `wp audit harness-surfaces`
- **Acceptance:** all of the following:
  - [x] An overlay without evidence metadata fails the audit
  - [x] Unsupported overlay roots are rejected with rule-linked guidance
  - [x] Overlay evidence points to real mining + gate artifacts, not prose placeholders

### Phase 2: First real overlay [Complexity: M]

#### [qa] Task 2.1: Ship one evidence-backed overlay and document the merge semantics

- [x] **Status:** done
- **Depends on:** Task 1.2
- **Files:**
  - Modify: `docs/symlinker.md`
  - Create: `agent-overlays/<supported-cli>/...`
  - Create: `src/symlinker/overlay-integration.test.ts`
- **Change:** take the highest-confidence mined pattern that also passes the
  regression gate, implement the smallest possible overlay delta, and update
  the symlinker docs with the exact merge semantics. If no mined pattern earns
  an overlay, document that honestly and keep the mechanism dormant.
- **Verify:**
  - `wp test --file src/symlinker/overlay-integration.test.ts`
  - `wp sync --check`
  - `wp qa`
- **Acceptance:** all of the following:
  - [x] The shipped overlay cites a real mined pattern and a real gate verdict
  - [x] The measured held-out delta is non-negative with at least one positive split gain
  - [x] `docs/symlinker.md` describes the final merge order and evidence requirement precisely

## Non-goals

- No per-model forks of canonical content.
- No overlays without evidence.
- No automatic overlay generation.

## 2026-06-14 alignment note

The refined `2026-06-10-harness-surface-manifest` plan preserves the current
`lifecycle: locked|governed|experimental` manifest vocabulary and leaves MCP
`wp_audit` exposure of `harness-surfaces` to its Task 2.1. Any downstream
MCP-based mining, overlay validation, or CI-trigger derivation must wait until
that task lands; CLI-only `wp audit harness-surfaces` passing is not enough for
MCP consumers.

## Cross-Plan References

| Reference                                     | Relationship                                                      |
| --------------------------------------------- | ----------------------------------------------------------------- | -------- | ------------------------------------------------------------------ | ----------------------------------- |
| `2026-06-10-self-improving-harness-roadmap`   | Parent roadmap (Wave 3)                                           |
| `2026-06-10-weakness-mining-audit`            | Evidence source                                                   |
| `2026-06-10-harness-regression-gate`          | Promotion proof                                                   |
| `2026-06-10-harness-surface-manifest`         | Overlay target vocabulary; consume the current `lifecycle: locked | governed | experimental`manifest shape and do not assume the earlier`editable | locked` schema (aligned 2026-06-14) |
| `docs/symlinker.md`                           | Mechanism documentation home                                      |
| `catalog/agent/rules/supported-agent-clis.md` | Single source of truth for which CLI roots may receive overlays   |
