---
type: blueprint
title: Agent-asset compiler — rulesync wrap + plugin manifests + AGENTS.md merger
status: completed
complexity: M
owner: ozby
created: 2026-05-11
last_updated: 2026-05-11
promoted_to_planned: 2026-05-11
tags:
  - agent-kit
  - multi-runtime
  - rulesync
  - plugin-marketplace
  - agents-md
related_research:
  - docs/research/2026-05-11-agent-asset-infrastructure-landscape.md
  - docs/research/2026-05-11-agent-asset-trilogy-ceo-plan.md
reviews:
  - ceo: 2026-05-11 (SELECTIVE_EXPANSION mode)
  - eng: 2026-05-11
  - dx: 2026-05-11 (DX_POLISH mode)
  - codex_outside_voice: 2026-05-11
  - plan_refine: 2026-05-11
lifecycle:
  state: completed
promoted_to_completed: 2026-05-11
---

# Agent-asset compiler — multi-runtime (revised post-CEO-review 2026-05-11)

## Product wedge anchor

- **Stage outcome:** VISION.md's "One command, fully wired" + Elegance Pass 2026's stage outcome ("every webpresso public package + ingest-lens reaches fully wired agent surfaces from a fresh clone via one command"). The original blueprint planned six custom emitters. Research (2026-05-11) found `dyoshikawa/rulesync@8.15.1` (175k weekly npm dl, MIT, daily commits) already does ~95% of multi-runtime emission, plus the Agent Skills open standard (Anthropic, Dec 2025) is now adopted natively by Claude/Codex/Gemini/Cursor/Copilot/Junie/Goose/OpenCode. Plugin marketplaces shipped in 4 of 6 target IDEs. So agent-kit's job is no longer "build the compiler" — it's "wrap rulesync + own AGENTS.md merging + emit plugin manifests + ship the audit/lifecycle integration that the substrate doesn't own."
- **Consuming surface:** `wp compile` (thin wrapper over `rulesync generate`), `wp skills orphans --fix`, new audit `wp audit gitignore-agent-surfaces`, new `wp audit memory-unified`, **plus** four plugin manifest emitters (`@webpresso/agent-kit-{claude,codex,cursor,gemini}-plugin`), the AGENTS.md section-keyed merger with `memory.merge.yaml` directives including `op: rotate`, the reusable `webpresso/agent-kit-action@v1` GitHub Action, and PR auto-comment integration.
- **New user-visible capability:** A consumer can author `.agent/skills/foo/SKILL.md` once and have it appear correctly (and only once) in Claude/Codex/OpenCode/Cursor/Windsurf/Gemini — distributed via plugin marketplace install for 4 of 6 IDEs and via rulesync filesystem fallback for Windsurf/OpenCode. AGENTS.md sections merge structurally across user/project/per-directory layers with rotation for stale sections. PRs auto-comment with structured drift summaries. CI is one yaml line: `uses: webpresso/agent-kit-action@v1`.

## Why this exists (revised)

Original blueprint planned six bespoke per-runtime adapters. Research findings (full citation in `docs/research/2026-05-11-agent-asset-infrastructure-landscape.md`):

- **`rulesync` covers the per-runtime emission.** 175k weekly downloads, MIT, last commit 2026-05-11. Supports all six targets + 11 more, project + global modes, `import/convert/fetch`, embedded MCP server. Single-maintainer truck-factor mitigated by MIT + small surface + active external contributors.
- **Agent Skills is now an open standard** (Anthropic, Dec 2025). Same SKILL.md works unchanged across 26+ runtimes. Cursor 3.0+ reads `.claude/skills/`, `.codex/skills/`, `.cursor/skills/`, `.agents/skills/` natively. Per-runtime SKILL.md transforms we previously planned are unnecessary.
- **Plugin marketplaces are the new distribution layer** for 4 of 6 IDEs (Claude Code GA Feb 2026 with 4200+ skills indexed; Codex CLI `.codex-plugin/`; Cursor Marketplace + Team Marketplaces with SCIM; Gemini Extensions v0.4.0 GA). File-writing replaced by plugin install for these four. Filesystem fallback only for Windsurf (no plugin marketplace) and OpenCode (npm plugins are hooks-only, agents are markdown-only).
- **The genuinely novel work** (no upstream): canonical `.agent/` schema + AGENTS.md section-keyed merger with `memory.merge.yaml` directives + provenance JSON + memory rotation + the audit/tech-debt integration layer + the cross-IDE plugin manifest emission.

So this blueprint is now ~30% of the original draft's scope. The remaining work is the integration layer that webpresso defensibly owns, plus four plugin manifests and the GitHub Action.

## Non-goals

- Not a generic "agent framework."
- Not reimplementing rulesync's emitters (we wrap it).
- Not maintaining bespoke MDC/TOML writers — rulesync owns them.
- **No migration commands. No legacy support.** agent-kit goes public at v0.11.0 as a clean release — there is no prior public version to migrate from. Internal consumers (monorepo + ingest-lens) get a one-time pre-release cleanup commit (delete symlinks, legacy `.windsurfrules`/`.cursorrules`, old `wp cursor-windsurf-sync` references) BEFORE v0.11.0 ships, done by hand or by a single throwaway script. After v0.11.0 lands, no `migrate-legacy` verb exists in the CLI surface. **Zero backwards compat in the public API.**

