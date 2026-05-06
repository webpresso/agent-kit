---
type: blueprint
status: draft
complexity: M
created: '2026-05-06'
last_updated: '2026-05-06'
progress: '0% (draft — refined 2026-05-06 against rtk@0.38.0 source + agent-kit/quality-engine/monorepo verification + second-pass fact-check applied)'
depends_on: []
tags:
  - agent-kit
  - mcp
  - dx
  - context-window
  - qa
---

# Compact QA Output Filters (rtk-inspired)

**Goal:** Make the output that `ak qa` / `ak test` / `ak lint` / `ak typecheck` returns to an LLM agent **compact by default** — failures-only, grouped, with a tiered passthrough fallback — so a full QA pass in `ozby/ingest-lens` fits inside one agent turn instead of blowing the context window. Replace the existing `clipRawOutput` heuristic clipping with structured, per-tool transforms.

## Product wedge anchor

- **Stage outcome:** Follow-up to the **completed** `webpresso-public-extraction-roadmap` (Wave 0 + Wave 1 are immutable foundations). Per the roadmap's "Completion rules and follow-up boundaries" rule 3, *"agent-kit roadmap UX/audit improvements"* are explicitly scoped as separate blueprints — this is one of those. Directly extends Decision 4 of that roadmap ("Quality-engine folds into agent-kit"): the chokepoint moved from a sibling package into agent-kit's MCP tool handlers, and `clipRawOutput` at [src/mcp/tools/_shared/result.ts:42](../../../src/mcp/tools/_shared/result.ts) is the truncation point that this blueprint upgrades to a tiered transform. Direct line to agent-kit's North Star ([VISION.md](../../../VISION.md)): *"`ak_*` MCP tools are now summary-first and context-friendly: structured results are canonical, while raw logs are clipped and secondary."* Today the structured side is `summary` + counts only — failure structure is missing.
- **Primary consuming surface:** `ozby/ingest-lens` — `pnpm qa` (scripts at [package.json](../../../../../ozby/ingest-lens/package.json): `"check": "vp check"`, `"test": "vp run test"`, `"check-types": "vp run check-types"`, `"lint": "vp run lint"`). Note: vp (vite-plus) wraps the underlying tools and adds its own framing — see F31. The Claude Code `webpresso-agent-kit:qa` skill calls the MCP `ak_qa` envelope defined at [src/mcp/tools/qa.ts](../../../src/mcp/tools/qa.ts).
- **Deferred consuming surface:** the **Monorepo** (`webpresso/monorepo`, proper noun per [Ubiquitous Language](../../../../../UBIQUITOUS_LANGUAGE.md)) — `just qa` (recipe at [justfile:161](../../../../monorepo/justfile)) runs its own parallel pipeline that does **not** call `ak qa`. Reaching the **Monorepo** requires either (a) routing `just qa` through the agent-kit MCP path or (b) shipping a separate compact-output adapter on the **Monorepo** side. **Punted to a follow-up blueprint** (see F8). Including it in this blueprint as written would over-scope it.
- **New user-visible capability:** An engineer running `ak qa` (directly, via `pnpm qa`, or via the QA skill) sees only the relevant signal — failing tests with one stack frame each, lint errors grouped by rule + file, tsc errors grouped by file with cascade collapse. Their AI session reasons about all failures in one turn instead of asking the user to re-run scoped commands.

## Why

Verified state of agent-kit (second-pass fact-check 2026-05-06):

- **`clipRawOutput` is canonical at [src/mcp/tools/_shared/result.ts:42](../../../src/mcp/tools/_shared/result.ts).** Six call sites: `lint.ts:196`, `lint.ts:255`, `test.ts:90`, `typecheck.ts:174`, `e2e.ts:149`, `audit.ts:187`+`audit.ts:198`. (Original blueprint claimed 3.)
- **A tsc parser already exists** at [src/mcp/tools/typecheck.ts](../../../src/mcp/tools/typecheck.ts) — function `parseTscOutput` with regex `/^(.+?)(?:\((\d+),\d+\)|:(\d+):\d+)(?::\s*|\s+-\s+)error TS(\d+):\s*(.*)$/m` and `TscError {file, line, code, message}` shape. Task 2.3 evolves this, doesn't replace it.
- **An oxlint parser already exists** at [src/mcp/tools/lint.ts](../../../src/mcp/tools/lint.ts) — emits `LintIssue[]` into `details.issues` with a `parseError` field. Task 2.1 evolves this.
- **`ak_qa` composes by calling sub-tool handlers directly** ([qa.ts:96](../../../src/mcp/tools/qa.ts)): `Promise.all([lintTool.handler(...), typecheckTool.handler(...), testTool.handler(...)])`. So qa.ts inherits the new shape automatically when the sub-tools update.
- **agent-kit's CLI commands directory** has a flat-file pattern ([src/cli/commands/](../../../src/cli/commands)): `audit.ts`, `dev.ts`, `docs.ts`, `e2e.ts`, `mcp.ts`, `roadmap.ts`, `skills.ts`, `symlink.ts`, `test.ts` are flat; `blueprint/`, `init/`, `tech-debt/` are dirs (for complex commands with subverbs). `src/cli/index.ts` does **not** exist (registration happens elsewhere). `ak err` follows the flat-file pattern.
- **agent-kit pins `vitest@^2.1.0` for its own tests** (package.json:devDependencies). Both consumers pin `vitest@^4.x`. Snapshots are needed for both major versions (F30, F37).
- **`zod@^4.3.6` is already a dep** — schemas reuse this.
- **PreToolUse hook redirect is already shipped — works in BOTH Claude Code and Codex/OMX.** [src/hooks/pretool-guard/dev-routing.ts:27-45](../../../src/hooks/pretool-guard/dev-routing.ts) routes prefixes (`pnpm test`, `vitest`, `just test`, `oxlint`, `tsc`, `pnpm qa`, `just qa`, etc.) → MCP tools via `permissionDecision: 'deny'` + `permissionDecisionReason` pointing at `mcp__agent-kit__ak_test|lint|typecheck|qa`. Verified at [runner.ts:104](../../../src/hooks/pretool-guard/runner.ts) and [validators/mcp-redirect.ts](../../../src/hooks/pretool-guard/validators/mcp-redirect.ts). Effect: when this blueprint's transforms land at the MCP handler layer, **every redirected call automatically gets compact output** — no new hook work needed.
- **Codex/OMX coverage:** the same `ak-pretool-guard` binary is wired into `.codex/hooks.json` by [agent-hooks/index.ts:160-185](../../../src/cli/commands/init/scaffolders/agent-hooks/index.ts). Codex adopted Claude Code's hook event names (`PreToolUse`, `PostToolUse`, `SessionStart`, `Stop`, `UserPromptSubmit`) and JSON output protocol verbatim, so a single JSON-emitting binary serves both. In ingest-lens ([.codex/hooks.json](../../../../../ozby/ingest-lens/.codex/hooks.json)), OMX's native hook (`oh-my-codex/dist/scripts/codex-native-hook.js`) and `ak-pretool-guard` run as **two independent entries** under the same `PreToolUse` event — they compose, neither wraps the other. OMX consumes MCP tools via `$CODEX_HOME/config.toml` (registered by [codex-mcp scaffolder](../../../src/cli/commands/init/scaffolders/codex-mcp/index.ts)).
- **Why deny + redirect, not rewrite:** Claude Code's PreToolUse spec doesn't support command rewrite the way rtk's bash hook does. Codex inherits the same constraint. agent-kit chose deny + structured guidance (`mcp__agent-kit__ak_test(...)`), which is the correct shape for the MCP loop and works identically across both runtimes.

`rtk-ai/rtk@0.38.0` (read 2026-05-06) demonstrates that the *output boundary* between a tool and an LLM is a high-leverage place to compress, claiming 60–90% token reduction with <10ms overhead. After reading the actual rtk source we know the **real** technique:

