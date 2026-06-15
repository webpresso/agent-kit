# Autoresearch parity matrix: session-memory / context-window libraries

**Date:** 2026-06-15
**Target blueprint:** `blueprints/planned/2026-06-15-wp-session-enforcement-parity/_overview.md`
**Validation mode:** `prompt-architect-artifact`
**Question:** which relevant memory/context libraries matter for agent-kit’s `wp_session_*` port, what do they do, how do they do it, what do they claim, and what parity should agent-kit target?

## Executive summary

The relevant ecosystem splits into four buckets:

1. **Coding-agent context-window enforcement**: context-mode, Claude-Mem, Hindsight’s Claude integration, and the current Webpresso agent-kit `wp_session_*` surface. These are closest to the blueprint because they operate at host/tool/session boundaries.
2. **Agent memory platforms**: Mem0, Zep/Graphiti, Cognee, Redis Agent Memory Server, and Hindsight. These target long-term semantic/graph/application memory rather than hook-level raw-output prevention.
3. **Framework memory primitives**: OpenAI Agents SDK Sessions, LangMem/LangGraph memory, LlamaIndex Memory, and AutoGen memory. These provide APIs for maintaining or retrieving conversational state inside agent applications; they do not enforce Claude/Codex/Cursor tool routing by themselves.
4. **Runtime / agent-OS systems**: Letta/MemGPT-style stateful agents. These include explicit memory models and agent harnesses, but they are not a drop-in replacement for agent-kit hooks.

**Conclusion:** “100% parity” for agent-kit should mean **WP-native parity on the coding-agent context-window axis**: SessionStart/routing injection, host-supported PreToolUse guard coverage before raw output reaches the transcript, broad PostToolUse/UserPromptSubmit/PreCompact/PostToolBatch continuity capture, concrete `wp_session_*` guidance, bounded preview/search/restore flows, diagnostics, and proof gates. Graph memory, LLM-extracted personalization, hosted memory APIs, and autonomous reflection should remain **non-goals** unless separately productized.

## Local baseline evidence

| Surface | Current evidence | Why it matters |
| --- | --- | --- |
| agent-kit routing block | `src/hooks/shared/routing-block.ts` currently exposes dev-workflow routing guidance; local inspection found no `wp_session_*` context-window hierarchy there. | Agents can have tools installed but still not be routed to use them. |
| agent-kit session-memory docs | `docs/guides/session-memory.md` documents `wp_session_batch_execute`, `wp_session_capture`, `wp_session_index`, `wp_session_fetch_and_index`, `wp_session_execute`, `wp_session_execute_file`, `wp_session_restore`, `wp_session_search`, `wp_session_snapshot`, `wp_session_stats`, `wp_session_purge`, and `wp_session_doctor`. | The tool surface exists; the gap is enforcement and generated-host guidance. |
| agent-kit hook scaffolding | `src/cli/commands/init/scaffolders/agent-hooks/index.ts` has broad Codex examples (`Bash|apply_patch|Edit|Write|mcp__.*`) but Claude config has historically been edit/shell-heavy. | Host matchers must be host-specific and tested; do not overclaim identical hook semantics. |
| context-mode hook config | Local `context-mode/hooks/hooks.json` includes SessionStart, PreToolUse, PostToolUse, and PreCompact, with broad PostToolUse and PreToolUse coverage for Bash/WebFetch/Read/Grep/Agent/MCP-style operations. | This is the direct behavioral comparator for “enforced use.” |
| context-mode routing block | Local `context-mode/hooks/routing-block.mjs` injects a context-window-protection hierarchy that prefers `ctx_*` tools for memory, gather, follow-up, processing, and fetch/index flows. | agent-kit needs the same behavior, but with `wp_session_*` names only. |

## Library survey: claims vs. mechanisms

