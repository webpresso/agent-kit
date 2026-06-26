---
type: research
title: "Continual Harness: Online Adaptation for Self-Improving Foundation Agents"
date: 2026-06-10
last_updated: 2026-06-10
status: active
arxiv_id: "2605.09998"
paper_url: https://arxiv.org/abs/2605.09998
authors:
  - "Seth Karten, Joel Zhang, Tersoo Upaa Jr, Ruirong Feng, Wenzhe Li, Chengshuai Shi, Chi Jin, Kiran Vodrahalli"
year: 2026
read_status: skimmed
relevance: medium
---

# Continual Harness: Online Adaptation for Self-Improving Foundation Agents

**Citation:** Karten et al., arXiv:2605.09998 [cs.LG], submitted 2026-05-11.

## Mechanism

Notes that coding harnesses (Claude Code, OpenHands) wrap foundation models
with tools, memory, and planning, but no equivalent exists for **embodied
agents'** long-horizon partial-observability decision-making. Reports the
Gemini Plays Pokemon (GPP) experiments: with iterative human-in-the-loop
harness refinement, GPP became the first AI system to complete Pokemon Blue,
Yellow Legacy (hard mode), and Crystal without a lost battle. In the hardest
stages, the agent itself began iterating on its strategy through long-context
memory — **emergent self-improvement** — motivating online (in-deployment)
harness adaptation rather than offline optimization rounds.

## Relevance caveat

The domain is embodied/game agents, not coding agents — adjacent rather than
direct prior art for agent-kit. It earns its registry slot for one idea:
harness refinement as a **continuous in-deployment process** rather than a
release-time event.

## What agent-kit takes from it

- The long-game framing for weakness mining: today a batch audit
  (`wp audit` style, run on demand), eventually a continuous signal collected
  across sessions.
- Human-in-the-loop refinement is a legitimate, publishable stage of the
  loop — agent-kit's "advisory first, gated automation later" sequencing
  matches how the strongest result in this paper was actually achieved.
