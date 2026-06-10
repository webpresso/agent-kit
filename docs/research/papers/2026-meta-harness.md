---
type: research
title: "Meta-Harness: End-to-End Optimization of Model Harnesses"
date: 2026-06-10
last_updated: 2026-06-10
status: active
arxiv_id: "2603.28052"
paper_url: https://arxiv.org/abs/2603.28052
authors: Yoonho Lee, Roshen Nair, Qizheng Zhang, Kangwook Lee, Omar Khattab, Chelsea Finn (Stanford)
year: 2026
read_status: skimmed
relevance: high
---

# Meta-Harness: End-to-End Optimization of Model Harnesses

**Citation:** Lee et al., arXiv:2603.28052 [cs.AI], submitted 2026-03-30.

## Mechanism

Defines the harness as "the code that determines what information to store,
retrieve, and present to the model" and observes that hand-designed harnesses
are the bottleneck. Meta-Harness is an **outer-loop system that searches over
harness code**: an agentic proposer (a coding agent) has filesystem access to
the source code, scores, and execution traces of *all prior candidates*, reads
real failure patterns, forms hypotheses, rewrites the harness, and re-tests.
Existing text optimizers fail here because they "compress feedback too
aggressively" — the proposer needs raw traces, not summaries.

## Results (from abstract)

On online text classification, improves over a state-of-the-art context
management system by **7.7 points while using 4× fewer tokens**; gains on
retrieval-augmented math reasoning across held-out models. A companion
artifact (stanford-iris-lab/meta-harness-tbench2-artifact) reports 76.4% on
Terminal-Bench 2.0 with Claude Opus 4.6.

## Contrast with Self-Harness

Meta-Harness is an *external optimizer* (a strong coding agent rewrites the
harness of a target system); Self-Harness has the *same model* improve its own
harness under a bounded edit surface. Meta-Harness searches more aggressively;
Self-Harness is the safer, more auditable shape.

## What agent-kit takes from it

- Optimization needs **uncompressed evidence**: agent-kit's hook logs and QA
  outputs must be preserved in mineable form, not only as summary-first
  payloads.
- Harness changes are *code* changes — version them, diff them, gate them in
  CI like any other code (agent-kit already has the git/PR machinery for
  this; the gap is the behavioral score).