| System | What it claims / optimizes for | How it does it | Relevance to agent-kit parity |
| --- | --- | --- | --- |
| **context-mode** | Context-window optimization for AI coding agents, raw-output sandboxing, session continuity, and large context reduction. | MCP server plus host hooks: SessionStart routing injection, PreToolUse nudges/blocks, PostToolUse capture, PreCompact indexing, SQLite/FTS-style retrieval, bounded `ctx_*` tools. | **Primary comparator.** Agent-kit should match this behavior under `wp_session_*`, not re-export `ctx_*`. |
| **Webpresso agent-kit `wp_session_*`** | Local session-memory tools for bounded execution, indexing, fetch/index, restore/search/snapshot/stats/doctor. | MCP tools and hook scaffolding in agent-kit; current gap is routing/guard breadth and host proof. | **Target implementation.** Needs enforcement, not just tools/docs. |
| **Claude-Mem** | Persistent context across sessions, automatic capture, semantic summaries, progressive disclosure, search tools, privacy controls. | Lifecycle hooks, worker service, SQLite observations/summaries, vector search, MCP search workflow with compact search → timeline → details. | Strong comparator for session continuity and progressive disclosure; less direct for raw-output prevention. |
| **Hindsight** | Agent memory layer with automated memory extraction and retrieval, including Claude Code integration. | Observes agent activity through integrations, extracts memories, stores/retrieves them for future agent context. | Good comparator for “learn across sessions”; mostly out-of-scope for this blueprint unless agent-kit adds LLM extraction. |
| **Mem0 Platform / OSS** | Universal AI memory layer that extracts, updates, and retrieves memories for AI applications. | SDK/API memory store with embeddings/graph-style retrieval options and user/session scoped memory operations. | Relevant for long-term app memory; not a hook enforcement model. |
| **Zep / Graphiti** | Enterprise-scale temporal knowledge graph memory for agents. | Builds and queries a knowledge graph from conversational/application events; focuses on temporality and relationships. | Relevant for graph memory comparisons; not needed for WP parity. |
| **Cognee** | Open-source AI memory platform / self-hosted knowledge graph for persistent memory across sessions. | Data ingestion and “cognify” style processing into graph/vector retrievable memory. | Adjacent: graph-based long-term memory. Not required for raw-output routing parity. |
| **Redis Agent Memory Server** | Fast/flexible memory for agents and AI applications using Redis. | MCP/server APIs backed by Redis data structures/search for memory storage and retrieval. | Relevant if agent-kit later wants pluggable backend scale; not required for local enforcement. |
| **OpenAI Agents SDK Sessions** | Conversation history/session persistence for Agents SDK runs. | Session objects store/retrieve prior conversation items, with SQLite and other session implementations. | Good framework primitive comparator; no host-level hooks. |
| **LangMem / LangGraph memory** | Long-term memory patterns for LangGraph agents: facts, preferences, procedural instructions, semantic/episodic/procedural memory. | Memory manager tools, store abstractions, retrieval and update flows within LangGraph applications. | Useful vocabulary for memory taxonomy; not a coding-agent hook system. |
| **LlamaIndex Memory** | Agent memory for chat/agent contexts, short-term and long-term memory blocks. | Memory classes, chat stores, vector/block retrieval, integration into LlamaIndex agents. | Framework primitive; useful for taxonomy, not direct parity. |
| **AutoGen Memory** | Memory and RAG support for AutoGen agents. | Memory protocol/components that update model context with retrieved content from memory stores. | Framework primitive; no generated host hook enforcement. |
| **Letta / MemGPT lineage** | Stateful agents that remember, learn, and improve over time, with memory blocks, archival memory, shared memory, and context hierarchy. | Agent runtime/API with explicit memory hierarchy, tools, and persistent state. | Strong memory-system comparator; too broad for this blueprint’s hook-enforcement scope. |

## Capability parity matrix

Legend: ✅ direct / first-class; ◐ partial or adjacent; ❌ no evidence / not in scope; N/A not applicable.

