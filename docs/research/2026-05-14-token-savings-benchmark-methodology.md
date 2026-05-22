---
type: research
title: "Token-Savings Benchmark Methodology for Agent Session Memory"
subject: "Reproducible token-savings methodology aligned with agent-kit philosophy"
date: 2026-05-14
last_updated: '2026-05-14'
confidence: high
verdict: adopt
---

# Token-Savings Benchmark Methodology for Agent Session Memory

> Two-turn `--print` cannot measure session memory savings — the value lives
> across compaction boundaries. This report extracts the 2026 state-of-the-art
> methodology and translates it into an agent-kit-shaped Bun-native, scriptable,
> hash-pinned benchmark harness with 100% reproducible runs.

## TL;DR

- **Failed two-turn experiment was not a bad idea — it was the wrong scope.**
  Session memory's value materializes across compaction or across long sessions
  (50+ tool calls, 200K+ tokens), not in two-turn `--print` calls.
- **Industry standard benchmarks are LoCoMo (1,540 q × 35 sessions × 9K avg
  tokens), LongMemEval (500 q × 6 categories), and BEAM (1M/10M token scale).**
  Mem0's open-source eval harness ([github.com/mem0ai/memory-benchmarks](https://github.com/mem0ai/memory-benchmarks))
  is the reference implementation.
- **Reproducibility is non-negotiable in 2026.** The Hindsight Manifesto:
  *"the only credible benchmark result is one you can reproduce yourself."*
  Required primitives: seed=42, pinned tool versions, SHA-256 content addressing,
  open judge prompt, recorded transcripts.
- **Caveat (Hindsight 2026):** LoCoMo and LongMemEval are saturating against
  million-token models that just stuff context. For agent-kit's purpose
  (compaction-aware session memory in short-lived hooks), we need an
  agentic-pattern benchmark, not a chatbot-recall one.
- **Recommendation: ADOPT** a Bun-native harness shipped as `wp bench session-memory`
  with versioned scenarios, hash-pinned variants, and cost/recall/latency
  reporting per scenario × variant.

## What This Is

The previous two-turn `claude --print` experiment showed zero token savings
because: (1) session memory tools (`wp_session_search`, `ctx_search`) require
the agent to *decide* to call them, (2) Claude's prompt cache served the second
turn anyway, and (3) the value of session memory is recovering context across
compaction, which never fired in 2-turn synthetic runs.

This research identifies the SOTA methodology for measuring agent memory token
savings and translates it into a plan for a fully scripted, deterministic
harness aligned with agent-kit's philosophy.

## State of the Art (2026)

