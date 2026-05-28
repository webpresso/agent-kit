---
title: Token-savings benchmark harness `wp bench session-memory`
owner: agent-kit
type: blueprint
status: draft
complexity: M
created: '2026-05-14'
last_updated: '2026-05-14'
progress: '0/9 tasks done'
depends_on: []
tags:
  - benchmarking
  - session-memory
  - reproducibility
  - bun
  - mit
---

# Token-savings benchmark harness `wp bench session-memory`

## Product wedge anchor

- **Stage outcome:** Webpresso open-sourcing extraction roadmap, Wave 1 — agent-kit ships as a reusable building block. The session-memory family (v1/v2) needs **proof of token savings** before it can be pitched as a context-mode replacement to 3rd-party consumers like ozby/ingest-lens. Must be **vendor-neutral** to compare Claude Code session memory vs OpenAI Codex CLI memory honestly.
- **Consuming surface:** New CLI verb `wp bench session-memory` (lives at `src/cli/commands/bench/session-memory.ts`). Output: markdown report in `runs/<run-id>/report.md` with cost/recall/latency comparison across `(vendor, variant)` cells: Claude Code × {baseline, context-mode, v1, v2} + Codex CLI × {baseline, codex-memory}.
- **New user-visible capability:** A maintainer or 3rd-party plugin author can run `wp bench session-memory --scenario debug --all-vendors --all-variants` and receive a defensible, reproducible cross-vendor token-savings report — works for any agentic CLI that emits per-call usage (Claude Code, Codex CLI, future Gemini CLI).

## Context

Tier-1 micro-benchmark (2026-05-14) measured raw SQLite ops only. The two-turn `--print` follow-up showed zero token savings because session memory's value lives **across compaction boundaries** in long agentic sessions, not in two-turn synthetic runs. Research doc (`docs/research/2026-05-14-token-savings-benchmark-methodology.md`) verdict: **adopt** the SOTA methodology from mem0 / Hindsight / MemoryAgentBench, adapted to agent-kit's Bun-native stack.

This blueprint implements that adoption.

## Architecture Overview

```text
┌──────────────────────────────────────────────────────────────────┐
│  ak bench session-memory --scenario X --variant Y               │
└─────────────────────────────┬────────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  scripts/bench/lib/manifest.ts                                  │
│  Captures pinned versions: bun, claude, plugin SHAs, model      │
│  Refuses to run if pins differ (deterministic by construction)  │
└─────────────────────────────┬────────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  scripts/bench/lib/variant-runner.ts                            │
│  Per (scenario, variant, trial):                                │
│   1. Build isolated HOME dir + repo copy                        │
│   2. Spawn `claude --print` with --plugin-dir <variant>         │
│   3. Pipe stream-json to transcript-recorder.ts                 │
│   4. Extract usage via usage-extractor.ts                       │
└─────────────────────────────┬────────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  scripts/bench/lib/cost-aggregator.ts                           │
│  Effective cost = input + 0.1×cache_read + cache_create × price │
│  Cross-check vs Anthropic Usage API (admin key, ±2% tolerance)  │
└─────────────────────────────┬────────────────────────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  runs/<run-id>/report.md                                        │
│  Variant × scenario table: cost, recall@k, wall_sec, tools_used │
└──────────────────────────────────────────────────────────────────┘
```

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Runtime | Bun TypeScript | Hooks already use bun; zero install vs Python+conda (MemoryAgentBench) |
| Seed | `BENCH_SEED=42` env + SHA-256 event-ids | Matches AgentMemory V4 determinism standard |
| Token ground truth | Anthropic Usage API + per-call stream-json (cross-check) | Per-call gives granularity; API gives ground-truth (±2%) |
| Cache isolation | Per-variant API key | No `cache_control: no-store` in Claude Code as of 2026-05-14 |
| Scenarios | 3 versioned JSON files | Debug, multi-file refactor, resumable task — each triggers compaction |
| Recall measurement | LoCoMo-style qrels (Q/A pairs) | Industry standard, but custom qrels for our agentic workload |
| Trials per cell | N=2 | Per existing benchmark plan F12 (Wilson CI for variance) |
| License | MIT | Aligns with agent-kit ecosystem; rules out any ELv2 code from context-mode |
| Distribution | `wp bench session-memory` subcommand | Aligns with existing `wp setup`, `wp blueprint`, `wp audit` surface |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| ---- | ----- | ------------ | -------------- | ------ |
| **Wave 0** | 1.1, 1.2, 1.3 | None | 3 agents | XS, XS, S |
| **Wave 1** | 2.1, 2.2 | Wave 0 | 2 agents | S, S |
| **Wave 2** | 3.1, 3.2 | Wave 1 | 2 agents | S, M |
| **Wave 3** | 4.1, 4.2 | Wave 2 | 2 agents | XS, XS |
| **Critical path** | 1.2 → 2.1 → 3.2 → 4.2 | — | 4 waves | M |

### Parallel Metrics

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ 3 | **3** ✓ |
| CPR | total_tasks / critical_path_length | ≥ 2.0 | **9/4 = 2.25** ✓ |
| DD | dependency_edges / total_tasks | ≤ 2.0 | **~1.0** ✓ |
| CP | same-file overlaps per wave | 0 | **0** ✓ |

Score: **A** — ready for `/pll`.

---

### Phase 1: Foundations [Complexity: S]