| Capability | context-mode | agent-kit current | agent-kit target | Claude-Mem | Hindsight | Mem0 | Zep/Graphiti | Cognee | Redis AMS | OpenAI Sessions | LangMem | LlamaIndex | AutoGen | Letta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Hook-enforced coding-agent routing | ✅ | ◐ | ✅ | ◐ | ◐ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ◐ |
| SessionStart / instruction injection | ✅ | ◐ | ✅ | ✅ | ◐ | ❌ | ❌ | ❌ | ❌ | N/A | N/A | N/A | N/A | ◐ |
| PreToolUse raw-output prevention | ✅ | ◐ | ✅ | ◐ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ◐ |
| Broad PostToolUse continuity capture | ✅ | ◐ | ✅ | ✅ | ◐ | ❌ | ❌ | ❌ | ❌ | N/A | N/A | N/A | N/A | ◐ |
| PreCompact / compaction support | ✅ | ◐ | ✅ | ◐ | ◐ | ❌ | ❌ | ❌ | ❌ | ◐ | ◐ | ◐ | ◐ | ✅ |
| Bounded shell/file processing | ✅ | ◐ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ◐ |
| Fetch + index without raw page context | ✅ | ✅ tool exists | ✅ enforced | ❌ | ◐ | ◐ | ◐ | ◐ | ◐ | ❌ | ◐ | ◐ | ◐ | ◐ |
| Search/restore compact previews | ✅ | ✅ tool exists | ✅ enforced | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ✅ | ✅ | ✅ | ✅ |
| Local-only option | ✅ | ✅ | ✅ | ✅ | ◐ | ◐ OSS | ◐ OSS/Cloud | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ |
| Graph/semantic memory | ◐ FTS/search | ◐ search/index | ◐ search/index only | ✅ vector + summaries | ✅ extraction/retrieval | ✅ | ✅ | ✅ | ◐ | ❌ | ✅ | ✅ | ◐ | ✅ |
| Learning/reflection/personality | ❌ | ❌ | ❌ non-goal | ◐ summaries | ✅ | ✅ | ✅ | ◐ | ◐ | ❌ | ✅ | ◐ | ◐ | ✅ |
| Operator diagnostics | ✅ doctor/stats | ✅ doctor/stats exist | ✅ gated | ✅ UI/search tools | ◐ | ◐ | ◐ | ◐ | ◐ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Release/proof gates for generated host surfaces | ✅ project-specific | ◐ | ✅ required | ◐ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A | N/A | N/A | N/A | N/A |

## What matters for this blueprint

| Axis | Systems that show the axis | Blueprint implication |
| --- | --- | --- |
| Context saving before raw output | context-mode | `wp_session_*` must be named in routing and invoked/nudged before `Bash`, `Read`, `Grep`, `WebFetch`, or broad MCP output enters the transcript. |
| Session continuity capture | context-mode, Claude-Mem, Hindsight | PostToolUse/UserPromptSubmit/PreCompact should capture bounded summaries of edits, reads, commands, tool failures, user decisions, and task state. |
| Progressive disclosure | Claude-Mem, context-mode, Mem0/Zep/Cognee patterns | `wp_session_search`/`restore` should return compact previews and IDs; full details should be fetched only by reference or narrow query. |
| Tool registry/routing consistency | context-mode, agent-kit current gap | Every `wp_session_*` tool in generated guidance must be registered and smoke-tested; every registered tool should be documented or intentionally hidden. |
| Host-specific enforcement | context-mode multi-host configs | Claude, Codex, Cursor, OpenCode, Gemini, etc. should each get only supported matcher semantics; parity is behavioral, not byte-identical config. |
| Non-goal discipline | Mem0/Zep/Cognee/Letta show broader memory ambitions | Do not add graph memory, hosted services, LLM extraction, or personalization to this blueprint. Keep it a hook/session-routing parity project. |

## Actionable parity requirements for `2026-06-15-wp-session-enforcement-parity`

