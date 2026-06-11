---
type: parent-roadmap
title: "Self-improving harness — gated loop roadmap"
owner: ozby
status: planned
complexity: XL
created: "2026-06-10"
last_updated: "2026-06-11"
progress: "0% (planned; child blueprints refined, ready for execution)"
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
  evidence-gated harness evolution (see
  `docs/research/2026-06-10-harness-engineering-landscape.md`,
  "Implications for agent-kit").
- **Consuming surface:** the child-owned `wp audit harness-surfaces`,
  `wp audit weakness-mining`, harness-regression PR verdict, and symlinker
  overlay evidence path.
- **New user-visible capability:** a maintainer can read ranked harness
  failure patterns mined from real sessions and see a behavioral
  non-regression verdict on harness PRs before merge.

## Planning Summary

The harness-update school (Self-Harness, Meta-Harness, AHE, auto-harness —
see `docs/research/papers/README.md`) showed that mining failure traces and
promoting harness edits only after held-in/held-out non-regression can move
pass rates by double digits on a fixed model. Agent-kit already ships the
surfaces and enforcement layer, but the loop is incomplete: the current repo
has no declared editable-surface manifest, only one durable hook log today,
no behavioral regression gate on harness PRs, and no model-specific overlay
layer in `wp sync`.

This roadmap keeps every child in `planned/` while the architecture is hardened
in evidence order:

```text
manifest (what may change)
  → mining (what should change)
  → gate (proof it did not regress)
  → overlays (model-specific deltas with evidence)
  → agent-proposed edits (explicitly deferred)
```

**Locked surfaces remain permanent policy:** guard hooks, permission policies,
and secret handling are excluded from every automated edit path at every stage
of this roadmap.

## Quick Reference (Execution Waves)

| Wave | Blueprints | Dependencies |
| --- | --- | --- |
| **Wave 1** | `planned/2026-06-10-harness-surface-manifest.md`, `planned/2026-06-10-weakness-mining-audit.md` | None |
| **Wave 2** | `planned/2026-06-10-harness-regression-gate.md` | `planned/2026-06-10-harness-surface-manifest.md` |
| **Wave 3** | `planned/2026-06-10-per-model-harness-overlays.md` | `planned/2026-06-10-weakness-mining-audit.md`, `planned/2026-06-10-harness-regression-gate.md` |

## Fact-Check Summary

| Claim | Reality in this repo | Impact on children |
| --- | --- | --- |
| Hook logs already provide a broad multi-hook evidence substrate | Only `src/hooks/pretool-guard/logger.ts` writes a durable hook log today; post-tool and stop do not emit comparable records | Mining must start from pretool data and explicitly scope any minimal log-enrichment work |
| A behavioral benchmark substrate already exists | `scripts/bench/` and the session-memory methodology already provide reproducibility, manifests, transcripts, and CLI-subprocess runner patterns | Regression gate extends the existing bench substrate instead of forking a new one |
| Symlinker already has an overlay merge phase | `runUnifiedSync` currently loads catalog + consumer content only; `docs/symlinker.md` does not mention overlays | Overlay support is new sync behavior, not documentation of an existing order |
| Parent task should promote children | These five blueprints are now promoted together into `planned/` after refinement hardening | Parent roadmap coordinates planned execution order and dependencies |

## Phases

### Wave 1 — explicit boundary and mineable evidence

- [`planned/2026-06-10-harness-surface-manifest.md`](./2026-06-10-harness-surface-manifest.md)
  declares the editable/locked boundary and adds the validating audit.
- [`planned/2026-06-10-weakness-mining-audit.md`](./2026-06-10-weakness-mining-audit.md)
  turns current hook/session evidence into ranked failure clusters and optional
  draft tech-debt outputs.

### Wave 2 — behavioral promotion gate

- [`planned/2026-06-10-harness-regression-gate.md`](./2026-06-10-harness-regression-gate.md)
  extends the existing benchmark substrate to score harness changes on the
  reference consumers.

### Wave 3 — evidence-backed model-specific overlays

- [`planned/2026-06-10-per-model-harness-overlays.md`](./2026-06-10-per-model-harness-overlays.md)
  adds minimal, audited overlay deltas only after mining and gate evidence
  exist.

## Non-goals

- **Agent-proposed harness edits (the "Harness Proposal" stage).** Explicitly
  deferred until the manifest, mining, and gate have operated together for at
  least one release cycle.
- Weight updates / model training — agent-kit does not own models.
- Adopting Terminal-Bench or Harbor as our benchmark — the reference
  consumers are the benchmark.
- Editing locked surfaces by any automated path, ever.
- Promoting these blueprints beyond `planned/` before execution evidence exists.

## Cross-Plan References

| Reference | Relationship |
| --- | --- |
| `docs/research/2026-06-10-harness-engineering-landscape.md` | Motivating research synthesis |
| `docs/research/2026-06-10-harness-competitor-analysis.md` | Capability-gap inventory this roadmap closes |
| `catalog/agent/rules/supported-agent-clis.md` | Single source of truth for CLI tier references |
| `catalog/agent/rules/no-timeout-as-fix.md` | Runtime-budget policy for any gated benchmark work |
