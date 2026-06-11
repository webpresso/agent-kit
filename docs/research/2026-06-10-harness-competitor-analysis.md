---
type: research
title: Harness competitor analysis — compulsory capabilities and agent-kit scorecard
date: 2026-06-10
last_updated: 2026-06-10
related_blueprints:
  - 2026-06-10-self-improving-harness-roadmap
  - 2026-06-10-harness-surface-manifest
  - 2026-06-10-weakness-mining-audit
  - 2026-06-10-harness-regression-gate
  - 2026-06-10-per-model-harness-overlays
status: active
recommendation: close-loop-gaps-keep-enforcement-moat
---

# Harness competitor analysis — June 2026

Companion to
[2026-06-10-harness-engineering-landscape.md](2026-06-10-harness-engineering-landscape.md)
(inventory + papers) and the existing
[positioning-vs-rulesync guide](../positioning-vs-rulesync.md). This doc
answers three questions: who competes with agent-kit, what the field now
treats as compulsory, and where agent-kit is honestly better or worse.

## Two arenas, kept distinct

Agent-kit competes in two different markets that are converging:

### Arena 1 — agent-asset / config management (today's market)

| Competitor | What it is | Threat shape |
| --- | --- | --- |
| **rulesync** (dyoshikawa/rulesync, MIT) | Deterministic multi-runtime emission of rules/skills to 17+ runtimes; ~175k weekly npm downloads (per [May 2026 landscape](2026-05-11-agent-asset-infrastructure-landscape.md)) | Not a threat — it's our substrate (`wp compile` wraps `rulesync generate`). Risk is upstream direction changes; see positioning guide |
| **Agent Skills open standard** (Anthropic, Dec 2025) | Same `SKILL.md` runs natively in 26+ runtimes | Commoditizes the *distribution* half of the symlinker. Raises the bar: our value must come from governance, not file fan-out |
| **Plugin marketplaces** (Claude Code, Cursor, et al.) | Install-time distribution of skills/hooks | Same commoditization pressure; agent-kit already ships as a Claude Code plugin — keep parity |
| **In-CLI native config** (CLAUDE.md/AGENTS.md conventions, Cursor rules, OpenCode config) | Every CLI ships its own zero-dependency config story | The "do nothing, use the CLI's native files" baseline every consumer compares us against |