| Requirement | Done when | Comparator evidence |
| --- | --- | --- |
| Add `wp_session_*` context-window-protection hierarchy | Generated routing block tells agents when to use `wp_session_search`, `restore`, `batch_execute`, `execute`, `execute_file`, `index`, `fetch_and_index`, `snapshot`, `stats`, `doctor`, and `purge`. | context-mode SessionStart routing block. |
| Prove routing names match registered tools | Unit/audit test fails if routing mentions a non-registered `wp_session_*` tool or registered public tool lacks guidance. | context-mode doctor/tool registration checks. |
| Broaden host-supported PreToolUse | Claude includes `Read`, `Grep`, `WebFetch`, `Agent`, and relevant MCP matching using host-valid syntax where supported; Codex uses its own matcher reality such as `mcp__.*`. | context-mode `hooks.json`; agent-kit host scaffolder. |
| Preserve no-loop behavior | Guard does not nudge calls that are already using `wp_session_*`, and does not block safe small output. | Current agent-kit guard loop-prevention behavior. |
| Convert generic bounded shell guidance to concrete WP tools | Warnings/nudges say exactly which `wp_session_*` tool to use for file search, log reading, command output, fetch, and indexing. | context-mode `ctx_*` guidance; agent-kit `wp_session_*` docs. |
| Capture broad continuity events | PostToolUse and PostToolBatch capture fires for edits, reads, grep/search, shell, user tasks, agent delegation, MCP calls, and batch results where available, storing bounded summaries only. | context-mode PostToolUse breadth; Claude-Mem observations. |
| Add host smoke fixtures | Generated Claude/Codex fixtures prove routing block injection, matcher coverage, no invalid config, and doctor output. | context-mode doctor/install verification. |
| Add package/release gates | Package tarball contains updated hooks/routing/docs and excludes local absolute paths/secrets. | agent-kit package-surface safety posture. |
| Document out-of-scope memory features | Blueprint explicitly excludes graph memory, hosted memory APIs, LLM memory extraction, autonomous reflection, and personalization. | Mem0/Zep/Cognee/Letta distinction. |

## Blueprint additions recommended from research

1. **Non-goals:** add explicit non-goal text for graph memory, LLM extraction, personalization, and cloud memory.
2. **Raw-output prevention test:** require tests proving guards fire before large `Bash`/`Read`/`Grep`/`WebFetch`/MCP output enters transcript.
3. **Progressive disclosure:** incorporate Claude-Mem’s compact search → timeline/context → full-detail-by-ID pattern into `wp_session_search`/`restore` acceptance criteria.
4. **Fetch safety dependency:** keep `wp_session_fetch_and_index` enforcement dependent on the SSRF-hardening blueprint.
5. **Separate proof axes:** distinguish tool existence, routing guidance, matcher coverage, actual guard behavior, continuity capture, PostToolBatch summaries, repair-path evidence, and package surface checks.

## Sources

### Local source evidence

- `src/hooks/shared/routing-block.ts`
- `docs/guides/session-memory.md`
- `src/cli/commands/init/scaffolders/agent-hooks/index.ts`
- `/Users/ozby/repos/ozby/context-mode/hooks/hooks.json`
- `/Users/ozby/repos/ozby/context-mode/hooks/routing-block.mjs`

### External sources

- context-mode: <https://github.com/mksglu/context-mode>
- Claude-Mem: <https://github.com/thedotmack/claude-mem>
- Hindsight: <https://hindsight.vectorize.io/>
- Mem0 Platform: <https://docs.mem0.ai/platform/overview>
- Mem0 Open Source: <https://docs.mem0.ai/open-source/overview>
- Zep: <https://www.getzep.com/>
- LangMem: <https://langchain-ai.github.io/langmem/concepts/conceptual_guide/>
- Letta: <https://docs.letta.com/guides/get-started/intro>
- LlamaIndex Memory: <https://developers.llamaindex.ai/python/framework/module_guides/deploying/agents/memory/>
- Cognee: <https://github.com/topoteretes/cognee>
- Redis Agent Memory Server: <https://github.com/redis/agent-memory-server>
- OpenAI Agents SDK Sessions: <https://openai.github.io/openai-agents-python/sessions/>
- AutoGen Memory: <https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/memory.html>
- AutoGen memory API reference: <https://microsoft.github.io/autogen/stable/reference/python/autogen_core.memory.html>