#### [infra] Task 1.1: Manifest pinning + version capture

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"command":"bun test scripts/bench/lib/manifest.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-28T10:20:00.000Z"}]
```

**Depends:** None

Build the manifest module that captures and verifies pinned tool versions at run start. Refuses to run if `bun --version`, `claude --version`, or any plugin commit SHA differs from the manifest pins. This is the reproducibility-by-construction primitive — without it, no run is repeatable.

**Files:**

- Create: `scripts/bench/lib/manifest.ts` (~80 LOC)
- Create: `scripts/bench/lib/manifest.test.ts`
- Create: `scripts/bench/manifest.lock.json` (initial pinned versions)

**Steps (TDD):**

1. Write failing test: `loadManifest()` returns shape `{ bun, claude, node, model, plugins: { main, v1, v2 } }` with strings
2. Write failing test: `verifyManifest(captured, pinned)` throws when any pin differs
3. Run: `bun test scripts/bench/lib/manifest.test.ts` — verify FAIL
4. Implement `captureManifest()` (runs `bun --version` etc. via `Bun.spawn`)
5. Implement `verifyManifest()` (deep-equal compare, named-diff error)
6. Run: `bun test scripts/bench/lib/manifest.test.ts` — verify PASS

**Acceptance:**

- [x] Manifest captures bun/claude/node/model/plugin SHAs
- [x] Verification throws on any mismatch with named diff
- [x] Initial `manifest.lock.json` committed with current versions
- [x] Tests pass; lint + typecheck clean
#### [infra] Task 1.2: Usage extractor (parses stream-json)

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"command":"bun test scripts/bench/lib/usage-extractor.test.ts --coverage","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-28T13:44:00+02:00"},{"actor":"codex","allow_manual":true,"description":"Smoke-checked extraction against sample-stream and opencode fixtures via direct module import.","kind":"manual","log_excerpt":"sample fixture yielded duration_ms=6225 with zero tokens; opencode fixture yielded input_tokens=41074 and output_tokens=2 without throwing.","result":"pass","ts":"2026-05-28T13:44:10+02:00"}]
```

**Depends:** None

Parse `claude --print --output-format stream-json` output into a typed `Usage` record. Extracts the `result` event and pulls `{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, duration_ms}`. Also enumerates `tool_use` events for "did the agent use wp_session_search" check.

**Files:**

- Create: `scripts/bench/lib/usage-extractor.ts` (~120 LOC)
- Create: `scripts/bench/lib/usage-extractor.test.ts`
- Create: `scripts/bench/__fixtures__/sample-stream.jsonl` (real captured output for testing)

**Steps (TDD):**

1. Write failing test: `extractUsage(streamJsonl)` returns the 4 usage fields + duration_ms
2. Write failing test: `extractToolUses(streamJsonl)` returns array of tool names
3. Write failing test: gracefully handles missing/malformed lines
4. Run: `bun test scripts/bench/lib/usage-extractor.test.ts` — verify FAIL
5. Capture a real fixture by running `claude --print "say hi" --output-format stream-json` once
6. Implement extraction
7. Run: `bun test` — verify PASS

**Acceptance:**

- [x] Returns typed `Usage` record from valid stream-json
- [x] Returns empty `tools[]` when no tool calls; populated array when tool calls present
- [x] Survives malformed lines (returns partial result, not throws)
- [x] Coverage ≥ 90% on extractor module
#### [infra] Task 1.3: Cost aggregator (cost math)

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"command":"bun test scripts/bench/lib/cost-aggregator.test.ts --coverage","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-28T13:47:30+02:00"},{"actor":"codex","allow_manual":true,"description":"Pinned Sonnet 4.5 pricing against Anthropic's official pricing docs and smoke-checked cost aggregation over three hand-calculated cases.","kind":"manual","log_excerpt":"As fetched on 2026-05-28 from docs.anthropic.com/en/docs/about-claude/pricing: Claude Sonnet 4.5 shows $3/MTok input, $3.75/MTok 5m cache writes, $0.30/MTok cache reads, and $15/MTok output. Smoke costs: [3, 3.525, 1.728123].","result":"pass","ts":"2026-05-28T13:47:45+02:00"}]
```

**Depends:** None

Compute effective cost from a `Usage` record using cached pricing. Formula: `cost = input × p_in + output × p_out + cache_create × p_cc + cache_read × p_cr`. Pricing table is a versioned JSON file. Supports per-variant aggregation across N trials (mean, std).

**Files:**

- Create: `scripts/bench/lib/cost-aggregator.ts` (~100 LOC)
- Create: `scripts/bench/lib/cost-aggregator.test.ts`
- Create: `scripts/bench/pricing.json` (Sonnet 4.5 prices, dated)

**Steps (TDD):**

1. Write failing test: `costOf(usage, prices)` returns USD with 6-decimal precision
2. Write failing test: `aggregateCosts(usages, prices)` returns `{ mean, std, n, total }`
3. Write failing test: `costOf` throws on missing model in pricing table
4. Run tests — verify FAIL
5. Implement
6. Run tests — verify PASS

**Acceptance:**

- [x] Cost math matches manual calculation on 3 hand-checked cases (committed as test)
- [x] Aggregator computes mean, std, n correctly
- [x] Pricing JSON validates against zod schema with model alias + 4 prices

---
### Phase 2: Variant runner + transcript [Complexity: M]

#### [backend] Task 2.1: Transcript recorder

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"command":"bun test scripts/bench/lib/transcript-recorder.test.ts --coverage","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-28T13:52:00+02:00"},{"actor":"codex","allow_manual":true,"description":"Smoke-recorded a two-event stream and inspected the emitted transcript JSONL for deterministic SHA-256 event IDs and replayable event payloads.","kind":"manual","log_excerpt":"Recorded assistant/result events with event_id values ea9c139e... and 9ee9f846..., preserved recorded_at_ms from source timestamps, and confirmed byte-identical reruns in the unit test.","result":"pass","ts":"2026-05-28T13:52:10+02:00"}]
```

**Depends:** Task 1.2

Record full conversation transcript (every tool call, every model response) to `runs/<run-id>/<variant>/<scenario>/transcript.jsonl` for replay. Augments stream-json with timestamps and a content-addressed `event_id = sha256(scenario_id + turn_idx + content)` per AgentMemory V4 standard.

