---
type: research
title: "Context-Mode Alternatives and a Webpresso-Specific Rust Rewrite: An Evaluation"
subject: "context-mode alternatives + custom Rust replacement for webpresso"
date: 2026-05-13
last_updated: 2026-05-13
confidence: high
verdict: assess
---

# Context-Mode Alternatives and a Webpresso-Specific Rust Rewrite

> **TL;DR — context-mode is not the wrong choice for its niche, but the niche has narrowed.** Anthropic's native Tool Search Tool, Cloudflare's Code Mode, and Atlassian's MCP Compressor each solve a clean slice of the same problem with fewer dependencies. A webpresso-targeted Rust rewrite would mostly reinvent the parts of context-mode that the prior architecture review at [`docs/research/2026-04-26-context-mode-plugin-architecture.md`](./2026-04-26-context-mode-plugin-architecture.md) **already decided agent-kit should not adopt** — its FTS5/SQLite indexing layer. Recommended path: do nothing structural; ride the Anthropic-native primitives, keep RTK for shell-output filtering, and let context-mode continue to own raw-Bash-output sandboxing for repos that need it.

## TL;DR

- **No single library "beats" context-mode end-to-end**, but its end-to-end framing increasingly overlaps with capabilities that Anthropic shipped natively in Jan 2026 (Tool Search Tool) — narrowing context-mode's unique value to "raw Bash output sandboxing + routing rules injection."
- **Best targeted alternatives:** Anthropic Tool Search (tool-def bloat, native, free), Cloudflare Code Mode (API-heavy use cases, 99.9% reduction), MCP Compressor (proxy-wrap existing MCPs, 70–99%), Engram (Go single binary for persistent memory).
- **Best Rust precedent that maps to webpresso's needs:** [meta_skill](https://github.com/Dicklesworthstone/meta_skill) (Rust + SQLite-FTS5 + Tantivy + RRF Fusion) — but its problem domain (skill management with hybrid lexical+semantic search) is **not** agent-kit's problem domain.
- **A webpresso-specific Rust rewrite is a "no" for the context-mode use case** because agent-kit's MCP tools already return structured `{passed: bool}` JSON — the summary is the output. The indexing layer is redundant by design.
- **A narrower Rust opportunity exists** but is unrelated to context-mode: small static-binary hook bins (`ak-pretool-guard`, etc.) and audit-engine perf for large repos. ROI is real but modest; not the highest-leverage work.

## What This Is