## Architecture

### Canonical source (unchanged)

```
.agent/                              ← canonical, committed
├── skills/<name>/SKILL.md           ← model-invokable workflows (Agent Skills standard)
├── commands/<name>.md               ← user-invokable slash commands
├── agents/<name>.md                 ← specialized subagents
├── memory/                          ← AGENTS.md layered sources
│   ├── AGENTS.md                    ← project-root base layer
│   ├── memory.merge.yaml            ← optional: section directives (replace|append|prepend|delete|**rotate**)
│   └── <subdir>/AGENTS.md           ← optional: per-directory overlays
├── rules/, workflows/, guides/      ← unchanged reference content
└── hooks/<event>.json               ← optional, per-project hooks
AGENTS.md                            ← committed merger output
CLAUDE.md                            ← committed; user-owned, expected to contain `@AGENTS.md`
```

### Emission pipeline (revised — rulesync owns runtime emission)

```
.agent/
   │
   ▼
wp compile  ─── reads .agent/, normalizes to .rulesync/ shape (flatten step ~50 LOC)
   │
   ▼
rulesync generate --targets claude,codex,cursor,gemini,opencode,windsurf
   │
   ▼
.claude/, .codex/, .opencode/, .cursor/, .windsurf/, .agents/, .gemini/    ← gitignored outputs
   │
   ├── AGENTS.md merger (in-tree, ours)  ──▶ AGENTS.md at repo root (committed)
   │   └── reads .agent/memory/**/AGENTS.md + memory.merge.yaml
   │   └── writes .agent/.merged.provenance.json
   │
   └── Plugin manifest emitters (in-tree, ours)
       ├── .claude-plugin/plugin.json + marketplace.json
       ├── .codex-plugin/plugin.json
       ├── .cursor-plugin/plugin.json
       └── gemini-extension.json
```

### Plugin distribution model (NEW per CEO decision 2)

| IDE | Distribution | What we ship |
|---|---|---|
| Claude Code | Plugin marketplace (`/plugin install`) | `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` pointing at shared `skills/` tree |
| Codex CLI | Plugin marketplace (`.codex-plugin/`) | `.codex-plugin/plugin.json` with same skills/MCP/apps/hooks shape |
| Cursor | Cursor Marketplace + Team Marketplaces (SCIM) | `.cursor-plugin/plugin.json` |
| Gemini CLI | Extensions v0.4.0 | `gemini-extension.json` |
| Windsurf | **Filesystem fallback** (no plugin marketplace) | rulesync emits `.windsurf/rules/<name>.md` |
| OpenCode | **Filesystem fallback** (agents are markdown-only) | rulesync emits `.opencode/agents/<n>.md` + `.opencode/commands/<n>.md` |

Plugin manifests reference the shared `skills/` tree by path; they're ~30 lines of JSON each. Consumer installs via `/plugin install webpresso/agent-kit-claude-plugin@v1` instead of file writes for those 4 IDEs.

### Generated file policy (codex critique #6 — explicit per-file classification)

Per file kind, exactly one of: **source** (canonical, committed, edited by humans), **cache** (gitignored, local-only, regenerable), or **payload** (committed, generated, distribution artifact).

