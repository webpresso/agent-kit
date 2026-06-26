---
type: research
title: "SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering"
date: 2026-06-10
last_updated: 2026-06-10
status: active
arxiv_id: "2405.15793"
paper_url: https://arxiv.org/abs/2405.15793
authors:
  - "John Yang, Carlos E. Jimenez, Alexander Wettig, Kilian Lieret, Shunyu Yao, Karthik Narasimhan, Ofir Press (Princeton)"
year: 2024
read_status: skimmed
relevance: medium
---

# SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering

**Citation:** Yang et al., NeurIPS 2024; arXiv:2405.15793.

## Why it's the historical anchor

SWE-agent introduced the **Agent-Computer Interface (ACI)** thesis: the
interface through which an agent perceives and acts on a codebase matters as
much as the model. Carefully designed file viewers, edit commands with
guardrails, and feedback formatting produced large SWE-bench gains with the
same model. This is the founding observation of harness engineering — every
2026 harness-update paper (Self-Harness, Meta-Harness, AHE) is automating
what SWE-agent did by hand.

## What agent-kit takes from it

- Legitimacy for the whole product category: agent-kit's rules, hooks, and
  summary-first MCP tools _are_ ACI design. The 2024→2026 arc (hand-built ACI
  → automated ACI optimization) is the roadmap argument in one line.
