---
type: research
title: Scientific session-memory benchmarks — evidence basis
date: 2026-06-19
last_updated: '2026-06-19'
status: active
confidence: high
related_blueprints:
  - 2026-06-19-revive-native-session-engine
---

# Scientific session-memory benchmarks — evidence basis

> **Scope notice:** This document is **external comparison material**. It
> collects references to third-party methodology and published external
> evidence that inform how webpresso session-memory measurements should be
> designed. It does NOT contain first-party webpresso performance numbers.
> No claim in this document constitutes a public webpresso result. See
> the **Conservative claim boundary** section for the policy that governs
> when a number may be published.

## Evidence basis overview

The webpresso session-memory system is being measured along several distinct
axes as part of the native session engine revival blueprint. A recurring
failure mode in agent-kit's earlier measurement attempts was conflating metric
classes — for example, reporting a byte-proxy reduction as if it were a
provider token-cost reduction, or treating a local `ctx_stats` snapshot as a
reproducible cross-environment benchmark.

The conservative claim boundary policy addresses this directly: **only
first-party result cards of the matching metric class count as public claims**.
A result card must record the metric class, measurement environment, CLI tier
(per `catalog/agent/rules/supported-agent-clis.md`), and the exact command
sequence used to reproduce it. Without those four fields, the number stays
internal.

This document records the external methodology and evidence sources that
inform the result-card design. It is the research substrate, not the result.

---

## External comparison material — not webpresso evidence

The following references are used to calibrate methodology, not to make
claims about webpresso's own performance.

### RTK (token-efficient shell proxy)

RTK is a byte-proxy layer that filters and condenses shell-tool output before
it reaches the model context. It operates at the raw byte level — it reduces
the volume of text injected into the context window, measured in bytes.

**Critical distinction:** byte-proxy savings are NOT provider token-cost
savings. A provider charges tokens based on how the provider's tokenizer
splits the text after any client-side filtering. A 60% byte reduction does not
imply a 60% token reduction; tokenizer efficiency varies by text content, and
provider prompt-caching further decouples byte volume from billed token cost
(see provider prompt-caching section below).

Reporting an RTK-derived byte reduction as a token saving conflates two
distinct metric classes. Webpresso measurements that involve RTK must report
both the raw byte delta and, separately, the provider-reported token delta
when one is available.

Similarly, **session compaction byte reduction is not provider token-cost
reduction**. Compaction reduces how many bytes are stored and re-injected in
subsequent turns; the provider still bills on the tokenized form of whatever
is injected, subject to caching rules.

### Context window utilization — internal diagnostic data

Local `ctx_stats` measurements (for example, an observation that roughly 55%
of retrieved session content is excluded from the active context window) are
**internal diagnostic data**. They describe a single run in a specific
environment with a specific model, session corpus, and retrieval configuration.

These measurements are not publishable claims because:

1. They are environment-specific. Context window size, retrieval threshold,
   and session index density all vary across deployments. A number measured
   on a developer workstation with a small session corpus does not transfer
   to a production run with a larger corpus and a different provider.
2. They are not reproducible across providers. Different providers expose
   different context-window limits and charge different token costs per
   position. A kept-out percentage measured against one provider's 200K window
   is not comparable to the same statistic against a 32K window.
3. They reflect a snapshot, not a stable distribution. Session content and
   relevance scoring shift as the session corpus grows. A single-session
   observation is not a benchmark; it is a data point.

Internal diagnostic data of this class belongs in run logs and developer
notes, not in published documentation or marketing material.

### MCP protocol and tool specification

The Model Context Protocol (MCP) defines a standard for exposing tools,
resources, and prompts to models via a provider-neutral interface. Relevance
to session indexing and search:

- Session index entries exposed as MCP resources allow agents to query the
  index without injecting raw index bytes into the context window. The
  retrieval result is returned as a structured tool response, which the
  provider may cache separately from the conversation history.
- MCP tool call overhead (round-trip latency, JSON serialization) must be
  measured separately from the semantic retrieval quality. A fast MCP tool
  call with poor recall is not equivalent to a slow call with perfect recall.
- The MCP spec's pagination contract (cursor-based, not offset-based) is
  load-bearing for session search over large corpora: measurements of recall
  quality must specify whether pagination was exercised, and at what depth.

