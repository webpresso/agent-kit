---
type: blueprint
status: in-progress
complexity: L
created: 2026-05-04T00:00:00.000Z
last_updated: '2026-05-04'
progress: '0% (0/16 tasks done, 0 blocked, updated 2026-05-04)'
depends_on: []
tags:
  - agent-kit
  - hooks
  - rules
  - claude-code
  - worktrees
  - audit
  - subagents
---

# Elegance Pass 2026: Bootstrap Reliability + Catalog Distribution

> **Refinement note (2026-05-04):** Original plan included migrating global hooks (`ak-pretool-guard`) into per-skill SKILL.md hooks. **Critical finding** during refinement: skill `hooks:` are *scoped to skill lifecycle*, not session-wide. Migrating safety guardrails into skills would break the always-on guarantee. Phase 3 was rewritten to ADD skill-scoped hooks for skill-specific behavior, NOT migrate existing global hooks. See Risks table R1.

Make `ak setup` the canonical, idempotent, single-command bootstrap for AI agent surfaces across Claude Code, Codex, Gemini CLI, and OpenCode. Eliminates regression classes (worktree hooks gap, missing `ak-pretool-guard`, stale `.claude/rules/` copies) by patching them into the scaffolder, and adds `ak audit agents` so CI catches drift before sessions degrade.

## Product wedge anchor

- **Stage outcome:** Every webpresso public package + ingest-lens consumer reaches "fully wired agent surfaces from a fresh clone" via one command, with CI catching drift.
- **Consuming surface:** `pnpm setup:agent` (consumer-side) + `ak audit agents` (CI-side).
- **New user-visible capability:** A developer who clones any webpresso public package today gets zero agent context. After this lands, they get full Claude Code rules, Codex hooks, Gemini commands, and gstack skills with one `pnpm install && pnpm setup:agent`.

## Planning Summary

16 tasks across 5 phases. **Shipping plan**: Phase 1+2 together as one PR (regression fix + enabler), then Phases 3, 4, 5 as separate PRs (net-new capabilities + redirect tightening). Phase 1 stops the regression bleeding (worktree hooks gap, missing `setup:agent` script, missing tests). Phase 2 simplifies the symlink chain by pointing `.claude/rules/` directly into `node_modules/@webpresso/agent-kit/catalog/agent/rules/` (auto-updates on `pnpm install`); **no `.agent/rules/` fallback** — `ak setup` fails fast if the devDep is missing. Phase 3 adds the *capability* for skills to declare scope-limited hooks. Phase 4 ships 4 canonical subagent definitions: code-reviewer, security-auditor, doc-writer, explorer. Phase 5 tightens forbidden-command deny reasons to lead with the `mcp__agent-kit__ak_*` MCP-tool template (universal across consumers regardless of `just` availability).

**Audit strictness (decided):** `ak audit agents` is **hard-fail everything**. Missing AGENTS.md, missing hooks, broken symlinks, hand-edited rule files, missing `setup:agent` script, missing devDep — all block CI. Legitimate overrides require an explicit allowlist entry in `.agent-kitrc.json#rules.overrides`.

**Dropped from original plan:**
- `ak setup --with github:user/repo` (community catalogs) — needs separate trust-model blueprint first; arbitrary catalog = arbitrary RCE via hooks.
- `ak migrate` — premature; do when catalog format actually changes.
- cc-switch integration — wrong audience layering (GUI vs CLI).
- `ak doctor agents` — `ak audit agents` already covers it.
- `.agent/rules/` fallback in `scaffoldClaudeRules` — adds complexity for the rare case; better to fail-fast and require devDep.

## Quick Reference (Execution Waves)

| Wave | Tasks | Parallelizable | T-shirt |
|------|-------|---------------|---------|
| **Wave 0** | 1.1, 1.2, 1.3, 1.4, 4.1, 5.2 | 6 agents | XS-S |
| **Wave 1** | 1.5, 2.1, 2.3, 4.2, 5.1 | 5 agents | S-M |
| **Wave 2** | 2.2, 2.4, 3.1, 5.3 | 4 agents | S |
| **Wave 3** | 3.2 | 1 agent | XS |
| **Critical path** | 1.1 → 2.3 → 2.4 (or 1.1 → 3.1 → 3.2) | — | 4 waves |

## Parallel Metrics

- **RW0** = 6 (target ≥ 3) ✓
- **CPR** = 16 / 4 = 4.00 (target ≥ 2.5) ✓
- **DD** ≈ 14 / 16 = 0.88 (target ≤ 2.0) ✓
- **CP** = 0 (no same-file overlaps in any wave) ✓
- **Score: A** — ready for `/pll`.

## Refinement Findings

| # | Severity | Claim | Reality | Fix |
|---|----------|-------|---------|-----|
| F1 | CRITICAL | "Move `ak-pretool-guard` into a skill SKILL.md" | Skill `hooks:` are scoped to skill lifecycle, not session-wide. `ak-pretool-guard` must fire on every Bash/Write/Edit. Moving it = breaks safety guarantee. | Phase 3 REWRITTEN: skill hooks for skill-specific behavior only; keep global hooks centralized. |
| F2 | CRITICAL | "`ak setup --with github:user/repo`" | Catalogs ship hooks. Arbitrary catalog from GitHub = arbitrary RCE on every tool use. No trust model proposed. | Dropped from this blueprint. Spin off `community-catalog-trust-model` blueprint. |
| F3 | HIGH | "Worktrees inherit `.claude/` cleanly via symlinkDirectories" | Symlink chain: `worktree/.claude` → `main/.claude` → `main/.agent/rules/`. Worktree reads MAIN's `.agent/rules/`, not its own. Catalog content is identical so functionally fine, but counter-intuitive. | Document in Task 1.5 + VISION.md. |
| F4 | HIGH | "`scaffoldClaudeRules` symlinks to `node_modules/...`" | agent-kit's own repo has no `node_modules/@webpresso/agent-kit/`. Self-hosting case unhandled. | Task 2.1 adds **2-mode detection**: self / consumer (require devDep). No fallback — fail fast if devDep missing. |
| F5 | HIGH | Implicit assumption that `prepare` hook could run `ak setup` | Race condition: `prepare` fires during `pnpm install` BEFORE agent-kit's own install completes in pnpm hoisted layout. | Task 1.5 documents anti-pattern: do NOT add `prepare: ak setup`. Use `pnpm install && pnpm setup:agent`. |
| F6 | MEDIUM | Original 1+2+3 day estimates | 1.5-2x optimistic; missing test files and edge cases. | T-shirt sizing: Phase 1 = M, Phase 2 = L, Phase 3 = S, Phase 4 = M. |
| F7 | MEDIUM | "Plan structured for `/pll`" (original) | No Blueprint format, no Files lists, no TDD steps, no parallelization metrics. | This rewrite. |
| F8 | MEDIUM | "cc-switch integration" | cc-switch is desktop-GUI for users; agent-kit is CLI for repos. Different audiences. | Dropped. Replaced with Phase 4 subagents (real value). |
| F9 | LOW | VISION.md / plan inconsistency on subagents priority | VISION said "next frontier"; original plan put as stretch. | Promoted to Phase 4. |
| F10 | LOW | Missing product-wedge anchor (per `blueprint-scoping.md`) | Standard requirement for blueprints. | Anchor added at top of this overview. |