| File | Class | Location | Notes |
|---|---|---|---|
| `.agent/skills/<n>/SKILL.md` | source | committed | Canonical |
| `.agent/commands/<n>.md` | source | committed | Canonical |
| `.agent/agents/<n>.md` | source | committed | Canonical |
| `.agent/memory/AGENTS.md` (layered) | source | committed | Per-layer canonical |
| `.agent/memory/memory.merge.yaml` | source | committed | Optional directives |
| `AGENTS.md` (root, merged) | **payload** | committed | Merger output; readable by humans, native to Codex+OpenCode |
| `CLAUDE.md` (root) | source | committed | User-owned; expected to contain `@AGENTS.md` import |
| `.agent/.merged.provenance.json` | cache | **gitignored** | Audit recomputes deterministically; never trusted as source |
| `.agent/.compile-manifest.json` | cache | **gitignored** | Content-hash sentinel; regeneratable |
| `.agent/.rotation-log.jsonl` | cache | **gitignored** | Local audit trail; deterministically reproducible from blame + thresholds. Note: CI cannot rely on this; PR-time rotation evidence flows through PR-comment integration (Task 2.5 in #1 + D6) which emits the rotation summary in the action output. |
| `.claude/skills/<n>/SKILL.md` (and the 5 other runtime trees) | payload | gitignored | Generated by `rulesync`; visible to local IDEs |
| `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `gemini-extension.json` | payload | committed | Emitted by manifest task; small JSON, reviewable in PRs |
| `.agent/.sync-manifest.json` (legacy term) | replaced by `.compile-manifest.json` | — | Old name from prior revision; do not use |

Single source of truth = this table. Anywhere else the trilogy says "gitignored" or "committed" must match this table or be corrected.

### AGENTS.md merging (unchanged from prior revision)

**Option C hybrid** per 2026-05-11 research:

- **Layer 1 (default):** Section-keyed override — parse mdast, key `##` sections by slug, deeper layer replaces parent's section atomically, missing sections inherit. Frontmatter merged via RFC 7396.
- **Layer 2 (opt-in):** Sibling `memory.merge.yaml` with directives (`op: replace|append|prepend|delete|**rotate**`) plus RFC 7396 frontmatter patch.
- **Layer 3 (observability):** `.agent/.merged.provenance.json` maps each output section's slug → contributing source file + op.

### Memory rotation (NEW per D7 cherry-pick)

`op: rotate` directive in `memory.merge.yaml`:

```yaml
sections:
  - heading: Legacy patterns
    op: rotate
    archive_to: AGENTS.history.md
    threshold_days: 90              # rotate if section's last-touched (per git blame) > N days
    keep_summary: true              # leave a one-line summary in main AGENTS.md pointing at history
```

Solves the 29KB monorepo `.codex/AGENTS.md` problem structurally. Strong defaults (90-day threshold, summary preserved). Every rotation logged to `.agent/.rotation-log.jsonl` (gitignored) with timestamp + section slug + reason. Audit `wp audit memory-rotation` surfaces rotation events for review.

## GitHub Action (NEW per D3 cherry-pick)

Ship `webpresso/agent-kit-action@v1` as a reusable workflow:

```yaml
# .github/workflows/agent-kit.yml in any consumer repo
jobs:
  agent-kit:
    uses: webpresso/agent-kit-action/.github/workflows/audit.yml@v1
    with:
      audits: "skill-sizes,broken-refs,memory-unified,gitignore-agent-surfaces"
      pr-comment: true
```

Action source at `webpresso/agent-kit-action` (separate repo, MIT, public). Pinned to v0.11.0+ of agent-kit; emits a structured PR comment per D6 when `pr-comment: true`.

## PR auto-comment integration (NEW per D6 cherry-pick)

When the action runs on a PR and `.agent/` or `blueprints/` or `tech-debt/` files changed, post a structured comment:

```markdown
## 🤖 agent-kit drift summary

**Blueprints changed:** 2 (1 promoted draft→planned)
**Skills added:** 1, modified: 3
**Audit findings:**
- ⚠️ `skill-sizes`: `monorepo-navigation` is 14,200 bytes (Codex budget 8000 — 178%)
- ✅ `broken-refs`: 0 unresolved
- ✅ `memory-unified`: CLAUDE.md correctly imports AGENTS.md

**Tech-debt items:** none auto-filed this PR

Run locally: `pnpm wp audit --all`
```

Implementation: `webpresso/agent-kit-action` invokes `wp audit --all --json`, formats via template, posts via `gh pr comment` (or GitLab equivalent in v0.12.x).

## Technology Choices

| Decision | Choice | Reasoning |
|---|---|---|
| Multi-runtime emitter | **`rulesync@8.15.1`** (npm dep, exact pin) | 175k weekly dl, MIT, covers all 6 targets + 11 more; we wrap not reimplement |
| Schema flatten step | ~50 LOC in `src/compiler/flatten.ts` | Maps our `.agent/{skills,commands,agents,memory}/` to rulesync's `.rulesync/` source shape |
| AGENTS.md merger | **In-tree** (remark + remark-frontmatter + remark-gfm) | Option C hybrid per research; no upstream does section-keyed merging |
| Memory rotation | **In-tree** (`op: rotate` directive) | Solves real monorepo pain (29KB AGENTS.md); shares parser with merger |
| Plugin manifests | **In-tree emitters** for 4 IDEs | Each ~30 LOC JSON; references shared skills/ tree |
| GitHub Action | **`webpresso/agent-kit-action`** (separate repo) | Reusable workflow; version-pinned to agent-kit minor releases |
| PR comment | **`gh pr comment` via action** | Single-platform initially (GitHub); GitLab support deferred to v0.12.x |
| Plugin marketplace path for Windsurf/OpenCode | **None — rulesync filesystem fallback** | No plugin marketplace in either; rulesync owns file writes |
| Legacy paths | **No migration verb. No public API for legacy.** | Per DX-review D7: agent-kit not live yet; internal consumers (monorepo + ingest-lens) get one-time hand-commit cleanup before v0.11.0 ships. No `wp skills migrate-legacy` verb exists in the v0.11.0 CLI surface. |
| AGENTS.md generation for Claude | **Don't generate CLAUDE.md** | `wp audit memory-unified` warns if CLAUDE.md missing `@AGENTS.md` import |
| Rulesync version pinning | **Exact pin (`8.15.1` at v0.11.0 release) + Renovate auto-PR for minor bumps + contract test gate** | Codex caught that `^8.15` lets fresh installs pull breaking minor before CI catches it. Exact pin + automated upgrade PR + CI contract test on each PR is the correct invariant. |
| Publishing target | **GitHub Packages npm registry** (per DX-review D10) | Confirmed: trilogy ships to GitHub Packages. Consumer must configure `@webpresso:registry=https://npm.pkg.github.com` + token. README documents the auth setup explicitly so OSS adopter discovers it on first install, not after first failure. |
| Generated file policy | **Explicit per-file classification table** (added below in Architecture section) | Codex caught that provenance JSON, manifests, and snapshots are described inconsistently as "outputs" vs "committed" vs "gitignored" in different places. Table is single source of truth. |

## Edge cases (revised — symlink-era edges removed)

| ID | Severity | Case | Mitigation |
|---|---|---|---|
| E1 | HIGH | Consumer hand-edits a rulesync-generated file → lost on next `wp compile` | Manifest tracks content hash; sync aborts with diff if drift detected; prompts `wp skills import <path>` |
| E2 | HIGH | Two memory layers both define `## Build` — atomic-replace surprises consumer expecting concat | Default = Option A semantics; users wanting append add `memory.merge.yaml` with `op: append`; README cookbook with worked examples |
| E3 | MEDIUM | `memory.merge.yaml` references heading that doesn't exist in any layer | Warn naming unused directive; don't fail (allows directives to anticipate future sections) |
| E4 | MEDIUM | `op: rotate` archives a section the agent still needs context for | Strong default (90-day threshold); summary preserved in main AGENTS.md pointing at history; rotation log audit surfaces every event |
| E5 | MEDIUM | Plugin marketplace schema change in Claude/Codex/Cursor/Gemini | Each manifest emitter has its own version constant in `src/compiler/manifests/_versions.ts`; monthly audit checks against official docs |
| E6 | MEDIUM | `rulesync` ships a breaking minor bump | Pinned `^8.15`; CI contract test (fixture SKILL.md → expected output per runtime) fails on breaking change; we don't auto-upgrade |
| E7 | LOW | `wp compile` runs in parallel from two terminals on same repo | `O_EXCL` lock file at `.agent/.compile.lock`; second invocation exits with clear message |
| E8 | LOW | Consumer uses GitLab not GitHub for PR commenting | v0.11.0 GitHub-only; GitLab adapter in v0.12.x or later if consumer demand surfaces |

## Risks

| ID | Severity | Risk | Mitigation |
|---|---|---|---|
| R1 | HIGH | `rulesync` single-maintainer truck factor (~70% commits by dyoshikawa) | MIT + small surface + active external PRs → forkable in 1 day if abandoned; we own only ~50 LOC of flatten glue |
| R2 | MEDIUM | Plugin marketplace volatility (Cursor + Codex are new in 2026) | Version-pin each manifest's schema; monthly audit doc check |
| R3 | MEDIUM | Memory rotation could surprise consumers (lost context) | Strong defaults, opt-in directive, every rotation logged + auditable |
| R4 | MEDIUM | "No backwards compat" means consumers coordinate the bump | Land in agent-kit first; create one PR per consumer (monorepo + ingest-lens) with one-time hand-commit cleanup (delete symlinks, legacy rules files) + bump pin in same commit. No `migrate-legacy` verb — per Technology Choices table. |
| R5 | LOW | `webpresso/agent-kit-action` GitHub Action needs CI testing of the action itself | Single repo, ~100 lines, fixture-based test; minimal maintenance burden |

## Tasks (revised — ~10 tasks, was 25)

### Wave 0 — foundations (parallel)

#### Task 1.1: Canonical schema + rulesync flatten step
**Status:** done
**Depends:** None

Create `src/compiler/schema.ts` (Zod for SKILL.md, command.md, agent.md frontmatter; reuses Appendix A schemas). Create `src/compiler/flatten.ts` that reads `.agent/{skills,commands,agents}/` and emits a `.rulesync/` directory shape that rulesync can consume. Pure function; no I/O beyond temp dir write.

**Acceptance:** Schemas validate fixtures; flatten output passes `rulesync generate --dry-run`.

#### Task 1.2: AGENTS.md section-keyed merger + `memory.merge.yaml` directive engine + rotation safeguards
**Status:** done
**Depends:** None

Implement Option C hybrid in `src/compiler/memory/`. Files: `merger.ts`, `precedence.ts`, `provenance.ts`, `directives.ts`, `directives.schema.ts`. All 5 directive ops supported (replace/append/prepend/delete/rotate). Provenance JSON emitted. Deterministic.

**Rotation safeguards** (post-codex concern #2 — `git blame` brittleness on shallow clones / squashes / generated content):

- **`op: rotate` is OPT-IN ONLY at the section level.** Sections must be explicitly tagged in `memory.merge.yaml` with `rotation_eligible: true`. Default is no-rotate. No section auto-rotates because the merger noticed it was stale.
- **Threshold tunable per section.** `threshold_days` configurable from 30 to unlimited, default 180 (conservative). Per-section override in `memory.merge.yaml`. Heuristic = `git blame` last-touched date AS WELL AS explicit content-staleness signal (e.g., section's slug is referenced by zero in-progress blueprint task acceptance criteria — leverages the Blueprint #3 SQL projection if available).
- **Shallow-clone detection.** Merger runs `git rev-parse --is-shallow-repository` before any rotation decision. If shallow clone detected, rotation is DISABLED with explicit warning: "shallow clone — rotation heuristics unreliable; run `git fetch --unshallow` or set `rotation_eligible: false` per section."
- **`--dry-run` flag standardized.** Both `wp compile --dry-run` and `wp audit memory-rotation --dry-run` show what WOULD be rotated without writing. Pre-merge verification step.
- **`wp audit memory-rotation --strict`** fails CI if any section was rotated within the last 30 days without an explicit `last_rotation_acked: <timestamp>` field in `memory.merge.yaml`. Forces human review of every rotation event.

**Acceptance:**
- [x] All worked examples from research note parse correctly; deterministic output; rotation log captures every event
- [x] Rotation is opt-in (no auto-rotation surprises)
- [x] Shallow-clone detection prevents incorrect rotation decisions
- [x] `--dry-run` shows planned rotations without writing
- [x] `wp audit memory-rotation --strict` enforces post-rotation acknowledgement

#### Task 1.3: Gitignore template + opt-in gstack SessionStart routing
**Status:** done
**Depends:** None

Extend `wp setup --with base-kit`'s `.gitignore` template. Block delimited by `# === agent-kit:` markers covering all generated paths (rulesync outputs + provenance JSON + manifests). Plus: extend `src/hooks/sessionstart/index.ts` to detect `~/.claude/skills/gstack/` presence (from `wp setup --with gstack`) and inject a small "interactive skills available" block alongside the existing `wp_*` / `ctx_*` routing block. **Opt-in only** — controlled by an explicit setup flag, never auto-enabled.

**Acceptance:** `wp audit gitignore-agent-surfaces` accepts the block on fresh setup. SessionStart hook emits gstack routing block only when `wp setup --with gstack` was run; default install is unchanged.

---

#### Task 1.4: rtk filter test harness (32-case matrix + 4 PoCs + runScript timeout + rulesync wrap)
**Status:** done
**Depends:** None. **Critical-path for "bulletproof 100% confidently" guarantee.**

Address the 6/9 GAPS verdict from filter coverage audit AND D6 from DX review (extend coverage to `rulesync` subprocess output emitted by `wp compile`). Land before any new `wp_*` MCP tool ships in v0.11.0.

- **Create:** `src/output-transforms/edge-cases.test.ts` — 32-case matrix: 5 transforms (vitest, oxlint, tsc, generic, **rulesync**) × 7 edges (empty, ANSI escape codes, 1MB blob, mid-truncation, stderr-only, summary-key collision, mixed-success-fail). Skip 3 N/A cells per transform/edge combinatorics. Each case asserts envelope shape valid, `bytes <= 4000`, `rawBytes` correct, `tokensSaved >= 0`, no thrown exceptions.
- **Create:** `src/output-transforms/rulesync.ts` — new transform for `wp compile`'s rulesync subprocess. Parses rulesync's per-target generation output into the summary-first envelope: count of skills/commands/agents emitted per runtime, failures with file:line, byte budget per runtime. Pinned to `rulesync@8.15.1` (exact pin, matches package.json). **Required by D6 from DX review** — without this, `wp compile` UX is inconsistent with `wp qa`/`wp test`/`wp lint`.
- **Create:** `src/output-transforms/__fixtures__/edge/` — committed real-world fixtures (ANSI-colored vitest, oxlint with stack traces, huge tsc output, rulesync v8.15 success + failure outputs).
- **Land 3 PoC tests proving current gaps** before fixing them:
  1. ANSI shift in `extractJson` (`vitest.ts:33`) — feed `'[31m['+JSON.stringify(sample)+'[0m'` to vitestTransform; verify regex fallback hits.
  2. 1MB blob in `genericTransform` — `'x'.repeat(1_500_000)`; verify no O(n²) blow-up + clip works.
  3. Truncated vitest JSON — fixture cut at byte 500 of 5KB; verify `extractJson`'s brace-counter doesn't infinite-loop.
- **Fix:** Add timeout to `runScript` in `src/mcp/tools/audit.ts:284-302` (mirror `lint.ts`'s `LINT_COMMAND_TIMEOUT_MS=5min`).
- **Fix:** `.agent/rules/rtk-routing.md` clarification block — append subprocess-vs-Bash-hook coverage note: "wp_* tools shelling out via `child_process.spawn` own their own filtering; rtk PreToolUse hook only fires for top-level Bash calls and does NOT reach into wp_* internals. CLI verbs (`wp <verb>` from a shell) ARE rewritten by rtk."

**Acceptance:**
- [x] All 32 cases pass with current source (some via fix, some via existing transform)
- [x] 4 PoCs initially fail (proving gap), then pass after fix (PoC 4 = rulesync wrapping per D6)
- [x] `runScript` audit timeout test (5-min cap) added
- [x] `rulesync` transform wraps `wp compile` subprocess output; UX consistent with `wp qa`/`wp test`/`wp lint`
- [x] `rtk-routing.md` subprocess clarification block landed in both `.agent/rules/` and `catalog/agent/rules/` mirrors

---

#### Task 1.5: gstack lane declaration + methodology cross-link
**Status:** done
**Depends:** None

Two text-only changes per CEO review + eng review decisions (no code coupling):

- **Modify:** `.agent/rules/rtk-routing.md` (and `catalog/agent/rules/rtk-routing.md` mirror) — add **gstack as the 4th lane**:
  > agent-kit owns `wp_*` dev-workflow routing and MCP-shaped deny wording
  > context-mode owns its own `ctx_*` nudging when that plugin is installed
  > rtk owns `rtk *` shell-tool filtering for the long-tail command surface
  > **gstack owns interactive/browser workflows (slash-skill invocation, AskUserQuestion-gated)**
  > this rule is fallback-only; it should not compete with SessionStart routing
- **Modify:** `.agent/skills/systematic-debugging/SKILL.md` — append `## See also` section pointing to `/investigate` (gstack) for the interactive variant. Describe when to pick each (headless agent run vs human-in-the-loop debugging with freeze hooks).

**Acceptance:** `rtk-routing.md` lists 4 lanes with clear ownership. systematic-debugging SKILL.md mentions /investigate as the interactive sibling.

---

### Wave 1 — wrappers + manifest emitters (parallel; depend on 1.1)

#### Task 2.1: `wp compile` wrapper
**Status:** done
**Depends:** Task 1.1

`src/cli/commands/compile.ts` — thin wrapper spawning `rulesync generate --targets <list>` after `flatten.ts`. Handles failure modes (rulesync missing, version mismatch). Idempotent. Atomic via tmp+rename.

**Acceptance:** Roundtrip fixture → all six runtime outputs match expected (golden-file tests).

#### Task 2.2: Four plugin manifest emitters
**Status:** done
**Depends:** Task 1.1

`src/compiler/manifests/{claude,codex,cursor,gemini}.ts` — each ~30 LOC JSON emitter pointing at the shared `skills/` tree. Manifests version-pinned via `_versions.ts`.

**Acceptance:** Each manifest validates against current official schema (verified per-manifest at test time).

#### Task 2.3: `wp setup --with example-skill` scaffold (DX-review D5)
**Status:** done
**Depends:** Task 1.1, Task 2.1

Per DX review D5: fix the empathy-narrative T+1:30 dead-end where first-time consumers run `wp compile` on an empty `.agent/skills/` and get a useless error. New scaffolder flag emits a working `.agent/skills/hello-webpresso/SKILL.md` + auto-runs `wp compile` as the final setup step. Chained with existing `--with base-kit` and `--with gstack` flags. TTHW for OSS-adopter persona: install → IDE skill discovery in ~90s without leaving terminal.

**Files:**
- Create: `src/cli/commands/init/scaffolders/example-skill/index.ts`
- Create: `src/cli/commands/init/scaffolders/example-skill/SKILL.md.template`
- Modify: `src/cli/commands/init/scaffolders/_registry.ts`

**Acceptance:** Fresh repo + `pnpm add -D @webpresso/agent-kit && npx wp setup --with base-kit --with example-skill` → `.agent/skills/hello-webpresso/SKILL.md` exists, `wp compile` ran, all 6 IDE asset trees populated, ready for first `/hello-webpresso` invocation.

---

#### Task 2.4: `wp_qa` advisory tail-hint for UI changesets
**Status:** done
**Depends:** Task 1.4 (filter test harness must precede MCP output changes)

When `wp_qa` returns success AND the changeset detected by `git diff --name-only HEAD` includes UI files (`*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `apps/client/**`, `apps/web/**`), append a single advisory line to the `wp_qa` summary output: `"Static QA passed. For visual/UX QA, run /qa (gstack)."` Static text only — no skill discovery, no auto-invocation, no MCP coupling. Detection logic lives in `src/mcp/tools/_shared/ui-detection.ts`.

Tail-hint must respect the 4000-char `clipRawOutput` cap (cannot extend the envelope size).

**Acceptance:** Fixture with UI file change → hint appended. Fixture with backend-only change → no hint. Hint absent if `wp_qa` failed (don't muddy failure output). Test added to `edge-cases.test.ts` matrix.

---

#### Task 2.6: OSS-positioning + WEDGE EXPERIENCE (DX-review D9 + post-codex concern #1)
**Status:** done
**Depends:** Task 2.1, Task 2.3 (example-skill scaffolder)

Per DX-review D9: trilogy scope stays as-drafted; add the OSS-positioning work to make v0.11.0 legible to 3rd-party adopters comparing against rulesync (175k weekly downloads). **Plus post-codex concern #1:** docs alone don't substitute for a wedge experience. This task ships BOTH the positioning docs AND a runnable wedge-demonstration.

**Files:**
- Modify: `webpresso/agent-kit/README.md` — new section "How agent-kit relates to rulesync" with a side-by-side feature table (rulesync: 17 runtimes, MIT, npm. agent-kit: layered on top; adds AGENTS.md merger, blueprint lifecycle, audits, structured MCP, cross-repo correlation, GitHub Action). Explicitly: "agent-kit uses rulesync as substrate; we don't reimplement what rulesync does well."
- Create: `webpresso/agent-kit/docs/positioning-vs-rulesync.md` — longer-form diff page with worked examples
- Modify: `webpresso/agent-kit/README.md` — top-of-README "first 5 minutes" chained-magical-moments tour
- **Create:** `webpresso/agent-kit/docs/wedge-experience/` — runnable, scripted demonstration of the value-add vs rulesync alone:
  - `demo.sh` — bash script: scaffolds two temp dirs (one with rulesync only, one with agent-kit), creates a deliberately-broken `.agent/` (oversized skill, broken ref, duplicate section), runs both, shows side-by-side terminal output proving agent-kit catches what rulesync alone doesn't.
  - `expected-output.txt` — golden-file of the demo's terminal output for regression testing.
  - `README.md` — explains the demo in 3 paragraphs; consumer can clone-and-run in <60 seconds.
- Add registry auth-setup section to the top-of-README (per DX-review D10 / codex #2) so OSS adopters discover `@webpresso:registry=https://npm.pkg.github.com` configuration BEFORE first install failure.

**Acceptance:**
- [x] README opens with: (a) registry+auth setup, (b) first-5-min tour, (c) "how agent-kit relates to rulesync"
- [x] `docs/wedge-experience/demo.sh` is runnable + reproducible against a fresh clone
- [x] Demo proves at least 3 concrete value-adds beyond rulesync (drift catch, AGENTS.md merge, audit-to-tech-debt loop)
- [x] Docs cross-link `docs/positioning-vs-rulesync.md`
- [x] OSS adopter first-week signal monitored via Task 2.5 telemetry: setup completion rate, demo-run rate

---

#### Task 2.5: Anonymous opt-in TTHW telemetry in `wp setup` (DX-review D8)
**Status:** done
**Depends:** Task 2.3

Per DX review D8: instrument `wp setup` to measure wall-clock from install to first successful `wp compile`. Anonymous, opt-in only (`--telemetry` flag at setup time or interactive prompt; defaults OFF for 3rd-party adopters, ON only for internal monorepo + ingest-lens consumers via a config flag). Posts a minimal payload (timestamp, duration_ms, agent-kit version, OS, no PII, no repo identifiers) to webpresso analytics endpoint. Reuses the gstack telemetry pattern (`gstack-telemetry-log` shape) so consumers see familiar UX. Enables the `/devex-review` boomerang to measure plan-vs-reality TTHW.

**Files:**
- Create: `src/telemetry/setup-tthw.ts`
- Create: `src/telemetry/_endpoint.ts` (URL + auth config)
- Modify: `src/cli/commands/init/setup.ts` (instrument start/end of setup flow)

**Acceptance:** Setup flow measures TTHW when telemetry enabled; one payload per setup; never blocks setup completion on network failure; opt-out is fully respected (zero network calls when off); privacy doc added to README.

---

### Wave 2 — orchestrator, audits, integrations (depend on Wave 1)

#### Task 3.1: Compile orchestrator + manifest
**Status:** done
**Depends:** Tasks 2.1, 2.2

Wire flatten → rulesync → manifests → merger into a single `wp compile` transactional run. Writes `.agent/.compile-manifest.json` with content-hash sentinels for drift detection.

**Acceptance:** Re-running with no source changes is a no-op (manifest match); drift detection works.

#### Task 3.2: `wp skills orphans --fix` + `wp audit gitignore-agent-surfaces` + `wp audit memory-unified`
**Status:** done
**Depends:** Task 3.1

The three audits + the orphans verb. Each emits summary-first JSON (`failures`, `tier`, `bytes`, `tokensSaved`) per the `cmd-execution.md` contract.

**Acceptance:** All three audits CI-suitable; orphans removes only unsourced files.

### Wave 3 — GitHub Action + PR comment (separate repo)

#### Task 4.1: `webpresso/agent-kit-action` repo
**Status:** done
**Depends:** v0.11.0 of agent-kit shipped

Create new repo `webpresso/agent-kit-action`. Reusable workflow `.github/workflows/audit.yml` that runs `wp audit --all --json` and posts a PR comment (D6) if `pr-comment: true`. Fixture-based test harness for the action itself.

**Acceptance:** Action consumed by 1 consumer (monorepo or ingest-lens) in PR test; comment formatted correctly.

### Wave 4 — release + consumer rollouts

#### Task 5.1: Cut agent-kit v0.11.0
**Status:** done
**Depends:** All prior

`pnpm version 0.11.0`, CHANGELOG with explicit breaking-change callout (symlink-era removed, `wp cursor-windsurf-sync` deleted, rulesync wrap is new architecture). Tag + push.

**Acceptance:** Published to GitHub Packages; SHA captured for ingest-lens pin.

#### Task 5.2: monorepo + ingest-lens adopt v0.11.0 (clean-state, no migration)
**Status:** done
**Depends:** Task 5.1

Per "we are not live yet" decision (DX review D7): no public migration commands. Internal consumers get a **one-time pre-release cleanup** before v0.11.0 ships:

- Hand-commit deleting `.claude/skills` symlinks, `.windsurfrules`, `.cursorrules`, any `wp cursor-windsurf-sync` references in package.json/husky/CI yamls. One throwaway commit per consumer, no CLI verb.
- After cleanup commit: bump agent-kit dep to v0.11.0.
- Run `wp setup --with base-kit --with example-skill` (D5 — fresh setup as if greenfield).
- Run `wp compile` (clean state, all 6 IDE trees populate from `.agent/`).
- Run all audits (gitignore-agent-surfaces, memory-unified, broken-refs, skill-sizes).
- Add `webpresso/agent-kit-action@v1` to each consumer's CI.
- Commit with lore-protocol message.

**Acceptance:** Both consumers' CI green; no drift on second `wp compile`; PR action runs and comments correctly; zero references to `migrate-legacy` anywhere in agent-kit source.

## Quick Reference

| Wave | Tasks | Parallel agents | Effort (CC) |
|---|---|---|---|
| Wave 0 | 1.1, 1.2, 1.3, 1.4, 1.5 | 5 | ~1.5 days |
| Wave 1 | 2.1, 2.2, 2.3, 2.4, 2.5, 2.6 | 6 | ~2-2.5 days |
| Wave 2 | 3.1, 3.2 | 2 | ~1 day |
| Wave 3 | 4.1 (separate repo) | 1 | ~half day |
| Wave 4 | 5.1, 5.2 | 1 then 2 | ~1-2 days |
| **Total** | **14 tasks** | | **~6.5-9 days CC / ~4-5 weeks human** |

Parallelization score: A. Total 14 tasks (1.4 filter harness, 1.5 gstack lane/cross-link, 2.3 example-skill scaffolder replaces removed migrate-legacy, 2.4 wp_qa tail-hint, 2.5 TTHW telemetry, 2.6 OSS-positioning+wedge-experience). Critical path still 5 waves. Task 1.2 expanded with rotation safeguards (post-codex concern #2) — same Wave 0 effort.

## Appendix A — Verified frontmatter schemas (2026-05-11)

(Unchanged from prior revision. See research note for full citation trail.)

- **Claude Code SKILL.md** — Required: `name`, `description`. Optional: `when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `allowed-tools`.
- **Claude Code subagent** — Required: `name`, `description`. Optional: `tools`, `disallowedTools`, `model`, `permissionMode`, `skills`, `mcpServers`, `hooks`, `maxTurns`, `isolation`, `color`.
- **Codex skill** — Required: `name`, `description`. Optional: `agents/openai.yaml` companion.
- **Codex subagent (TOML)** — Required: `name`, `description`, `developer_instructions`. Optional: `nickname_candidates`, `model`, `model_reasoning_effort`, `sandbox_mode`, `mcp_servers`, `skills.config`.
- **OpenCode agent** — `description`, `mode` (`primary`|`subagent`|`all`), `model`, `temperature`, `tools` (object), `permission` (`edit`/`bash`: `allow`/`ask`/`deny`), `prompt`.
- **OpenCode command** — `description`, `agent`, `model`.
- **Cursor rule (MDC)** — `description`, `globs` (array), `alwaysApply` (boolean).
- **Windsurf rule** — `description`, `trigger` (`always_on`|`glob`|`model_decision`), `globs` (when `trigger: glob`).
- **Gemini command (TOML)** — Required `prompt`. Optional `description`.

## Resolution log

All open questions from prior revision resolved by CEO review 2026-05-11:

1. ✅ **rulesync as dep** — yes.
2. ✅ **Plugin marketplace pivot** — yes for 4 of 6 IDEs; filesystem fallback only for Windsurf/OpenCode.
3. ✅ **AGENTS.md merging** — Option C hybrid (section-keyed default + `memory.merge.yaml` directives + provenance JSON) + new `op: rotate` directive.
4. ✅ **Cursor/Windsurf/Gemini fold-in** — all in scope; `wp cursor-windsurf-sync` deleted.
5. ✅ **Zero backwards compat for any integration** — applied recursively.
6. ✅ **GitHub Action + PR comment** — yes (D3 + D6).
7. ✅ **Memory rotation** — yes (D7) via `op: rotate` directive.
8. ✅ **AGENTS.md root ownership semantics (explicit decision — 2026-05-11 post-Codex audit)** — Root `AGENTS.md` is classified as **payload** (committed, generated). This is a deliberate semantic change from the prior convention where AGENTS.md was consumer-owned and not rewritten by tooling. Decision: `wp compile` writes and owns root `AGENTS.md`; consumers MUST NOT hand-edit it (use `.agent/memory/AGENTS.md` or `memory.merge.yaml` directives instead). The generated-file policy table in Architecture is the single source of truth. `wp audit memory-unified` warns if CLAUDE.md does not import `@AGENTS.md`. This decision is load-bearing — implementors must not soften it to "wp compile writes it if missing" or any partial-generation path.

Blueprint ready to promote `draft/` → `planned/`.