Any session-memory benchmark that routes through MCP must report the MCP
round-trip latency separately from the model inference latency and the
retrieval recall score.

### Criterion benchmarking (Rust) — performance measurement methodology

Criterion is the de facto standard benchmarking harness for Rust. Its design
decisions are directly applicable to any native-backend performance measurement:

- **Warmup phase**: Criterion runs a configurable warmup period (default 3
  seconds) before collecting measurements. Cold-start numbers without warmup
  are not comparable to steady-state numbers with warmup. Webpresso native
  backend benchmarks must document whether they include warmup and, if so,
  the warmup duration.
- **Sample size and repetitions**: Criterion collects a configured number of
  samples (default 100) and reports the distribution (mean, median, standard
  deviation). Single-shot measurements are not benchmarks; they are
  observations. A result card must report the sample count.
- **Outlier rejection**: Criterion identifies and reports outliers but does
  not remove them by default — it flags them and lets the engineer decide.
  A result card must note whether outliers were present and how they were
  handled.
- **Regression detection**: Criterion compares against a stored baseline and
  reports a statistically significant regression if the new distribution is
  slower. This is the model for the native-speedup metric class: a speedup
  claim is only valid when measured against the same baseline, same
  environment, and same workload as the comparison.

The key methodological lesson: a benchmark without a specified environment,
sample count, warmup policy, and comparison baseline is a data point, not a
result.

### ACM artifact badging — scientific reproducibility concepts

ACM's artifact badging program defines three reproducibility levels:

- **Functional**: the artifact runs and produces output. This is the minimum
  bar — a session-memory benchmark that can be invoked and produces a number
  is functional, but not reproducible.
- **Reusable**: the artifact is documented well enough that an independent
  party can reuse it for a different workload. A reusable benchmark includes
  environment specifications, seed data, and command sequences.
- **Reproduced**: an independent group has run the artifact and obtained
  results within a stated tolerance of the original. This is the bar for a
  publishable performance claim.

Webpresso result cards aim for the reusable bar as a minimum: they must
include enough detail that a different engineer, on a different machine, can
run the same measurement and compare results. Claims that cannot meet the
functional bar remain internal.

### Google Benchmark / Criterion practices — warmup, repetitions, outlier rejection

Google Benchmark (C++) and Criterion (Rust) share the same core practices:

- **Steady-state measurement**: benchmark the hot path, not the initialization
  path, unless initialization time is the metric under measurement.
- **Repetition count**: report how many repetitions were used. More repetitions
  reduce variance but increase wall-clock measurement time. For session-memory
  operations, 50–100 repetitions over a representative corpus is a reasonable
  minimum; fewer than 10 repetitions produce noisy results.
- **Variance budgeting**: if the coefficient of variation (std / mean) exceeds
  roughly 5%, the measurement environment is not stable enough for a
  performance claim. Likely causes: background processes, thermal throttling,
  or non-deterministic I/O (disk cache state, network latency).
- **Environment pinning**: OS, runtime version, hardware class, and background
  load must be recorded. A benchmark on a 2024 M-series laptop is not
  comparable to the same benchmark on a 2022 Intel laptop without explicit
  normalization.

These practices apply directly to measuring the native session engine's
indexing latency, search latency, and throughput under realistic session
corpus sizes.

### Provider prompt-caching considerations

Provider prompt-caching (as offered by Anthropic, OpenAI, and others) changes
the relationship between injected bytes and billed tokens:

- A cache hit on a prompt prefix costs significantly less per token than a
  cache miss (the exact discount varies by provider and is subject to change).
- Session-memory systems that inject a large, stable context prefix (e.g., a
  summarized session index) benefit more from prompt-caching than systems that
  inject volatile, turn-specific content.
- **Byte savings do not directly reduce cache hit cost**: if a cached prefix
  is 10K tokens, the cache hit discount applies to those 10K tokens regardless
  of whether the source bytes were reduced by 30% or 60%.
- **Cache hit rate is a separate metric class** from byte volume and from token
  cost. A session-memory design that improves cache hit rate may reduce
  effective token cost even if raw byte volume is unchanged. These are
  independent measurements and must not be conflated.