## Shipping Plan

| PR | Phases | Tasks | Why |
|----|--------|-------|-----|
| **PR #1** (Land first) | Phase 1 + Phase 2 | 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4 | Phase 1 fixes the regression (worktree hooks gap, missing devDep auto-injection); Phase 2 simplifies the symlink chain and adds CI drift detection. They're paired: Phase 2.1 depends on Task 1.4's devDep guarantee. Shipping together gives the foundation in one merge. |
| **PR #2** | Phase 3 | 3.1, 3.2 | Net-new capability (skill-scoped hooks). Independent of Phase 4 catalog content. |
| **PR #3** | Phase 4 | 4.1, 4.2 | Subagent catalog. Independent ship; can be parallel with PR #2. |
| **PR #4** | Phase 5 | 5.1, 5.2, 5.3 | MCP-shaped redirect format. Independent of Phases 3+4; can ship in parallel with PR #2 once PR #1 lands. |

**Why not one PR per phase:** Phase 1 alone leaves the symlink chain in the redundant 2-hop state; Phase 2 alone breaks without Task 1.4. They're a pair.

**Why not one mega-PR:** Phase 3 and Phase 4 are net-new capabilities that benefit from independent review and rollback. Shipping the foundation (PR #1) first lets us measure regression-fix impact before introducing new surface area.

## Edge Cases

| # | Scenario | Handling | Task |
|---|----------|----------|------|
| E1 | Consumer in fresh worktree, node_modules not yet installed | All `ak-*` hook commands wrap in `[ -x ... ] && ... || true` (already shipped in current `scaffold-agent-hooks`); verify in Task 1.1 test | 1.1 |
| E2 | Consumer's `.claude/settings.json` has user-customized hooks | `patchClaudeSettings` is additive; `hasCommand` checks by binary name (already implemented) | 1.1 |
| E3 | Consumer hand-edited a `.claude/rules/<name>.md` (not a symlink) | `scaffoldClaudeRules` preserves real files (already implemented in current code) | 2.2 |
| E4 | agent-kit's own repo running `ak setup` | Detect `package.json#name === "@webpresso/agent-kit"` → use `catalog/agent/rules/` instead of `node_modules/...` | 2.1 |
| E5 | Consumer with broken/stale symlinks in `.claude/rules/` | `ak audit agents` **hard-fails** (CI blocked). Run `ak setup --overwrite` to repair. | 2.3 |
| E6 | Skill SKILL.md has malformed `hooks:` frontmatter | Validator in Task 3.2 rejects with clear error; setup fails fast | 3.2 |
| E7 | Worktree experimenting with rule changes | Reads MAIN's rules (documented behavior). To diverge, copy `.agent/rules/` into worktree and remove `.claude` symlinkDirectories entry locally | 1.5 |
| E8 | Pnpm hoisted vs nested layout | Resolution uses `require.resolve('@webpresso/agent-kit/package.json')` then dirname — works in both layouts | 2.1 |
| E9 | Consumer wants to override a catalog rule with custom content | Add entry to `.agent-kitrc.json#rules.overrides: ["rule-name"]` — audit then ignores that rule. Without entry: hard-fail. | 2.3 |
| E10 | Consumer has not installed `@webpresso/agent-kit` devDep yet | `ak setup` fails fast with: "Run `pnpm add -D @webpresso/agent-kit && pnpm install` first." No fallback. | 2.1 |
| E11 | `node_modules/@webpresso/agent-kit/` deleted (e.g. `rm -rf node_modules`) | `.claude/rules/` symlinks become dangling; next `ak audit agents` hard-fails. Resolution: `pnpm install`. | 2.1, 2.3 |
| E12 | Existing consumer repo runs `ak audit agents` for the first time → fails with multiple drift findings | **Migration path:** run `ak setup --overwrite`. Re-runs scaffolders with overwrite mode: catalog-owned files (rules symlinks, hooks) updated to current state; consumer-customized files preserved with `.new` sidecar for manual merge; subsequent `ak audit agents` passes. Documented in audit failure messages and `docs/migration.md`. | 2.3 |
| E13 | Consumer pinned `@webpresso/agent-kit` to a specific version, doesn't want `"latest"` | Task 1.4 preserves consumer-customized version field (test #4). The `"latest"` injection fires only when the dep is missing entirely, never when present. | 1.4 |
| E14 | Agent runs `pnpm test` in `webpresso/runtime` (no justfile) | New redirect format leads with `mcp__agent-kit__ak_test(...)`. Fallback line mentions `just test...` but model picks the MCP path which works (Phase 5 V1+V2). Old format would have suggested `just test` and silently failed at execution. | 5.1 |
| E15 | Agent-kit MCP server is briefly unavailable mid-session (sentinel cleared) | `buildRedirectMessage` checks `isMcpReady()` (V4) at call time. When false, output reverts to `just`-prefixed hint (V5 passthrough pattern). No agent-stuck state. | 5.1 |
| E16 | Fork of agent-kit publishes under different MCP server name | Override via `.agent-kitrc.json#mcp.serverName`. `buildRedirectMessage` reads from `AgentkitConfig.mcp.serverName`, defaults to `'agent-kit'` (V1). | 5.2 |

## Risks

| # | Risk | Mitigation | Severity |
|---|------|------------|----------|
| R1 | Future contributor moves `ak-pretool-guard` into a skill (recurring temptation since "self-contained skill" is appealing) | F1 documented in this blueprint + Risks; add explicit comment in `scaffold-agent-hooks.ts` warning against this | HIGH |
| R2 | `node_modules/@webpresso/agent-kit/` symlink target deleted by `rm -rf node_modules` | Symlinks become broken until next `pnpm install`. `ak audit agents` hard-fails on dangling symlinks (Task 2.3); developer runs `pnpm install && pnpm setup:agent` to repair. | MEDIUM |
| R3 | Phase 4 subagent definitions diverge from Claude Code subagent format as it evolves | Pin to docs version at time of writing; `ak audit agents` validates frontmatter; revisit on major Claude Code releases | MEDIUM |
| R4 | Hard-fail audit blocks legitimate consumer customizations | Documented `.agent-kitrc.json#rules.overrides` and `scripts.setup-agent` allowlist mechanism. Failure messages tell consumers exactly how to opt out per-file. The strictness is intentional: with hard-fail-everything chosen by the team, drift never silently leaks past CI. | MEDIUM (LOWERED from HIGH by allowlist) |
| R5 | Consumer never installs `@webpresso/agent-kit` devDep, runs `ak setup` and gets cryptic error | Task 2.1 returns actionable error message (`pnpm add -D @webpresso/agent-kit && pnpm install`). Task 1.4 ensures fresh `ak setup` runs auto-add the devDep before the symlink step. | LOW |
| R6 | Phase 1+2 single PR is large | Each task is XS-S individually; PR is a ~10-task PR. Review burden manageable if each task has its own commit. CI's existing audit chain catches regressions per-commit. | LOW |
| R7 | `"latest"` dist-tag in consumer devDep means `pnpm install` silently picks up new agent-kit majors | `ak audit agents` in CI catches catalog-format breaks immediately on next install (Task 2.3 hard-fails on schema drift). Consumers with tighter reproducibility needs can override the injected `"latest"` to a pinned version — Task 1.4 preserves consumer-customized version (test #4). | MEDIUM |
| R8 | MCP tool names drift between Claude Code (matcher pattern), MCP server registration, and the `ak_*` source files | Phase 5 hardcodes the matcher format (`mcp__agent-kit__ak_<verb>`) with file:line references in V1+V2 of the blueprint. The `ak audit agents` check from Task 2.3 should be extended to verify the constants in `mcp-redirect.ts` match the actual `name:` literals in `src/mcp/tools/*.ts` (use AST or grep). Cited as follow-up in Task 5.3 acceptance. | LOW |

## Technology Choices

| Choice | Rationale | Source |
|--------|-----------|--------|
| `worktree.symlinkDirectories` | Official Claude Code setting; documented + supports cross-tree inheritance | https://docs.anthropic.com/en/docs/claude-code/settings#worktree-settings |
| Skill `hooks:` frontmatter | Platform-supported; scoped semantics correct for skill-specific behavior | https://docs.anthropic.com/en/docs/claude-code/skills (frontmatter table) |
| `.claude/rules/*.md` with `paths:` frontmatter | Already used by all our catalog rules; path-scoped loading keeps context lean | https://docs.anthropic.com/en/docs/claude-code/memory#path-specific-rules |
| `require.resolve()` for cross-package path detection | Stable in pnpm hoisted + nested layouts; no hardcoded paths | Node.js built-in |

## Phases

### Phase 1: Bootstrap regression fixes [Complexity: M]

Goal: every `ak setup` run produces correct settings. Stops the regression where the monorepo had to be hand-fixed for `symlinkDirectories`, `ak-pretool-guard`, and `ak-stop-qa`.

#### [infra] Task 1.1: Patch `worktree.symlinkDirectories` in scaffold-agent-hooks

**Status:** todo

**Depends:** None

`scaffold-agent-hooks.ts` currently patches `.claude/settings.json#hooks` but never touches `worktree.symlinkDirectories`. Without this, new Claude Code worktrees get a fresh empty `.claude/` and inherit nothing — every hook reverts to silent failure on first session start. Extend `patchClaudeSettings` to ensure `worktree.symlinkDirectories` includes `.claude` (additive — preserve other entries like `node_modules`, `.cache`).

**Files:**
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/index.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/index.test.ts` (add test cases)

**Steps (TDD):**
1. Write failing test: empty `settings.json` → after patch → `worktree.symlinkDirectories` contains `.claude`
2. Write failing test: existing `worktree.symlinkDirectories: ["node_modules"]` → after patch → contains both `node_modules` AND `.claude` (additive, no duplicate)
3. Write failing test: existing `worktree.symlinkDirectories: [".claude"]` → after patch → identical (idempotent)
4. Run: `bun run test src/cli/commands/init/scaffolders/agent-hooks/index.test.ts` — verify FAIL
5. Implement: extend `patchClaudeSettings` to merge `.claude` into `worktree.symlinkDirectories` array
6. Add a comment block above the patch explaining: skill `hooks:` are scoped, NOT a substitute for centralized `ak-*` hooks (R1 mitigation)
7. Run: same test command — verify PASS
8. Run: `bun run lint:pkg` and `bun run typecheck` — both clean

**Acceptance:**
- [ ] All three tests pass
- [ ] R1 warning comment present in source
- [ ] `bun run typecheck` clean
- [ ] No regression in existing agent-hooks tests

#### [docs] Task 1.2: Single-command bootstrap in AGENTS.md.tpl

**Status:** todo

**Depends:** None

The current `AGENTS.md.tpl` setup section says `ak setup && ak symlink sync`. But `ak setup` already calls `syncAll` (the symlinker) at the end of its flow. The second command is redundant and confuses consumers. Update the template to a single canonical command that works for both first-time and re-run cases.

**Files:**
- Modify: `catalog/AGENTS.md.tpl`

**Steps (TDD):**
1. Read current template's "Setup after clone" section
2. Replace the multi-command block with: `pnpm install && pnpm setup:agent`
3. Add explanatory comment: `# pnpm setup:agent runs ak setup, which scaffolds .agent/, AGENTS.md, hooks, and runs symlink sync`
4. Run: `bun run lint:pkg` (ensure publint still passes)
5. Run: existing `scaffold-agents-md.test.ts` tests — verify PASS (no regression in template rendering)

**Acceptance:**
- [ ] Template uses single bootstrap command
- [ ] Explanatory comment present
- [ ] All existing scaffold-agents-md tests pass

#### [infra] Task 1.3: Add test file for scaffoldClaudeRules

**Status:** todo

**Depends:** None

When `scaffolders/claude-rules/index.ts` was created earlier, no test file was added. Establish coverage now so Phase 2 can refactor confidently. Tests must cover: symlink creation from empty, idempotency on re-run, preservation of consumer-owned real files, dry-run mode, and missing source `.agent/rules/` directory.

**Files:**
- Create: `src/cli/commands/init/scaffolders/claude-rules/index.test.ts`

**Steps (TDD):**
1. Set up test fixtures: temp directory with `.agent/rules/sample.md` plus a `.markdownlint.json` and `README.md` to verify they're skipped
2. Write failing test: empty `.claude/rules/` → after scaffold → has symlink `sample.md` → `../../.agent/rules/sample.md`
3. Write failing test: re-run on populated `.claude/rules/` → all entries marked `identical`, no double-symlinking
4. Write failing test: existing real file at `.claude/rules/sample.md` → preserved as `identical`, not overwritten
5. Write failing test: dry-run mode → no filesystem changes, results contain `created` actions
6. Write failing test: missing `.agent/rules/` source → returns empty results, doesn't throw
7. Run: `bun run test src/cli/commands/init/scaffolders/claude-rules/index.test.ts` — all 5 tests must pass against the EXISTING implementation (no impl change needed if it's correct)
8. If any test fails: fix the implementation, not the test

**Acceptance:**
- [ ] 5 tests covering symlink/idempotent/preserve/dry-run/missing-source
- [ ] All tests pass
- [ ] Test file follows existing scaffolder test patterns (e.g. `scaffold-agents-md.test.ts`)

#### [infra] Task 1.4: ak setup ensures @webpresso/agent-kit devDep + setup:agent script

**Status:** todo

**Depends:** None

Currently consumers must hand-add `@webpresso/agent-kit` as a devDep and the `setup:agent` script. We did this manually for 7 sibling repos in the prior session — this should be `ak setup`'s job. Extend `scaffold-base-kit.ts` (or split into a new `scaffold-self-install` scaffolder if it would bloat base-kit) to merge both into the consumer's `package.json`.

**Files:**
- Modify: `src/cli/commands/init/scaffold-base-kit.ts` (or new file `scaffolders/self-install/index.ts`)
- Modify: corresponding test file

**Steps (TDD):**
1. Write failing test: consumer `package.json` without `@webpresso/agent-kit` → after scaffold → has `devDependencies["@webpresso/agent-kit"] = "latest"` (tracks dist-tag, not pinned to a specific version)
2. Write failing test: consumer without `setup:agent` script → after scaffold → has `scripts["setup:agent"] = "ak setup"`
3. Write failing test: consumer with both already present at correct values → identical, no change
4. Write failing test: consumer with `setup:agent` pointing to a custom command → preserve consumer override (do NOT clobber)
5. Write failing test: agent-kit's OWN repo (detected by `package.json#name`) → skip both (don't add self-as-devDep)
6. Run failing tests, implement, re-run
7. Document in scaffolder: never add `prepare` script — chicken-and-egg with `ak` not on PATH yet during `pnpm install` (F5)
8. Document in scaffolder: `"latest"` tag tracks the published dist-tag; consumers re-run `pnpm install` to pick up new versions; CI catches break-on-update via `ak audit agents` (see R7)

**Acceptance:**
- [ ] 5 tests pass
- [ ] Self-install detection works for agent-kit's own repo
- [ ] `prepare` anti-pattern documented in source comment
- [ ] `latest` tag rationale documented in source comment
- [ ] No clobber of consumer-customized `setup:agent`

#### [docs] Task 1.5: Document worktree-resolution behavior + prepare anti-pattern

**Status:** todo

**Depends:** Task 1.1

When `symlinkDirectories: [".claude"]` is set, new worktrees follow the symlink to MAIN's `.claude/` AND read MAIN's `.agent/rules/` (not the worktree's). For catalog rules this is identical content, but it's counter-intuitive and warrants explicit documentation. Also document the `prepare` script anti-pattern from F5.

**Files:**
- Create: `docs/worktrees.md`
- Modify: `VISION.md` (add to "What 'fully wired' means" + new "Anti-patterns" section)

**Steps (TDD):**
1. Write `docs/worktrees.md` covering: how `symlinkDirectories` resolves, what reads MAIN vs worktree, when to diverge (rare), and how to opt out per-worktree
2. Add "Anti-patterns" section to VISION.md:
   - Do NOT use `prepare: ak setup` in `package.json` (race condition during pnpm install)
   - Do NOT migrate `ak-*` global hooks into skill SKILL.md `hooks:` (scope mismatch)
3. Run: `pnpm exec ak audit docs-frontmatter` — verify new doc passes
4. Run: existing `pnpm docs:check` — no regressions

**Acceptance:**
- [ ] `docs/worktrees.md` created with frontmatter
- [ ] VISION.md updated with anti-patterns section
- [ ] `ak audit docs-frontmatter` passes
- [ ] Cross-references between VISION.md and `docs/worktrees.md` are intact

### Phase 2: Direct catalog symlinks + audit [Complexity: L]

Goal: eliminate the redundant `.agent/rules/` copy hop for Claude Code consumers; auto-update `.claude/rules/` content on `pnpm install`. Add `ak audit agents` so CI catches drift.

#### [infra] Task 2.1: scaffoldClaudeRules with 2-mode detection (no fallback)

**Status:** todo

**Depends:** Task 1.3 (test foundation), Task 1.4 (devDep auto-injection guarantees consumer mode is reachable)

Refactor `scaffoldClaudeRules` to detect environment and choose symlink target:

| Mode | When | Symlink target |
|------|------|----------------|
| `self` | `package.json#name === "@webpresso/agent-kit"` | `../../catalog/agent/rules/<name>.md` |
| `consumer` | `require.resolve("@webpresso/agent-kit/package.json")` succeeds | `../../node_modules/@webpresso/agent-kit/catalog/agent/rules/<name>.md` |

**No fallback mode.** If `require.resolve()` fails (devDep missing or `pnpm install` not yet run), `scaffoldClaudeRules` returns an error result that bubbles up to `ak setup`, which fails fast with: `"@webpresso/agent-kit not found in node_modules. Run \`pnpm add -D @webpresso/agent-kit && pnpm install\` first."` Task 1.4 ensures the devDep is present so this only triggers in unusual orderings.

Use `require.resolve()` for path detection so pnpm hoisted/nested layouts both work. Each mode has different relative-symlink semantics that must be unit-tested.

**Files:**
- Modify: `src/cli/commands/init/scaffolders/claude-rules/index.ts`
- Modify: `src/cli/commands/init/scaffolders/claude-rules/index.test.ts`

**Steps (TDD):**
1. Add helper `detectMode(repoRoot): { mode: 'self' | 'consumer', catalogPath: string } | { error: string }`
2. Write failing tests for each mode + the error case (devDep missing → error result)
3. Implement mode detection + per-mode `symlinkTargetFor(name, mode)` helper
4. Migration: existing symlinks pointing at the wrong target are detected and replaced (with `--overwrite` flag) or flagged as drift (without `--overwrite`)
5. Wire error result into `init/index.ts` so `ak setup` exits 1 with the actionable message
6. Run tests — all pass
7. Run: `bun run typecheck` — clean

**Acceptance:**
- [ ] Both modes (self / consumer) covered by tests including pnpm-hoisted-layout fixture
- [ ] Detection uses `require.resolve()`, no hardcoded paths
- [ ] Devdep-missing case returns error result with actionable message; `ak setup` exits 1
- [ ] Existing symlinks with wrong target detected (drift signal in result)
- [ ] Self-hosting case (agent-kit's own repo) verified in test

#### [infra] Task 2.2: Tests for both symlink modes + error path

**Status:** todo

**Depends:** Task 2.1

Expand the test suite added in Task 1.3 to cover the 2-mode detection. Specifically: pnpm hoisted layout (`node_modules/@webpresso/agent-kit/`), pnpm nested layout (`node_modules/.pnpm/@webpresso+agent-kit@.../node_modules/@webpresso/agent-kit/`), self-hosting, and the devDep-missing error path.

**Files:**
- Modify: `src/cli/commands/init/scaffolders/claude-rules/index.test.ts`

**Steps (TDD):**
1. Add fixtures simulating pnpm hoisted layout (symlink: `node_modules/@webpresso/agent-kit/` → `node_modules/.pnpm/.../`)
2. Add fixtures simulating self-hosting (`package.json#name = "@webpresso/agent-kit"`)
3. Add fixtures simulating devDep-missing (no `node_modules/@webpresso/`)
4. Write tests asserting correct symlink target per mode
5. Write test asserting error result + actionable message when devDep is missing
6. Add migration test: existing wrong-target symlink → with `overwrite: true` → replaced; without → preserved as drift
7. Run tests — all pass

**Acceptance:**
- [ ] pnpm hoisted layout tested
- [ ] pnpm nested layout tested
- [ ] Self-hosting tested
- [ ] Devdep-missing → error result with actionable message tested
- [ ] Migration paths tested

#### [infra] Task 2.3: New audit/agents.ts (hard-fail everything)

**Status:** todo

**Depends:** Task 1.1

Add `ak audit agents` checking the full agent surface. **Every check is hard-fail.** No warn-level. Drift = CI block. Legitimate overrides require explicit allowlist in `.agent-kitrc.json#rules.overrides`.

Checks (all hard-fail):

1. `AGENTS.md` exists at repo root and is non-empty
2. `.claude/settings.json` exists and contains all 5 ak hooks: `ak-pretool-guard` (PreToolUse), `ak-post-tool` (PostToolUse), `ak-stop-qa` (Stop), `ak-sessionstart-routing` (SessionStart), `ak-guard-switch` (UserPromptSubmit)
3. `.claude/settings.json#worktree.symlinkDirectories` includes `.claude`
4. Every `.md` in the catalog rules dir (resolved per Task 2.1 mode detection) has a corresponding entry in `.claude/rules/`. Two valid forms:
   - A symlink resolving to the catalog target (matches expected target byte-for-byte)
   - An entry in `.agent-kitrc.json#rules.overrides: ["<name>"]` declaring intentional override (then audit ignores that name)
5. Every entry in `.claude/rules/` is either a valid symlink (resolvable, target exists) or an allowlisted override (per #4). No dangling, no untracked files.
6. `package.json#scripts.setup:agent === "ak setup"` — exact match. Customization requires an `.agent-kitrc.json#scripts.setup-agent` allowlist entry with the override command.
7. `package.json#devDependencies["@webpresso/agent-kit"]` present and matches a satisfiable semver range for the installed version.

The `.agent-kitrc.json` allowlist mechanism extends the existing config schema. Adding overrides is opt-in per consumer; default is empty (full hard-fail). Document the override path in audit failure messages so consumers know how to legitimize a customization.

**Files:**
- Create: `src/audit/agents.ts`
- Create: `src/audit/agents.test.ts`
- Modify: `src/cli/commands/init/config.ts` (extend `AgentkitConfig` with `rules.overrides`, `scripts.setup-agent`)

**Steps (TDD):**
1. Define `AgentsAuditResult { ok: boolean, checks: AuditCheck[] }` matching existing `repo-guardrails` shape — every check uses `severity: 'error'`
2. Extend `AgentkitConfig` schema for the override allowlist
3. Write failing tests for each check (one fixture per failure mode)
4. Write failing test for each override path (allowlisted rule → check passes)
5. Implement `runAgentsAudit(repoRoot, config): AgentsAuditResult`
6. Failure messages must include actionable remediation (`run \`ak setup\``, `add to .agent-kitrc.json#rules.overrides`, etc.)
7. Run tests — all pass
8. Verify against the local monorepo + sibling repos (manual smoke)

**Acceptance:**
- [ ] All 7 checks implemented as hard-fail
- [ ] Override allowlist mechanism works (rules.overrides, scripts.setup-agent)
- [ ] Failure messages include remediation guidance
- [ ] Manual smoke against monorepo: passes
- [ ] Manual smoke against a sibling repo (e.g. runtime): passes
- [ ] Manual test: hand-edit a `.claude/rules/X.md` symlink → audit fails with override-path hint

#### [infra] Task 2.4: Wire ak audit agents into CLI + audits:check

**Status:** todo

**Depends:** Task 2.3

Register the new audit in the `ak audit` CLI dispatcher and add to agent-kit's own `audits:check` script so CI runs it.

**Files:**
- Modify: `src/cli/commands/audit.ts` (add `agents` subcommand)
- Modify: `src/mcp/tools/audit.ts` (expose via MCP)
- Modify: `package.json#scripts.audits:check` (add `pnpm exec ak audit agents`)

**Steps (TDD):**
1. Add `agents` to the audit subcommand list with help text
2. Wire to `runAgentsAudit` from Task 2.3
3. Add to MCP tool list so subagents can call it
4. Add to `audits:check` script in agent-kit's package.json
5. Run: `pnpm audits:check` — passes locally
6. Run: existing audit tests — no regressions

**Acceptance:**
- [ ] `pnpm exec ak audit agents` runs and exits 0 in agent-kit's repo
- [ ] MCP `audit` tool lists `agents` as available subaudit
- [ ] CI script (`audits:check`) includes the new audit
- [ ] No regressions in existing audit suite

### Phase 3: Skill-scoped hooks (capability addition) [Complexity: S]

Goal: support skills that declare scope-limited hooks for skill-specific behavior. **Does NOT migrate** existing global hooks (those stay centralized — see R1).

#### [infra] Task 3.1: scaffold-agent-hooks reads SKILL.md frontmatter hooks (with `verify` skill as canonical example)

**Status:** todo

**Depends:** Task 1.1, Task 2.3 (`verify` skill's Stop hook calls `ak audit agents` from Phase 2.3)

`scaffold-agent-hooks` currently has hardcoded global hooks (ak-pretool-guard, etc.). Add a second pass that walks `.agent/skills/*/SKILL.md`, extracts the optional `hooks:` frontmatter field, and merges those scoped hooks into `.claude/settings.json`. Skills without `hooks:` are unchanged.

The merged hooks must be tagged so they can be removed cleanly when a skill is uninstalled.

**Canonical example shipped in this task:** add `hooks:` frontmatter to `catalog/agent/skills/verify/SKILL.md` declaring a Stop hook that runs `ak audit agents`. This demonstrates the "skill installs its own enforcement when invoked" pattern: when a session uses the `verify` skill, on stop, the agent-surface audit fires automatically.

**Files:**
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/index.ts`
- Create: `src/cli/commands/init/scaffolders/agent-hooks/skill-hooks.ts` (helper to extract+merge)
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/index.test.ts`
- Modify: `catalog/agent/skills/verify/SKILL.md` (add `hooks:` frontmatter — Stop hook running `ak audit agents`)

**Steps (TDD):**
1. Define helper `extractSkillHooks(skillsDir): SkillHook[]` that scans SKILL.md files
2. Write failing test: skill with `hooks:` frontmatter → extracted correctly
3. Write failing test: skill without `hooks:` → no entries
4. Write failing test: malformed `hooks:` → returns extraction error (fed to validator in 3.2)
5. Write failing test: skill-defined hook merged into settings.json with traceability tag
6. Implement, run tests, verify clean
7. Edit `catalog/agent/skills/verify/SKILL.md`: add `hooks: { Stop: [{ command: "ak audit agents", matcher: ... }] }` to frontmatter
8. Verify: in a test consumer repo with the verify skill, after `ak setup`, `.claude/settings.json` Stop array includes both the global `ak-stop-qa` AND the verify-skill-scoped `ak audit agents`

**Acceptance:**
- [ ] Helper extracts hooks from SKILL.md frontmatter
- [ ] Merged hooks tagged with skill name (e.g. `# from-skill: verify`) for clean removal
- [ ] `verify` skill SKILL.md updated with Stop hook running `ak audit agents`
- [ ] Test verifies both global + skill-scoped Stop hooks coexist in settings.json
- [ ] No regression in existing global-hook merging

#### [infra] Task 3.2: Schema validator for SKILL.md hooks frontmatter

**Status:** todo

**Depends:** Task 3.1

Strict validation of skill-defined hooks at scaffold time. Rejects malformed entries early with clear errors instead of silent settings.json corruption.

Validation rules:
- `hooks` is an object keyed by event name (`PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, `UserPromptSubmit`)
- Each value is an array of `{matcher?: string, command: string, timeout?: number}`
- `command` is required and non-empty
- For events that REQUIRE a matcher (`PreToolUse`, `PostToolUse`), missing matcher rejected with explanation
- Reject hooks that try to register global names (`ak-pretool-guard`, etc.) — those belong in centralized config, not per-skill

**Files:**
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/skill-hooks.ts` (add `validateSkillHooks`)
- Modify: corresponding test file

**Steps (TDD):**
1. Define Zod schema `SkillHooksSchema`
2. Write failing tests for each rejection rule
3. Write failing test: valid hooks → no error
4. Implement validator; run tests until clean
5. Wire validator into Task 3.1's extraction so invalid skills surface error during `ak setup`

**Acceptance:**
- [ ] Zod schema covers all 5 events
- [ ] Required-matcher events rejected without matcher
- [ ] Reserved global names rejected with clear error
- [ ] All validation tests pass
- [ ] `ak setup` fails fast on invalid SKILL.md hooks (not silent)

### Phase 4: Subagent catalog [Complexity: M]

Goal: ship canonical subagent definitions in the catalog and distribute them to consumers via `ak setup`. The 2026 frontier of agentic workflows.

#### [catalog] Task 4.1: Add 4 canonical subagents to catalog

**Status:** todo

**Depends:** None

Four canonical subagents covering common workflows. Each is a markdown file with Claude Code subagent frontmatter (`name`, `description`, `tools`, `model`, optional `permissionMode`, optional `hooks`).

Subagents:
- `code-reviewer` — review recent diff against repo conventions (CLAUDE.md, AGENTS.md, `.agent/rules/`); tools: Read, Grep, Glob, Bash; model: sonnet
- `security-auditor` — scan for secrets, hardcoded credentials, OWASP top 10, supply-chain risk in lockfile; tools: Read, Grep, Bash; model: sonnet
- `doc-writer` — generate/update READMEs, JSDoc, ADRs, frontmatter; tools: Read, Edit, Write; model: sonnet
- `explorer` — read-only codebase exploration with bounded budget (no edits, no shell); tools: Read, Grep, Glob; model: haiku (cheap, fast for read-only work)

**Files:**
- Create: `catalog/agents/code-reviewer.md`
- Create: `catalog/agents/security-auditor.md`
- Create: `catalog/agents/doc-writer.md`
- Create: `catalog/agents/explorer.md`
- Create: `catalog/agents/README.md`

**Steps (TDD):**
1. Write each subagent with full frontmatter + system prompt body (~50-150 lines each)
2. `explorer` MUST exclude Bash, Edit, Write from `tools` (validates the read-only contract)
3. Run: `pnpm exec ak audit docs-frontmatter` — verify all four pass frontmatter validation
4. Manually invoke each in Claude Code (`Task agent: <name>`) — verify they work as expected
5. Document each in `catalog/agents/README.md` (purpose, when to use, tools, example invocation)

**Acceptance:**
- [ ] 4 subagent files with correct frontmatter
- [ ] `explorer` is verified read-only (no Bash/Edit/Write in tools)
- [ ] `catalog/agents/README.md` documents purpose/usage for all 4
- [ ] All 4 manually verified in Claude Code

#### [infra] Task 4.2: scaffolders/subagents distributes catalog/agents to .claude/agents

**Status:** todo

**Depends:** Task 4.1

New scaffolder copies (or symlinks, depending on mode from Phase 2) `catalog/agents/*.md` to `.claude/agents/` in the consumer repo. Mirrors the `scaffoldClaudeRules` pattern.

**Files:**
- Create: `src/cli/commands/init/scaffolders/subagents/index.ts`
- Create: `src/cli/commands/init/scaffolders/subagents/index.test.ts`
- Modify: `src/cli/commands/init/index.ts` (wire into setup flow)

**Steps (TDD):**
1. Write failing test: empty `.claude/agents/` → after scaffold → has 3 entries (code-reviewer, security-auditor, doc-writer)
2. Write failing test: re-run → identical, idempotent
3. Write failing test: consumer adds custom agent at `.claude/agents/custom.md` → preserved on re-run
4. Write failing test: dry-run mode → no writes
5. Write failing test: agent-kit self-hosting → uses `catalog/agents/` directly
6. Implement (mirroring `scaffoldClaudeRules`); run tests until clean
7. Wire into `init/index.ts`; include results in summary
8. Update `audit/agents.ts` from Task 2.3 to also check `.claude/agents/` (extend the audit)

**Acceptance:**
- [ ] All 5 tests pass
- [ ] `ak setup` distributes subagents to `.claude/agents/`
- [ ] `ak audit agents` extended to validate `.claude/agents/`
- [ ] Consumer-owned subagents preserved across re-runs

### Phase 5: MCP-shaped redirect format [Complexity: S]

Goal: deny reasons for forbidden commands lead with the agent-kit MCP-tool template (`mcp__agent-kit__ak_*`) so they work universally — in `ozby/ingest-lens` (justfile + pnpm scripts), in `webpresso/monorepo` (justfile + pnpm-workspace), in `webpresso/runtime` (pnpm-only, no justfile). Mirrors context-mode's `mcpRedirect` readiness-guard pattern so the redirect only fires when the MCP server is actually responding.

**Verified facts (file:line):**

| # | Claim | Source |
|---|-------|--------|
| V1 | MCP server identifies as `agent-kit` (the matcher prefix is `mcp__agent-kit__`) | `src/mcp/server.ts:30` — `const SERVER_NAME = 'agent-kit'`; passed to `new Server({name: SERVER_NAME, ...})` at `:83`. Also `.claude-plugin/plugin.json:mcpServers.agent-kit` |
| V2 | Existing MCP tool names | `src/mcp/tools/test.ts:34` → `ak_test`; `src/mcp/tools/lint.ts:102` → `ak_lint`; `src/mcp/tools/typecheck.ts:83` → `ak_typecheck`; `src/mcp/tools/qa.ts:75` → `ak_qa`; `src/mcp/tools/audit.ts:140` → `ak_audit`; `src/mcp/tools/blueprint.ts:63` → `ak_blueprint` |
| V3 | Current `forbidden-commands.ts` hints are `just`-prefixed | `src/hooks/pretool-guard/validators/forbidden-commands.ts:46-53` — `DB_HINT`, `LINT_BASE`, `TEST_HINT`, `MUTATION_HINT`, `TYPECHECK_HINT`, `ENV_HINT` constants all start with `'just '` |
| V4 | `isMcpReady()` already exists and is wired into the runner | `src/hooks/shared/mcp-sentinel.ts` exports `isMcpReady` (camelCase, not `isMCPReady`); used at `src/hooks/pretool-guard/runner.ts:104` and `src/hooks/doctor.ts:18,246` |
| V5 | context-mode's `mcpRedirect` pattern returns null (passthrough) when MCP not ready | `~/repos/ozby/context-mode/hooks/core/routing.mjs` (function `mcpRedirect`) — references issue #230 |
| V6 | `AgentkitConfig` schema has no MCP field today | `src/cli/commands/init/config.ts:13-18` — interface has `version`, `installed.tier3Skills`, `durablePlanningRoot`, `lastInit` only |
| V7 | ingest-lens has justfile (so `just`-redirects work there) | `/Users/ozby/repos/ozby/ingest-lens/justfile` exists |
| V8 | runtime has no justfile (so `just`-redirects fail there silently) | No `justfile` in `/Users/ozby/repos/webpresso/runtime/` (sibling repo, pnpm-only) |
| V9 | The `mcp__<server>__<tool>` matcher pattern is the official Claude Code convention | `https://docs.anthropic.com/en/docs/claude-code/hooks` § "Match MCP tools" — examples include `mcp__memory__create_entities` |

**Why this phase exists:** V3 + V8 prove the bug. The current redirect tells the model to run `just test --package <name>` — which silently fails in runtime (no justfile). The agent-kit MCP server with `ak_test` works in **all** consumers because it's registered globally via `.claude-plugin/plugin.json` (V1 + plugin marketplace install). The MCP-tool redirect is universal; the `just`-prefixed redirect is repo-specific.

#### [infra] Task 5.1: New `mcp-redirect.ts` helper + refactor forbidden-commands hints

**Status:** todo

**Depends:** Task 1.1 (no functional dep, but ordering keeps PR #1 cleanly scoped)

New helper produces deny reasons that lead with the `mcp__agent-kit__ak_*` template, fall back to the existing `just`-prefixed hint when MCP is not ready (mirrors V5 pattern). `forbidden-commands.ts:46-53` switches from static `*_HINT` constants to calling the helper.

**Files:**
- Create: `src/hooks/pretool-guard/validators/mcp-redirect.ts`
- Create: `src/hooks/pretool-guard/validators/mcp-redirect.test.ts`
- Modify: `src/hooks/pretool-guard/validators/forbidden-commands.ts:46-67` (replace constants with helper calls inside `BLOCKED_TOOLS` definitions)
- Modify: `src/hooks/pretool-guard/validators/forbidden-commands.test.ts` (update expected message format)

**API:**
```ts
import { isMcpReady } from '#hooks/shared/mcp-sentinel'

export interface MCPRedirectContext {
  category: 'test' | 'lint' | 'typecheck' | 'unknown'
  command: string
  /** Override for tests / forks. Defaults to isMcpReady() at call time. */
  mcpReady?: () => boolean
  /** Optional fallback hint string used when MCP is not ready. */
  fallbackHint?: string
}

export function buildRedirectMessage(ctx: MCPRedirectContext): string
```

**Per-category MCP tool mapping** (verified V2):

| Category | MCP tool name | Server matcher | Source |
|---|---|---|---|
| `test` | `ak_test` | `mcp__agent-kit__ak_test` | `src/mcp/tools/test.ts:34` |
| `lint` | `ak_lint` | `mcp__agent-kit__ak_lint` | `src/mcp/tools/lint.ts:102` |
| `typecheck` | `ak_typecheck` | `mcp__agent-kit__ak_typecheck` | `src/mcp/tools/typecheck.ts:83` |
| `unknown` (qa/audit/mutation) | first match: `ak_qa`, `ak_audit`, or fall back to `ak_test --mutation` | `mcp__agent-kit__ak_qa`, `mcp__agent-kit__ak_audit` | `src/mcp/tools/qa.ts:75`, `src/mcp/tools/audit.ts:140` |

**Output format (caveman, parseable):**
```
"<command>" denied — use agent-kit MCP tool:
  mcp__agent-kit__ak_test({ "package": "<infer-from-cwd>" })
Returns {passed, summary}. Auto-saves logs.
Fallback (MCP not ready): just test --package <name>
```

When `mcpReady() === false`, output the existing `just`-prefixed hint as the primary suggestion (no MCP block) so consumers without an active MCP server fall back gracefully — matches V5's null-passthrough rule.

**Steps (TDD):**
1. Write failing tests for `buildRedirectMessage` covering all 4 categories × {mcp ready, mcp not ready} = 8 cases
2. Test the exact format string (golden-string test)
3. Test that `unknown` category falls through to a category-suggestion in the message body (not a hard error)
4. Implement `buildRedirectMessage`
5. Replace `*_HINT` constants in `forbidden-commands.ts:46-53` — call `buildRedirectMessage` per `BLOCKED_TOOLS` entry, parameterized by `category`
6. Update `forbidden-commands.test.ts` snapshots / assertions to match new format
7. Run: `bun run test src/hooks/pretool-guard/validators/` — all tests pass
8. Run: `bun run typecheck` — clean

**Acceptance:**
- [ ] 8 helper tests pass (4 categories × 2 ready states)
- [ ] `forbidden-commands` integration tests pass with new format
- [ ] Helper uses `isMcpReady` from `src/hooks/shared/mcp-sentinel.ts` (V4); injectable for tests
- [ ] Format includes literal `mcp__agent-kit__ak_*` tool name (not `${prefix}` placeholder) when MCP is ready
- [ ] Format falls back to `just`-prefixed hint when MCP is not ready (V5 pattern)
- [ ] No regression in existing forbidden-commands DENY behavior (still denies; only the reason changes)

#### [infra] Task 5.2: Extend AgentkitConfig with optional `mcp` field

**Status:** todo

**Depends:** None (independent of 5.1; can land first or together)

`AgentkitConfig` (V6) currently has no MCP fields. Extend it so a fork or rebrand can override the server name and tool prefix without source edits. Defaults match the verified production values (V1, V2).

**Files:**
- Modify: `src/cli/commands/init/config.ts:13-18` (interface), and `defaultConfig()`/`readConfig()`/`mergeConfig()` (whole file is 71 lines — small surface)
- Modify: `src/cli/commands/init/config.test.ts` (if exists; otherwise create)

**Schema delta:**
```ts
export interface AgentkitConfig {
  version: string
  installed: { tier3Skills: string[] }
  durablePlanningRoot: string
  lastInit?: string
  mcp?: {
    /** MCP server name as seen in matcher prefix `mcp__<serverName>__<tool>`. Defaults to `'agent-kit'` (matches src/mcp/server.ts:30). */
    serverName?: string
    /** Tool name prefix. Defaults to `'ak_'` (matches src/mcp/tools/*.ts naming). */
    toolPrefix?: string
  }
}
```

**Steps (TDD):**
1. Add `mcp?` field + Zod-or-narrowing parse logic in `readConfig()`
2. Update `defaultConfig()` to NOT include `mcp` (undefined = use built-in defaults)
3. Update `mergeConfig()` to deep-merge `mcp` field if either side provides it
4. Failing test: empty config → `readConfig` returns config without `mcp`
5. Failing test: config with `{mcp: {serverName: "fork-kit"}}` → preserved through round-trip
6. Failing test: malformed `mcp` field (e.g. `serverName: 123`) → silently dropped (don't throw, mirrors existing pattern in `readConfig` for `tier3Skills`)
7. Implement, run tests until clean
8. Helper from Task 5.1 reads `config.mcp` (passed as a parameter or via a `loadConfig` helper) to construct tool names

**Acceptance:**
- [ ] Schema delta lands in `AgentkitConfig`
- [ ] `defaultConfig()`/`readConfig()`/`mergeConfig()` updated
- [ ] All existing config tests still pass (no regression)
- [ ] New tests cover present, absent, and malformed `mcp` field
- [ ] `buildRedirectMessage` from Task 5.1 reads serverName/toolPrefix from config (passed in via `MCPRedirectContext`)

#### [docs] Task 5.3: End-to-end smoke in 3 consumer profiles

**Status:** todo

**Depends:** Task 5.1, Task 5.2

Three consumer profiles cover the realistic distribution of agent-kit consumers. The redirect must work in all of them.

| Consumer | Profile | Has justfile? | Path |
|---|---|---|---|
| `ozby/ingest-lens` | App repo, justfile + pnpm scripts | ✓ (V7) | `~/repos/ozby/ingest-lens/justfile` |
| `webpresso/monorepo` | Internal monorepo, justfile + pnpm-workspace + Doppler | ✓ | `~/repos/webpresso/monorepo/justfile` |
| `webpresso/runtime` | Public sibling, pnpm-only | ✗ (V8) | `~/repos/webpresso/runtime/` (no justfile) |

**Smoke sequence per consumer:**
1. Ensure agent-kit plugin is installed (Claude Code marketplace) — gives `mcp__agent-kit__*` tools system-wide
2. Confirm `.claude/settings.json` has `ak-pretool-guard` wired (V4: it must be — it's installed by `scaffold-agent-hooks`)
3. In a Claude Code session inside the consumer repo, run `pnpm test`
4. Expected: hook denies; deny reason starts with `"pnpm test" denied — use agent-kit MCP tool: mcp__agent-kit__ak_test(...)`
5. For `runtime` (no justfile): the fallback line should still mention `just test...`-style fallback (acceptable; the model uses the primary MCP suggestion)
6. Capture each consumer's deny-reason output verbatim in a fixture file

**Files:**
- Create: `src/hooks/pretool-guard/validators/__fixtures__/redirect-format/ingest-lens.txt` (golden output)
- Create: `src/hooks/pretool-guard/validators/__fixtures__/redirect-format/monorepo.txt`
- Create: `src/hooks/pretool-guard/validators/__fixtures__/redirect-format/runtime.txt`
- Modify: `VISION.md` — note in the "What 'fully wired' means" table that redirect format is MCP-shaped, not `just`-shaped, and works regardless of task runner

**Steps (TDD):**
1. Run the smoke sequence in each consumer; record verbatim output to fixture files
2. Add a unit test that loads each fixture and asserts the new format invariants (starts with `"<cmd>" denied — use agent-kit MCP tool:`, contains `mcp__agent-kit__ak_*` literal)
3. Update VISION.md with the redirect-format guarantee
4. Run: `bun run test src/hooks/pretool-guard/` — all pass
5. Run: `pnpm exec ak audit docs-frontmatter` — VISION.md edit doesn't break frontmatter

**Acceptance:**
- [ ] 3 fixture files committed, verbatim deny reasons
- [ ] Unit test loads fixtures + validates format
- [ ] VISION.md updated with the universal-redirect guarantee
- [ ] Manual verification: in `runtime`, the model successfully follows the MCP redirect (uses `ak_test` MCP tool) instead of failing on `just test`

## Verification

After implementation completes, run the full audit chain to verify the system actually delivers on the wedge:

```bash
# In agent-kit
pnpm audits:check    # includes new ak audit agents
pnpm test            # all scaffolder + audit tests
pnpm typecheck       # zero errors

# In a sibling repo (e.g. runtime) after `pnpm install && pnpm setup:agent`
ak audit agents      # passes — full surface wired
ls .claude/rules/    # symlinks resolve to node_modules/@webpresso/agent-kit/catalog/agent/rules/
ls .claude/agents/   # has code-reviewer, security-auditor, doc-writer, explorer
cat .claude/settings.json | jq '.worktree.symlinkDirectories'  # ['.claude']

# In a fresh worktree of the same sibling repo
# (Should inherit everything via symlinkDirectories — no manual setup)

# Migration path for an existing repo whose audit fails on first run:
ak setup --overwrite   # re-syncs catalog state, preserves customizations as .new sidecars
ak audit agents        # now passes
```

## Migration Path (for existing consumers)

Existing consumers that have hand-edited agent surfaces will get audit failures when PR #1 lands. The fix path:

1. Run `ak audit agents` — see all drift findings with remediation hints
2. For each catalog-owned file (rules, hooks): run `ak setup --overwrite` to re-sync
3. For each genuine consumer customization: add to `.agent-kitrc.json#rules.overrides` (allowlist)
4. Re-run `ak audit agents` — should pass
5. If a `.new` sidecar was written (pre-existing custom AGENTS.md content), manually merge

This is the only path; no `ak migrate` subcommand. Failure messages in Task 2.3 must include the exact override path or `ak setup --overwrite` command per failure.

## Cross-Plan References

- **Upstream (completed):**
  - [`coordinated-pre-tool-hook-unified-hook-process-for-context-mode-agent-kit`](../../completed/coordinated-pre-tool-hook-unified-hook-process-for-context-mode-agent-kit/) — hook-process unification + context-mode interaction model. Phase 5 directly references its F4 finding (context-mode hooks NOT importable as a library) and F5 (MCP readiness sentinel pattern shared with agent-kit's `mcp-sentinel.ts`).
  - [`pretooluse-dev-command-routing-intercept-just-pnpm-commands-and-redirect-to-ak-mcp-tools`](../../completed/pretooluse-dev-command-routing-intercept-just-pnpm-commands-and-redirect-to-ak-mcp-tools/) — built the `dev-routing.ts` validator. Phase 5 tightens its sibling `forbidden-commands.ts` redirect format to the same MCP-shape standard.
  - [`sessionstart-routing-block-inject-ak-tool-routing-rules-at-session-start`](../../completed/sessionstart-routing-block-inject-ak-tool-routing-rules-at-session-start/) — SessionStart-time `<ak_routing>` block. Phase 5's PreToolUse-time deny reasons must be consistent with the SessionStart routing rules.
  - [`harden-plugin-hooks-suppress-stderr-and-mcp-readiness-sentinel`](../../completed/harden-plugin-hooks-suppress-stderr-and-mcp-readiness-sentinel/) — installed the `mcp-sentinel.ts` that Phase 5.1 reads (V4).
  - [`ak-hooks-doctor`](../../completed/ak-hooks-doctor-post-install-verification-skill-for-plugin-hook-health/) — `ak audit agents` extends what `ak hooks doctor` started.
- **Spinoff (NOT created yet):** `community-catalog-trust-model` — required before Phase 4-equivalent (third-party catalogs from GitHub) can ship; tracks F2.

## Out of scope

- Community catalog distribution (`--with github:user/repo`) — needs trust model first
- `ak migrate` for catalog format upgrades — premature
- cc-switch integration — different audience layer
- Migrating existing global hooks into per-skill SKILL.md (see R1)
