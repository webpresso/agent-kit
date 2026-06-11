---
type: research
title: Harness engineering landscape — June 2026 research synthesis
date: 2026-06-10
last_updated: 2026-06-10
related_blueprints:
  - 2026-06-10-self-improving-harness-roadmap
  - 2026-06-10-harness-surface-manifest
  - 2026-06-10-weakness-mining-audit
  - 2026-06-10-harness-regression-gate
  - 2026-06-10-per-model-harness-overlays
status: active
recommendation: adopt-harness-vocabulary-and-file-gated-loop-roadmap
---

# Harness engineering landscape — June 2026

## TL;DR

"Harness engineering" became a named discipline over 2025–2026, with its own
survey, three competing awesome-lists, a weekly-scored ranked list, and an
active research school ("harness-update school") automating what used to be
hand-tuned scaffolding. The headline result repeats across independent
groups: **harness changes alone move benchmark pass rates by 15–40+ points on
a fixed model**, often more than a model upgrade. Agent-kit is a harness
product that predates the vocabulary — it ships the surfaces (rules, hooks,
skills, routing, presets) and the enforcement (audits) but none of the
optimization loop (mining, gating, adaptation). This doc fixes the
vocabulary, records the landscape, and anchors the
[self-improving-harness roadmap](../../blueprints/planned/2026-06-10-self-improving-harness-roadmap.md).

## Definition and mapping to agent-kit

