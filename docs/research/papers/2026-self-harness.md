---
type: research
title: "Self-Harness: Harnesses That Improve Themselves"
date: 2026-06-10
last_updated: 2026-06-10
status: active
arxiv_id: "2606.09498"
paper_url: https://arxiv.org/abs/2606.09498
authors: Hangfan Zhang, Shao Zhang, Kangcong Li, Chen Zhang, Yang Chen, Yiqun Zhang, Lei Bai, Shuyue Hu (Shanghai AI Laboratory)
year: 2026
read_status: read
relevance: high
---

# Self-Harness: Harnesses That Improve Themselves

**Citation:** Zhang et al., arXiv:2606.09498 [cs.CL], submitted 2026-06-08.
License CC BY 4.0.

## Mechanism

An LLM agent improves its **own** operating harness — no human engineers, no
stronger external model. Three-stage iterative loop:

1. **Weakness Mining** — run the fixed model on a held-in task split; cluster
   _failed_ traces by a deterministic signature: (terminal verifier-level
   cause, causal status of the agent behavior, abstract agent mechanism).
   Clusters ranked by support and actionability into an evidence bundle.
2. **Harness Proposal** — the same model, in a proposer role, sees a _bounded_
   context (declared editable surfaces, clustered failure patterns, passing
   behaviors to preserve, previously attempted edits) and generates K diverse,
   minimal candidate edits.
3. **Proposal Validation** — conservative promotion gate: accept only if
   Δheld-in ≥ 0 AND Δheld-out ≥ 0 AND max(Δin, Δho) > 0. Stochastic evals are
   repeated; compatible accepted edits merge; every accept/reject is logged so
   the harness lineage is auditable.

The initial harness is deliberately minimal (Terminal-Bench-2.0 default
prompt, DeepAgent default tools) with explicitly declared editable surfaces:
system prompt, a failure-recovery instruction, and a runtime control policy
(`max_recent_tool_errors`, `max_total_tool_messages`).

## Results

Held-out pass rates on Terminal-Bench-2.0: MiniMax M2.5 40.5% → 61.9%,
Qwen3.5-35B-A3B 23.8% → 38.1%, GLM-5 42.9% → 57.1% (up to +21.4pts / 138%
relative). Accepted edits were **model-specific**, not generic instructions
(e.g. a tool-error-triggered redirect prompt for Qwen's destructive retry
loops; a "write the artifact, read it back, stop" workflow nudge for
MiniMax's over-exploration).

## Stated limits

Bounded edits on a fixed benchmark; depends on verifier quality; the authors
explicitly warn that pass-rate non-regression is **not** a strong enough gate
for higher-stakes harness changes.

## What agent-kit takes from it

- The **promotion gate** template for harness changes (held-in/held-out
  non-regression) — the missing piece in agent-kit's audit family.
- The **failure-clustering signature** as the schema for mining hook logs and
  session evidence.
- The **declared editable surfaces** pattern — and its inverse: guard hooks,
  permission policies, and secret handling stay locked.
- Empirical backing for per-model overlays: optimal harnesses are
  model-specific.