### Public benchmarks
- **[LoCoMo](https://snap-research.github.io/locomo/)**: 1,540 questions across
  5 categories. Each conversation: 300 turns, 9K tokens avg, up to 35 sessions.
  Designed for very-long-term conversational memory. Tasks: question answering,
  event summarization, multi-modal dialogue.
- **[LongMemEval](https://arxiv.org/pdf/2410.10813)**: 500 questions across 6
  categories: single-session user/assistant/preference recall, knowledge update,
  temporal reasoning, multi-session recall.
- **BEAM (1M / 10M)**: 700 questions × 35 conversations (1M); 200 questions ×
  10 conversations (10M). Tests retrieval at orders-of-magnitude-larger context.

### Token measurement format
Industry standard reports **mean tokens per retrieval call**.
Mem0 reports: 6,956 mean tokens per LoCoMo retrieval, 6,710 mean tokens per
BEAM-1M retrieval. Full-context baselines: 25,000–100,000+ tokens.
Recall metrics co-reported per question category.

### Reproducibility standards
From [MemoryAgentBench (ICLR 2026)](https://github.com/HUST-AI-HYZ/MemoryAgentBench):
- Pinned conda env: `python=3.10.16`
- Containerized environment (Dockerfile + conda env)
- Seed everything: `PYTHONHASHSEED=42`, judge model seed=42
- Hardware reported: GPU model, CUDA/cuDNN version
- Dataset releases include generation scripts with seeds

From [Hindsight's AMB Manifesto](https://hindsight.vectorize.io/blog/2026/03/23/agent-memory-benchmark):
- Judge prompt published verbatim
- Answer-generation prompt published verbatim
- Model versions pinned
- Harness decoupled from any specific memory backend
- "Anyone can plug in a different memory backend, run the same harness, get a
  comparable result"

### Critical 2026 caveat (Hindsight)
> "LoComo and LongMemEval are solid datasets… The problem is when they were
> designed. Both come from an era of 32k context windows. State-of-the-art
> models now have million-token context windows. On most LoComo and
> LongMemEval instances, a naive 'dump everything into context' approach scores
> competitively — not because it's a good memory architecture, but because
> retrieval has become the easy part."

For agent-kit specifically, we are not solving chatbot recall. We are solving
**short-lived hook process memory across compaction in long agentic sessions.**
The benchmark must reflect that workload.

## Positive Signals

### Mature, open-source eval harnesses
- [Mem0's eval framework](https://github.com/mem0ai/memory-benchmarks) is
  open-source and is the reference for the field. ECAI 2025 paper
  (arXiv:2504.19413) established the first reproducible head-to-head
  comparison of 10 memory approaches. **Credibility: high (academic peer
  review + open code).**
- [Hindsight's Agent Memory Benchmark (AMB)](https://github.com/vectorize-io/agent-memory-benchmark)
  is explicitly designed to be vendor-neutral and forkable. **Credibility: high.**
- [MemoryAgentBench](https://github.com/HUST-AI-HYZ/MemoryAgentBench) accepted
  at ICLR 2026 — designed for incremental multi-turn evaluation matching
  agent workloads, not chatbot QA. **Credibility: high.**

### Anthropic provides ground-truth measurement
- [Anthropic Usage and Cost API](https://platform.claude.com/docs/en/build-with-claude/usage-cost-api)
  exposes per-API-key token consumption with breakdowns by uncached input,
  cached input, cache creation, output. Filterable by API key and time bucket
  (1m / 1h / 1d). **This is the ground truth — `stream-json --output-format`
  per-call usage matches this for individual calls.**

### Per-call token usage is already accessible
- `claude --output-format stream-json` emits a `result` event with full
  `usage` block: `{input_tokens, output_tokens, cache_creation_input_tokens,
  cache_read_input_tokens}` plus `duration_ms`.
- Validated working in our 2026-05-14 baseline experiment.

### Determinism is achievable in 2026
- AgentMemory V4 (#1 on LongMemEval, 96.2%) is "single deterministic run with
  PYTHONHASHSEED=42 and judge seed=42 — fully reproducible, no ensembling, no
  oracle access."
- Cache Saver framework ([2025 ACL findings](https://aclanthology.org/2025.findings-emnlp.1402.pdf))
  provides deterministic request handling and consistent output ordering for
  reproducibility, with precise prompt-response mapping.

## Negative Signals / Risks

### LoCoMo/LongMemEval are saturating
- Hindsight explicitly calls out that million-token models (Claude Sonnet 4.5,
  GPT-4 Turbo, Gemini 1.5 Pro) score competitively by brute-force context
  stuffing on these benchmarks. A naive "dump everything in" beats clever
  memory architectures on most instances. **Direct quote, high credibility.**
- Both datasets were built for **chatbot conversation history**, not for
  **agentic tool-use workloads**. The agent-kit use case (developer assistant
  with PostToolUse capture) is structurally different.

### Benchmark numbers don't generalize across vendors
- One vendor's published 84% was independently corrected to 58% when methodology
  was standardized. (From [context compression research](https://medium.com/the-ai-forum/automatic-context-compression-in-llm-agents-why-agents-need-to-forget-and-how-to-help-them-do-it-43bff14c341d), 2026.)
- Vendors disagree on which LLM judge prompt to use → published numbers from
  different papers aren't directly comparable. The Hindsight Manifesto
  acknowledges this and pre-publishes everything.

### Prompt cache contaminates across runs
- Anthropic's prompt cache persists across calls and is keyed by the org/key,
  not the variant. Without per-variant API keys (or `cache_control: no-store`
  headers), cache hits leak between baseline and v1 runs.
- Per the existing benchmark plan (F8): the only clean fix is per-variant
  API keys. There is no "disable cache for this call" header in stable Claude
  Code as of 2026-05-14.

### Two-turn `--print` is the wrong unit
- Our 2026-05-14 experiment confirmed: agents do NOT call `wp_session_search`
  in fresh `--print` calls because (a) they don't know prior context exists
  unless told, and (b) Anthropic's prompt cache serves T2 from T1's residual
  cache. The savings need a longer session that triggers compaction.

## Community Sentiment

The Hindsight Manifesto captures the consensus:
> "We believe the only credible benchmark result is one you can reproduce
> yourself. AMB publishes everything: the evaluation harness, the exact
> methodology — how ingestion works, how recall is scored, how the LLM judge
> is prompted."

The convergent best practice across mem0, Letta, MemGPT, Hindsight, and
academic work (MemoryAgentBench): **publish the harness, pin the seeds, decouple
from any specific memory backend, allow forks with documented changes.**

The frustration is also visible. From [Mem0 2026 Token Optimization Playbook](https://mem0.ai/blog/the-2026-token-optimization-playbook-cut-ai-agent-memory-costs-3%E2%80%934x):
> "Vendors can't agree on which LLM judge prompt to use, so published numbers
> from different papers aren't comparable."

## Project Alignment

### Vision Fit
The agent-kit + webpresso vision is to ship reusable, open-source building
blocks (MIT/Apache) that work standalone in 3rd-party repos like ozby/ingest-lens.
A token-savings benchmark fits this directly: **it's a building block other
plugin authors can use to prove their plugin saves tokens.**

The current state of the agent-kit ecosystem:
- 3 worktrees (main/context-mode, v1/TS-FTS5, v2/Rust-ctx-rs)
- All ship as Claude Code plugins via `bun ${CLAUDE_PLUGIN_ROOT}/...`
- Existing harness at `/tmp/session-memory-benchmark/harness.js` measures
  raw SQLite ops only — not token savings

A token-savings harness shipped as `wp bench session-memory` aligns with the
ecosystem's existing CLI surface (`wp setup`, `wp blueprint`, `wp audit`,
`wp test`, `wp qa`).

### Tech Stack Fit
- **Bun-native**: Bun 1.3+ is the runtime for all hooks; the harness should be
  Bun TypeScript, not Node Python (avoids the conda dependency that
  MemoryAgentBench needs). Zero install cost.
- **No Docker**: agent-kit is local-first; the harness must run with `bun
  scripts/bench/token-savings.ts` and nothing else. Per CLAUDE.md
  "Cloudflare Workers + React Router" stack: no containers.
- **MIT-only deps**: minisearch (MIT), better-sqlite3 (MIT), node:sqlite
  (built-in). No GPL, no ELv2 (context-mode's license — algorithm-learnable
  but code-uncopyable).
- **Existing fixtures pattern**: ingest-lens uses fixtures for tests.
  Scenarios should be JSON files in `fixtures/scenarios/`.

### Trade-offs for Current Stage
- **Speed-to-credible-numbers vs perfect benchmark**: We don't need to invent
  a new benchmark. Use LoCoMo as the recall ground truth, but design our own
  agentic scenarios for the workload that matters.
- **Reproducibility ceiling**: We can hit AgentMemory V4-grade determinism
  (seed=42 everywhere) without inventing new infrastructure. Anthropic's API
  is non-deterministic at the model level (temperature > 0), but variance
  averages out across N=2 trials per cell (per existing benchmark plan F12).
- **Cost ceiling**: Existing benchmark plan caps at $50/run. Token-savings
  experiments fit inside that budget if scenarios are bounded (5–10 scenarios
  × 3 variants × 2 trials = 30–60 sessions, ~50K tokens each = ~$30 at
  Sonnet 4.5 rates).

## Recommendation

**ADOPT** a Bun-native, hash-pinned token-savings harness as a first-class
agent-kit deliverable. Specifically:

### Deliverable: `wp bench session-memory`

**Files to create:**
```
scripts/bench/token-savings.ts          — Orchestrator (Bun, MIT)
scripts/bench/scenarios/                — Versioned scenario definitions
  ├── debug-long-session.json           — 50+ tool calls, triggers compaction
  ├── multi-file-refactor.json          — Read 20 files, implement feature
  └── resumable-task.json               — Do task, restart, continue
scripts/bench/qrels/                    — LoCoMo-style ground truth
  └── debug-recall.json                 — Q/A pairs for the debug scenario
scripts/bench/lib/
  ├── usage-extractor.ts                — Parse stream-json usage events
  ├── transcript-recorder.ts            — Capture full conversation logs
  ├── variant-runner.ts                 — Run a scenario × variant pair
  ├── cost-aggregator.ts                — Compute effective cost
  └── manifest.ts                       — Pin tool versions + SHAs
scripts/bench/__tests__/
  ├── usage-extractor.test.ts           — Unit tests for parsing
  ├── cost-aggregator.test.ts           — Unit tests for cost math
  └── reproducibility.test.ts           — Run twice → identical output
docs/bench/session-memory-methodology.md — Full methodology doc
```

### Mandatory reproducibility primitives (non-negotiable)
1. **Pinned versions** captured into a manifest at run start:
   - `bun --version`, `claude --version`, `node --version`
   - Plugin commit SHAs (main, v1, v2)
   - Anthropic model alias + version (`claude-sonnet-4-5-20250929`)
   - SQLite version, better-sqlite3 version
2. **Seed everything**: `BENCH_SEED=42` for shuffles; deterministic event-id
   generation via SHA-256 of `(scenario_id, turn_idx, content)`.
3. **Per-variant API keys** to isolate prompt cache (per existing F8).
4. **Recorded transcripts**: every tool call, every model response saved to
   `runs/<run-id>/<variant>/<scenario>/transcript.jsonl` for replay.
5. **Cost extraction via Anthropic Usage API** (admin key) as cross-check
   against per-call `stream-json usage` (must agree within ±2%).
6. **Hash-pinned refuse-to-run**: harness aborts if `bun --version`,
   `claude --version`, or plugin SHAs differ from manifest pins.

### Test scenarios designed for compaction
1. **Debug scenario** (50+ tool calls, ~200K tokens):
   - Read 8 source files
   - Run failing tests
   - Search for similar past errors via session memory
   - Apply fix, re-run tests
   - Compaction fires mid-session → measure recall after restore
2. **Multi-file refactor** (~30 tool calls, ~150K tokens):
   - Audit 20 files
   - Identify pattern to refactor
   - Apply refactor across all 20 files
   - Run lint/typecheck
3. **Resumable task** (split into 2 sessions):
   - Session A: Start task, capture progress to session memory
   - Session B (separate `--print`): "Continue from where you left off" —
     this IS the agent-kit value prop

### Ship-shape requirements
- Single command: `bun scripts/bench/token-savings.ts --scenario debug --variant v1`
- All-variants mode: `bun scripts/bench/token-savings.ts --scenario all --all-variants`
- Output: `runs/<run-id>/report.md` with the comparison table
- Documentation: `docs/bench/README.md` with the 3-line "how to run" + the
  expected output format + the cost cap

### Test strategy (100% test coverage for the harness itself)
- Unit tests for `usage-extractor.ts`: parse fixture stream-json files
- Unit tests for `cost-aggregator.ts`: compute cost from known token counts
- Reproducibility test: run scenario twice with same seed → byte-identical
  output (modulo timestamps)
- Snapshot test: scenario JSON validates against zod schema
- Smoke test: `bun scripts/bench/token-savings.ts --dry-run` validates env
  without making API calls

### When this recommendation would change
- If Anthropic ships native `cache_control: no-store` for the API: the
  per-variant API key requirement is relaxed.
- If LoCoMo is fully replaced by an agentic-workload benchmark (Hindsight's
  AMB shows promise): switch the recall ground truth to that.
- If `claude --print` gains a `--no-cache` flag: simplifies isolation.

**Confidence: HIGH.** Methodology is well-established (mem0, Hindsight,
MemoryAgentBench all publish their harnesses). The only novel work is
adapting the public methodology to Bun + agent-kit's CLI surface, which is
~500 LOC of TypeScript.

## Sources

1. [MemoryAgentBench (ICLR 2026)](https://github.com/HUST-AI-HYZ/MemoryAgentBench) — official repo, high credibility, neutral methodology
2. [Mem0 Research (token-efficient algorithm)](https://mem0.ai/research) — vendor (medium-bias) but published methodology, high data density
3. [Mem0 ECAI 2025 paper (arXiv:2504.19413)](https://arxiv.org/abs/2504.19413) — academic peer review, high credibility
4. [LoCoMo benchmark](https://snap-research.github.io/locomo/) — academic, high credibility, neutral
5. [LongMemEval (arXiv:2410.10813)](https://arxiv.org/pdf/2410.10813) — academic, high credibility, neutral
6. [Hindsight Agent Memory Benchmark Manifesto](https://hindsight.vectorize.io/blog/2026/03/23/agent-memory-benchmark) — vendor (Vectorize) but explicit about reproducibility, high credibility
7. [Don't Break the Cache (arXiv:2601.06007)](https://arxiv.org/abs/2601.06007) — academic, high credibility, cautionary on cache
8. [Cache Saver framework (ACL 2025)](https://aclanthology.org/2025.findings-emnlp.1402.pdf) — academic, high credibility, deterministic primitives
9. [Anthropic Usage and Cost API](https://platform.claude.com/docs/en/build-with-claude/usage-cost-api) — official docs, high credibility, neutral
10. [Mem0 2026 Token Optimization Playbook](https://mem0.ai/blog/the-2026-token-optimization-playbook-cut-ai-agent-memory-costs-3%E2%80%934x) — vendor blog, medium credibility, methodology critique
11. [State of AI Agent Memory 2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026) — vendor blog, medium credibility, ecosystem overview
12. [Cloudflare Agent Memory](https://blog.cloudflare.com/introducing-agent-memory/) — vendor blog, medium credibility, content-addressed IDs reference