**Files:**

- Create: `scripts/bench/lib/transcript-recorder.ts` (~150 LOC)
- Create: `scripts/bench/lib/transcript-recorder.test.ts`

**Steps (TDD):**

1. Write failing test: `recordStream(stream, outPath)` writes one line per stream event with added `event_id` (SHA-256, deterministic)
2. Write failing test: re-running with same input produces byte-identical output
3. Run tests — FAIL
4. Implement using Bun's stream APIs + `node:crypto`
5. Run tests — PASS

**Acceptance:**

- [x] Output JSONL is replayable (each line is valid JSON)
- [x] event_id reproducible: same input → same hash
- [x] Reproducibility test: 2 runs → byte-identical files (modulo timestamps)
#### [backend] Task 2.2: Variant runner

**Status:** todo

**Depends:** Task 1.1, Task 1.2, Task 2.1

Per-cell orchestrator. For (scenario, variant, trial): builds isolated HOME, spawns `claude --print` with the variant's `--plugin-dir`, pipes through transcript recorder, extracts usage, returns `RunResult`. Handles per-variant API key rotation (via env var `ANTHROPIC_API_KEY_<VARIANT>`). Aborts cleanly on rate limit (no mid-cell SIGTERM, per existing benchmark plan F18).

**Files:**

- Create: `scripts/bench/lib/variant-runner.ts` (~200 LOC)
- Create: `scripts/bench/lib/variant-runner.test.ts`

**Steps (TDD):**

1. Write failing test: `runCell({scenario, variant, trial})` returns `RunResult` with `usage`, `tools`, `transcript_path`
2. Write failing test: rate-limit returns clean failure with `error: 'rate_limit'`, no partial transcripts
3. Write failing test: per-variant API key is used (mock `Bun.spawn` env)
4. Run tests — FAIL
5. Implement (mock claude CLI for unit tests; real run for smoke)
6. Run tests — PASS

**Acceptance:**

- [ ] Spawns claude with correct `--plugin-dir` per variant
- [ ] Uses per-variant API key from env
- [ ] Rate-limit produces clean failure, not corrupt transcript
- [ ] Smoke test (1 real run) produces valid usage record

---

### Phase 3: Scenarios + CLI command [Complexity: M]

#### [qa] Task 3.1: Scenario fixtures + qrels

**Status:** todo

**Depends:** None (parallel with Phase 1/2)

Author 3 versioned scenarios that exercise compaction. Each scenario JSON has: `scenario_id`, `description`, `prompt_turns: []`, `expected_tool_calls`, `qrels: [{question, expected_substring_in_response}]`. Scenarios MUST be designed so the baseline session triggers compaction (>200K tokens) — this is where session memory's value materializes.

**Files:**

- Create: `scripts/bench/scenarios/debug-long-session.json`
- Create: `scripts/bench/scenarios/multi-file-refactor.json`
- Create: `scripts/bench/scenarios/resumable-task.json`
- Create: `scripts/bench/qrels/debug-recall.json`
- Create: `scripts/bench/scenarios/_schema.ts` (zod schema)

**Steps (TDD):**

1. Write zod schema for `Scenario` (turns, qrels, expected behavior)
2. Write zod schema for `Qrel` (question, expected substring or match function)
3. Validate all 3 scenario JSON files parse against schema
4. Author scenario 1 (debug session) with realistic 10-turn workflow
5. Author scenario 2 (multi-file refactor) with 8-turn workflow
6. Author scenario 3 (resumable task) split into 2 sessions

**Acceptance:**

- [ ] All 3 scenarios validate against zod schema
- [ ] qrels file has ≥ 5 Q/A pairs per scenario for recall scoring
- [ ] Each scenario's worst-case token count documented in scenario JSON

#### [backend] Task 3.2: `wp bench session-memory` CLI command

**Status:** todo

**Depends:** Task 1.1, Task 1.3, Task 2.2, Task 3.1

CLI entry point. Wires manifest → variant-runner → cost-aggregator → report writer. Subcommands: `--scenario X --variant Y` (single cell), `--scenario all --all-variants` (full matrix), `--dry-run` (validate env, no API calls). Outputs `runs/<run-id>/report.md` with the comparison table. Run-id format: `YYYYMMDD-HHMMSS-<manifest-sha>`.

**Files:**

- Create: `src/cli/commands/bench/session-memory.ts` (~250 LOC)
- Create: `src/cli/commands/bench/session-memory.test.ts`
- Modify: `src/cli/cli.ts` to register the `bench` subcommand
- Create: `scripts/bench/lib/report-writer.ts` (~100 LOC)

**Steps (TDD):**

1. Write failing test: `--dry-run` succeeds without API calls and validates manifest+scenario
2. Write failing test: `--scenario X --variant Y` produces a `runs/<id>/report.md` file
3. Write failing test: `--all-variants` runs N=2 trials per cell
4. Run tests — FAIL
5. Implement (use existing `src/cli/commands/*` patterns for arg parsing)
6. Run tests — PASS
7. Smoke test: `WP_SKIP_UPDATE_CHECK=1 wp bench session-memory --dry-run`

**Acceptance:**

- [ ] `--dry-run` validates env without API calls
- [ ] Report markdown contains cost, recall@5, wall_sec per cell
- [ ] Run-id is deterministic from manifest SHA (no time-component for cache lookups)
- [ ] Aborts cleanly if manifest verification fails

---

### Phase 4: Tests + docs [Complexity: S]

#### [qa] Task 4.1: Reproducibility test

**Status:** todo

**Depends:** Task 3.2

The keystone test: run the same scenario twice with `BENCH_SEED=42` against a mocked claude CLI. Output transcripts must be byte-identical (modulo timestamps). This is the test that makes the harness 100% reproducible by construction.

