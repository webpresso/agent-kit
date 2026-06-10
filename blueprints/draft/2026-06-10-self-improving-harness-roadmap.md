---
type: parent-roadmap
title: "Self-improving harness — gated loop roadmap"
owner: ozby
status: draft
complexity: XL
created: "2026-06-10"
last_updated: "2026-06-10"
progress: "0% (draft)"
depends_on:
  - 2026-06-10-harness-surface-manifest
  - 2026-06-10-weakness-mining-audit
  - 2026-06-10-harness-regression-gate
  - 2026-06-10-per-model-harness-overlays
tags:
  - agent-kit
  - harness
  - self-improvement
  - roadmap
---

# Self-improving harness — gated loop roadmap

## Product wedge anchor

- **Stage outcome:** VISION.md "Proof over vibes" extended to the kit itself —
  evidence-gated harness evolution (see `docs/research/2026-06-10-harness-engineering-landscape.md`,
  "Implications for agent-kit").
- **Consuming surface:** `wp audit harness-surfaces` + `wp audit
  weakness-mining` CLI verbs, a required PR check on agent-kit harness
  changes, and the symlinker overlay path — each owned by a child blueprint.
- **New user-visible capability:** a maintainer can read a ranked
  failure-pattern report mined from real agent sessions, and every harness
  PR carries a behavioral non-regression verdict from the reference
  consumers — neither exists today.

## Planning Summary

The harness-update school (Self-Harness, Meta-Harness, AHE, auto-harness —
see `docs/research/papers/README.md`) showed that mining an agent's failure
traces and gating proposed harness edits on held-in/held-out non-regression
moves pass rates by double digits on a fixed model. Agent-kit ships and
governs harnesses for a fleet of repos and CLIs but has no such loop: hook
logs are write-only, harness changes ship ungated, and one canonical
`.agent/` serves all models.

This roadmap sequences the loop in evidence order. Each child stands alone;
the composition is the destination:

```
manifest (what may change)            → 2026-06-10-harness-surface-manifest
  → mining (what should change)       → 2026-06-10-weakness-mining-audit
  → gate (proof it didn't regress)    → 2026-06-10-harness-regression-gate
  → overlays (model-specific change)  → 2026-06-10-per-model-harness-overlays
  → agent-proposed edits              → DEFERRED — see Non-goals
```

**Locked surfaces are permanent policy:** guard hooks, permission policies,
and secret handling are excluded from every automated edit path at every
stage of this roadmap, per the Self-Harness authors' own caution that
pass-rate non-regression is too weak a gate for high-stakes surfaces.

## Quick Reference (Execution Waves)

- **Wave 1 (independent):** `draft/2026-06-10-harness-surface-manifest.md`,
  `draft/2026-06-10-weakness-mining-audit.md`
- **Wave 2:** `draft/2026-06-10-harness-regression-gate.md`
- **Wave 3:** `draft/2026-06-10-per-model-harness-overlays.md`

## Phases

### Phase 1: Coordinate child blueprints [Complexity: XL]

#### [docs] Task 1.1: Promote children in dependency order

**Status:** todo

**Depends:** —

Promote each child from `draft/` to `planned/` only when its product wedge
is confirmed and the prior wave's evidence exists (mining output before
overlays, gate before any automated promotion).

**Acceptance:**

- [ ] Wave 1 children promoted with wedges confirmed
- [ ] Wave 2 promoted only after Wave 1 ships usable evidence
- [ ] Wave 3 promoted only with at least one mined, model-attributed failure
      pattern cited in its overview

## Non-goals

- **Agent-proposed harness edits (the "Harness Proposal" stage).** Explicitly
  deferred until the manifest, mining, and gate have operated together for at
  least one release cycle. Filing it now would be a proposal loop with no
  validated promotion path.
- Weight updates / model training (SIA's other half) — agent-kit does not own
  models.
- Adopting Terminal-Bench or Harbor as our benchmark — the reference
  consumers are the benchmark.
- Editing locked surfaces by any automated path, ever.

## Cross-Plan References

| Reference | Relationship |
| --- | --- |
| `docs/research/2026-06-10-harness-engineering-landscape.md` | Motivating research synthesis |
| `docs/research/2026-06-10-harness-competitor-analysis.md` | Compulsory-capabilities gaps this roadmap closes |
| `catalog/agent/rules/supported-agent-clis.md` | Tier discipline for any CLI referenced by children |
