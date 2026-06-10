---
type: research
title: Papers registry — harness engineering and self-improving agents
date: 2026-06-10
last_updated: 2026-06-10
status: active
---

# Papers registry

One note per academic paper that informs agent-kit's harness-engineering
direction. Each note records the citation, a short mechanism summary, and —
the part that matters — **what agent-kit takes from it**. Cite papers in
research docs and blueprints by linking the registry note, not the raw arXiv
URL, so the "so what" travels with the citation.

PDFs are not committed; every note links its arXiv page (licenses vary —
e.g. Self-Harness is CC BY 4.0, SIA is CC BY-SA 4.0).

| Note | Paper | Year | Why it's here |
| --- | --- | --- | --- |
| [2026-self-harness.md](2026-self-harness.md) | Self-Harness: Harnesses That Improve Themselves | 2026 | The trigger paper: mine → propose → validate loop with a held-in/held-out promotion gate |
| [2026-meta-harness.md](2026-meta-harness.md) | Meta-Harness: End-to-End Optimization of Model Harnesses | 2026 | Outer-loop agentic search over harness code; trace-grounded proposals |
| [2026-continual-harness.md](2026-continual-harness.md) | Continual Harness: Online Adaptation for Self-Improving Foundation Agents | 2026 | Online (in-deployment) harness refinement; emergent self-improvement |
| [2026-sia.md](2026-sia.md) | SIA: Self Improving AI with Harness & Weight Updates | 2026 | Names the "harness-update school"; combines harness + weight updates; open source |
| [2026-hyperagents.md](2026-hyperagents.md) | Hyperagents | 2026 | Task agent + meta agent as one editable program; meta-level itself improvable |
| [2026-agentfactory.md](2026-agentfactory.md) | AgentFactory: A Self-Evolving Framework Through Executable Subagent Accumulation and Reuse | 2026 | Self-evolution by accumulating reusable executable subagents |
| [2026-terminal-bench.md](2026-terminal-bench.md) | Terminal-Bench: Benchmarking Agents on Hard, Realistic Tasks in CLIs | 2026 | The benchmark the harness-update school standardized on |
| [2025-darwin-godel-machine.md](2025-darwin-godel-machine.md) | Darwin Gödel Machine | 2025 | Archive-based open-ended self-modification with empirical validation |
| [2025-sica.md](2025-sica.md) | SICA: A Self-Improving Coding Agent | 2025 | Eliminates the meta-agent/target-agent split; agent edits its own codebase |
| [2024-swe-agent.md](2024-swe-agent.md) | SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering | 2024 | Historical anchor: established that the interface layer (ACI) drives agent performance |

## Maintenance

- Add a note when a paper changes a decision in this repo; don't archive
  papers "for completeness".
- Keep `read_status` honest: `read` (full text) vs `skimmed` (abstract +
  secondary sources).
- The standing discovery surface is the watchlist section of
  [2026-06-10-harness-engineering-landscape.md](../2026-06-10-harness-engineering-landscape.md).