**Files:**

- Create: `scripts/bench/__tests__/reproducibility.test.ts`
- Create: `scripts/bench/__fixtures__/mock-claude.ts` (deterministic stub)

**Steps (TDD):**

1. Write the reproducibility test: 2 runs, diff transcripts (excluding timestamp lines), assert empty diff
2. Mock claude CLI returns fixture stream-json from `__fixtures__`
3. Run twice with same `BENCH_SEED=42`
4. Compare outputs; failure shows the first diverging line

**Acceptance:**

- [ ] Two runs with same seed → byte-identical transcripts
- [ ] Two runs with different seeds → different transcripts (assert diff is non-empty)

#### [docs] Task 4.2: README + methodology doc

**Status:** todo

**Depends:** Task 3.2

Document the harness so a 3rd-party plugin author can use it without reading the code. README has: how to run (single command), expected output format, cost cap, troubleshooting (rate limit, missing API key). Methodology doc cites the research file + summarizes the deterministic-by-construction property.

**Files:**

- Create: `scripts/bench/README.md`
- Create: `docs/bench/session-memory-methodology.md` (cross-references the 2026-05-14 research file)

**Steps:**

1. Write README with: install (none — bun built-in), 3-line how-to-run, expected output table, troubleshooting
2. Write methodology doc summarizing the 2026-05-14 research findings + linking to it
3. Run `wp audit docs-frontmatter` (or equivalent) to verify frontmatter

**Acceptance:**

- [ ] README has working "how to run" example
- [ ] Methodology doc cross-references `docs/research/2026-05-14-token-savings-benchmark-methodology.md`
- [ ] `wp_audit kind=docs-frontmatter` passes on new docs

---

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Type safety | `wp_typecheck` (or `bun run typecheck`) | Zero errors |
| Lint | `wp_lint` | Zero violations |
| Tests | `wp_test --file scripts/bench/**/*.test.ts` | All pass |
| Reproducibility | `bun test scripts/bench/__tests__/reproducibility.test.ts` | 2 runs byte-identical |
| Smoke (no API) | `WP_SKIP_UPDATE_CHECK=1 wp bench session-memory --dry-run` | Exit 0, valid manifest report |
| End-to-end (1 cell, real API) | `WP_SKIP_UPDATE_CHECK=1 wp bench session-memory --scenario debug --variant baseline --trials 1` | Cost < $1, report.md generated |

## Cross-Plan References

| Type | Blueprint / Doc | Relationship |
| ---- | --------------- | ------------ |
| Upstream | `docs/research/2026-05-14-token-savings-benchmark-methodology.md` | Methodology research that drove this blueprint |
| Upstream | `/Users/ozby/.claude/plans/virtual-rolling-eclipse.md` (Tier 3 section) | Predecessor benchmark plan for Terminal Bench harness — shares per-variant key isolation, manifest pinning patterns |
| Sibling | `/tmp/session-memory-benchmark/harness.js` | Tier-1 micro-benchmark; this is Tier-2/3 (token savings) |
| Downstream | None yet | Future: integrate into agent-kit CI for regression detection |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --------- | ---- | -------- | ---- |
| Rate limit during trial | Corrupt partial transcript | Variant runner aborts cleanly between trials, never mid-trial | 2.2 |
| Manifest mismatch (newer claude version) | Non-reproducible run | Refuse to run; print named diff; user must update lock or revert | 1.1 |
| Per-variant API key missing | Cache contamination | Validate at startup via `--dry-run`; refuse with clear error | 3.2 |
| Anthropic Usage API delay | Cross-check fails | Retry with exponential backoff; if persistently fails, log warning but don't block (per-call usage is good enough) | 2.2 |
| Scenario doesn't trigger compaction | Token savings invisible | Document scenario worst-case token count; auto-warn if observed < 50K | 3.1 |
| Mocked claude CLI in repro test diverges from real | False reproducibility | Smoke test compares mock output structure against real one quarterly | 4.1 |

## Non-goals

- Replacing context-mode wholesale — this benchmark proves savings, doesn't ship a replacement.
- Running on CI by default — too expensive ($30–50/run); developers run on-demand.
- Multi-LLM-vendor support — Anthropic only for v1; Codex/Gemini in future scope per Tier-3 plan.
- Replacing existing Tier-1 harness — this is Tier-2/3 (token savings); Tier-1 (raw ops) stays.

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Anthropic prompt cache contaminates results | Wrong token savings numbers | Per-variant API keys (Task 2.2 enforces) |
| LoCoMo-style benchmarks saturate against million-token models | Recall numbers don't differentiate | Custom agentic-scenario qrels (Task 3.1) |
| Mock claude in repro test diverges from real CLI | False reproducibility | Quarterly smoke test compares mock vs real (Task 4.1 acceptance) |
| Per-variant cost exceeds $50 cap | Run incomplete | Pre-flight 1-cell estimate; abort if projected > $80 (per existing benchmark plan) |
| Bun version drift breaks reproducibility | Numbers from old runs not comparable | Manifest pin enforces (Task 1.1) |

## Technology Choices

| Component | Technology | Version | Why |
| --------- | ---------- | ------- | --- |
| Runtime | Bun | 1.3+ | Hooks already use bun; native APIs (spawn, crypto, sqlite) |
| Test framework | bun:test (with vitest fallback for compat gaps) | built-in | Zero install; matches v2's pattern (Codex L1: Jest compat incomplete) |
| Schema validation | zod | catalog | Already in agent-kit; matches blueprint MCP pattern |
| Hashing | node:crypto SHA-256 | built-in | AgentMemory V4 standard |
| API client | Bun.spawn (claude CLI) with `stderr: "pipe"` | built-in | No SDK dependency; matches Tier-1 harness (Codex L2: must explicitly pipe) |
| Pricing source | Anthropic console (manual pull on run day) | dated JSON | Per Tier-3 plan F7 |
| Cache isolation | 4 distinct Anthropic **workspaces** (NOT keys) | — | Codex CRITICAL: cache is org+workspace-scoped since Feb 5, 2026 |