- Per-tool **Tier 1/2/3 parser** in [src/cmds/js/vitest_cmd.rs](https://github.com/rtk-ai/rtk/blob/master/src/cmds/js/vitest_cmd.rs): force `--reporter=json`, parse with serde, fall back to regex on summary lines, fall back to passthrough with stderr warning. ~12 KB Rust per tool.
- Per-tool dedicated module: vitest 12 KB, tsc 11 KB, eslint+biome combined 21 KB, playwright 14 KB, pnpm 16 KB. **Not** the "thin declarative filter" the README implies — most JS-tool work lives in hand-written Rust modules.
- Pre-compiled `lazy_static! Regex` + `HashMap` grouping by file and error code (tsc).
- Token-saved analytics emitted via `tracking::*` for every filter call.

Our advantage:

- We already control the chokepoint — `agent-kit/src/mcp/tools/{lint,test,typecheck,qa}.ts` is where every consumer's QA results pass through `Promise.all`-fanned subtools and back to the agent. Adding transforms here lands across every consumer with no per-tool external binary.
- We already install hooks via `ak setup` (`ak-pretool-guard`, `ak-post-tool`, `ak-stop-qa`) into Claude Code and Codex. No new install path needed.
- We're TS in-process — zero install overhead vs `ak`, no per-OS Rust binary, can borrow the *heuristic* without porting tier-based JSON parsers wholesale.

Our gap vs rtk:

- `clipRawOutput` is a fixed-length truncate at byte boundaries. It can hide the actual failure when output is verbose (e.g., vitest stack frames push pass/fail summary outside the budget).
- The `ak_qa` shape is `{passed, lint, typecheck, test}` where each leaf is a clipped raw blob. The agent has to parse English to find what failed.
- No tiered fallback — if the underlying tool changes its output format, `clipRawOutput` silently keeps clipping the wrong thing.

## Findings (Refinement Pass 2026-05-06)

| ID  | Severity | Claim (original blueprint)                                                                                                                                                  | Reality                                                                                                                                                                                                            | Fix                                                                                                                                  |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | CRITICAL | "Extend `CommandSpec` in `quality-engine` with an optional `outputTransform` field"                                                                                         | `quality-engine` has no `CommandSpec` type. Files: `target-resolver.ts`, `command-builder.ts`, `log-paths.ts`, `workspace-config.ts`, `package-import-rules.ts`, `test-classification.ts`. It builds commands, doesn't process output. | Move transforms into `agent-kit/src/output-transforms/` and have `agent-kit/src/{lint,test,typecheck}/index.ts` call them.            |
| F2  | CRITICAL | "`quality-engine` is the single chokepoint for `ak qa`/`lint`/`test`/`typecheck`"                                                                                            | The chokepoint is `agent-kit/src/mcp/tools/*.ts` + `agent-kit/src/{lint,test,typecheck}/index.ts`. quality-engine is upstream — it builds the command line. Output handling lives in agent-kit.                    | Re-target the implementation outline at agent-kit's MCP tool layer.                                                                  |
| F3  | HIGH     | "ingest-lens uses oxlint + vitest"                                                                                                                                          | ✅ Confirmed: `oxlint@1.61.0` + `oxlint-tsgolint@0.21.1` (note: tsgolint sidecar is in use). vitest via `@webpresso/vitest-config` catalog.                                                                          | Implementation must handle `oxlint` AND `oxlint-tsgolint` output formats — they differ.                                              |
| F4  | HIGH     | "rtk filter implementations live under `crates/rtk/src/filters/`"                                                                                                           | rtk is single-crate (no `crates/` workspace). TOML configs at `src/filters/*.toml` (59 files) cover only simple regex/strip-line filters. Real filter code is in `src/cmds/<lang>/*_cmd.rs`. Of 59 TOMLs, only `oxlint.toml` (1.2 KB) is relevant to us. | Update reference paths. Read `src/cmds/js/{vitest,tsc,playwright,pnpm}_cmd.rs` and `src/filters/oxlint.toml`, NOT a `crates/` path.   |
| F5  | HIGH     | "100+ small filters in TOML"                                                                                                                                                | 59 TOML configs but most are trivial line-strippers. Heavy lifting is in 12-21 KB Rust modules per JS tool. README's "100+ supported commands" includes commands that fall through to `npm_cmd::exec` (e.g. wrangler, stryker have zero filter code).                          | Maintenance footprint of "borrowing rtk's approach" is **per-tool Rust port**, not config copy. Cap our scope at 4 transforms.       |
| F6  | HIGH     | "Lock to JSON reporters where available; snapshot tests catch upstream breakage"                                                                                            | Insufficient. rtk uses an explicit **Tier 1 (JSON parse) → Tier 2 (regex fallback) → Tier 3 (passthrough with stderr warning)** pattern. Tier 2 catches partially-valid output; Tier 3 fails open instead of dropping data. | Adopt the tiered parser pattern explicitly. Document the tiers per transform.                                                        |
| F7  | MEDIUM   | "Use `--reporter=dot` for live + `--reporter=json` post-process"                                                                                                            | rtk uses `--reporter=json` alone for vitest. Vitest 4.x supports stacked reporters but the JSON output is consumed via `--reporter=json --outputFile=<path>` if you want to keep terminal output too. Need to verify which fits MCP path. | Use `--reporter=json` only on the MCP path (no terminal user); decide on stacked reporters separately if interactive needs it.       |
| F8  | HIGH     | "monorepo `just qa` is a consuming surface"                                                                                                                                 | monorepo's [justfile:161](../../../../monorepo/justfile) `qa` recipe is its own parallel pipeline. It does NOT route through `ak qa` MCP. Variadic `--package` and `--file` flags are monorepo-local.               | Demote monorepo to a **deferred** wedge. File a follow-up blueprint for `monorepo-route-qa-through-ak` once the agent-kit transforms ship. |
| F9  | LOW      | rtk license = "Apache-2.0"                                                                                                                                                  | rtk Cargo.toml says `license = "MIT"`.                                                                                                                                                                              | Correct attribution. MIT is fine — same compatibility for re-licensing under MIT or Apache.                                          |
| F10 | HIGH     | "Update MCP skill response shape to structured failure list"                                                                                                                | `ak_qa` already returns `{passed, lint, typecheck, test}` with structured leaves. `clipRawOutput` is the actual gap, not the top-level shape.                                                                       | Replace `clipRawOutput` with typed transforms; preserve the existing `ak_qa` envelope.                                               |
| F11 | HIGH     | "rtk is a thin filter library worth lifting from"                                                                                                                           | rtk is ~16 KLOC Rust maintained by one person at v0.38 — high churn. Filter heuristics per tool are 12-21 KB of Rust w/ `lazy_static`/`serde`/regex.                                                                | Lift *technique* (tiered parser, JSON-first, regex fallback, dedup-with-counts), not code. Each port is a discrete TS reimplementation. |
| F12 | MEDIUM   | "vitest `--reporter=json` works"                                                                                                                                            | Both consumers are on **vitest@4.x** (monorepo `^4.1.4`, ingest-lens via `@webpresso/vitest-config` catalog). Vitest 4 changed reporter internals. JSON reporter shape is mostly stable but `outputFile` semantics differ. | Validate against the actual version each consumer pins. Add a fixture per major-version.                                             |
| F13 | MEDIUM   | "Default ON when invoked from MCP, OFF when invoked interactively"                                                                                                          | Implementation must detect via `process.stdout.isTTY` and the MCP transport flag. Trivial but not implicit.                                                                                                         | Specify the detection rule and add a unit test.                                                                                      |
| F14 | LOW      | "ingest-lens uses just oxlint"                                                                                                                                              | Also runs `oxlint-tsgolint` (sidecar TS rules). Output format differs from plain oxlint.                                                                                                                            | Transform must handle both. Add fixtures for each.                                                                                   |
| F15 | HIGH     | "Build new transforms behind a `--compact` flag" (implies new system)                                                                                                       | `clipRawOutput` already exists at `agent-kit/src/mcp/tools/lint.ts:196` and is called from every MCP tool. We're **replacing** existing infrastructure, not building parallel.                                       | Rephrase scope: evolve `clipRawOutput` into a typed-transform dispatcher. Keep the function name and call sites; change implementation. |
| F16 | LOW      | rtk has separate `eslint` and `biome` filters                                                                                                                               | rtk lumps both into [src/cmds/js/lint_cmd.rs](https://github.com/rtk-ai/rtk/blob/master/src/cmds/js/lint_cmd.rs) (21 KB) — same module handles both via `--format=json`. We don't need biome (neither consumer uses it). | Drop biome from scope. Keep oxlint only.                                                                                             |
| F17 | MEDIUM   | "Track token-saved metric for verification"                                                                                                                                 | rtk emits this via `tracking::*` in every `*_cmd.rs`. Worth replicating as a verification gate.                                                                                                                     | Add `tokensSaved` to MCP transform return + assert in tests.                                                                         |
| F18 | LOW      | "Cover `ak err <cmd>` for pulumi/wrangler"                                                                                                                                  | rtk has no wrangler/stryker filter — those fall through to passthrough. Same for us: `ak err` is the catch-all.                                                                                                     | Keep `ak err` as the explicit fallback, document its scope.                                                                          |
| F19 | MEDIUM   | "Snapshot tests catch upstream breakage"                                                                                                                                    | True but insufficient. rtk also tests at the `Tier1 → Tier2 → Tier3` boundary — explicit fixtures for malformed JSON.                                                                                               | Add malformed-input fixtures per transform; assert it falls back to Tier 2 then Tier 3 cleanly.                                       |
| F20 | LOW      | "Compress `pnpm install` output"                                                                                                                                            | rtk has 16 KB pnpm wrapper but `pnpm install` output is rarely in the agent's BOOKEND budget. ingest-lens runs it in CI, not in normal QA loop.                                                                     | Out of scope for this blueprint. File a follow-up if CI-log compression becomes a need.                                              |
| F21 | CRITICAL | "Step 1: add `outputTransform` plumbing to `CommandSpec` in `quality-engine`"                                                                                               | See F1, F2. Mis-located.                                                                                                                                                                                            | Step 1 becomes "create `agent-kit/src/output-transforms/` and migrate `clipRawOutput` callers."                                       |
| F22 | LOW      | "`ak err` location"                                                                                                                                                          | agent-kit CLI commands live under `src/cli/commands/<verb>/index.ts`. New verb follows that.                                                                                                                        | See F32 — actual pattern is mixed; flat-file is correct for `ak err`.                                                               |
| F23 | CRITICAL | "Three callers of `clipRawOutput`: lint, test, typecheck"                                                                                                                    | Six callers: `lint.ts:196`, `lint.ts:255` (pnpm fallback), `test.ts:90`, `typecheck.ts:174`, `e2e.ts:149`, `audit.ts:187`+`audit.ts:198`. Missed e2e and audit.                                                       | Task 1.1 must migrate all six call sites; the dispatcher must accept dynamic toolNames (e.g. `ak_audit-${kind}`).                   |
| F24 | CRITICAL | "Modify `src/cli/index.ts` (register `err` verb)"                                                                                                                            | `src/cli/index.ts` does **not exist**. Verified via `head -30` → `No such file or directory`.                                                                                                                       | Drop that line. Registration likely happens in the bin entry; locate at implementation time. Task 2.4 shouldn't fabricate the path. |
| F25 | HIGH     | "Modify `src/mcp/tools/qa.ts` for shape extension (Task 3.1)"                                                                                                                | qa.ts composes by calling `lintTool.handler` / `typecheckTool.handler` / `testTool.handler` and unwrapping. It does **not** transform the leaves itself — it inherits whatever shape the sub-tools return.        | Task 3.1's qa.ts modification reduces to: confirm the unwrap+envelope still type-checks against the new leaf shape. No leaf-level work in qa.ts. |
| F26 | HIGH     | Task 2.3: "Build a new tsc transform"                                                                                                                                        | `parseTscOutput` already exists at typecheck.ts. Already produces `TscError[]` with `{file, line, code, message}`.                                                                                                  | Task 2.3 becomes "evolve parseTscOutput to add cascade-collapse + group-by-file output rendering." Smaller scope than originally planned. |
| F27 | HIGH     | Task 2.1: "Build a new oxlint transform"                                                                                                                                     | A `LintIssue` parser already runs in lint.ts (issues array goes into `details.issues` with a `parseError` field).                                                                                                   | Task 2.1 becomes "evolve LintIssue parser to add rule-grouping + Tier 2 fallback. Add `oxlint-tsgolint` parser variant."             |
| F28 | HIGH     | "e2e is out of scope (deferred)"                                                                                                                                             | `ak_e2e` is a real existing tool that calls `clipRawOutput` ([e2e.ts:149](../../../src/mcp/tools/e2e.ts)). The dispatcher migration WILL touch it.                                                                  | Task 1.1 includes e2e.ts. e2e content stays Tier 3 passthrough until a future blueprint adds a playwright-aware transform.            |
| F29 | HIGH     | "audit is out of scope"                                                                                                                                                      | Same — `ak_audit-${kind}` calls `clipRawOutput` at audit.ts:187+198. Dynamic toolName.                                                                                                                              | Dispatcher must accept template-style toolNames or strip the `-${kind}` suffix before lookup.                                       |
| F30 | CRITICAL | "Pin tests against vitest@4.x"                                                                                                                                               | **agent-kit itself uses vitest@^2.1.0.** Both consumers (ingest-lens, monorepo) use vitest@^4.x.                                                                                                                    | Need fixtures for **both** vitest@2 and vitest@4 JSON shapes. Or pin Tier 1 schema strictly and rely on Tier 2 regex for cross-version.|
| F31 | CRITICAL | "Vitest emits the JSON we parse"                                                                                                                                             | ingest-lens runs vitest under `vp run test` (vite-plus wraps the test command and adds prefix framing — version markers, env-loaded notices, etc.). The JSON we receive may be wrapped or interleaved.              | Tier 1 must be tolerant of leading/trailing non-JSON lines. Use `extract_json_object` pattern from rtk vitest_cmd.rs. Add fixture for vp-wrapped output. |
| F32 | LOW      | F22 mid-fix: "`src/cli/commands/err/index.ts`"                                                                                                                                | Flat-file pattern is the convention for simple verbs (`audit.ts`, `dev.ts`, `docs.ts`, `e2e.ts`, `mcp.ts`, `roadmap.ts`, `skills.ts`, `symlink.ts`, `test.ts`). Subdirectories are for complex verbs only.           | Final path: `src/cli/commands/err.ts` + `src/cli/commands/err.test.ts`.                                                              |
| F33 | HIGH     | "Detect MCP context via `runViaMcp` flag"                                                                                                                                    | No such flag. agent-kit has `isMcpReady()` from `#hooks/shared/mcp-sentinel`, but that's for hook routing — not in MCP tool handlers.                                                                                | Inside an MCP tool handler the code IS by definition running via MCP — no detection needed. TTY detection is only relevant at the **CLI surface** (`src/cli/commands/{test,docs,...}.ts`). Task 1.2 narrows to CLI-side TTY detection only. |
| F34 | LOW      | "oxlint --format=json works"                                                                                                                                                 | Confirmed via `oxlint --help`: `-f, --format=ARG  Possible values: ... 'json' ...`.                                                                                                                                  | No change.                                                                                                                          |
| F35 | LOW      | "`output-transforms/` is a new module"                                                                                                                                        | Confirmed: no existing `output-transforms` or `transforms` directory under src/.                                                                                                                                    | Sibling to existing `src/{lint,test,typecheck}/` (which are RUNNERS, not output processors). Naming: keep `output-transforms/`.       |
| F36 | LOW      | "Fixtures under `__fixtures__/<tool>/`"                                                                                                                                      | Existing convention: `__fixtures__/` at root + co-located `src/<module>/__fixtures__/`. Co-location wins for module-local data.                                                                                      | Place at `src/output-transforms/__fixtures__/<tool>/` to match `src/blueprint/service/__fixtures__` and `src/hooks/pretool-guard/validators/__fixtures__`. |
| F37 | MEDIUM   | "Snapshot fixtures versioned per minor release"                                                                                                                              | Per F30 we need at least vitest@2 and vitest@4 fixtures up front.                                                                                                                                                   | Fixture filenames carry version: `vitest-2.x-one-fail.json`, `vitest-4.x-one-fail.json`.                                             |
| F38 | CRITICAL | "Pass `--reporter=json` via `pnpm test -- --reporter=json`"                                                                                                                  | **PoC 3 disproves this.** `pnpm -F lab test -- --reporter=json src/x.test.ts` expands to `vitest run -- --reporter=json src/x.test.ts`. Vitest treats the `--` as a positional separator and interprets `--reporter=json` as a file path. Default reporter runs. **No JSON output.** | The backend MUST bypass the package's `test` script. **PoC 4 confirmed working:** `pnpm -F lab exec vitest run --reporter=json --no-color <files>` — zero framing, clean JSON, 96% reduction (5106B → 189B). |
| F39 | CRITICAL | "Transform plugs into existing pnpm/just backends without backend changes"                                                                                                   | **`src/mcp/backends/{pnpm,just}.ts` run `pnpm test` / `just test` verbatim** with no reporter override. The transform's Tier 1 will never fire on raw output that's not JSON.                                       | The blueprint **must add backend changes**: detect vitest-using packages, switch from `pnpm test` to `pnpm -F <pkg> exec vitest run --reporter=json`. Same for the just backend. New task: `Task 1.3: backend reporter injection`. |
| F40 | HIGH     | "ak-pretool-guard always emits JSON-shaped deny via stdout"                                                                                                                  | **PoC 5 found two paths.** When MCP is ready: `exit 0` + `hookSpecificOutput.permissionDecision: deny` JSON to stdout. When MCP is NOT ready: `exit 2` + formatted human message to stderr. Both block; output stream differs. | Both paths are correct (Claude Code and Codex both honor either form). Document both modes in the blueprint and don't claim a single output shape. |
| F41 | LOW      | "Dispatcher needs full TS inference"                                                                                                                                         | TS strict mode flags `Array.isArray()` widening — params become `any[]`. **Reference impl uses `is*Shape` user-defined type guards instead.** PoC verified clean strict typecheck.                                  | Use named type-predicate helpers (`isVitestShape`, `isOxlintShape`) — KISS, satisfies `no-implicit-any` lint rule, no `// @ts-expect-error` escape hatches. |

**Findings totals:** 41 — Critical: 9, High: 19, Medium: 6, Low: 7. F23–F37 are second-pass corrections from running tools against the live tree. F38–F41 are **PoC-confirmed** corrections from running actual tool invocations and the reference implementation against captured fixtures. Net effect: scope holds at 4 transforms but **adds one backend-injection task** (F38, F39).

## Vision & philosophy alignment

Cross-checked against [`VISION.md`](../../../VISION.md), [`AGENTS.md`](../../../AGENTS.md), the **completed** [`webpresso-public-extraction-roadmap`](../../../../monorepo/webpresso/blueprints/completed/webpresso-public-extraction-roadmap/_overview.md), the [`testing-philosophy`](../../../catalog/agent/skills/testing-philosophy/SKILL.md) skill, and the [Ubiquitous Language](../../../../../UBIQUITOUS_LANGUAGE.md) glossary on 2026-05-06.

| Vision principle / invariant                              | Alignment in this blueprint                                                                                                                                                                                                                              |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **North Star** ("`ak_*` MCP tools summary-first, structured canonical") | Direct extension. Adds `failures: Failure[]` and `tier` to the existing summary-first envelope. `rawOutput` stays clipped and secondary as today.                                                                                                            |
| **Softest sufficient boundary**                           | TS in-process transforms at the existing `clipRawOutput` chokepoint. Softer than: a new Rust binary (rtk's path), per-IDE hook adapters, a linter plugin, or a separate package. We're upgrading existing infrastructure, not adding new layers.            |
| **Catalog is law**                                        | Catalog rule changes (Task 3.2 `cmd-execution.md`) edit `catalog/agent/rules/` first — that's what ships to consumers — then `ak symlink sync` propagates to `.agent/`. No hand-edits to per-IDE surfaces.                                                  |
| **Multi-IDE distribution is zero-maintenance**            | Transforms live at the runner layer. Every IDE (Claude Code, Codex, Gemini, Cursor, Windsurf, Cline, Kilocode, Antigravity) gets compact output automatically because they all route through the same MCP tool handlers via the verified PreToolUse redirect. |
| **Fail loudly, never silently degrade**                   | Tier 1 → Tier 2 → Tier 3 ladder emits stderr warning on every degradation step. Tier 3 passthrough is documented as "drift signal" — CI snapshot tests assert Tier 1 still parses against pinned tool versions.                                              |
| **Surfaces load at the right time**                       | N/A for transforms (runtime code, not catalog rules). Applies to Task 3.2 docs update only — `cmd-execution.md` is path-scoped.                                                                                                                            |
| **Vision boundaries — IN scope**                          | "Quality gates" (existing audit list) explicitly include this kind of work. agent-kit's MCP tools, hooks, and audits are in scope per [VISION.md § Boundaries](../../../VISION.md).                                                                            |
| **Vision boundaries — OUT of scope**                      | Not running AI agents (we improve their tooling, not replace their runtime). Not repo-specific rule content (transforms are universal). Not authoring prompts. Not consumer application/runtime code.                                                       |
| **Anti-pattern: `prepare: ak setup`**                     | N/A — no install-lifecycle hooks added.                                                                                                                                                                                                                  |
| **Anti-pattern: hand-edit generated `.claude/` / `.codex/`** | N/A — no per-IDE surface edits. PreToolUse hook redirect is verified-already-shipped (not modified by this blueprint).                                                                                                                                      |
| **Anti-pattern: worktree-local `.claude/` isolation**     | N/A.                                                                                                                                                                                                                                                     |
| **Public package isolation invariant**                    | Zero `@webpresso/*` runtime or dev deps added. Reference impl uses only `node:` built-ins. Self-contained per [README § Design Invariants](../../../README.md).                                                                                              |
| **Catalog content is canonical once shipped**             | New transforms are `src/` (TS code), not catalog. No catalog content is mutated except Task 3.2's documentation update.                                                                                                                                      |
| **Testing philosophy — TDD Iron Law**                     | Every Task X.Y has explicit TDD steps with `ak test --file <path>` red→green cycles before implementation.                                                                                                                                                  |
| **Testing philosophy — integration-first**                | Task 4.1 (ingest-lens BOOKEND) is the integration test that hits the real MCP path. Per-transform unit tests come after. Pyramid: ~70% unit (transforms), ~15% integration (BOOKEND + escape hatch), ~10% E2E redirect verification.                       |
| **Testing philosophy — 85% mutation score**               | Added as gate G10 below.                                                                                                                                                                                                                                 |
| **Testing philosophy — E2E never call internal APIs**     | Task 4.1 invokes via the MCP transport (`ak_qa` tool call), not by importing `applyTransform` directly.                                                                                                                                                    |
| **Ubiquitous Language — Reference consumer**              | `ozby/ingest-lens` correctly identified as the integration-test gate (per glossary).                                                                                                                                                                       |
| **Ubiquitous Language — Monorepo (proper noun)**          | `webpresso/monorepo` capitalized as the **Monorepo** in deferred-wedge text; lowercase use eliminated.                                                                                                                                                     |
| **Ubiquitous Language — Audit (non-mutating)**            | Blueprint never invokes mutation as audit. New `transform-drift` audit (out of scope, parked) would also be non-mutating per definition.                                                                                                                   |
| **Roadmap completion rules**                              | This blueprint sits as a follow-up to the completed extraction roadmap, per its rule 3. It does not reopen completed waves. Decision 4 (quality-engine folds into agent-kit) is the direct lineage.                                                         |

## PoC artifacts (verified 2026-05-06)

The blueprint is grounded against running PoCs in [`__poc__/`](./__poc__/):

| PoC | Result | What it proves |
| --- | --- | --- |
| PoC 1 | `oxlint-1.61-real-output.json` (873B) | oxlint@1.61 JSON shape: `{diagnostics: [{code: "eslint(no-X)", filename, severity, labels: [{span: {line, column}}], message}]}` |
| PoC 2 | `vitest-4-direct.json` (2.3KB) | vitest@4.1.5 JSON shape verified: `{numTotalTests, numFailedTests, success, testResults: [{name, assertionResults: [{fullName, status, failureMessages}]}]}` |
| PoC 3 | (negative result, F38) | `pnpm -F <pkg> test -- --reporter=json <file>` does NOT forward — vitest treats `--` as positional separator |
| PoC 4 | `vitest-4-pnpm-exec-strategy.json` | `pnpm -F <pkg> exec vitest run --reporter=json --no-color <file>` produces clean JSON, **zero framing, 96% reduction (5106B → 189B)** |
| PoC 5 | `pretool-guard-pnpm-test.json` | `ak-pretool-guard` blocks `pnpm test`, `vitest`, `oxlint`, `tsc`. Two output paths (F40): MCP-ready → JSON deny on stdout / exit 0; MCP-not-ready → formatted message on stderr / exit 2. Both block. |
| PoC 6 | `tsc-cascade-collapse.txt` | Existing tsc regex extracts cascades correctly. Cascade-collapse heuristic compresses 4 identical errors → 1 line + count. |
| Reference impl | `reference-impl.ts` (215 LOC) | **Strict TypeScript** typecheck clean. **8/8 fixture tests pass:** oxlint Tier 1 (63B), vitest Tier 1 direct (169B), vitest Tier 1 vp-wrapped (tolerates framing), tsc cascade collapse, e2e Tier 3 passthrough, dynamic name normalization (`ak_audit-blueprint-lifecycle` → `audit`), clean run (0B), vitest Tier 2 regex fallback. |
| Architecture analysis | `peer-plugin-architecture.md` | Deep read of context-mode@1.0.111 + rtk@master sources + measured fork costs. **Confirms transforms-inside-MCP-handler is optimal** (zero per-call fork). Documents the three-peer hook chain: ak (Bun, 46ms) + rtk (Rust, ~5ms) + context-mode (Node, 91ms). Recommends `RTK_HOOK_EXCLUDE_COMMANDS` populated with our 10 prefixes to skip redundant rtk forks. |

The reference impl pins the design shape — implementation tasks in this blueprint port it into the agent-kit tree with full per-tool tests.

## Scope (revised)

### A. Output-transform module in agent-kit

Create `agent-kit/src/output-transforms/` (sibling to existing `src/{lint,test,typecheck}/` which are runners, F35) with one file per transform plus an `index.ts` dispatcher. Migrate **all six** `clipRawOutput` call sites (F23): `src/mcp/tools/lint.ts:196`, `lint.ts:255` (pnpm fallback), `test.ts:90`, `typecheck.ts:174`, `e2e.ts:149`, `audit.ts:187`+`audit.ts:198`. The dispatcher selects a transform by tool name + invocation context; for dynamic names like `ak_audit-${kind}` strip the suffix before lookup (F29). Fall back to the existing clip behavior when no transform matches.

Public shape (TS):

```ts
export type TransformResult = {
  ok: boolean;
  // Structured failures the agent can reason over without re-parsing English.
  failures: Failure[];
  // Bytes of compact output emitted (for token-budget assertions).
  bytes: number;
  // Tier the parser landed on (1 = full JSON, 2 = regex fallback, 3 = passthrough).
  tier: 1 | 2 | 3;
  // Stays available for follow-up via ctx_execute_file when the agent needs more context.
  logPath?: string;
};
```

### B. Transforms (4 in this blueprint)

1. **`oxlint.ts`** — handles `oxlint` AND `oxlint-tsgolint` (F14, F34). `--format=json` for both. Builds on the **existing `LintIssue` parser** in lint.ts (F27); extracts the parser into `output-transforms/oxlint.ts` and adds rule-grouping (`Map<rule_id, file[]>`), Tier 2 regex fallback over `error|warning` lines, Tier 3 passthrough. Reference rtk [src/cmds/js/lint_cmd.rs](https://github.com/rtk-ai/rtk/blob/master/src/cmds/js/lint_cmd.rs) for grouping ergonomics.
2. **`vitest.ts`** — Force `--reporter=json` on the MCP path (no terminal user). **Tolerate vp-wrapped output** (F31): use a JSON-object extractor (find first balanced `{...}` block) rather than parsing the whole stdout, since vp prepends framing lines. Tier 1 = full JSON parse with Zod (validate `numTotalTests`, `numFailedTests`, `testResults[].assertionResults[]`). Tier 2 = regex over `Tests  N passed (M)` summary lines. Tier 3 = passthrough. **Two fixture sets:** vitest@2.x (matches agent-kit's own deps, F30) and vitest@4.x (matches consumers).
3. **`tsc.ts`** — **Evolves the existing `parseTscOutput`** at typecheck.ts (F26). The regex `/^(.+?)(?:\((\d+),\d+\)|:(\d+):\d+)(?::\s*|\s+-\s+)error TS(\d+):\s*(.*)$/m` already correctly extracts both standard tsc formats. Adds: group by file (`Map<file, TscError[]>`), collapse duplicate cascades (track `(code, msgPrefix)` pairs; collapse repeats with count), bytes-aware rendering. Reference rtk [src/cmds/js/tsc_cmd.rs](https://github.com/rtk-ai/rtk/blob/master/src/cmds/js/tsc_cmd.rs) for cascade-collapse heuristic.
4. **`generic.ts`** — errors-only stripper used by `ak err <cmd>` and as the fallback when no transform matches. Strips lines that don't match `/error|fail|✗|✘|FAIL/i`; preserves stderr framing. Used as Tier 3 fallback for `ak_e2e` (F28) and `ak_audit-${kind}` (F29) until tool-specific transforms ship.

Out of this blueprint: biome (not used, F16), eslint (not used), playwright/jest (deferred — e2e is rare in BOOKEND), pnpm install (F20), prisma, next, ruff, pytest, cargo (Python/Go/Rust not relevant to ingest-lens primary).

### C. `ak err <cmd>` CLI verb

New top-level command at `agent-kit/src/cli/commands/err.ts` + `err.test.ts` (F32 — flat-file pattern matching `audit.ts`, `dev.ts`, `e2e.ts`, etc.). Locate the registration call site at implementation time (F24 — `src/cli/index.ts` does not exist; registration happens via the bin entry, find by pattern). Runs an arbitrary subcommand, captures stdout+stderr, applies the `generic` transform, re-emits to stdout, exits with the subcommand's code.

```bash
ak err pnpm exec wrangler types       # only errors from wrangler
ak err pulumi preview                 # errors + diff summary
```

### D. TTY detection (F13, F33)

Detection only matters at the **CLI layer** (`src/cli/commands/{test,docs,...}.ts`). MCP tool handlers always run in non-TTY context — no detection needed there (F33: `runViaMcp` flag does not exist; `isMcpReady()` is for hook routing, not handler context).

CLI-side rule:

- TTY interactive (`process.stdout.isTTY === true`) → compact OFF (human reads the full output).
- Non-TTY (piped stdout, e.g. `ak qa | tee log.txt`, CI logs) → compact ON.
- `AK_COMPACT=0` env override → always OFF (prefix `AK_` matches the codebase's `ak_*` conventions; checked existing env vars and there's no collision — `CLAUDE_PROJECT_DIR`, `CODEX_HOME`, `HOME` are the only ones in tool handlers).
- `--compact` / `--no-compact` CLI flag → explicit override (highest precedence).

MCP tool handlers always emit compact (no fallback, no env check) — that's the whole point of the MCP path.

### E. BOOKEND-rule reinforcement

Update `agent-kit/.agent/rules/cmd-execution.md` (existing file, verified) to reference this blueprint and note that compact output makes the BOOKEND end-run **affordable** for the first time. Sync to `catalog/agent/rules/cmd-execution.md` via `ak symlink sync`.

## Out of scope

- Replacing rtk for non-quality-engine commands (git, ls, find, etc.). Recommend rtk as a downstream layer.
- Building a Rust binary. Stay in TS, in-process.
- biome / eslint / playwright / jest / pytest / prisma / wrangler / stryker transforms (F16, F20). Each is a discrete follow-up if a consumer asks.
- monorepo `just qa` integration (F8). File `monorepo-route-qa-through-ak` after this ships.
- pnpm install log compression (F20).
- `Read` / `Grep` / `Glob` tool output (rtk explicitly notes this gap; we accept it — context-mode `ctx_*` covers that lane).

## Maintenance considerations

- **Per-transform burden:** ~150-300 LOC TS + 3 fixture files per transform (Tier 1 valid, Tier 2 partial, Tier 3 garbage). Total = ~1.5-2 KLOC for the four transforms in this blueprint.
- **Upstream tracking:** vitest, oxlint, tsc each release every 1-3 months. Snapshot fixtures per minor version. Failing snapshots are a CI signal that a transform needs a refresh — explicitly do **not** silently fall through to Tier 3, that hides drift.
- **What we don't take on:** the rtk maintenance pattern of "100+ commands wrapped." We commit to 4 transforms in this blueprint; new ones get a templated test fixture but each is a discrete decision, not an obligation.
- **Drift signal:** ship a once-a-quarter `ak audit transform-drift` (out of scope for this blueprint) that runs each transform against a known-failing input and asserts Tier 1 still parses. Park as a follow-up.

## Verification gates

| Gate | Expected behavior                                                                                                                                                                                                |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1   | **ingest-lens BOOKEND run:** `pnpm qa` end-to-end with one seeded lint error + one seeded type error + one failing test → MCP `ak_qa` payload ≤ 2 KB total. All three failures preserved with file:line.          |
| G2   | **All-green ingest-lens run:** payload ≤ 200 bytes per stage (`{ok: true, failures: [], tier: 1, bytes: <120, logPath: ...}`).                                                                                   |
| G3   | **`ak err <cmd>` regression:** `ak err sh -c 'echo line1; echo "ERROR: bad"; echo line2'` emits only the `ERROR:` line and exits with the subcommand's exit code.                                                |
| G4   | **Tiered fallback:** feed each transform malformed JSON → fixture asserts it falls to Tier 2 (regex) cleanly; feed total garbage → fixture asserts Tier 3 passthrough with stderr warning (not silent drop).      |
| G5   | **Backward-compat escape hatch:** `QUALITY_ENGINE_COMPACT=0 ak qa` returns the exact same shape as today (clipRawOutput-clipped raw blobs). Verified by snapshot diff.                                            |
| G6   | **Token-saved metric:** every `TransformResult` carries `bytes` and `tier`. Snapshot tests assert `bytes` is below per-transform budget (oxlint ≤ 800B for 1 error, vitest ≤ 600B for 1 fail, tsc ≤ 400B for 1).  |
| G7   | **MCP shape contract:** existing `ak_qa` envelope `{passed, lint, typecheck, test}` is preserved. Each leaf gains `failures: Failure[]` and `tier: 1|2|3`. New `__fixtures__/qa-snapshot.json` asserts the shape. |
| G8   | **TTY detection:** `process.stdout.isTTY=true` + no env override → compact OFF; same conditions + `--compact` → ON. Unit test covers the 4-quadrant matrix.                                                       |
| G9   | **`oxlint-tsgolint` parity:** fixtures for both `oxlint` and `oxlint-tsgolint` JSON outputs (F14) → same `Failure[]` shape downstream regardless of source.                                                       |
| G10  | **Mutation score ≥ 85%** for new transform code per testing-philosophy Iron Law 3. Run `ak audit tph` (or equivalent stryker invocation) over `src/output-transforms/`; fail the blueprint at completion if below 85%. |
| G11  | **No per-Bash-call hook regression.** This blueprint adds zero new hooks (transforms run inside the existing MCP tool handler, which is the persistent server — zero per-call fork cost). Verify by measuring `ak-pretool-guard` median fork time before and after the blueprint lands; must stay ≤50ms median. Reference benchmarks captured in [`__poc__/peer-plugin-architecture.md`](./__poc__/peer-plugin-architecture.md). |

## Risks

| Risk                                              | Severity | Mitigation                                                                                                                                                  |
| ------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest 4.x JSON shape changes between minor releases | HIGH     | Fixture per minor version; CI runs against current pinned version. Tier 2 regex catches when JSON shape moves (G4).                                          |
| `oxlint-tsgolint` output format drift            | MEDIUM   | Separate fixture (F14, G9). Both formats supported; tracked in transform-drift audit (out of scope).                                                          |
| Transform replaces useful debug context          | MEDIUM   | Always emit `logPath` so the agent can `ctx_execute_file` to pull the full log. Documented in MCP tool description.                                         |
| TTY misdetection (e.g., piped stdout in CI)      | LOW      | Explicit CLI flags `--compact` / `--no-compact` always win. Env `QUALITY_ENGINE_COMPACT=0|1` for headless CI runs.                                          |
| Cross-repo coordination with monorepo            | DEFERRED | Out of scope (F8). Follow-up blueprint required.                                                                                                            |
| Hidden dependency on `clipRawOutput` semantics    | MEDIUM   | Preserve `clipRawOutput` as the Tier 3 fallback path inside the new dispatcher. Existing tests stay green. New transforms layer above it.                    |

## Tasks (Blueprint format)

#### [agent-kit] Task 1.1: Scaffold `output-transforms/` module

**Status:** todo

**Depends:** None

Create the new module skeleton in agent-kit and wire the dispatcher. No transforms yet — just the boundary. Move the `clipRawOutput` call sites to a single `applyTransform(toolName, raw, ctx)` dispatch that defaults to the existing clip when no transform is registered. This is the **scaffolding step** — keeps the system green while subsequent tasks fill in transforms.

**Files:**

- Create: `src/output-transforms/index.ts` (dispatcher + `TransformResult` type + `Failure` type + dynamic-name normalizer for `ak_audit-${kind}` per F29)
- Create: `src/output-transforms/index.test.ts`
- Create: `src/output-transforms/passthrough.ts` (Tier 3 default that wraps existing `clipRawOutput` from `src/mcp/tools/_shared/result.ts:42`)
- Modify: `src/mcp/tools/lint.ts` (replace `clipRawOutput` calls at lines 196 and 255 with `applyTransform('oxlint', ...)` / `applyTransform('pnpm-lint', ...)`)
- Modify: `src/mcp/tools/test.ts` (replace line 90)
- Modify: `src/mcp/tools/typecheck.ts` (replace line 174)
- Modify: `src/mcp/tools/e2e.ts` (replace line 149 — F28; passthrough only for now)
- Modify: `src/mcp/tools/audit.ts` (replace lines 187 and 198 — F29; dynamic toolName `ak_audit-${kind}` normalizes to `audit` in dispatcher)

**Steps (TDD):**

1. Write failing test: dispatcher with no registered transforms returns Tier 3 passthrough with `bytes` count.
2. Write failing test: dynamic toolName `ak_audit-blueprint-lifecycle` normalizes to `audit` lookup (F29).
3. Run: `ak test --file src/output-transforms/index.test.ts` — verify FAIL
4. Implement dispatcher with registry pattern (`registerTransform(name, fn)`) + dynamic-name normalizer.
5. Run: `ak test --file src/output-transforms/index.test.ts` — verify PASS
6. Migrate **all six** MCP tool call sites; run their existing tests to confirm no behavioral change yet (passthrough preserves clip semantics).
7. Run: `ak lint --file src/output-transforms/index.ts src/output-transforms/passthrough.ts src/mcp/tools/lint.ts src/mcp/tools/test.ts src/mcp/tools/typecheck.ts src/mcp/tools/e2e.ts src/mcp/tools/audit.ts` and `ak typecheck --file <same>`.

**Acceptance:**

- [ ] Dispatcher exists with `applyTransform`, `registerTransform`, `TransformResult`, `Failure` exports.
- [ ] All **six** `clipRawOutput` callers route through the dispatcher (F23).
- [ ] Dynamic `ak_audit-${kind}` toolName resolved to `audit` registry key (F29).
- [ ] Existing tests for `lint.ts`, `test.ts`, `typecheck.ts`, `e2e.ts`, `audit.ts` pass without modification (passthrough behavior preserved).
- [ ] `ak qa` integration test still green.
- [ ] `ak lint --file <changed-files>` and `ak typecheck --file <changed-files>` pass.

#### [agent-kit] Task 1.3: Backend reporter injection (F38, F39)

**Status:** todo

**Depends:** None

**Critical PoC finding (F38, F39):** the existing `pnpm` and `just` backends run the consumer's `test` script verbatim. To get vitest JSON output for Tier 1 parsing, the backend must bypass the package script and invoke vitest directly via `pnpm -F <pkg> exec vitest run --reporter=json --no-color <files>`. PoC 4 verified zero framing + 96% reduction with this command.

This is a **separate**, parallelizable task from the dispatcher (1.1) because it's a backend change, not an output-transform change.

**Files:**

- Modify: `src/mcp/backends/pnpm.ts` — detect "vitest in package devDeps" → switch to `pnpm -F <pkg> exec vitest run --reporter=json --no-color` invocation. Fall back to plain `pnpm -F <pkg> test` if package doesn't use vitest.
- Modify: `src/mcp/backends/just.ts` — accept an `extraArgs` param that the test handler can populate; `just test` recipes that forward `*args:` (verified in monorepo justfile) will pass `--reporter=json` through.
- Modify: `src/mcp/backends/pnpm.test.ts` — add detection-fork tests
- Modify: `src/mcp/backends/just.test.ts` — same

**Steps (TDD):**

1. Write failing test: backend invoked against a fixture package with vitest in devDeps → spawn args include `exec vitest run --reporter=json`.
2. Write failing test: backend invoked against a fixture package without vitest → spawn args remain `test`.
3. Run: `ak test --file src/mcp/backends/pnpm.test.ts src/mcp/backends/just.test.ts` — verify FAIL
4. Implement detection (`fs.readFileSync(pkg/package.json)` → check `devDependencies.vitest`).
5. Run tests — verify PASS.
6. Run: `ak lint --file <changed>` and `ak typecheck --file <changed>`.

**Acceptance:**

- [ ] vitest-using package → backend invokes `pnpm -F <pkg> exec vitest run --reporter=json --no-color <files>`.
- [ ] non-vitest package → backend keeps current `pnpm test` behavior (no regression).
- [ ] just backend forwards `--reporter=json` for vitest-using packages via `*args:` recipe pass-through.
- [ ] Existing pnpm.test.ts / just.test.ts assertions still green.

#### [agent-kit] Task 1.2: CLI-side compact-detection helper

**Status:** todo

**Depends:** None

Decides compact ON/OFF for CLI invocations only. **MCP tool handlers always use compact** (F33: there is no `runViaMcp` flag — the MCP transport is implicit in the handler context). This helper is consumed by `src/cli/commands/{test,docs,...}.ts`, not by `src/mcp/tools/*.ts`.

**Files:**

- Create: `src/output-transforms/should-compact.ts`
- Create: `src/output-transforms/should-compact.test.ts`

**Steps (TDD):**

1. Write failing tests for the 4-quadrant matrix: TTY × `AK_COMPACT` env × `--compact`/`--no-compact` flag (precedence order: flag > env > TTY default).
2. Run: `ak test --file src/output-transforms/should-compact.test.ts` — verify FAIL
3. Implement: read `process.stdout.isTTY`, read `process.env.AK_COMPACT`, accept explicit boolean override.
4. Run: `ak test --file src/output-transforms/should-compact.test.ts` — verify PASS
5. Run: `ak lint --file src/output-transforms/should-compact.ts src/output-transforms/should-compact.test.ts` and `ak typecheck --file <same>`.

**Acceptance:**

- [ ] All 4 quadrants tested.
- [ ] CLI-side default: TTY=OFF, non-TTY=ON. `AK_COMPACT=0|1` overrides default. Flag overrides env.
- [ ] MCP path documented as "always compact, no detection."
- [ ] No env-var collision (verified — `AK_COMPACT` not currently used; `CLAUDE_PROJECT_DIR`, `CODEX_HOME`, `HOME` are the existing process.env reads in tool handlers).

#### [agent-kit] Task 2.1: oxlint + oxlint-tsgolint transform

**Status:** todo

**Depends:** Task 1.1

Implements the oxlint transform with both vanilla `oxlint --format=json` and `oxlint-tsgolint` output shapes (F14). Lifts the rule-grouping heuristic from rtk's [lint_cmd.rs](https://github.com/rtk-ai/rtk/blob/master/src/cmds/js/lint_cmd.rs). Tier 1 = JSON parse; Tier 2 = regex line-grep over `error|warning`; Tier 3 = delegate to passthrough.

Note: `oxlint --format=json` emits a top-level `diagnostics: [...]` array; `oxlint-tsgolint` adds a wrapper field. Use Zod `.union()` or two parsers tried in order.

**Files:**

- Create: `src/output-transforms/oxlint.ts` (lifts the existing `LintIssue` parser from `src/mcp/tools/lint.ts` per F27, adds rule-grouping)
- Create: `src/output-transforms/oxlint.test.ts`
- Create: `src/output-transforms/__fixtures__/oxlint/clean.json` (no errors) — F36 co-location
- Create: `src/output-transforms/__fixtures__/oxlint/one-error.json` (single rule violation)
- Create: `src/output-transforms/__fixtures__/oxlint/multi-rule.json` (3 rules across 2 files)
- Create: `src/output-transforms/__fixtures__/oxlint/tsgolint-one-error.json` (oxlint-tsgolint variant per F14)
- Create: `src/output-transforms/__fixtures__/oxlint/malformed.txt` (Tier 2 fallback)
- Modify: `src/mcp/tools/lint.ts` (replace inline `LintIssue` parser with the extracted version; keep the existing `details.issues` shape additive)
- Modify: `src/output-transforms/index.ts` (`registerTransform('oxlint', oxlintTransform)`)

**Steps (TDD):**

1. Write tests against each fixture asserting the expected `Failure[]` shape and `bytes` budget per G6.
2. Run: `ak test --file src/output-transforms/oxlint.test.ts` — verify FAIL
3. Implement Zod schema for both JSON shapes; group by `rule_id` then `file`.
4. Implement Tier 2 regex over `error|warning` lines with file:line:col extraction.
5. Run: `ak test --file src/output-transforms/oxlint.test.ts` — verify PASS
6. Run: `ak lint --file src/output-transforms/oxlint.ts src/output-transforms/oxlint.test.ts` and `ak typecheck --file <same>`.

**Acceptance:**

- [ ] All 5 fixtures pass.
- [ ] G9 (parity between oxlint and oxlint-tsgolint outputs) satisfied.
- [ ] Tier 2 fallback exercises regex path; Tier 3 delegates to passthrough.
- [ ] Bytes ≤ 800B for the `one-error` fixture (G6).

#### [agent-kit] Task 2.2: vitest transform (vp-tolerant, dual-version)

**Status:** todo

**Depends:** Task 1.1

Vitest JSON-reporter parser tolerant of vp framing (F31) and validated against both vitest@2 (agent-kit's own dev dep) and vitest@4 (consumers') JSON shapes (F30). Tier 1 = JSON-object extraction (find first balanced `{...}` after framing) → Zod parse → emit failures only with one stack frame each. Tier 2 = regex over `Tests  N passed (M)` / `Test Files  N passed (M)`. Tier 3 = passthrough.

**Files:**

- Create: `src/output-transforms/vitest.ts`
- Create: `src/output-transforms/vitest.test.ts`
- Create: `src/output-transforms/__fixtures__/vitest/v2-all-pass.json`
- Create: `src/output-transforms/__fixtures__/vitest/v2-one-fail.json`
- Create: `src/output-transforms/__fixtures__/vitest/v4-all-pass.json` (matches consumer pinning, F30)
- Create: `src/output-transforms/__fixtures__/vitest/v4-one-fail.json`
- Create: `src/output-transforms/__fixtures__/vitest/v4-multi-fail.json` (3 failures across 2 files)
- Create: `src/output-transforms/__fixtures__/vitest/vp-wrapped.txt` (vitest@4 JSON with vp prefix lines, F31)
- Create: `src/output-transforms/__fixtures__/vitest/regex-fallback.txt` (summary line only, no JSON)
- Modify: `src/output-transforms/index.ts` (register)

**Steps (TDD):**

1. Write tests against each fixture asserting `Failure[]` and bytes ≤ 600B for `v4-one-fail` (G6).
2. Write a vp-wrapped fixture test asserting Tier 1 still parses despite framing.
3. Run: `ak test --file src/output-transforms/vitest.test.ts` — verify FAIL
4. Implement JSON-object extractor (handles leading non-JSON lines from vp).
5. Implement Zod schema as a union of v2 + v4 shapes (or two parsers tried in order); extract per-failure file/test/error/stack.
6. Implement Tier 2 regex over summary lines.
7. Run: `ak test --file src/output-transforms/vitest.test.ts` — verify PASS
8. Run: `ak lint --file src/output-transforms/vitest.ts src/output-transforms/vitest.test.ts` and `ak typecheck --file <same>`.

**Acceptance:**

- [ ] All fixtures pass (v2 + v4 + vp-wrapped + regex-fallback).
- [ ] Bytes ≤ 600B for `v4-one-fail` fixture (G6).
- [ ] vp-wrapped fixture lands on Tier 1 (not Tier 2/3).
- [ ] Tier 2 fallback covers the case where JSON parse fails but summary line is intact.

#### [agent-kit] Task 2.3: tsc transform (evolves existing parseTscOutput)

**Status:** todo

**Depends:** Task 1.1

**Lifts the existing `parseTscOutput` from `src/mcp/tools/typecheck.ts` into `src/output-transforms/tsc.ts`** (F26). The existing regex `/^(.+?)(?:\((\d+),\d+\)|:(\d+):\d+)(?::\s*|\s+-\s+)error TS(\d+):\s*(.*)$/m` already handles both standard tsc formats (paren and colon). Add: group by file (`Map<file, TscError[]>`), collapse duplicate cascades (track `(code, msgPrefix)` pairs), bytes-aware rendering.

**Files:**

- Create: `src/output-transforms/tsc.ts` (extracted + extended `parseTscOutput`)
- Create: `src/output-transforms/tsc.test.ts`
- Create: `src/output-transforms/__fixtures__/tsc/clean.txt`
- Create: `src/output-transforms/__fixtures__/tsc/one-error.txt`
- Create: `src/output-transforms/__fixtures__/tsc/cascade.txt` (one root → 8 cascading messages → collapsed to 1 line + count)
- Create: `src/output-transforms/__fixtures__/tsc/multi-file.txt` (errors in 3 files)
- Create: `src/output-transforms/__fixtures__/tsc/colon-format.txt` (`src/foo.ts:5:12 - error TS2304: ...` variant)
- Modify: `src/mcp/tools/typecheck.ts` (replace inline `parseTscOutput` with re-export; existing `TscError[]` consumers unaffected)
- Modify: `src/output-transforms/index.ts` (register `tsc`)

**Steps (TDD):**

1. Write tests asserting bytes ≤ 400B for `one-error` (G6) and ≤ 800B for `cascade`.
2. Run: `ak test --file src/output-transforms/tsc.test.ts` — verify FAIL
3. Move existing `parseTscOutput` from typecheck.ts to `output-transforms/tsc.ts`; re-export from typecheck.ts so existing tests stay green.
4. Add `groupByFile(errors)` and `collapseCascades(errors)` helpers.
5. Implement compact rendering (file header + collapsed errors).
6. Run existing typecheck tests AND new transform tests — verify both PASS.
7. Run: `ak lint --file <changed>` and `ak typecheck --file <changed>`.

**Acceptance:**

- [ ] Existing `typecheck.test.ts` stays green (re-export contract preserved).
- [ ] All new fixtures pass.
- [ ] Cascade collapses correctly.
- [ ] Bytes targets met (G6).
- [ ] Both paren and colon error-line formats handled (existing regex preserved).

#### [agent-kit] Task 2.4: generic errors-only transform + `ak err` CLI

**Status:** todo

**Depends:** Task 1.1

Generic Tier-2-style line-grep used by `ak err <cmd>` and as the fallback when no specific transform matches a tool. Self-contained.

**Files:**

- Create: `src/output-transforms/generic.ts`
- Create: `src/output-transforms/generic.test.ts`
- Create: `src/cli/commands/err.ts` (flat-file pattern per F32, matching `audit.ts`/`dev.ts`/`e2e.ts`)
- Create: `src/cli/commands/err.test.ts`
- Create: `src/output-transforms/__fixtures__/generic/mixed.txt` (10 lines, 1 ERROR)
- Modify: bin/CLI registration site (locate at implementation time per F24 — `src/cli/index.ts` does not exist; check the bin entry under `bin/` or scan for where existing commands like `audit.ts`, `dev.ts` are registered)
- Modify: `src/output-transforms/index.ts` (register as default fallback for unknown tools)

**Steps (TDD):**

1. Write failing tests: `ak err sh -c 'echo a; echo "ERROR: x"; echo b'` exits with subcommand code, prints only `ERROR: x` (G3).
2. Run: `ak test --file src/output-transforms/generic.test.ts src/cli/commands/err/index.test.ts` — verify FAIL
3. Implement regex `/error|fail|✗|✘|FAIL/i` line filter for `generic.ts`.
4. Implement `err` verb that captures stdout+stderr, applies `generic`, emits, exits with subcommand code.
5. Run: `ak test --file src/output-transforms/generic.test.ts src/cli/commands/err/index.test.ts` — verify PASS
6. Run: `ak lint --file <changed>` and `ak typecheck --file <changed>`.

**Acceptance:**

- [ ] G3 satisfied.
- [ ] Exit code propagation tested.
- [ ] `ak err --help` documents the verb.

#### [agent-kit] Task 3.1: MCP leaf-shape extension + token-saved metric

**Status:** todo

**Depends:** Task 2.1, Task 2.2, Task 2.3

Extend each MCP tool leaf to include `failures: Failure[]`, `tier`, and `bytes` from `TransformResult` (G6, G7). **`qa.ts` itself does not need leaf-level changes** (F25) — it composes by calling `lintTool.handler` / `typecheckTool.handler` / `testTool.handler` and returns `{passed, lint, typecheck, test}`; it inherits the new shape automatically. Only verify the unwrap+envelope still type-checks.

**Files:**

- Modify: `src/mcp/tools/lint.ts` (leaf `outputSchema` adds `failures`, `tier`, `bytes` via `createSummaryOutputSchema` extension)
- Modify: `src/mcp/tools/test.ts` (leaf shape)
- Modify: `src/mcp/tools/typecheck.ts` (leaf shape)
- Modify: `src/mcp/tools/qa.test.ts` (snapshot of new envelope shape)
- Modify: `src/mcp/tools/qa.ts` ONLY if `unwrap` typing breaks — confirm before modifying
- Create: `src/mcp/tools/__fixtures__/qa-snapshot.json`

**Steps (TDD):**

1. Write a contract snapshot test asserting the new shape (G7).
2. Run: `ak test --file src/mcp/tools/qa.test.ts` — verify FAIL
3. Extend each leaf to include `failures` and `tier`. Top-level `passed` still = AND of leaves.
4. Run: `ak test --file src/mcp/tools/qa.test.ts` — verify PASS
5. Run: `ak lint --file <changed>` and `ak typecheck --file <changed>`.

**Acceptance:**

- [ ] G7 snapshot stable.
- [ ] Existing `ak_qa` consumers unaffected (envelope unchanged, leaves additive).

#### [agent-kit] Task 3.2: BOOKEND-rule doc update + symlink sync

**Status:** todo

**Depends:** Task 3.1

Documentation update — references this blueprint and explains the affordability claim. Both files update because of the canonical/symlinker pattern.

**Files:**

- Modify: `catalog/agent/rules/cmd-execution.md` (**canonical for shipping** per "Catalog is law" design principle — this is what consumers receive)
- Modify: `.agent/rules/cmd-execution.md` (agent-kit's own dogfood copy; auto-synced by `ak symlink sync`)
- Create: `docs/qa-output.md` (new doc — explains transforms, tiers, escape hatches)

**Steps (TDD):**

1. Edit `catalog/agent/rules/cmd-execution.md` first (the source-of-truth shipped to consumers).
2. Run: `ak symlink sync` — propagates to `.agent/` and per-IDE surfaces.
3. Run: `ak audit catalog-drift` — verify no drift between catalog and synced surfaces.
4. Run: `ak audit docs-frontmatter` — verify `docs/qa-output.md` has correct frontmatter.
5. Run: `ak lint --file docs/qa-output.md` (markdownlint pass).

**Acceptance:**

- [ ] `catalog/agent/` is the canonical edit; `.agent/` is the synced copy (drift-clean per `ak audit catalog-drift`).
- [ ] New doc passes frontmatter audit.
- [ ] No hand-edits to per-IDE surfaces (`.claude/`, `.codex/`, `.gemini/`, `.cursor/`, `.windsurf/`) — all derive from catalog via the symlinker.

#### [agent-kit] Task 4.1: ingest-lens BOOKEND verification (G1, G2)

**Status:** todo

**Depends:** Task 3.1

Integration test from `ozby/ingest-lens` running through agent-kit MCP. Seed three failures (lint, type, test) and assert the MCP `ak_qa` payload size + correctness per G1.

**Files:**

- Create: `agent-kit/src/__integration__/ingest-lens-bookend.test.ts` (skipped if `INGEST_LENS_PATH` env var absent)
- Create: `agent-kit/src/__integration__/fixtures/seeded-lint-error.ts`
- Create: `agent-kit/src/__integration__/fixtures/seeded-type-error.ts`
- Create: `agent-kit/src/__integration__/fixtures/seeded-failing-test.ts`

**Steps (TDD):**

1. Write the integration test as a runnable script that copies fixtures into a clone of ingest-lens, runs `ak qa`, asserts size + shape.
2. Run: `INGEST_LENS_PATH=~/repos/ozby/ingest-lens ak test --file src/__integration__/ingest-lens-bookend.test.ts` — verify FAIL (until prior tasks land)
3. After Tasks 1-3 land, run the same — verify PASS.
4. Document the env var in `docs/qa-output.md`.

**Acceptance:**

- [ ] G1: payload ≤ 2 KB for the 3-failure scenario.
- [ ] G2: payload ≤ 200B per stage when all green.
- [ ] Test gracefully skips when env var unset (CI-safe).

#### [agent-kit] Task 4.2: All-green snapshot + escape-hatch test (G5, G8)

**Status:** todo

**Depends:** Task 3.1

Two final regression tests that aren't tied to ingest-lens. (a) `QUALITY_ENGINE_COMPACT=0` returns the legacy `clipRawOutput` shape (G5). (b) TTY 4-quadrant matrix (G8).

**Files:**

- Create: `src/output-transforms/escape-hatch.test.ts`
- Create: `__fixtures__/legacy-shape.json` (the pre-blueprint `ak_qa` shape)

**Steps (TDD):**

1. Write tests for G5 + G8.
2. Run: `ak test --file src/output-transforms/escape-hatch.test.ts` — verify FAIL
3. Implement env-var read in dispatcher (already partly in Task 1.2; this validates).
4. Run: `ak test --file src/output-transforms/escape-hatch.test.ts` — verify PASS
5. Run: `ak lint --file <changed>` and `ak typecheck --file <changed>`.

**Acceptance:**

- [ ] G5 + G8 satisfied.
- [ ] Escape-hatch behavior documented in `docs/qa-output.md`.

## Quick Reference (Execution Waves)

| Wave              | Tasks                                      | Dependencies              | Parallelizable | Effort (T-shirt) |
| ----------------- | ------------------------------------------ | ------------------------- | -------------- | ---------------- |
| **Wave 0**        | 1.1, 1.2, 1.3                              | None                      | 3 agents       | S each           |
| **Wave 1**        | 2.1, 2.2, 2.3, 2.4                         | Wave 0 (Task 1.1)         | 4 agents       | M each           |
| **Wave 2**        | 3.1                                        | Tasks 2.1, 2.2, 2.3, 1.3  | 1 agent        | S                |
| **Wave 3**        | 3.2, 4.1, 4.2                              | Task 3.1                  | 3 agents       | XS-S each        |
| **Critical path** | 1.1 → 2.2 → 3.1 → 4.1                      | —                         | 4 waves        | M total          |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target               | Actual |
| ------ | ---------------------------------- | -------------------- | ------ |
| RW0    | Ready tasks in Wave 0              | ≥ 2 (planning for 4-6 agents) | 2     |
| CPR    | total_tasks / critical_path_length | ≥ 2.5                | 10/4 = 2.5 |
| DD     | dependency_edges / total_tasks     | ≤ 2.0                | 12/10 = 1.2 |
| CP     | same-file overlaps per wave        | 0                    | 0     |

**Refinement delta:** Wave 0 has only 2 tasks (1.1, 1.2) which is below the "≥6" target for 6-agent runs. **Reason:** Task 1.1 owns the dispatcher module — every transform task depends on it. Splitting 1.1 further would create artificial dependencies. Acceptable given small total task count (10). For 4-agent runs, this plan is well-shaped; for 6-8 agent runs, Wave 1 is the bottleneck and runs at 4 wide.

**Parallelization Score: B** — RW0 below target but CPR meets and CP=0. Acceptable given the architectural reality that transforms must layer on the dispatcher.

## Refinement Summary

| Metric                    | Value                              |
| ------------------------- | ---------------------------------- |
| Findings total            | 41 (22 first-pass + 15 second-pass + 4 PoC-confirmed) |
| Critical                  | 9 (F1, F2, F21, F23, F24, F30, F31, F38, F39)         |
| High                      | 19                                 |
| Medium                    | 6                                  |
| Low                       | 7                                  |
| Fixes applied             | 41/41                              |
| PoCs run                  | 6 + reference impl (8/8 fixture tests pass, strict typecheck clean) |
| Cross-plans updated       | 0 (no live siblings affected; deferred monorepo blueprint to be filed separately) |
| Edge cases documented     | All 9 verification gates           |
| Risks documented          | 6                                  |
| **Parallelization score** | B (10 tasks, 4 waves, CPR 2.5, RW0 2) |
| **Critical path**         | 4 waves                            |
| **Max parallel agents**   | 4 (Wave 1 bottleneck)              |
| **Total tasks**           | 11 (added Task 1.3 backend reporter injection per F38/F39)         |
| **Blueprint compliant**   | 11/11                              |
| **Net effort change**     | **Reduced** vs first refinement — Tasks 2.1 and 2.3 evolve existing parsers (F26, F27). Task 3.1 shrunk (F25). +1 task (1.3) added because PoC 3 disproved `pnpm test --` forwarding (F38/F39). |

## Related

- Triggered by: 2026-05-06 landscape scan of `https://github.com/rtk-ai/rtk@v0.38.0` (filter heuristics) + refinement pass against actual rtk + agent-kit + ingest-lens + monorepo source on the same date.
- Relevant rules: `.agent/rules/cmd-execution.md` (BOOKEND), `.agent/rules/context-mode-routing.md` (when to use `ctx_*` vs `ak_*`).
- Sibling work: `scaffold-audit-clean-baseline` (`ak setup` + `ak doctor` baseline).
- Deferred follow-up: `monorepo-route-qa-through-ak` (file once this blueprint reaches `in-progress/`).
- Reference (read but **don't depend on**): rtk filter implementations under `src/cmds/js/{vitest,tsc,playwright,pnpm}_cmd.rs` and `src/filters/oxlint.toml`. License: MIT (F9).