Verdict for arena 1: emission/fan-out is **table stakes and commoditizing**.
The existing positioning ("the differentiator is enforcement — audits,
lifecycle, drift detection") is correct and holding; nobody in this arena
ships an audit family, a blueprint lifecycle, or a tech-debt lifecycle.

### Arena 2 — harness optimization & evaluation (where the field is going)

| Competitor | What it is | Threat shape |
| --- | --- | --- |
| **auto-harness** (neosigmaai/auto-harness) | BYO-agent self-improving loop: mine failures from benchmark runs, optimize the harness, gate against regressions; TB-2.0/tau-bench via Harbor/Docker | **The closest thing to our roadmap that already exists.** Differences: benchmark-centric (not repo-centric), single-agent (not fleet), no governance layer. If it grows repo-native evidence mining, it enters our lane |
| **AHE** (china-qijizhifeng/agentic-harness-engineering) | Observability-driven automatic harness evolution; 84.7% pass@1 TB-2; frozen harness transfers across benchmarks | Research-grade today; its transfer result legitimizes selling *pre-optimized* harness profiles — which is what our catalog could become |
| **Meta-Harness / SIA / SICA** | Research systems (see [papers registry](papers/README.md)) | Idea source, not product threat yet; SIA is MIT and pip-installable |
| **Harbor + Terminal-Bench** (harbor-framework) | Eval/RL-environment framework + the school's standard benchmark | Complementary infra; candidate execution backend if our regression gate ever needs sandboxed scale |
| **OpenHands benchmarks** | Standardized eval pipelines for OpenHands agents | Prior art for eval-pipeline shape only; OpenHands itself is Tier 3 (not supported) per the [supported-CLI rule](../../catalog/agent/rules/supported-agent-clis.md) — not to be confused with OpenCode, the actual Tier 2 CLI |

Verdict for arena 2: nobody here does **fleet governance** (many repos, many
CLIs, tiers, audits, lifecycles) — they all optimize one agent against one
benchmark. Agent-kit's opening is to bring the loop to the fleet. The risk of
doing nothing: arena-2 tools mature, grow repo-native modes, and arrive in
arena 1 with a capability we lack and they already have ("our harness
improves itself; yours is hand-written markdown").

## Compulsory capabilities matrix

Rows are the de-facto discipline checklist (taxonomy from
ai-boost/awesome-harness-engineering, the field's most structured list):
agent loop, planning, context delivery, tool design, skills & MCP,
permissions, memory & state, orchestration, verification & CI, observability,
debugging & DX, human-in-the-loop, security/sandbox, evals.

Gap rating: ✅ competitive · 🟡 partial · ❌ missing.

| Capability (field expectation) | Agent-kit today | Gap |
| --- | --- | --- |
| **Agent loop** — owning the model loop | Out of scope by design (CLIs own the loop; we configure them) | ✅ n/a by boundary |
| **Planning & task decomposition** — plans as first-class artifacts | Blueprint lifecycle + parsers + MCP tools + audits (`blueprint-lifecycle`, `roadmap-links`) | ✅ best-in-class |
| **Context delivery & compaction** — token-efficient evidence | Summary-first `wp_*` tools, `wp err`; context-mode owns the ctx lane (lane 2) | ✅ via lane model |
| **Tool design (ACI)** — structured, deny-aware tools | `wp_*` MCP family with structured deny wording, guard `scriptRoutes` | ✅ |
| **Skills & MCP** — catalog + multi-runtime distribution | Catalog + symlinker + plugin packaging + tier rule | ✅ (commoditizing — see arena 1) |
| **Permissions & authorization** — guarded write/exec paths | pretool-guard, guard-switch, secret-aware wrappers (`with-secrets`) | ✅ |
| **Memory & state** — durable cross-session knowledge | Session stores, blueprint/tech-debt lifecycles; KG deferred behind gates (per May 2026 review) | 🟡 deliberate partial |
| **Task runners & orchestration** — multi-agent execution | pll lanes, worktree isolation docs | 🟡 adapter-level, not owned |
| **Verification & CI integration** — gates on agent output | 20+ audit kinds, GitHub Action, hooks | ✅ the moat |
| **Observability & tracing** — mineable execution traces | Hook logs exist but are write-only: nothing reads, aggregates, or reports them | ❌ → [weakness-mining blueprint](../../blueprints/draft/2026-06-10-weakness-mining-audit.md) |
| **Debugging & DX** — doctor flows, rollback | `wp doctor`, hooks-doctor skill, hooks-rollback doc | ✅ |
| **Human-in-the-loop** — review gates on agent-proposed change | PR flow + lore commits (generic git, nothing harness-aware) | 🟡 implicit only |
| **Security / sandbox** — isolation for agent execution | Worktree isolation; no sandboxed eval runner | 🟡 acceptable until the gate needs one |
| **Evals & verification of the harness itself** — behavioral regression testing of harness changes | **None.** Token-savings benchmark methodology exists on paper ([2026-05-14](2026-05-14-token-savings-benchmark-methodology.md), [bench methodology](../bench/session-memory-methodology.md)) but no pass-rate suite gates catalog/hook PRs | ❌ → [regression-gate blueprint](../../blueprints/draft/2026-06-10-harness-regression-gate.md) |
| **Model-specific adaptation** — per-model harness variants (the school's central finding) | One canonical `.agent/` for all CLIs/models | ❌ → [overlays blueprint](../../blueprints/draft/2026-06-10-per-model-harness-overlays.md) |
| **Editable-surface declaration** — machine-readable edit boundary | Implicit (conventions + guard code), not declared | ❌ → [manifest blueprint](../../blueprints/draft/2026-06-10-harness-surface-manifest.md) |

## Agent-kit better / worse — honest scorecard

**Where agent-kit is better than everyone in either arena:**

1. **Enforcement.** A 20-kind audit family wired into CI and hooks. No
   config-sync tool audits compiled output; no harness-optimizer governs
   anything.
2. **Governance lifecycles.** Blueprints and tech-debt items with states,
   cadences, and audits — research systems have nothing; rulesync has nothing.
3. **Fleet + tier discipline.** Many repos × many CLIs with explicit support
   tiers and promotion gates ([supported-agent-clis](../../catalog/agent/rules/supported-agent-clis.md)).
   Every arena-2 system is single-agent, single-benchmark.
4. **Decision provenance.** Lore commit trailers (`Rejected:`, `Constraint:`,
   `Confidence:`) already implement the "auditable harness lineage" the
   papers had to invent.

**Where agent-kit is worse (each row names its fix):**

1. **No behavioral feedback loop** — harness changes ship on review rationale
   alone. Fix: [harness-regression-gate](../../blueprints/draft/2026-06-10-harness-regression-gate.md).
2. **Write-only observability** — hook logs are never mined; failure
   knowledge stays tribal until a human writes a rule. Fix:
   [weakness-mining-audit](../../blueprints/draft/2026-06-10-weakness-mining-audit.md).
3. **No model-specificity** — one harness for all models contradicts the
   school's central, replicated finding. Fix:
   [per-model-harness-overlays](../../blueprints/draft/2026-06-10-per-model-harness-overlays.md).
4. **No declared edit boundary** — "what may an agent change about its own
   harness" is answerable only by reading guard source. Fix:
   [harness-surface-manifest](../../blueprints/draft/2026-06-10-harness-surface-manifest.md).
5. **Hook coverage gaps** — documented-vs-measured support per
   [hook-matrix](../hook-matrix.md) (e.g. Codex MultiEdit parity). Accepted
   gap, tracked there — not part of this roadmap.
6. **No sandboxed eval execution** — fine today; becomes a real gap only if
   the regression gate outgrows reference-consumer CI. Accepted gap; Harbor
   is the noted architecture reference.

## Must-add to stay credible (ranked)

1. Harness-surface manifest — cheap, unblocks everything, makes the locked
   set (guards/permissions/secrets) explicit policy instead of folklore.
2. Weakness-mining audit — converts an existing asset (hook logs) into the
   evidence loop; immediate standalone value via auto-drafted tech-debt.
3. Harness regression gate — the credibility line: "our own harness changes
   are regression-tested on real consumer repos" is a claim no competitor in
   either arena can make.
4. Per-model overlays — differentiating, but only honest after 1–3 exist
   (overlays without evidence are vibes).

## Fact-Check Summary

| Claim | Source | Verified |
| --- | --- | --- |
| rulesync substrate relationship, ~175k weekly downloads | [positioning guide](../positioning-vs-rulesync.md); [May 2026 landscape](2026-05-11-agent-asset-infrastructure-landscape.md) | ✅ internal docs (download figure not re-checked 2026-06-10) |
| Agent Skills standard (Dec 2025), 26+ runtimes | [May 2026 landscape](2026-05-11-agent-asset-infrastructure-landscape.md) | ✅ internal doc |
| auto-harness scope ("mine failures, optimize the agent harness, gate against regressions") | repo description, github.com/neosigmaai/auto-harness | ✅ 2026-06-10 |
| AHE results & transfer claim | repo description | ✅ 2026-06-10 (description only) |
| Audit kind count (20) | `src/mcp/tools/_shared/audit-kinds.ts` | ✅ 2026-06-10 |
| Hook-log "write-only" claim | no reader/aggregator found in `src/` for hook log output | ✅ 2026-06-10 (grep) |
| Taxonomy rows | ai-boost/awesome-harness-engineering table of contents | ✅ 2026-06-10 |
