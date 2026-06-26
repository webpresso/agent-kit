---
type: research
title: "AgentFactory: A Self-Evolving Framework Through Executable Subagent Accumulation and Reuse"
date: 2026-06-10
last_updated: 2026-06-10
status: active
arxiv_id: "2603.18000"
paper_url: https://arxiv.org/abs/2603.18000
authors:
  - "Zhang Zhang et al."
year: 2026
read_status: skimmed
relevance: low
---

# AgentFactory: A Self-Evolving Framework Through Executable Subagent Accumulation and Reuse

**Citation:** Zhang et al., arXiv:2603.18000 [cs.AI], submitted 2026-03-18.

## Mechanism

Self-evolution through **accumulating and reusing executable subagents**:
instead of rewriting one monolithic agent, the framework grows a library of
specialized, validated subagents and composes them for new tasks.

## What agent-kit takes from it

- The accumulation pattern rhymes with agent-kit's **catalog**: skills and
  rules are the accumulated, reusable units. The delta is that AgentFactory's
  units are _earned_ through task evidence, while catalog entries are
  human-authored — weakness mining is the bridge (evidence proposes catalog
  additions).
- Validation-before-reuse for each accumulated unit maps to the
  regression-gate blueprint: no catalog entry should be promoted on rationale
  alone.