**context-mode** ([mksglu/context-mode](https://github.com/mksglu/context-mode)) is an MCP server + plugin that reduces Claude Code context consumption by ~98% on raw Bash output. It combines three mechanisms:

1. **PreToolUse routing** — rewrites `Bash(...)` calls into `ctx_execute(...)` calls so raw output goes to a SQLite/FTS5 sandbox instead of the context window.
2. **FTS5 indexing + BM25 search** — `ctx_search` lets the agent re-query indexed output by keyword later.
3. **SessionStart XML injection** — tells Claude the routing rules before the first turn.

Agent-kit already adopted patterns 1 and 3 (verified by the `ak_routing` block injected at session start in this very conversation) but **explicitly skipped pattern 2** per the [Apr 26 architecture review](./2026-04-26-context-mode-plugin-architecture.md). That decision is load-bearing for the rest of this analysis.

## State of the Art (2026)

Five clean primitives now exist for the "agent context window is too small" problem. Each addresses a different slice:

1. **Anthropic Tool Search Tool** (native, default-enabled Jan 2026): defers MCP tool definitions; loads 3–5 relevant tools (~3K tokens) per turn instead of all 50+ (~67K). 85% reduction on tool-definition bloat, 49→74% accuracy lift on Opus 4 MCP evals ([atcyrus.com](https://www.atcyrus.com/stories/mcp-tool-search-claude-code-context-pollution-guide), [Anthropic engineering](https://www.anthropic.com/engineering/advanced-tool-use)).
2. **Cloudflare Code Mode**: collapses entire MCP API surfaces into a `search()` + `execute()` pair backed by a V8 isolate that runs generated JS. 2,500 endpoints / 1.17M tokens → ~1K tokens (99.9%) ([blog.cloudflare.com/code-mode-mcp](https://blog.cloudflare.com/code-mode-mcp/)).
3. **MCP Compressor** ([atlassian-labs](https://github.com/atlassian-labs/mcp-compressor)): proxy server that wraps existing MCPs and compresses tool descriptions; 70–99% reduction with `low`/`medium`/`high`/`max` modes, plus a `just-bash` mode that exposes all backend tools through one sandboxed shell.
4. **Subagent isolation**: each subagent gets its own 200K window; only the final summary returns to the parent. The recommended pattern for "exploration that would otherwise pollute the main thread" ([code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents)).
5. **context-mode** ([mksglu/context-mode](https://github.com/mksglu/context-mode)): the only one of the five that focuses on **raw shell-tool output** rather than tool-definition bloat. Claims 98% reduction; battle-tested on 15 platforms with 66K+ developers.

Below these primitives sit narrower specialized layers: **Claude Context** ([zilliztech](https://github.com/zilliztech/claude-context)) for semantic codebase search via vector embeddings (~40% reduction), **Engram** ([Gentleman-Programming](https://github.com/Gentleman-Programming/engram)) for persistent agent memory as a Go single binary with SQLite+FTS5, **Memsearch** for decision/preference recall, and **Caveman** ([JuliusBrussee](https://github.com/juliusbrussee/caveman)) for discursive-text compression (real-world 4–10% savings despite 65% headline).

## Positive Signals

### Anthropic-native primitives have closed the biggest gap

- **Tool Search Tool replaces the tool-definition half of context-mode's value prop**. It is default-on, free, native, and 85% effective; pairs cleanly with skill-driven on-demand tool loading ([anthropics/claude-code#41068](https://github.com/anthropics/claude-code/issues/41068)). For a 7-MCP-server setup, internal measurements show 51K→8.5K tokens, 46.9% net reduction ([Medium / Joe Njenga](https://medium.com/@joe.njenga/claude-code-just-cut-mcp-context-bloat-by-46-9-51k-tokens-down-to-8-5k-with-new-tool-search-ddf9e905f734)).
- **Subagent isolation** is now the recommended pattern for delegated exploration; it makes "burn a 200K window on grep results then return one bullet" a first-class operation ([developersdigest.tech](https://www.developersdigest.tech/blog/claude-code-agent-teams-subagents-2026)).

### context-mode's routing mechanism is genuinely novel

- The `updatedInput` + `permissionDecision: "allow"` combo in its PreToolUse hook is architecturally clean: Claude doesn't see an error, no permission prompt, the call just executes in the sandbox. No other library in the survey does exactly this for raw Bash output.
- The SessionStart XML injection pattern is the right surface for routing instructions and has been adopted by agent-kit and other plugins (visible in this very session's `<ak_routing>` block).

### Targeted alternatives package the same idea with fewer dependencies

- **Engram** ships as a single Go binary, zero install dependencies, agent-agnostic (Claude / OpenCode / Gemini CLI / Codex / VS Code / Cursor / Windsurf). It bypasses context-mode's `better-sqlite3` Node build chain entirely. Different problem framing (persistent memory rather than output sandboxing) but the underlying mechanic (SQLite+FTS5 over agent-owned content) is identical.
- **MCP Compressor's `just-bash` mode** is structurally similar to context-mode's `ctx_execute` — single shell entry point that funnels output through a compression/indexing layer.

### Rust + FTS5 + Tantivy is a proven combination

- **Tantivy** ([quickwit-oss](https://github.com/quickwit-oss/tantivy)) is roughly 2× faster than Lucene for typical search workloads ([turso.tech](https://turso.tech/blog/beyond-fts5)) and is the search engine inside Turso's native FTS.
- **meta_skill** ([Dicklesworthstone](https://github.com/Dicklesworthstone/meta_skill)) demonstrates the exact stack — Rust + SQLite/FTS5 + Tantivy + RRF Fusion — running as an MCP server with hybrid BM25-and-hash-embedding ranking. Hash embeddings (FNV-1a, 384d) avoid model dependencies entirely. Single binary, no Python build step, no Windows nvm4w issues.
- **rmcp** (the official Rust MCP SDK) crossed 4.7M downloads on crates.io; demonstrated 4.3MB stripped single-binary footprint in production examples ([systemprompt.io](https://systemprompt.io/guides/build-mcp-server-rust)).

## Negative Signals

### Anthropic native primitives narrow context-mode's unique value

- After Tool Search Tool (Jan 2026), context-mode's value collapses to "raw Bash output sandboxing + routing-rules injection." That's still useful, but it's a fraction of what the headline "98% reduction" implies. For users whose MCP tools already return structured output (agent-kit's entire surface), the remaining value approaches zero.
- The prior agent-kit architecture review concluded explicitly: *"FTS5/SQLite session DB — agent-kit's structured `{passed: bool}` JSON is already the summary; no need to index raw output."* That conclusion remains correct.

### context-mode's distribution chain is the largest source of complexity

- **`better-sqlite3` is a native module** with a build chain involving Python + `node-gyp` if prebuilt binaries are missing. Postinstall has needed Windows-specific `nvm4w` junction fixes ([mksglu/context-mode#15](https://github.com/mksglu/context-mode/issues/15)).
- **PreToolUse contains a ~60-line self-heal block** that detects stale plugin-cache directories and patches the Claude Code plugin registry. The prior architecture review called this *"fragile and indicates the plugin-cache model is not well-designed from the Claude Code side."*
- **Adapter coverage is incomplete**: the Cursor adapter registers 3 of ~20 native Cursor v1.7 hook events ([context-mode#485](https://github.com/mksglu/context-mode/issues/485)).

### Bus factor and governance

- context-mode is effectively a solo project (Mert Köseoğlu). The maintainer himself notes: *"I built it, maintain it, write the docs, fix the bugs, and try to tell people about it"* ([@mksglu / X](https://x.com/mksglu)). The project is actively recruiting DevRel and growth help.
- For dependency-graph reasoning: a webpresso public package can absorb a solo-maintained MCP plugin into its install instructions, but cannot **own** it. If context-mode stops shipping, the routing pattern is recoverable (it's ~100 lines of TS in the PreToolUse hook); the FTS5 indexing layer is not.

### Routing has false-positive risk

- The PreToolUse hook in context-mode is parallel with other hooks; per [Anthropic's docs](https://code.claude.com/docs/en/agent-sdk/hooks), *"when multiple PreToolUse hooks return `updatedInput`, the last one to finish wins, and since hooks run in parallel, the order is non-deterministic."* This is an active footgun if context-mode and RTK both modify `Bash` input, or if context-mode and `ak-pretool-guard` collide. The current webpresso CLAUDE.md already routes around this (lane 1 / lane 2 / lane 3 / lane 4 ownership model), but that routing is an in-repo convention, not a guarantee.

### "98% reduction" doesn't apply to repos with structured-output tools

- The 98% number ([context-mode README](https://github.com/mksglu/context-mode)) is measured on raw shell output (315 KB → 5.4 KB). Agent-kit's MCP tools (`ak_test`, `ak_lint`, `ak_qa`, `ak_audit`) return ≤2 KB JSON summaries by design. The savings ceiling on already-structured output is ≤2 KB → ≤2 KB.

## Community Sentiment

- **Anthropic engineering team**, on the tool-search release: positions Tool Search as the canonical solution to "MCP context pollution," default-on, with measurable accuracy lifts ([Anthropic / advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)).
- **context-mode users**: positive on the core idea; pain points are install/Windows ([#15](https://github.com/mksglu/context-mode/issues/15)), conflicts with concurrent hooks (RTK question on [#146](https://github.com/mksglu/context-mode/issues/146)), and skill-loader collisions ([#447](https://github.com/mksglu/context-mode/issues/447)).
- **Skeptical voices** (Morph LLM, Towards Data Science): the dominant 2026 view is that *"intelligence is not the bottleneck, context is"* and that **context cleanliness** matters more than total context capacity ([Morph LLM / context-engineering](https://www.morphllm.com/context-engineering), [MachineLearningMastery](https://machinelearningmastery.com/effective-context-engineering-for-ai-agents-a-developers-guide/)). The implication: a small repo with disciplined tooling beats a big repo with aggressive compression.
- **Caveman benchmark** ([dev.to / Onsen](https://dev.to/onsen/caveman-claude-the-token-cutting-skill-thats-changing-ai-workflows-4hmc)): real-world savings of 4–10% per session vs. headline 65–75%. Worth remembering when reading context-mode's 98%.

## Project Alignment

### Vision Fit

Agent-kit's stated non-goals (from [`webpresso/agent-kit/README.md`](../../README.md)) include *"running AI agents themselves"* and *"application or runtime code — agent-kit is dev-time scaffolding only."* That bounds the question hard: context-mode is dev-time scaffolding for context reduction; webpresso can recommend it and ride its routing pattern (already done in the SessionStart block), but **owning a context-management library is not on the roadmap.**

The Lane 1–4 ownership model in [`catalog/agent/rules/gstack-routing.md`](../../catalog/agent/rules/gstack-routing.md) makes this explicit: agent-kit owns `ak_*` dev-workflow routing; context-mode owns `ctx_*`; rtk owns shell-tool output filtering; gstack owns interactive/browser workflows. **Building a webpresso-owned context-reduction library would create a fifth lane that overlaps with existing ones.** That's the wrong shape.

### Tech Stack Fit

- Webpresso already ships **two** dev-time runtimes: Bun-distributed Node CLIs (`wp`, `ak`) and **Rust binaries via RTK** ([`/Users/ozby/.claude/RTK.md`](../../../../.claude/RTK.md) on the workspace). Adding a third runtime for a context-reduction layer raises the install matrix without unblocking a wedge.
- The build-side fit for a Rust addition is acceptable (rmcp is mature, single-binary distribution via `cargo-dist` is well-trodden). The fit problem is product, not engineering.

### Trade-offs for Current Stage

Per the workspace's [`blueprint-scoping.md`](../../catalog/agent/rules/blueprint-scoping.md) rule, any new infrastructure work needs a product-wedge anchor — a roadmap stage outcome that consumes the capability in the same cycle. A Rust context-mode replacement has no such anchor:

- **Stage outcome:** none in the current roadmap names "agent context reduction" as a deliverable.
- **Consuming surface:** none of `ak`, `wp`, blueprint runtime, audits, or any consumer-facing route would change.
- **New user-visible capability:** none. Users would still type `ak test`, `ak audit`, and so on; the output would be identical.

By the rule's own framing, *"if you cannot fill all three, the blueprint is premature."*

## Recommendation

**Verdict: assess.** Context-mode is **fine for its niche** and **already adopted at the routing-pattern level** by agent-kit. The narrowing of its unique value (post Tool Search Tool) does not justify replacing it; the lack of a product-wedge anchor does not justify building a webpresso-specific replacement.

### Concrete actions

1. **Leave context-mode in place** as a recommend-install plugin for consumer repos. Its routing pattern is the right abstraction and the FTS5 sandbox is genuinely useful for repos with heavy raw-Bash workflows (e.g. monorepo's `just dev` PM2 logs).
2. **Ride the Anthropic-native primitives** explicitly. The current SessionStart block in agent-kit already does this implicitly; consider documenting it in [`docs/architecture.md`](../architecture.md) as a hard expectation: *"Tool definitions are deferred via Anthropic Tool Search; agent-kit assumes this and does not duplicate it."*
3. **Do not build a Rust context-mode replacement.** It would inherit the architectural mismatch that the prior research already identified: agent-kit's structured outputs make indexing redundant.
4. **Track a narrower Rust opportunity, if any** — `ak-pretool-guard` startup speed or large-repo audit-engine perf. Each is a measured wedge with a consuming surface (hook latency, audit wall-time on monorepo). File a fact-check doc under `blueprints/draft/` if and when those latencies become a measurable complaint. **Today they are not.**
5. **Adopt MCP Compressor** if and only if webpresso starts wrapping a high-tool-count external MCP server in the consumer install path. The `just-bash` mode is the most interesting variant for agent-kit's existing routing model.

### Conditions under which this recommendation would change

- **Adopt-Rust-rewrite path opens** if (a) agent-kit's MCP tools shift from returning structured summaries to returning streaming logs (e.g. `ak dev` style live console output) **and** (b) ingest-lens or another consumer files a blueprint that names "live-log search across the last N sessions" as a roadmap outcome with a consuming surface.
- **Drop-context-mode path opens** if Anthropic ships a native raw-Bash output sandbox primitive (none announced as of May 2026) or if context-mode's solo-maintainer status changes meaningfully (project archived, license shift).

## Sources

1. [mksglu/context-mode](https://github.com/mksglu/context-mode) — official repo. Type: source/docs. Credibility: high (primary). Sentiment: neutral.
2. [context-mode.com](https://context-mode.com/) — marketing site. Type: vendor. Credibility: medium (vendor bias). Sentiment: positive.
3. [docs/research/2026-04-26-context-mode-plugin-architecture.md](./2026-04-26-context-mode-plugin-architecture.md) — prior agent-kit review of context-mode patterns. Type: in-repo research. Credibility: high. Sentiment: mixed (adopted routing, rejected indexing).
4. [Anthropic — Tool search tool docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool) — official tool-search reference. Type: official docs. Credibility: high. Sentiment: positive on the feature.
5. [Anthropic — Advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use) — engineering writeup with measured accuracy lifts. Type: official engineering blog. Credibility: high. Sentiment: positive.
6. [atcyrus.com — MCP Tool Search](https://www.atcyrus.com/stories/mcp-tool-search-claude-code-context-pollution-guide) — independent walkthrough of Tool Search mechanics. Type: independent practitioner. Credibility: medium-high. Sentiment: positive.
7. [Cloudflare — Code Mode MCP](https://blog.cloudflare.com/code-mode-mcp/) — Code Mode launch post. Type: vendor blog (technical). Credibility: medium-high (vendor; technically detailed). Sentiment: positive.
8. [atlassian-labs/mcp-compressor](https://github.com/atlassian-labs/mcp-compressor) — proxy MCP compressor; primary source for compression levels and `just-bash` mode. Type: source/docs. Credibility: high. Sentiment: neutral.
9. [Gentleman-Programming/engram](https://github.com/Gentleman-Programming/engram) — Go single-binary persistent-memory MCP server with SQLite+FTS5. Type: source/docs. Credibility: high. Sentiment: positive on simplicity.
10. [zilliztech/claude-context](https://github.com/zilliztech/claude-context) — semantic-search MCP backed by vector DB. Type: source/docs. Credibility: high. Sentiment: positive on the semantic-search angle, vendor framing.
11. [Dicklesworthstone/meta_skill](https://github.com/Dicklesworthstone/meta_skill) — Rust + SQLite/FTS5 + Tantivy + hash-embeddings reference architecture. Type: source/docs. Credibility: high. Sentiment: positive on the Rust stack.
12. [quickwit-oss/tantivy](https://github.com/quickwit-oss/tantivy) — Rust full-text search library. Type: source/docs. Credibility: high. Sentiment: neutral.
13. [modelcontextprotocol/rust-sdk (rmcp)](https://github.com/modelcontextprotocol/rust-sdk) — official Rust MCP SDK. Type: source/docs. Credibility: high. Sentiment: neutral.
14. [systemprompt.io — Build an MCP server in Rust with rmcp and Claude Code](https://systemprompt.io/guides/build-mcp-server-rust) — practitioner guide; cites 4.3 MB stripped single-binary example. Type: independent technical blog. Credibility: medium-high. Sentiment: positive on Rust.
15. [Morph LLM — Context engineering](https://www.morphllm.com/context-engineering) — argues "more tokens makes agents worse." Type: vendor blog (technical). Credibility: medium. Sentiment: mild critical of large-context approaches.
16. [MachineLearningMastery — Effective Context Engineering](https://machinelearningmastery.com/effective-context-engineering-for-ai-agents-a-developers-guide/) — 2026 practitioner-facing guide. Type: independent practitioner. Credibility: medium-high. Sentiment: neutral / positive on context engineering.
17. [GitHub Blog — Improving token efficiency in agentic workflows](https://github.blog/ai-and-ml/github-copilot/improving-token-efficiency-in-github-agentic-workflows/) — measured 8–12 KB per-call savings from disabling unused MCP tools. Type: vendor blog (technical). Credibility: high. Sentiment: positive on pruning.
18. [Anthropic — 2026 Agentic Coding Trends Report](https://resources.anthropic.com/hubfs/2026%20Agentic%20Coding%20Trends%20Report.pdf) — industry report on agentic coding patterns. Type: vendor report. Credibility: medium-high. Sentiment: neutral.
19. [JuliusBrussee/caveman](https://github.com/juliusbrussee/caveman) — discursive-text compression skill. Type: source/docs. Credibility: medium. Sentiment: mildly positive; benchmark caveat applies.
20. [dev.to / Onsen — Caveman Claude](https://dev.to/onsen/caveman-claude-the-token-cutting-skill-thats-changing-ai-workflows-4hmc) — independent benchmark showing 4–10% real-session savings vs. 65% headline. Type: independent practitioner. Credibility: medium-high. Sentiment: mixed.
21. [Joe Njenga / Medium — Tool Search 46.9% reduction](https://medium.com/@joe.njenga/claude-code-just-cut-mcp-context-bloat-by-46-9-51k-tokens-down-to-8-5k-with-new-tool-search-ddf9e905f734) — independent measurement, 51K→8.5K tokens. Type: independent practitioner. Credibility: medium. Sentiment: positive.
22. [code.claude.com — Hooks guide](https://code.claude.com/docs/en/hooks-guide) — official hook semantics, including parallel-hook ordering. Type: official docs. Credibility: high. Sentiment: neutral.
23. [code.claude.com — Sub-agents](https://code.claude.com/docs/en/sub-agents) — official subagent reference. Type: official docs. Credibility: high. Sentiment: neutral.
24. [turso.tech — Beyond FTS5](https://turso.tech/blog/beyond-fts5) — context for Tantivy vs. FTS5 vs. Lucene. Type: vendor blog (technical). Credibility: medium-high. Sentiment: positive on Tantivy.
25. [mksglu/context-mode#15](https://github.com/mksglu/context-mode/issues/15) — Windows-build pain. Type: issue tracker. Credibility: high. Sentiment: negative.
26. [mksglu/context-mode#146](https://github.com/mksglu/context-mode/issues/146) — RTK interaction question. Type: issue tracker. Credibility: high. Sentiment: neutral.
27. [mksglu/context-mode#485](https://github.com/mksglu/context-mode/issues/485) — incomplete Cursor adapter coverage. Type: issue tracker. Credibility: high. Sentiment: negative.
28. [catalog/agent/rules/blueprint-scoping.md](../../catalog/agent/rules/blueprint-scoping.md) — agent-kit's product-wedge anchor rule. Type: in-repo rule. Credibility: authoritative for webpresso. Sentiment: neutral.
29. [catalog/agent/rules/gstack-routing.md](../../catalog/agent/rules/gstack-routing.md) — Lane 1–4 ownership model. Type: in-repo rule. Credibility: authoritative for webpresso. Sentiment: neutral.