---

## Codex /plan-refine findings (2026-05-14, GPT-5 high reasoning)

| Sev | Finding | Fix applied / required |
|---|---|---|
| **CRITICAL** | Per-variant API keys do NOT isolate Anthropic prompt cache. Per Anthropic docs (Feb 5, 2026), cache is keyed by **organization + workspace**, not API key. Keys in same workspace share cache. | **Architectural change**: Use 4 distinct Anthropic **workspaces** (or deliberate cache-bust + measure penalty). Workspace setup is a pre-flight gate. |
| HIGH | `--plugin-dir` does NOT "load only this plugin" — coexists with normal/project config. Isolated HOME alone is incomplete isolation. | Add `--strict-mcp-config` flag + assert loaded plugin path matches expected in every cell (per Tier-3 plan F15). |
| HIGH | Per-variant key sourcing under-specified. Single-key user has no valid fallback. | Add explicit `--require-workspaces 4` validation; document `single-workspace` mode that disables cache and tags results with `cache: disabled`. |
| HIGH | Rate-limit handling not solved by "no mid-cell SIGTERM" alone. Rate limits happen INSIDE the claude subprocess. | Variant runner needs: temp transcript paths, atomic finalize on clean `result` event, stderr classification (rate_limit vs network vs auth), retry only at cell boundaries. |
| HIGH | Mocked claude CLI can silently rot. Concrete failure: real Claude renames `usage.cache_read_input_tokens` → `modelUsage.cacheReadInputTokens`; mock emits old; tests pass; reports show NaN. | Replace "quarterly smoke" with **schema compatibility gate**: store live-CLI fixture in `__fixtures__/`; reproducibility test refreshes fixture and fails if schema drifts. |
| HIGH | Scenario compaction is NOT verified. "Worst-case token count" + "warn if <50K" doesn't prove compaction fired. | Detect concrete compaction evidence: stop reason, compaction transcript marker, or Claude Code `compaction` event. Refuse to count run if no evidence. |
| HIGH | 5 qrels × 3 scenarios = 15 questions vs LoCoMo's 1,540. Cannot support defensible comparative recall claims with N=2 trials. | Either: (a) downscope to "directional regression detector" framing (no recall claims), OR (b) bump to ≥30 qrels per scenario. Document the choice. |
| HIGH | ELv2 "algorithm-learnable" is legally casual. Even patterns influenced by ELv2 source structure/names/tests carry risk. | Use clean-room spec process: write spec from research doc only (cites ELv2 sources but isn't derived); no source-derived test names; document provenance per file. |
| MEDIUM | `duration_ms` is `result` SIBLING, not part of `usage` object. Per-step assistant messages also carry usage; need event-id de-dup. | Update `usage-extractor.ts` design: parse `result.usage` (cumulative) AND filter per-step `assistant` events with event-id de-dup. Real captured fixture mandatory before implementation. |
| MEDIUM | Anthropic Usage API has reporting delay (~5min, sometimes hours). Blocking ±2% agreement at run end is fragile. | Mark reconciliation `pending` at run end; poll bounded (max 30min); update report later. Don't block run completion. |
| MEDIUM | Manifest hard-refusal on bun upgrade is hostile without update path. | Add `wp bench session-memory update-manifest --reason "..."` that records old/new versions, runs dry-run + 1-cell smoke, requires human-readable reason in lock diff. |
| MEDIUM | Cost estimate was wrong but $50 cap is safe. Real: 24 runs × 50K input ≈ $3.60 input + $0.36 cache_read + $4.50 cache_writes + $1.80 output = **~$10**. | Update cost section: realistic ~$10–15 per full run; $50 cap stays as safety margin. |
| LOW | `bun:test` Jest compatibility incomplete. | Acknowledge in tech choices: vitest fallback for any compat gap. |
| LOW | `Bun.spawn` defaults `stderr: "inherit"`. | Document in variant-runner.ts: must set `stderr: "pipe"` to capture rate_limit. |
| LOW | CLI registration pattern verified at `src/cli/cli.ts`. | Confirmed; add `'bench'` to `SUPPORTED_COMMANDS` in Task 3.2. |

## New tasks added by Codex review

#### [infra] Task 0.0: Workspace pre-flight (PRE-WAVE-0)

**Status:** todo

**Depends:** None

**BLOCKS ALL OTHER TASKS.** Verify the user has 4 distinct Anthropic workspaces and obtain admin keys for each. Without this, the entire benchmark's cache isolation premise is invalid (Codex CRITICAL finding).

Two acceptable modes:
- **isolated mode**: 4 separate workspace keys → clean per-variant cache isolation
- **single-workspace mode**: 1 key + `cache: disabled` mode (cache-bust per request) → results tagged as "cache-disabled baseline"

**Files:**
- Modify: `scripts/bench/lib/manifest.ts` to enforce mode selection
- Create: `scripts/bench/PREFLIGHT.md` documenting how to set up workspaces

**Acceptance:**
- [ ] Pre-flight refuses to run if workspace mode unspecified
- [ ] `single-workspace` mode tags reports with cache disclaimer
- [ ] `isolated` mode validates each key resolves to a distinct workspace via Anthropic API

#### [qa] Task 1.4: Live-CLI fixture refresh gate

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"command":"bun test scripts/bench/lib/refresh-cli-fixture.test.ts --coverage","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-28T14:08:10+02:00"},{"command":"bun test scripts/bench/lib/usage-extractor.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-28T14:08:12+02:00"},{"actor":"codex","allow_manual":true,"description":"Confirmed the PR CI workflow now runs the committed live-fixture gate alongside usage-extractor tests, and the refresh script exits non-zero on schema drift in the test harness.","kind":"manual","log_excerpt":"ci.webpresso.yml includes a pull_request-only 'Bench fixture compatibility gate' running bun test scripts/bench/lib/usage-extractor.test.ts and bun test scripts/bench/lib/refresh-cli-fixture.test.ts. The drift test asserts checkLiveFixture rejects with 'CLI fixture schema drift detected'.","result":"pass","ts":"2026-05-28T14:08:20+02:00"}]
```

**Depends:** Task 1.2 (usage-extractor.ts)

The mocked claude CLI test only catches schema drift if the fixture matches today's CLI. Add a CI-runnable script that captures a fresh fixture from real `claude --print` and diffs against the committed one. Schema drift → blocking failure (not warning).

**Files:**
- Create: `scripts/bench/__tests__/refresh-cli-fixture.ts`
- Modify: `scripts/bench/__fixtures__/sample-stream.jsonl` (versioned)

**Acceptance:**
- [x] Script captures fresh fixture, diffs against pinned, exits non-zero on schema drift
- [x] Run on every PR that touches `usage-extractor.ts` (CI gate)

## Refinement summary

| Metric | Value |
|---|---|
| Findings total | 15 (Codex Phase 1+3, after pre-Codex 9) |
| **CRITICAL** | 1 (per-variant key cache isolation invalid) → switched to per-variant workspace |
| HIGH | 7 |
| MEDIUM | 4 |
| LOW | 3 |
| Architecture-invalidating | 1 (cache isolation premise) — fixed via workspace mode + single-key fallback |
| New tasks added | 2 (Task 0.0 workspace pre-flight, Task 1.4 fixture refresh gate) |
| Tasks total | 11 (was 9) |
| Critical path | 5 waves (was 4) — pre-flight gates everything |
| Parallelization score | B (was A; pre-flight serializes Wave 0 start) |

---

## Decisions applied (2026-05-14, post-Codex)

User answered 3 refinement questions; these decisions reshape the blueprint:
### D1: Cache isolation → 3-vendor abstraction with explicit support tiers

**User answers (cumulative):**
- "we need something that works for both codex-cli and claude-code"
- "claude code+codex are must! but, open-code has to be supported fairly well if not %100"

**Vendor support tiers** (per `catalog/agent/rules/supported-agent-clis.md`):
- **Tier 1 (must work perfectly)**: Claude Code, Codex CLI
- **Tier 2 (fairly well, best-effort)**: OpenCode
- **Tier 3 (not supported)**: everything else

**Implication:** Harness is multi-vendor with degraded-tier support. Each `(vendor, variant)` cell has its own cache-isolation strategy AND token-extraction granularity:

| Vendor | Tier | Token granularity | Cache isolation |
|---|---|---|---|
| Claude Code | T1 | per-call (`--output-format stream-json` `result` event) | per-Anthropic-workspace OR cache-disabled |
| Codex CLI | T1 | per-call (`codex exec --json` `turn.completed` event) | per-OpenAI-org/project OR cache-disabled |
| OpenCode | T2 | session-only (`opencode -f json` + `opencode stats`) | depends on dispatched provider |

**Scope expansion:**
- New module: `scripts/bench/lib/vendor-adapter.ts` — abstract interface `VendorAdapter` with implementations `ClaudeCodeAdapter`, `CodexCLIAdapter`, `OpenCodeAdapter`
- Pre-flight Task 0.0 supports all three vendors with appropriate isolation gates per vendor
- Per-vendor pricing tables (`pricing/claude.json`, `pricing/openai.json`, `pricing/opencode-providers.json` — delegates to underlying provider)
- Report format adds `vendor` and `tier` columns; T2 cells show degraded-granularity disclaimer
- T2 cells use **session-aggregated** numbers per scenario; comparing to T1 per-call sums requires explicit caveat in the report

### D2: Recall scale → 30+ qrels for comparative claims

**User answer:** "30+ qrels = comparative claims"

**Implication:** Authoring effort doubles (3 scenarios × 30 = 90 qrels vs original 15 qrels). Benchmark cost ~2× ($20–25/run vs $10).

**Changes to Task 3.1:**
- Effort: M (was S)
- Acceptance: ≥ 30 qrels per scenario, with category labels (recall@k by category, like LoCoMo's single-hop / multi-hop / temporal)
- Authoring template + zod schema for category-tagged qrels

**New Task 3.3 (added):** Statistical analysis module
- `scripts/bench/lib/stats.ts` computes Wilson 95% CI on recall per `(vendor, variant, category)`
- Comparative claims gated: only emit "X% better" if CIs don't overlap

### D3: ELv2 posture → "Inspired by, MIT-license ours" (mild risk accepted)

**User answer:** "Inspired by context-mode, MIT-license ours"

**Implication:** No clean-room overhead. Devs can read context-mode source for inspiration; final code is in our own style and MIT-licensed.

**Changes:**
- Drop "clean-room spec process" from H8 fix; replace with: "Devs may read context-mode source for inspiration; commit messages must NOT cite specific context-mode line numbers; new code in our own style."
- Add `LICENSE-NOTICES.md` documenting which patterns were inspired-by-context-mode (provenance log, not legal disclaimer)
- Acknowledge legal risk in Risks table: "Mild — court could call it derivative; mitigation is documented provenance + style independence"

### Updated task structure (post-decisions)

| Wave | Tasks | Effort | New |
|------|-------|--------|-----|
| Wave 0 (gate) | 0.0 (workspace pre-flight, multi-vendor) | XS | yes |
| Wave 1 (parallel) | 1.1 (manifest), 1.2 (usage extractor — multi-vendor), 1.3 (cost aggregator), 1.5 (vendor adapter) | XS, S, XS, S | 1.5 NEW |
| Wave 2 (parallel) | 2.1 (transcript), 2.2 (variant runner — multi-vendor) | S, M | refactored |
| Wave 3 (parallel) | 3.1 (30 qrels × 3 scenarios), 3.2 (CLI command), 3.3 (stats module) | M, S, S | 3.3 NEW |
| Wave 4 | 4.1 (reproducibility test), 4.2 (docs + LICENSE-NOTICES.md), 1.4 (fixture refresh CI) | XS, XS, XS | 1.4 NEW |

**New total:** 13 tasks (was 11). Critical path: 5 waves. Parallelization score: B.

### Cost recalculation (post-decisions)

- 3 scenarios × 4 Claude variants × 2 trials = 24 cells
- 3 scenarios × 2 Codex variants × 2 trials = 12 cells
- 36 cells total × ~50K tokens = 1.8M tokens
- Anthropic Sonnet 4.5: ~$10
- OpenAI o4 / GPT-5: ~$5–8 (if pricing similar)
- **Realistic full-run cost: ~$15–20.** $50 cap stays safe.

### Open questions remaining

- **Codex CLI usage extraction format**: needs verification. `codex exec --json` emits stream events with usage — exact field names not yet confirmed. Task 1.5 (vendor adapter) acceptance gate: capture a real Codex stream-json fixture and verify field shape before implementation.
- **OpenAI cache isolation**: needs same fact-check as Anthropic — does OpenAI's prompt cache isolate by org or project? Needed for Task 0.0 pre-flight.
- **Codex memory plugin candidate**: what's the equivalent of context-mode for Codex CLI? May not exist as a standalone plugin — Codex's "memory" is built into the CLI itself. May need to compare Codex-with-memory-feature-on vs Codex-with-memory-off.
- **OpenCode plugin/memory equivalent**: OpenCode has its own Agents config system. Need to identify the closest equivalent to a session-memory plugin. Possibly skip variant comparison for OpenCode (use single OpenCode config) and only measure baseline cost.

---

## Codex /codex round 2 — second-opinion findings (2026-05-14, GPT-5 high)

Codex re-reviewed after the OpenCode/3-vendor expansion. Verdict: **same severity class as the original 1-CRITICAL+7-HIGH pass — the expansion reintroduced a CRITICAL at the foundation.** All 7 corrections applied below.

| Sev | Finding | Fix applied |
|---|---|---|
| ~~CRITICAL~~ **RESOLVED** (2026-05-14) | OpenCode telemetry premise was unproven. Live fixture capture via `opencode run --format json --pure` proved per-step events emit `tokens: {total, input, output, reasoning, cache: {write, read}}` AND pre-calculated `cost` per step. Industry-standard pattern (Bifrost/Maxim AI gateway proxy) is unnecessary — direct CLI parsing works. | **Captured fixture** at `scripts/bench/__fixtures__/opencode-stream.jsonl` (Task 0.-1 complete). OpenCode telemetry is per-step (granularity = "per-step", roughly equivalent to Claude/Codex per-call). Cost field eliminates need for OpenCode-specific pricing table — use OpenCode's pre-calculated cost as ground truth, optionally validate against provider rates. |
| HIGH | `{usage_per_call?, usage_session}` adapter shape leaks granularity into consumers via `undefined` branching | **Replaced with `UsageMeasurement`**: `{ total: TokenCounts, attribution: { kind: 'per-call' \| 'session-only', calls?: TokenCounts[] }, source: string, confidence: 'high' \| 'medium', tier: 1 \| 2 }`. Aggregator/cost code consumes `total` only; `attribution.kind` only relevant to stats/reporting. |
| HIGH | Cross-tier comparison gate is policy prose, not data structure | **`BenchmarkCell` gets first-class `{vendor, tier, granularity}` fields.** `stats.compare(a, b, { allowCrossTier?: false })` enforces in code: throws if `a.tier !== b.tier && !allowCrossTier`. Reporter receives pre-validated claims. |
| HIGH | Worktree parallelization wrong — extractor (1.2) cannot precede adapter interface (1.5); pre-flight (0.0) labeled both "Final" and "BLOCKS ALL" | **Re-sequenced**: 0.0 + 0.-1 (preflight) → 1.5 (interface only, types) → 1.2 + 1.3 + 1.1 in parallel → 2.x → 3.x → 4.x. Authoring tasks (3.1 qrels) stay parallel from Wave 0. |
| HIGH | Tier rule is prose, not infrastructure. No audit gate. CLAUDE.md re-lists tiers (drift risk). | **New Task 4.3**: implement `wp audit supported-agent-clis`. Scans plans/docs for known CLI names, requires tier classification, fails on Tier 3 silently added. CLAUDE.md trimmed to pointer-only (already done). |
| HIGH | OpenCode cache isolation not enforceable — config merges from multiple sources, parsing misses actual provider used | **OpenCode adapter contract update**: every `opencode run` invocation uses `--pure`, isolated `OPENCODE_CONFIG_CONTENT`, explicit `--model provider/model`, restricted `enabled_providers`. **Validate provider/model from emitted events**, fail-closed on mismatch. |
| MEDIUM | Cell/cost math inconsistent (36 vs 36-72 cells) | **Single explicit cell matrix below.** No more ranges. |

### The cell matrix (single source of truth)

```
SCENARIOS (3): debug-long-session, multi-file-refactor, resumable-task
TRIALS: N=2 per cell

