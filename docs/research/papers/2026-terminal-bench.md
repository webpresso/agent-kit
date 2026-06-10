---
type: research
title: "Terminal-Bench: Benchmarking Agents on Hard, Realistic Tasks in Command Line Interfaces"
date: 2026-06-10
last_updated: 2026-06-10
status: active
arxiv_id: "2601.11868"
paper_url: https://arxiv.org/abs/2601.11868
repo_url: https://github.com/harbor-framework/terminal-bench
year: 2026
read_status: skimmed
relevance: medium
---

# Terminal-Bench: Benchmarking Agents on Hard, Realistic Tasks in CLIs

**Citation:** arXiv:2601.11868. Repos: harbor-framework/terminal-bench,
harbor-framework/terminal-bench-2; sibling framework harbor-framework/harbor
("a framework for running agent evaluations and creating and using RL
environments", harborframework.com).

## Why it's in the registry

Terminal-Bench 2.0 is the benchmark the entire harness-update school
standardized on in 2026: Self-Harness, Meta-Harness (76.4% artifact), AHE
(84.7% pass@1), and auto-harness all report against it. Harbor is the
generalized eval/RL-environment runner released alongside it.

## What agent-kit takes from it

- A held-out task suite needs **fresh environments per task and fixed split
  assignment across harness variants** — controls agent-kit's regression-gate
  blueprint inherits.
- agent-kit's gate intentionally does NOT adopt Terminal-Bench itself: the
  reference consumers (ingest-lens, edge-matte) are the benchmark, because
  the question is "does the harness work for a 3rd-party repo", not "does
  the model solve terminal puzzles". Harbor remains the architecture
  reference if the suite ever needs sandboxed execution at scale.
