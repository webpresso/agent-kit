---
type: rule
slug: supported-agent-clis
title: Supported Agent CLIs (Tier 1 / Tier 2)
status: active
scope: repo
applies_to: [agents, humans]
related: [package-conventions]
created: '2026-05-14'
last_reviewed: '2026-05-14'
paths:
  - '**/*'
---

# Supported Agent CLIs

webpresso ships building blocks for AI coding-agent CLIs. We
support a fixed set of CLIs at a defined tier. Plans, benchmarks, docs, and
plugins MUST honor this tier list. Do not add a CLI without tier classification.

## Tier 1 — must work perfectly (P0)

| CLI | Provider model | Why Tier 1 |
|---|---|---|
| **Claude Code** (`claude`) | Anthropic | webpresso's native plugin runtime; primary consumer (ozby/ingest-lens) uses it |
| **Codex CLI** (`codex`) | OpenAI (configurable) | Already integrated via `/codex` skill for second-opinion review; widely used by webpresso engineers |

Tier 1 requirements:
- Per-call token-usage extraction (stream-json or equivalent)
- Plugin/extension surface with isolatable scope (`--plugin-dir`, etc.)
- Reproducible session lifecycle (`--no-session-persistence` or equivalent)
- Tested in CI for every relevant webpresso release

## Tier 2 — fairly well, best-effort (P1)

| CLI | Provider model | Tier 2 caveats |
|---|---|---|
| **OpenCode** (`opencode`) | Provider-agnostic (Anthropic, OpenAI, local, etc.) | Session-level token totals only (`-f json` + `opencode stats`); no per-call granularity; cache isolation depends on dispatched provider |

Tier 2 requirements:
- At minimum: session-level token totals captured
- Best-effort: per-call attribution if the CLI exposes it
- Documented degradation in any benchmark/report cell using a Tier 2 CLI
- May be skipped in CI when prerequisites are missing

## Tier 3 — not supported

Any other agent CLI (Aider, Cursor terminal mode, Gemini CLI, custom tools).
Plans and docs MUST NOT introduce Tier 3 CLIs without first promoting them via
this rule. Adding a new tier-3 CLI is a separate decision, not an in-band scope
expansion.

## Hard rules

- **Plans MUST classify each CLI they reference by tier.** A plan that says
  "supports Claude, Codex, and Aider" without a tier table is incomplete.
- **Benchmark reports MUST label every cell with the CLI's tier.** Tier 2 cells
  show degraded-granularity disclaimers; tier 2 numbers are NOT directly
  comparable to tier 1 numbers without explicit caveat.
- **Docs MUST refer back to this rule** rather than re-listing CLIs. If a doc
  says "supported CLIs", it links here. Single source of truth.
- **Adding a new tier-1 CLI requires** plan-eng-review approval + integration
  test coverage + per-call usage extractor.
- **Promoting tier 2 → tier 1** requires the same gate plus a 1-week sowp test
  in actual benchmark runs.
- **Removing a tier-1 CLI** requires CEO-review-level scope decision (it's a
  product position change).

## Non-goals

- Universal agent-CLI abstraction. We pick winners per tier.
- Wrapping vendor SDKs. We integrate via CLI subprocess only — keeps our code
  vendor-agnostic and dependency-free.

## See also

- `package-conventions.md` for which packages may import which CLI
- `gstack-routing.md` for how interactive workflows route to CLIs
- `docs/research/2026-05-14-token-savings-benchmark-methodology.md` for the
  benchmark methodology that exercises this CLI matrix