Tier 1 cells (per-call attribution, full cache-isolated):
  Claude Code × {baseline, context-mode, v1, v2}    = 4 variants × 3 scenarios × 2 trials = 24 cells
  Codex CLI   × {baseline, codex-memory-on}         = 2 variants × 3 scenarios × 2 trials = 12 cells
  Tier 1 total: 36 cells

Tier 2 cells (session-only, baseline-reference only):
  OpenCode × {baseline}                              = 1 variant × 3 scenarios × 2 trials = 6 cells
  Tier 2 total: 6 cells

GRAND TOTAL: 42 cells
```

### Updated cost ceiling

- 42 cells × ~50K tokens = 2.1M tokens
- Anthropic Sonnet 4.5: ~$10
- OpenAI o4 / GPT-5: ~$5–8
- OpenCode (delegates to provider — costed at provider rates): ~$3
- **Realistic full-run cost: ~$18–22.** $50 cap stays as safety margin.

### New tasks added in round 2

- **Task 0.-1 (Phase -1, BLOCKS Phase 0)**: OpenCode telemetry fixture capture. Run `opencode run --format json "say hi"` against an isolated config, parse output, prove either (a) per-call usage events emit OR (b) `export <sessionID>` returns aggregate. If neither: demote OpenCode to reference-only.
- **Task 4.3**: `wp audit supported-agent-clis` — codifies the tier rule as enforced infrastructure, not policy prose.

### What round 2 did NOT find

- No new Code Quality issues (Section 2)
- No new Test issues (Section 3) beyond what's already in the test plan
- No new Performance issues (Section 4)

### Verdict

Codex: "Same severity class. Worse architecture confidence until OpenCode telemetry is fixture-proven. Once Task 0.-1 succeeds and the 7 fixes land, this is REVISE → ACCEPT."

---

## Architecture review (3-vendor scope, 2026-05-14)

### Findings (P1)

**P1-A1 — Vendor adapter interface must hide granularity asymmetry**
The 3 vendors emit usage at different granularities (Claude/Codex per-call vs OpenCode per-session). The `VendorAdapter` interface MUST normalize to a single shape: `{usage_per_call?: Usage[], usage_session: Usage}`. Adapters that lack per-call data return `usage_per_call: undefined`. Aggregator and reporter MUST handle the undefined case explicitly — not assume per-call presence.

**P1-A2 — Cache isolation strategy varies by underlying provider, not by CLI**
OpenCode dispatches to many providers (Anthropic, OpenAI, local). Cache isolation rules apply to the *dispatched provider*, not OpenCode itself. Pre-flight Task 0.0 must inspect OpenCode's selected provider per cell and apply the matching isolation gate (workspace for Anthropic, org/project for OpenAI). This is non-trivial — OpenCode config can change per-cell if scenarios specify different models.

**P1-A3 — Report comparability needs explicit tier column**
Without a `tier` column, readers will compare a T2 OpenCode cell to a T1 Claude cell as if they are equivalent. Report template MUST: (a) include `tier` column, (b) emit a "Comparing across tiers" caveat at top of any table that mixes tiers, (c) refuse to emit "X% better" claims that span tiers without `--allow-cross-tier` flag.

### Findings (P2)

**P2-A4 — Provider-pricing table indirection**
OpenCode's pricing depends on dispatched provider. Cleanest design: `OpenCodeAdapter.getCost(usage)` reads OpenCode config to determine provider, then delegates to `getProviderPricing(provider).cost(usage)`. This adds one indirection but avoids duplicating Anthropic/OpenAI pricing tables.

**P2-A5 — OpenCode "memory plugin" variant may not exist**
For Tier 1 vendors we compare baseline vs memory-plugin-on. For OpenCode there may not be a directly comparable "memory plugin" — OpenCode's Agents system is configuration, not a plugin. Decision: **skip variant comparison for OpenCode in v1** — measure OpenCode baseline only, document as "vendor reference cost." If user later identifies a memory-equivalent in OpenCode, add as a follow-up.

### Test plan addition (Section 3 of /plan-eng-review)

| Code path | Test required | Tier |
|---|---|---|
| `VendorAdapter` interface contract | Unit test: each adapter implements full interface; per-call usage returns undefined for OpenCode | T1+T2 |
| Pre-flight Task 0.0 vendor-specific isolation gates | Unit test: claude → workspace required; codex → org required; opencode → defers to provider | T1+T2 |
| Report writer cross-tier comparison gate | Unit test: emitting "X% better" across tiers without `--allow-cross-tier` throws | T1+T2 |
| OpenCode session-only usage extraction | Integration test (real `opencode -f json` fixture): extracts session totals correctly | T2 |
| OpenCode dispatched-provider detection | Unit test: parses OpenCode config to identify provider for cache-isolation routing | T2 |

### Updated cost ceiling

- 3 vendors × 2-4 variants × 2 trials × 3 scenarios = ~36-72 cells
- Tier 1 (Claude+Codex): full per-call attribution, ~$15
- Tier 2 (OpenCode): baseline only (no variant comparison), ~$5-8
- **Realistic full-run cost: ~$20-25.** $50 cap stays as safety margin.

### What this review did NOT find (zero findings)

- **Code quality (Section 2)**: No issues — vendor adapter is a clean interface; the 3 implementations are isolated.
- **Performance (Section 4)**: No issues — benchmark runs are sequential; vendor abstraction adds one virtual call per cell, negligible.

### Worktree parallelization

| Lane | Tasks | Notes |
|---|---|---|
| Lane A | 1.1 manifest, 1.3 cost aggregator, 1.5 vendor adapter (interface only) | All independent |
| Lane B | 1.2 usage extractor (Claude+Codex only) | Independent |
| Lane C | 3.1 scenarios + 30 qrels | Authoring work, no code conflicts |
| Wait | 1.4 fixture refresh CI, 1.5 vendor adapter (impls), 2.1 transcript, 2.2 variant runner | Need Lane A+B done |
| Wait | 3.2 CLI command, 3.3 stats module | Need 2.x done |
| Final | 4.1 reproducibility test, 4.2 docs, Task 0.0 pre-flight | All other tasks done |

3 parallel lanes in Wave 0-1; serial after that.