A **harness** is the system layer that situates a model and mediates its
interaction with the environment: system prompts, tools, runtime mechanisms,
verification rules, permission policies, failure-recovery procedures
([Self-Harness](papers/2026-self-harness.md)); equivalently "the code that
determines what information to store, retrieve, and present to the model"
([Meta-Harness](papers/2026-meta-harness.md)). The lineage runs from
[SWE-agent's ACI thesis (2024)](papers/2024-swe-agent.md) — interface design
matters as much as the model — to 2026's automated harness optimization.

| Paper-harness component | Agent-kit equivalent |
| --- | --- |
| System prompt / instructions | `catalog/agent/rules/*.md`, AGENTS.md template, routing blocks |
| Failure-recovery instruction | Rules like `no-timeout-as-fix.md` (each born from a real post-mortem) |
| Runtime control policy (tool-error caps, message budgets) | Hook config and thresholds (`pretool-guard`, `post-tool`, `stop`) |
| Tool design / ACI | Summary-first `wp_*` MCP tools, `wp err` compact wrappers |
| Verifier | `wp audit <kind>`, `wp qa`, blueprint verification gates |
| Permission policy | Guard hooks, `guard.scriptRoutes`, deny wording |
| Memory/state | Session stores, blueprint/tech-debt lifecycles |

Agent-kit's distinctive angle: every paper above optimizes a harness for **one
agent on one benchmark**; agent-kit ships and governs harnesses for **many
repos across many CLIs** (tiered per
[`supported-agent-clis`](../../catalog/agent/rules/supported-agent-clis.md)).
The fleet angle is the moat; the missing piece is the loop.

## The harness-update school — paper summaries

Full notes with citations live in the [papers registry](papers/README.md).

| Paper | Mechanism | Headline result | What agent-kit takes |
| --- | --- | --- | --- |
| [Self-Harness](papers/2026-self-harness.md) | Same model mines its own failures, proposes bounded edits, validates with held-in/held-out gate | +21.4pts / up to 138% rel. on Terminal-Bench-2.0 across 3 model families; edits are model-specific | Promotion gate, failure-cluster signature, declared editable surfaces |
| [Meta-Harness](papers/2026-meta-harness.md) | External coding agent searches harness code with full trace/score history | +7.7pts with 4× fewer tokens (online text classification); 76.4% TB-2 artifact | Preserve uncompressed evidence; treat harness changes as gated code |
| [Continual Harness](papers/2026-continual-harness.md) | Online in-deployment harness refinement (embodied/games domain) | First AI to finish Pokemon Blue/Yellow-hard/Crystal without a lost battle | Mining as continuous signal, eventually; human-in-the-loop is a valid stage |
| [SIA](papers/2026-sia.md) | Unifies harness updates + weight updates; open source (MIT) | 56.6% LawBench gain a.o. | The "harness-update school" vocabulary; weight updates stay out of scope |
| [DGM](papers/2025-darwin-godel-machine.md) | Archive-based self-modification, empirically validated | SWE-bench 20.0%→50.0% | Keep rejected candidates logged (lore `Rejected:` trailers already do) |
| [SICA](papers/2025-sica.md) | One agent edits its own codebase (no meta/target split) | Self-bootstrapped tooling gains | Minimal-base + bootstrap matches "calm defaults" |
| [Hyperagents](papers/2026-hyperagents.md) | Task + meta agent as one editable program | Meta-level itself improvable | Boundary marker: agent-kit keeps the meta-level human-owned |
| [AgentFactory](papers/2026-agentfactory.md) | Self-evolution via accumulated executable subagents | — | Catalog entries should be earned via evidence, validated before reuse |
| [Terminal-Bench](papers/2026-terminal-bench.md) | The school's standard benchmark + Harbor eval/RL runner | — | Split/environment controls for our gate; reference consumers stay our benchmark |

Practitioner side: "harness engineering" is a hiring-page topic
(e.g. [Superagentic's overview](https://shashikantjagtap.net/harness-engineering-why-its-suddenly-the-hottest-topic-in-ai-agent-engineering/),
with its own SuperOpt "agentic environment optimization" research line), and
an [Agent Harness Engineering survey](https://picrew.github.io/LLM-Harness/)
exists.

## Repo / product table

Competitor-grade analysis (compulsory capabilities, better/worse scorecard)
lives in
[2026-06-10-harness-competitor-analysis.md](2026-06-10-harness-competitor-analysis.md).
This table is the raw inventory.

| Project | URL | Category | Relevance to agent-kit | License |
| --- | --- | --- | --- | --- |
| auto-harness | github.com/neosigmaai/auto-harness | Self-improving loop (BYO agent; mine failures, optimize harness, gate regressions; TB-2.0/tau-bench via Harbor/Docker) | **High — closest existing product to our roadmap**; study its `PROGRAM.md` directive pattern and gate design | OSS (check repo) |
| AHE | github.com/china-qijizhifeng/agentic-harness-engineering | Self-improving loop ("observability-driven automatic evolution"; 84.7%±2.1 pass@1 TB-2 w/ GPT-5.5; GPT-5.4 69.7→77.0 over 10 iters; frozen harness transfers to SWE-bench-Verified) | High — proof that mined harnesses transfer across benchmarks | OSS (check repo) |
| SIA | github.com/hexo-ai/sia | Self-improving loop (harness + weights) | Medium — reference implementation; weights out of scope | MIT |
| SICA | github.com/MaximeRobeyns/self_improving_coding_agent | Self-improving coding agent | Medium — oversight/eventbus instrumentation patterns | OSS (check repo) |
| Meta-Harness artifact | github.com/stanford-iris-lab/meta-harness-tbench2-artifact | Optimized-harness artifact (76.4% TB-2, Claude Opus 4.6) | Medium — what an optimized harness for a Tier 1 CLI's model looks like | research artifact |
| Harbor | github.com/harbor-framework/harbor | Eval/RL-environment framework | Medium — architecture reference if our gate needs sandboxed scale | OSS |
| Terminal-Bench (+ TB-2) | github.com/harbor-framework/terminal-bench | Benchmark | Medium — split/env controls | OSS |
| OpenHands benchmarks | github.com/OpenHands/benchmarks | Eval harness for OpenHands V1 | Low — eval-pipeline prior art only; OpenHands is Tier 3 (not supported) per the supported-CLI rule | OSS |
| rulesync | github.com/dyoshikawa/rulesync | Config emission substrate (17+ runtimes) | Already integrated — `wp compile` wraps it; see [positioning guide](../positioning-vs-rulesync.md) | MIT |

## Industry watchlist & cadence

Standing watch surfaces (all verified live 2026-06-10):

- **github.com/RyanAlberts/best-of-Agent-Harnesses** — 100+ harnesses,
  `projects.yaml`-driven, scored weekly. The single best pulse-check.
- **github.com/ai-boost/awesome-harness-engineering** — taxonomy of the
  discipline (agent loop, planning, context delivery, tool design, skills &
  MCP, permissions, memory, orchestration, verification & CI, observability,
  debugging/DX, human-in-the-loop, security/sandbox, evals). Used as the
  compulsory-capabilities checklist in the competitor doc.
- **github.com/Picrew/awesome-agent-harness** (+ survey at
  picrew.github.io/LLM-Harness) and
  **github.com/walkinglabs/awesome-harness-engineering** — secondary lists.
- **github.com/YennNing/Awesome-Code-as-Agent-Harness-Papers** — paper feed.

**Cadence:** monthly review; append a dated `### Watch note — YYYY-MM-DD`
subsection below with deltas (new entrants, tier-relevant CLI changes, papers
worth a registry note). If a month produces no delta, append "no material
change" — silence is not evidence of watching.

### Watch note — 2026-06-10 (baseline)

Initial sweep; this document is the baseline. Next review due ~2026-07-10.

## Implications for agent-kit

1. **Adopt the vocabulary.** "Harness" is now the industry term for exactly
   what agent-kit ships. Terminology added to the workspace
   UBIQUITOUS_LANGUAGE (Harness, Harness surface, editable/locked surface,
   weakness mining, harness promotion gate, harness lineage, per-model
   overlay).
2. **The gap is the loop, not the surfaces.** Agent-kit has best-in-class
   enforcement (audits) and distribution (symlinker/tiers) but no behavioral
   feedback loop: hook logs are written and never mined; harness changes ship
   without a behavioral regression gate; one canonical `.agent/` serves all
   models despite model-specificity being the school's central finding.
3. **Sequence: manifest → mining → gate → overlays → (deferred) proposals.**
   Filed as one parent roadmap + four child blueprints (see frontmatter).
   Agent-proposed edits stay deferred until the gate exists; guard hooks,
   permission policies, and secret handling are locked surfaces permanently.
4. **Our benchmark is the reference consumers**, not Terminal-Bench: the
   question agent-kit must answer is "did this harness change make agents
   better at working in a 3rd-party repo", measured on ingest-lens and
   edge-matte suites.

## Fact-Check Summary

| Claim | Source | Verified |
| --- | --- | --- |
| Self-Harness gate rule, results (40.5→61.9 / 23.8→38.1 / 42.9→57.1), model-specific edits | arXiv 2606.09498 full text | ✅ 2026-06-10 |
| Meta-Harness +7.7pts, 4× fewer tokens; authors Stanford (Lee, Finn, Khattab et al.) | arXiv 2603.28052 abstract | ✅ 2026-06-10 |
| Meta-Harness TB-2 artifact 76.4% (Claude Opus 4.6) | github.com/stanford-iris-lab/meta-harness-tbench2-artifact repo description | ✅ 2026-06-10 (description only) |
| AHE 84.7%±2.1 pass@1 TB-2; 69.7→77.0 over 10 iters; SWE-bench transfer | repo description, china-qijizhifeng/agentic-harness-engineering | ✅ 2026-06-10 (description only) |
| auto-harness exists; BYO-agent mine/optimize/gate framing | github.com/neosigmaai/auto-harness repo description | ✅ 2026-06-10; its Tau3 0.56→0.78 figure is from secondary press — unverified |
| SIA MIT code, PyPI `sia-agent`; LawBench/kernel/RNA figures | hexo-ai/sia README | ✅ 2026-06-10 (README cites its own paper) |
| SICA is ICLR 2025 workshop work | repo citation block | ✅ 2026-06-10 |
| DGM SWE-bench 20.0→50.0 | sakana.ai/dgm project page | ⚠️ page summary; not re-derived |
| Continual Harness is embodied/games domain (GPP) | arXiv 2605.09998 abstract | ✅ 2026-06-10 |
| Watchlist repos live | direct fetch of all five | ✅ 2026-06-10 |