Any result card that claims cost reduction from session-memory improvements
must separately attribute the reduction to: (a) byte volume reduction, (b)
cache hit rate improvement, or (c) query count reduction — and must specify
the provider and caching tier used during measurement.

---

## Metric class taxonomy

The following metric classes are distinct and require separate measurement
methodologies. Mixing them in a single claim, or using one as a proxy for
another, produces misleading results.

| Metric class | Definition | Unit | Measurement requires |
|---|---|---|---|
| `byte_proxy` | Bytes filtered or compacted before context injection | Bytes (raw delta) | Before/after byte count for the same content, same session |
| `provider_tokens_cost` | Tokens billed by the provider for a given turn | Tokens (provider-reported) | Provider API response with usage field; specify cache hit/miss |
| `recall` | Fraction of relevant session entries retrieved by the search | Recall@K (0.0–1.0) | Ground-truth relevance labels; specified K; test corpus |
| `hook_latency` | Wall-clock time for a hook execution round-trip | Milliseconds (p50/p95) | Warmup; sample count ≥ 50; stable environment |
| `native_speedup` | Ratio of native backend latency to baseline backend latency | Dimensionless ratio | Same workload, same environment, same sample count for both |
| `replacement_parity` | Whether native backend output is byte-equivalent to baseline | Pass/fail (diff output) | Byte-exact comparison on a fixed test corpus |
| `rtk_context_mode` | RTK's active filtering mode during a session | Enum (standard/compact/ultra) | RTK session log; not a performance metric |

**Why each class needs its own methodology:**

- `byte_proxy` is measured at the I/O layer before tokenization. It is fast
  to measure but does not predict provider cost.
- `provider_tokens_cost` is measured at the provider API layer after the turn
  completes. It is the authoritative cost metric but requires a live provider
  call and may be affected by caching, batching, and provider-side sampling.
- `recall` requires a labeled ground-truth corpus. It cannot be inferred from
  byte volume or token cost; a system that retrieves fewer bytes may have
  higher or lower recall depending on the quality of the retrieval index.
- `hook_latency` is a process-execution metric. It is independent of model
  inference and provider billing. Measuring it during a live model turn
  conflates hook time with network round-trip time.
- `native_speedup` is a relative metric: it is only defined relative to a
  stated baseline. A 3x speedup claim without specifying the baseline is
  not a claim.
- `replacement_parity` is a correctness gate, not a performance metric. It
  must pass before any performance metric is meaningful: a faster system that
  returns wrong results is not a speedup.
- `rtk_context_mode` is a configuration observation, not a performance
  measurement. It explains the conditions under which other metrics were
  collected; it is not itself a claim.

---

## Conservative claim boundary

**Policy:** No numeric performance claim ships in agent-kit documentation,
release notes, or public-facing material without a first-party result card of
the matching metric class.

A result card must contain:

1. **Metric class**: one of the seven classes defined above.
2. **Measurement environment**: OS, runtime version, hardware class (general
   category only — no absolute machine paths), and background load state.
3. **CLI tier**: per `catalog/agent/rules/supported-agent-clis.md`. A Tier 2
   CLI measurement is not directly comparable to a Tier 1 measurement.
4. **Command sequence**: the exact commands that produce the measurement,
   expressed as a reproducible script. The script must not depend on
   environment-specific absolute paths.
5. **Sample count and warmup policy**: for latency and throughput claims,
   state how many samples were collected and whether warmup was included.
6. **Baseline**: for ratio claims (speedup, reduction), state what was
   measured against.

A claim that cannot be backed by a result card of the matching class is an
internal observation. It belongs in a developer note, not a public document.

**Specifically excluded from public claims without result cards:**

- Any percentage reduction derived solely from byte counts (no token-cost
  result card).
- Any speedup ratio derived from a single-shot measurement (no sample count).
- Any recall figure derived from an unlabeled corpus (no ground-truth labels).
- Any cost comparison across providers without specifying cache hit rate and
  caching tier for each provider.
- Any measurement from a local diagnostic tool (such as `ctx_stats`) that
  has not been reproduced in a specified, documented environment.

This boundary is intentionally conservative. The cost of a false performance
claim — either in user trust or in engineering time spent chasing a number
that was never reproducible — exceeds the cost of shipping a claim later once
the result card exists.
