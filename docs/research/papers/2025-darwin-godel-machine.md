---
type: research
title: "Darwin Gödel Machine: AI that improves itself by rewriting its own code"
date: 2026-06-10
last_updated: 2026-06-10
status: active
arxiv_id: "2505.22954"
paper_url: https://arxiv.org/abs/2505.22954
page_url: https://sakana.ai/dgm/
authors:
  - "Jenny Zhang, Shengran Hu, Cong Lu, Robert Lange, Jeff Clune (Sakana AI / UBC)"
year: 2025
read_status: skimmed
relevance: medium
---

# Darwin Gödel Machine (DGM)

**Citation:** arXiv:2505.22954 (published ICLR 2026); project page
sakana.ai/dgm.

## Mechanism

A self-improving system that iteratively modifies its own code and
**empirically validates** changes on coding benchmarks — replacing the
original Gödel Machine's requirement of _provable_ self-improvement with
Darwinian evidence. Key design: a growing **archive of agents** (not a single
lineage), interleaving self-modification with downstream task evaluation, so
the search stays open-ended and can branch from any prior variant.

## Results (from project page; not independently re-verified)

SWE-bench performance improved from 20.0% to 50.0% through self-modification.

## What agent-kit takes from it

- **Archive over lineage**: rejected harness candidates are still information.
  Agent-kit's analogue is keeping rejected proposals logged (blueprint
  evidence + lore commits with `Rejected:` trailers), so future mining can
  revisit them — this costs nothing and is already protocol.
- Empirical validation over rationale — the same stance as Self-Harness's
  gate, predating it.
