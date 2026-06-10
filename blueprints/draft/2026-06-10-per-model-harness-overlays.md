---
type: blueprint
title: "Per-model harness overlays in the symlinker"
owner: ozby
status: draft
complexity: L
created: "2026-06-10"
last_updated: "2026-06-10"
progress: "0% (draft)"
parent_roadmap: 2026-06-10-self-improving-harness-roadmap
depends_on:
  - >-
    2026-06-10-weakness-mining-audit (draft) — an overlay may only exist when
    it cites a mined, model-attributed failure pattern
  - >-
    2026-06-10-harness-regression-gate (draft) — every overlay must show a
    measured pass-rate delta to be promoted
tags:
  - agent-kit
  - harness
  - symlinker
---

# Per-model harness overlays in the symlinker

## Product wedge anchor

- **Stage outcome:** the "model-specific adaptation" ❌ row in
  `docs/research/2026-06-10-harness-competitor-analysis.md` — the
  harness-update school's central replicated finding is that optimal
  harnesses are model-specific, while agent-kit ships one canonical
  `.agent/` to every CLI.
- **Consuming surface:** `wp sync` overlay merge + a per-overlay measured
  pass-rate delta on the reference-consumer suite, visible in the overlay's
  required evidence block.
- **New user-visible capability:** a consumer running two Tier 1 CLIs gets
  behavior-tuned harness deltas per CLI (e.g. a tool-error recovery redirect
  only where mining showed retry-loop failures), with the measured gain on
  record.

## Planning Summary

Self-Harness found different models need different harness fixes (Qwen:
tool-error-triggered redirect for destructive retry loops; MiniMax:
write-artifact-then-stop workflow nudge — see
`docs/research/papers/2026-self-harness.md`). This blueprint adds an overlay
layer to the symlinker: canonical `.agent/` remains the single source of
truth; `overlays/<cli>/` holds minimal deltas merged at `wp sync` after the
canonical layer. CLIs are referenced strictly by tier — overlays ship for
Tier 1 only (Claude Code, Codex) per
`catalog/agent/rules/supported-agent-clis.md`; this blueprint introduces no
new CLI support.

**Evidence-or-nothing rule (the YAGNI gate):** an overlay file may only be
added when it cites (a) a mined failure pattern attributed to that CLI's
model from `wp audit weakness-mining`, and (b) a regression-gate verdict
showing held-out non-regression and a positive delta. Speculative overlays
are rejected in review and by audit.

## Phases

### Phase 1: Overlay mechanism [Complexity: M]

#### [infra] Task 1.1: Symlinker overlay merge

**Status:** todo

**Depends:** —

Extend the symlinker merge order: catalog → consumer `.agent/` →
`overlays/<cli>/`. Deterministic, drift-checkable via `wp sync --check`.

**Acceptance:**

- [ ] Overlay-merged output is reproducible and covered by symlinker tests
- [ ] `wp sync --check` flags hand-edited per-IDE surfaces exactly as today
- [ ] No overlay present → byte-identical output to current behavior

#### [infra] Task 1.2: Overlay evidence audit

**Status:** todo

**Depends:** Task 1.1

Each overlay file requires an evidence block (mined-pattern reference +
gate-verdict reference); audited (extend `harness-surfaces` or add a check
within the sync audit family — decided in-task, not a new top-level kind by
default).

**Acceptance:**

- [ ] An overlay without an evidence block fails the audit
- [ ] Tier 2/3 CLI overlay directories are rejected

### Phase 2: First evidence-backed overlay [Complexity: M]

#### [qa] Task 2.1: Ship one real overlay end-to-end

**Status:** todo

**Depends:** Task 1.2

Take the top model-attributed cluster from weakness mining, author the
minimal overlay, run it through the regression gate, ship with the measured
delta in the evidence block. This task is the blueprint's proof — if no
mined pattern justifies an overlay, the mechanism ships dormant and this
task documents that honestly instead of inventing one.

**Acceptance:**

- [ ] Overlay cites a real mined cluster and a real gate verdict
- [ ] Measured held-out delta ≥ 0 with positive held-in or held-out gain
- [ ] Documented in `docs/symlinker.md`

## Non-goals

- No per-model *forks* of canonical content — overlays are minimal deltas;
  canonical `.agent/` stays the single source of truth.
- No Tier 2/3 CLI overlays.
- No automatic overlay generation (that is the deferred proposal stage in
  the parent roadmap).

## Cross-Plan References

| Reference | Relationship |
| --- | --- |
| `2026-06-10-self-improving-harness-roadmap` | Parent roadmap (Wave 3) |
| `2026-06-10-weakness-mining-audit` | Evidence source (required) |
| `2026-06-10-harness-regression-gate` | Promotion proof (required) |
| `docs/symlinker.md` | Mechanism home |
