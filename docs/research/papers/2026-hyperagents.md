---
type: research
title: "Hyperagents"
date: 2026-06-10
last_updated: 2026-06-10
status: active
arxiv_id: "2603.19461"
paper_url: https://arxiv.org/abs/2603.19461
authors:
  - "Jenny Zhang, Bingchen Zhao, Wannan Yang, Jakob Foerster, Jeff Clune, Minqi Jiang, Sam Devlin, Tatiana Shavrina"
year: 2026
read_status: skimmed
relevance: low
---

# Hyperagents

**Citation:** Zhang et al., arXiv:2603.19461 [cs.AI], submitted 2026-03-19.

## Mechanism

Existing self-improvement approaches rely on fixed, handcrafted meta-level
mechanisms, which bounds how fast a system can improve. Hyperagents integrate
a **task agent** (solves the target task) and a **meta agent** (modifies
itself and the task agent) into a **single editable program** — so the
meta-level itself is improvable, not just the task level. Because both
evaluation and self-modification are coding tasks, gains in coding ability
translate into gains in self-improvement ability (the paper notes this
alignment does not generally hold beyond coding domains).

## What agent-kit takes from it

- A boundary marker, not a design input: agent-kit's roadmap deliberately
  keeps the meta-level (the audit gates, the promotion rule, the locked
  surfaces) **fixed and human-owned**. Hyperagents is what the fully
  self-referential end of the spectrum looks like — useful for explaining
  _why_ agent-kit's locked-surface stance exists.
