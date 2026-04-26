---
type: blueprint
status: in-progress
complexity: L
created: '2026-04-26'
last_updated: '2026-04-26'
progress: '85% (11/13 tasks done, 0 blocked, updated 2026-04-26)'
depends_on: []
tags:
  - agent-kit
  - claude-code
  - plugin
  - marketplace
  - mcp
  - hooks
  - dev-ex
parent_roadmap: >-
  cross-repo: webpresso/monorepo →
  webpresso/blueprints/draft/webpresso-public-extraction-roadmap
---

# Agent-Kit Claude Code Plugin & Marketplace

**Goal:** Promote `webpresso/agent-kit` from a skills-only Claude Code plugin into a full plugin (skills + commands + hooks + MCP server) distributed via a `marketplace.json` in the same repo, so consumers install everything with `/plugin marketplace add webpresso/agent-kit && /plugin install agent-kit@webpresso` instead of hand-wiring `pnpm add @webpresso/agent-kit` + `.claude/settings.json`.

## Problem Statement

Today `webpresso/agent-kit` is half-finished as a Claude Code plugin:

- `.claude-plugin/plugin.json` only declares `skills` (15 SKILL.md files). No `hooks`, no `commands`, no `mcpServers`, no `marketplace.json`.
- 5 hook bins (`ak-pretool-guard`, `ak-post-tool`, `ak-stop-qa`, `ak-guard-switch`, `ak-test-quality-check`) ship in `package.json#bin` but are not auto-wired — every consumer has to manually edit `.claude/settings.json`.
- Reference consumer `ozby/ingest-lens` confirms the gap: its `.claude/settings.json` has only one `gstack` Skill-matcher hook and **none** of agent-kit's hooks. Install path is `pnpm add github:webpresso/agent-kit#<sha>` + manual config.
- Workflow ergonomics live in `monorepo/justfile` (e.g. `just test --package x y`, `just qa`). The agent has to hand-build CLI strings — no schema, no structured output, lossy parsing.
- "How do I run tests / QA / audits efficiently?" requires per-repo recipe discovery. Not portable to public consumers without a justfile.

## Fact-Checked Findings

Verified against [Claude Code plugin docs](https://docs.claude.com/en/docs/claude-code/plugins-reference), [hooks docs](https://docs.claude.com/en/docs/claude-code/hooks), [marketplaces docs](https://docs.claude.com/en/docs/claude-code/plugin-marketplaces), the [npm registry for `@modelcontextprotocol/sdk`](https://registry.npmjs.org/@modelcontextprotocol/sdk/latest) (latest 1.29.0, ESM, Node ≥18), and live repos (`mksglu/context-mode`, `wshobson/agents`).

| ID | Severity | Claim | Reality | Fix |
|----|----------|-------|---------|-----|
| F1 | **CRITICAL** | Plugin hooks reference `${CLAUDE_PLUGIN_ROOT}/dist/esm/hooks/...` and "just work" after marketplace install. | `.gitignore` includes `dist/`, and `git ls-files dist` returns 0. Marketplace install is a git clone — `dist/` won't exist on the consumer's machine. Hooks would 404. | Pin marketplace `source.ref` to release tags. Add a `release` script that builds, force-adds `dist/`, commits to a release branch, and tags. Document in CONTRIBUTING. (See Task 5.1.) |
| F2 | HIGH | We can build the MCP server with what's already installed. | Current deps: `@manypkg/find-root, cac, glob, gray-matter, js-yaml, zod`. No MCP SDK. | Add `@modelcontextprotocol/sdk@^1.29.0` (verified latest, MIT, ESM, Node ≥18; `./server` subpath provides stdio transport) and `zod-to-json-schema@^3` for tool schema generation. (Task 1.4.) |
| F3 | LOW | `parent_roadmap: 'webpresso/blueprints/draft/...'` | Existing convention in `agent-kit-parity-pass` and `promote-parent-roadmaps` is `'cross-repo: webpresso/monorepo → webpresso/blueprints/draft/...'`. | Frontmatter updated to match (already applied above). |
| F4 | HIGH | Tasks 2.1 and 3.1 can run in parallel safely. | Both modify `package.json#bin` (`ak-mcp` and `ak-instructions-loaded`). Same-file conflict in the same wave → CP > 0. | Move ALL `bin` declarations into Task 1.1 (Wave 0) using shim scripts that throw "not implemented" until later tasks fill them. Subsequent tasks only modify their own files. CP returns to 0. |
| F5 | HIGH | Wave 1 has only one task → 5 agents idle. | Original draft: Wave 1 = `{2.1}`. RW1 = 1, far below the 6-agent target. | Restructure: Wave 1 = `{1.4 (MCP scaffold), 3.1 (SessionStart hook)}`; Wave 2 = `{2.2, 2.3, 2.5, 2.6}` (4 independent tools, each its own file). |
| F6 | MEDIUM | "MCP cold-start latency" is a per-tool-call concern. | Plugin-declared MCP servers are spawned at session start as long-running stdio processes. Cold start is one-time per session, not per call. | Removed from Risks. |
| F7 | MEDIUM | `just test --package x` and `pnpm -F x test` are equivalent. | They differ in flags (coverage, watch, output format) and dependency-graph behavior. | Add `agent-kit.config.ts#testBackend?: 'just' \| 'pnpm' \| 'auto'` (default `auto` → justfile present). Add a fixture-based integration test asserting equivalent JSON output across backends. (Task 2.1 acceptance.) |
| F8 | MEDIUM | Plugin install obviates the npm dep on `@webpresso/agent-kit` in ingest-lens. | ingest-lens imports `defineAgentKitConfig` from `@webpresso/agent-kit/e2e` (verified in `agent-kit.config.ts`). Library dep must remain. | Task 4.1 only removes `.claude/settings.json` hook entries, not the npm dep. |
| F9 | LOW | `agent-kit-parity-pass` is unrelated. | That blueprint plans `.agent/mcp.json → .cursor/mcp.json` fan-out for non-Claude IDEs. Mine ships `mcpServers` inside `plugin.json` for Claude Code. | Both coexist (different audiences). Cross-Plan section notes coordination: plugin.json is authoritative for Claude Code; .mcp.json fan-out is authoritative for Cursor/Aider/Cline. |
| F10 | LOW | `commands/` at root will conflict with the symlinker's `.agent/commands/` fan-out. | Different paths, different consumers. Symlinker writes to `.cursor/commands/`, `.gemini/commands/`. Plugin reads from `commands/` at root. | No conflict. Add a brief note in symlinker docs that `commands/` (top-level) is plugin-managed. |
| F13 | MEDIUM | `InstructionsLoaded` is right for routing-rule injection. | `InstructionsLoaded` is observability-only — "does not support blocking or decision control". It cannot inject context into Claude's session. | Use `SessionStart` with matcher `startup\|resume` instead. JSON-output context injection is supported there. Updated Architecture + Tech Choices. |
| F14 | LOW | `claude plugin validate` is a documented CLI subcommand. | Verified in marketplaces docs (`claude plugin validate .`). | No change. |

## Evidence Base

- `webpresso/agent-kit/.claude-plugin/plugin.json` — current minimal manifest (3 fields).
- `webpresso/agent-kit/.gitignore` (Build outputs section) — `dist/` is ignored. `git ls-files dist | wc -l` → 0. **(Source for F1.)**
- `webpresso/agent-kit/package.json` — `bin`, `files`, `tshy.exports` declared. Deps: `cac` (CLI), `zod` 4.x, `js-yaml`, `gray-matter`. **(Source for F2.)**
- `webpresso/agent-kit/src/cli/cli.ts` and `src/cli/commands/{test,e2e,dev,cursor-windsurf-sync}.ts` — CLI surface to extend with `ak mcp`.
- `webpresso/agent-kit/src/hooks/{pretool-guard,post-tool,stop,guard-switch}/` — existing hook bins.
- `webpresso/agent-kit/skills/` — 15 SKILL.md files.
- `webpresso/agent-kit/blueprints/planned/agent-kit-parity-pass/_overview.md` — parent_roadmap convention reference. **(Source for F3, F9.)**
- `ozby/ingest-lens/.claude/settings.json` — gstack-only hook. **(Source for F8.)**
- `ozby/ingest-lens/agent-kit.config.ts` — `defineAgentKitConfig` import. **(Source for F8.)**
- [`mksglu/context-mode/.claude-plugin/plugin.json`](https://github.com/mksglu/context-mode/blob/main/.claude-plugin/plugin.json) — minimal `mcpServers + skills` reference using `${CLAUDE_PLUGIN_ROOT}/start.mjs`.
- [`wshobson/agents/.claude-plugin/marketplace.json`](https://github.com/wshobson/agents) — 79-plugin marketplace reference.
- [`@modelcontextprotocol/sdk@1.29.0`](https://registry.npmjs.org/@modelcontextprotocol/sdk/latest) — verified ESM `./server` subpath. **(Source for F2.)**

## Architecture Overview

```text
webpresso/agent-kit/                    (one repo, two manifest files)
├── .claude-plugin/
│   ├── marketplace.json                NEW — exposes one plugin to /plugin install (source: "./")
│   └── plugin.json                     UPGRADED — declares hooks, commands, mcpServers inline
├── skills/                             EXISTING — 15 SKILL.md (no change)
├── commands/                           NEW — slash commands (/ak:test, /ak:qa, /ak:audit, /ak:blueprint)
├── src/
│   ├── hooks/                          EXISTING — 5 hook bins
│   │   └── sessionstart/               NEW — routing-rule injector (matcher: startup|resume) [F13]
│   └── mcp/                            NEW — `ak mcp` MCP server, stdio transport
│       ├── server.ts                   stdio entry — uses @modelcontextprotocol/sdk@^1.29.0/server
│       ├── auto-discover.ts            scans tools/*.ts → registers each tool's exported descriptor [F4]
│       └── tools/
│           ├── test.ts                 ak_test({packages?, files?, suite?, backend?})
│           ├── lint.ts                 ak_lint({files?, fix?})
│           ├── typecheck.ts            ak_typecheck({packages?})
│           ├── qa.ts                   ak_qa() — composite parallel
│           ├── audit.ts                ak_audit({kind})
│           └── blueprint.ts            ak_blueprint({action, ...})
├── package.json#bin                    EXISTING + 2 NEW (ak-mcp, ak-sessionstart-routing) [F4]
└── scripts/release.mjs                 NEW — pnpm build → git add -f dist → tag — see F1 mitigation

Consumer install flow (after release):
  /plugin marketplace add webpresso/agent-kit
  /plugin install agent-kit@webpresso
  → Claude Code clones repo at marketplace's pinned tag (which has dist/ committed)
  → reads plugin.json, registers hooks + skills + commands + MCP server
  → no settings.json edits, no pnpm install, no SHA pinning by consumer
```

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Marketplace location | Same repo as the plugin (`webpresso/agent-kit/.claude-plugin/`) | Matches context-mode and the docs' "Host on GitHub" recommendation. No new repo. |
| Granularity | One plugin (`agent-kit`) initially; sub-plugins later | Skill count is 15. wshobson's 79-plugin pattern is for catalog-style products. Revisit at >30 skills. |
| Hook declaration | Inline in `plugin.json` | Schema is small (~4 entries). Avoids a separate `hooks.json`. |
| MCP server packaging | Bundled, started via `${CLAUDE_PLUGIN_ROOT}/dist/esm/cli/cli.js mcp` | Reuses the `ak` CLI; no separate `start.mjs`. |
| **Distribution of `dist/`** | **Commit `dist/` at release tags only; pin marketplace `source.ref` to those tags** | F1 mitigation. `dist/` stays gitignored on `main`; the release script force-adds and tags. Mirrors how many plugin repos handle this. |
| `just`-vs-`pnpm` backend | Auto-detect (justfile present → just; else pnpm -F); `agent-kit.config.ts#testBackend` overrides | F7. Keeps monorepo working; portable to public consumers. |
| Routing injection event | `SessionStart` matcher `startup\|resume` (NOT `InstructionsLoaded`) | F13. InstructionsLoaded is observability-only and cannot inject context. |
| Tool registration | Auto-discovery from `src/mcp/tools/*.ts` exports | F4. Avoids `server.ts` becoming a same-file conflict point in parallel waves. |
| Backward compat | Drop `agent-hooks` scaffolder once plugin path is verified in ingest-lens | Manual wiring becomes dead code. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
|------|-------|--------------|----------------|------------------|
| **Wave 0** | 1.1, 1.2, 1.3 | None | 3 agents | S |
| **Wave 1** | 1.4, 3.1 | Wave 0 (1.1 only) | 2 agents | M |
| **Wave 2** | 2.2, 2.3, 2.5, 2.6 | Wave 1 (1.4) | 4 agents | S–M |
| **Wave 3** | 2.4, 4.1 | Wave 2 (2.2 + 2.3) for 2.4; Wave 1 (1.4 + 3.1) + release for 4.1 | 2 agents | M |
| **Wave 4** | 4.2 | Wave 3 (4.1) | 1 agent | XS |
| **Critical path** | 1.1 → 1.4 → 2.2 → 2.4 → 4.1 → 4.2 | — | 5 waves | L |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
|--------|-------------------|--------|--------|
| RW0 | Ready tasks in Wave 0 | ≥ planned agents / 2 (≥3 for 6 agents) | **3** ✓ |
| RW1 | Ready tasks in Wave 1 | ≥3 | **2** — narrow, but unavoidable: 1.4 is foundational and 3.1 is the only other Wave-0-dependent task. Tooling tasks must wait for the MCP scaffold. |
| RW2 | Ready tasks in Wave 2 | ≥3 | **4** ✓ |
| CPR | total_tasks / critical_path_length = 12 / 6 | ≥2.5 | **2.0** — borderline. Acceptable: shortening the critical path further would split single-concern tasks (1.4) into artificial subtasks. |
| DD | dependency_edges / total_tasks ≈ 12 / 12 | ≤2.0 | **~1.0** ✓ |
| CP | same-file overlaps per wave | 0 | **0** ✓ (F4 mitigated by centralizing `package.json#bin` writes in 1.1 and using auto-discovery for tools) |

**Parallelization score: B** — RW1 = 2 (foundation tasks unavoidable), CPR 2.0. Refinement delta vs. original draft: moved 3.1 to Wave 1 (from Wave 4); split 2.1 into 1.4 (scaffold) + 2.x (tools); moved 4.1 to Wave 3 (was Wave 5, now only depends on 1.4 + 3.1 + release).

### Phase 1: Plugin manifest + marketplace + commands (Wave 0)

#### [infra] Task 1.1: Inline `hooks` + `mcpServers` in `plugin.json`; declare all new bins

**Status:** done

**Depends:** None

Promote `.claude-plugin/plugin.json` to declare `hooks`, `commands`, and `mcpServers` inline. Wire the 5 existing hook bins. Use `${CLAUDE_PLUGIN_ROOT}` for every path. Pre-declare the 2 new bins (`ak-mcp`, `ak-sessionstart-routing`) in `package.json#bin` pointing to shim files that `process.exit(2)` with a "not implemented" error — later tasks (1.4, 3.1) replace the shim contents. This avoids same-file contention in Wave 1 (F4).

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `package.json` (add 2 bin entries to `bin`, add `dist/esm/mcp/cli.js` and `dist/esm/hooks/sessionstart/index.js` to `chmod-bins` script, ensure `commands` is in `files` array, **extend `lint:pkg` script to also run `claude plugin validate .` if the `claude` CLI is on PATH** — this consolidates all Wave-0 `package.json` writes here so 1.2 has no `package.json` overlap)
- Create: `src/mcp/cli.ts` (shim — exits 2 with "ak mcp not yet implemented; this is a release-engineering placeholder")
- Create: `src/hooks/sessionstart/index.ts` (shim — exits 0 silently)
- Create: `__fixtures__/plugin-manifest/expected.json` (golden snapshot)
- Create: `src/build/validate-plugin-manifest.test.ts`

**Steps (TDD):**
1. Write `validate-plugin-manifest.test.ts` asserting the manifest has `hooks.PreToolUse`, `hooks.PostToolUse`, `hooks.Stop`, `hooks.SessionStart` with matcher `startup|resume`, `mcpServers["agent-kit"]` with command `node` and args including `${CLAUDE_PLUGIN_ROOT}`, `commands === "./commands"`, and that no script path contains a literal `./dist` (must use `${CLAUDE_PLUGIN_ROOT}`).
2. Run: `pnpm vitest run src/build/validate-plugin-manifest.test.ts` — verify FAIL.
3. Update `plugin.json`, add bin entries to `package.json`, write shim files.
4. Run: `pnpm build && pnpm vitest run src/build/validate-plugin-manifest.test.ts` — verify PASS.
5. Run: `pnpm lint:pkg` (publint + attw) — verify no regressions.

**Acceptance:**
- [x] `plugin.json` validates against the fixture snapshot.
- [ ] `package.json#bin` contains `ak-mcp` — deferred: `src/mcp/` not yet committed, removed from bin + chmod-bins until Task 1.4 lands.
- [x] `package.json#bin` contains `ak-sessionstart-routing` pointing to compiled path.
- [x] No literal `./dist/...` paths in `plugin.json` — all use `${CLAUDE_PLUGIN_ROOT}`.
- [x] `pnpm build` succeeds; bins are chmod'd.
#### [infra] Task 1.2: Add `marketplace.json` pinned to release tags

**Status:** done

**Depends:** None

Create `.claude-plugin/marketplace.json` exposing one plugin (`agent-kit`) with `"source": "./"`. Marketplace `version` reads from `package.json#version`. Add a `claude plugin validate` step to the `lint:pkg` script.

**Files:**
- Create: `.claude-plugin/marketplace.json`
- Create: `src/build/validate-marketplace.test.ts`

(The `lint:pkg` extension was moved to Task 1.1 to consolidate `package.json` writes — see Edge Cases F4.)

**Steps (TDD):**
1. Write test asserting marketplace has `name`, `owner.name`, `metadata.version`, `plugins[0].name === "agent-kit"`, `plugins[0].source === "./"`, and that `metadata.version === package.json.version`.
2. Run test — verify FAIL.
3. Write `marketplace.json`.
4. Run test — verify PASS.

**Acceptance:**
- [x] `claude plugin validate .` passes (when `claude` CLI installed locally; CI already runs Claude Code in some workflows — gate on availability).
- [x] `metadata.version` equals `package.json#version` (asserted by test).
#### [docs] Task 1.3: Slash commands directory

**Status:** done

**Depends:** None

Create `commands/` with markdown files for `/ak:test`, `/ak:qa`, `/ak:audit`, `/ak:blueprint`. Each file is a one-line directive that delegates to the corresponding MCP tool. No instructions duplicated from skills.

**Files:**
- Create: `commands/test.md`, `commands/qa.md`, `commands/audit.md`, `commands/blueprint.md`
- Create: `src/build/validate-commands.test.ts`

**Steps (TDD):**
1. Write a test asserting each `commands/*.md` is <30 lines, has a YAML frontmatter `description` field, and references `mcp__agent-kit__ak_<tool>` in its body.
2. Run — verify FAIL.
3. Write each command file.
4. Run — verify PASS.

**Acceptance:**
- [x] 4 command files created.
- [x] Each is <30 lines.
- [x] Each references its corresponding MCP tool by namespaced name.
### Phase 2: `ak mcp` MCP server (Waves 1–3)

#### [backend] Task 1.4: MCP server scaffold + auto-discovery + `ak_test` seed tool

**Status:** done

**Depends:** Task 1.1

Replace `src/mcp/cli.ts` shim with a real stdio server using `@modelcontextprotocol/sdk@^1.29.0/server`. Implement `auto-discover.ts` that scans `src/mcp/tools/*.ts` and registers each tool from a default-export descriptor `{name, description, inputSchema, handler}`. Seed the directory with `tools/test.ts` (`ak_test`) to validate the auto-discovery pattern end-to-end. Register `ak mcp` as a `cac` subcommand on `src/cli/cli.ts`.

Backend selection for `ak_test`: detect `justfile` in cwd → `just test --package <p>...`; else `pnpm -F <p>... test`. Allow override via `agent-kit.config.ts#testBackend: 'just' \| 'pnpm' \| 'auto'` (default `auto`). (F7.)

**Files:**
- Create: `src/mcp/server.ts`, `src/mcp/auto-discover.ts`, `src/mcp/tools/test.ts`, `src/mcp/backends/just.ts`, `src/mcp/backends/pnpm.ts`
- Create: `src/mcp/server.test.ts` (integration), `src/mcp/auto-discover.test.ts`, `src/mcp/tools/test.test.ts`, `src/mcp/backends/{just,pnpm}.test.ts`
- Modify: `src/mcp/cli.ts` (replace shim with real entrypoint)
- Modify: `src/cli/cli.ts` (add `mcp` subcommand)
- Modify: `package.json` (add `@modelcontextprotocol/sdk@^1.29.0`, `zod-to-json-schema@^3` to deps)

**Steps (TDD):**
1. Write `server.test.ts` — spawns the server via stdio, sends `tools/list`, asserts `ak_test` is present with the expected JSON Schema.
2. Write `tools/test.test.ts` — calls `ak_test({packages: ["x"]})` against a mock spawn; asserts argv equals `["just", "test", "--package", "x"]` when justfile is present, `["pnpm", "-F", "x", "test"]` otherwise.
3. Run all — verify FAIL.
4. Implement.
5. Run — verify PASS. Run full `pnpm test` to confirm no regression.

**Acceptance:**
- [x] `node ./dist/esm/mcp/cli.js` responds to MCP `tools/list` with at least `ak_test`.
- [x] `ak_test({packages: ["x"]})` correctly routes to justfile or pnpm based on detection.
- [x] `auto-discover.ts` picks up new files added under `tools/` without modifying `server.ts`.
- [x] `ak mcp` subcommand is invokable via the `ak` CLI binary.
#### [backend] Task 2.2: `ak_lint` tool

**Status:** done

**Depends:** Task 1.4

Add `tools/lint.ts` exporting `{name: "ak_lint", description, inputSchema: zod schema for {files?: string[], fix?: boolean}, handler}`. Backend: oxlint by default; falls back to `pnpm lint` per package if oxlint unavailable.

**Files:**
- Create: `src/mcp/tools/lint.ts`, `src/mcp/tools/lint.test.ts`

**Steps (TDD):**
1. Write `lint.test.ts` — `ak_lint({files: ["a.ts","b.ts"]})` returns structured `{passed: boolean, issues: Array<{file, line, rule, message}>}`. Mock spawned oxlint output.
2. Run — verify FAIL.
3. Implement.
4. Run — verify PASS.

**Acceptance:**
- [x] `ak_lint` appears in `tools/list` after Task 1.4 auto-discovery.
- [x] Returns structured issues, not raw stdout.
#### [backend] Task 2.3: `ak_typecheck` tool

**Status:** done

**Depends:** Task 1.4

Add `tools/typecheck.ts`. Runs `tsc --noEmit -p <pkg>/tsconfig.json` per resolved package. Returns `{passed, errorCount, errors: [{file, line, code, message}]}`.

**Files:**
- Create: `src/mcp/tools/typecheck.ts`, `src/mcp/tools/typecheck.test.ts`

**Steps (TDD):**
1. Write `typecheck.test.ts` — asserts argv and structured-output contract (mocked tsc).
2. Run — verify FAIL.
3. Implement.
4. Run — verify PASS.

**Acceptance:**
- [x] Returns structured tsc errors.
- [x] Resolves packages from `pnpm-workspace.yaml` if present, else just runs at cwd.
#### [backend] Task 2.5: `ak_audit` tool

**Status:** done

**Depends:** Task 1.4

Add `tools/audit.ts`. Wraps existing `ak audit *` subcommands behind one MCP tool with `kind: "tph" | "catalog-drift" | "docs-frontmatter" | "blueprint-lifecycle" | "bundle-budget" | "commit-message" | "tech-debt"`.

**Files:**
- Create: `src/mcp/tools/audit.ts`, `src/mcp/tools/audit.test.ts`

**Steps (TDD):**
1. Write test — for each `kind`, asserts the corresponding `ak audit <kind>` is invoked and the output is parsed into a structured result.
2. Run — verify FAIL.
3. Implement.
4. Run — verify PASS.

**Acceptance:**
- [x] All 7 `kind` values supported.
- [x] Failure of any audit returns `{passed: false, kind, details}` rather than throwing.
#### [backend] Task 2.6: `ak_blueprint` tool

**Status:** done

**Depends:** Task 1.4

Add `tools/blueprint.ts`. Wraps `ak blueprint new|audit|list` behind `action: "new" | "audit" | "list"` with action-specific input schemas.

**Files:**
- Create: `src/mcp/tools/blueprint.ts`, `src/mcp/tools/blueprint.test.ts`

**Steps (TDD):**
1. Write test — for each action, asserts the correct `ak blueprint <action>` invocation and structured-result parsing.
2. Run — verify FAIL.
3. Implement.
4. Run — verify PASS.

**Acceptance:**
- [x] `ak_blueprint({action: "audit", path: "..."})` returns `{passed, errors: []}`.
- [x] `ak_blueprint({action: "new", goal, complexity})` returns the path of the created `_overview.md`.
#### [backend] Task 2.4: `ak_qa` composite tool

**Status:** done

**Depends:** Tasks 2.2, 2.3 (and transitively 1.4 for `ak_test`)

Add `tools/qa.ts`. Runs `ak_lint` + `ak_typecheck` + `ak_test` in parallel via `Promise.all`. Returns per-step structured results plus a top-level `passed: boolean`.

**Files:**
- Create: `src/mcp/tools/qa.ts`, `src/mcp/tools/qa.test.ts`

**Steps (TDD):**
1. Write test — invoking `ak_qa()` triggers all three tools concurrently (assert via spies); aggregate result has `{passed, lint, typecheck, test}`.
2. Run — verify FAIL.
3. Implement.
4. Run — verify PASS.

**Acceptance:**
- [x] Three sub-tools run concurrently (verified by timing/spy).
- [x] Top-level `passed = lint.passed && typecheck.passed && test.passed`.
### Phase 3: SessionStart routing injector (Wave 1)

#### [infra] Task 3.1: `ak-sessionstart-routing` hook bin

**Status:** done

**Depends:** Task 1.1

Replace `src/hooks/sessionstart/index.ts` shim with a real implementation. Reads `.agent/routing.md` (canonical source) if present and emits its content as additional context via the documented SessionStart JSON output format. Wired in `plugin.json` as `SessionStart` with matcher `startup|resume` (F13).

**Files:**
- Modify: `src/hooks/sessionstart/index.ts` (replace shim)
- Create: `src/hooks/sessionstart/index.test.ts`

**Steps (TDD):**
1. Write test — runs the hook in a fixture cwd containing `.agent/routing.md`; asserts stdout is valid JSON with `additionalContext` containing the file contents. Run again with no `.agent/routing.md` → exits 0 with no output.
2. Run — verify FAIL.
3. Implement.
4. Run — verify PASS.

**Acceptance:**
- [x] When `.agent/routing.md` exists, hook emits its content as `additionalContext`.
- [x] When absent, hook exits 0 silently.
- [x] Hook latency <50ms on a cold filesystem (measured in test).
### Phase 4: Reference-consumer migration & cleanup (Waves 3–4)

#### [docs] Task 4.1: Migrate `ozby/ingest-lens` to plugin install

**Status:** todo

**Depends:** Tasks 1.1, 1.4, 3.1 + a tagged release of agent-kit (see Task 5.1)

Cross-repo PR. In ingest-lens: replace manual `.claude/settings.json` hook entries with `/plugin marketplace add webpresso/agent-kit` + `/plugin install agent-kit@webpresso`. Keep the npm dep on `@webpresso/agent-kit` because `agent-kit.config.ts` imports `defineAgentKitConfig` from `@webpresso/agent-kit/e2e` (F8).

**Files (in ingest-lens):**
- Modify: `.claude/settings.json` (remove hook entries, keep gstack Skill matcher and any Doppler-related permissions)
- Modify: `CLAUDE.md` (update install section)
- Verify: `package.json` keeps `@webpresso/agent-kit` GitHub-pinned dep (no removal)

**Steps:**
1. Tag agent-kit at release version (Task 5.1 prerequisite).
2. In ingest-lens, run `/plugin marketplace add webpresso/agent-kit` then `/plugin install agent-kit@webpresso` in a Claude Code session.
3. Trigger an Edit operation; verify `ak-pretool-guard` and `ak-post-tool` fire (check logs).
4. Trigger Stop; verify `ak-stop-qa` fires.
5. Trigger session start; verify `ak-sessionstart-routing` reads `.agent/routing.md` (create one if it doesn't exist).
6. Remove the corresponding manual hook entries from `.claude/settings.json`.
7. Run `pnpm dev` and exercise a typical edit cycle to confirm parity.

**Acceptance:**
- [ ] All previous hook behaviors fire with no manual `.claude/settings.json` hook entries.
- [ ] `pnpm dev` and `pnpm test` in ingest-lens still pass.
- [ ] `pnpm-lock.yaml` still has `@webpresso/agent-kit` (library import path is preserved).

#### [infra] Task 4.2: Remove `agent-hooks` scaffolder

**Status:** todo

**Depends:** Task 4.1

Once ingest-lens is migrated and confirmed working, delete `src/cli/commands/init/scaffolders/agent-hooks/` since plugin-managed hooks supersede it. Other scaffolders (lore-commits, gstack, omx, runtime-check, monorepo-nav, base-kit) remain.

**Files:**
- Delete: `src/cli/commands/init/scaffolders/agent-hooks/`
- Modify: `src/cli/commands/init/scaffold-agent.ts` (remove the `--with agent-hooks` enum value and any reference)
- Modify: `src/cli/commands/init/init.presets.test.ts` (drop the agent-hooks expectations)

**Steps (TDD):**
1. Update `init.presets.test.ts` to drop `agent-hooks` from expected scaffolders.
2. Run — verify FAIL (because the scaffolder still emits agent-hooks output).
3. Delete the scaffolder; remove the `--with` enum value.
4. Run — verify PASS.

**Acceptance:**
- [ ] `ak setup --with agent-hooks` errors with a clear deprecation message OR is removed from the `--with` enum.
- [ ] Existing setup golden tests updated and pass.

### Phase 5: Release engineering (parallel to Phase 4)

#### [infra] Task 5.1: Release script with `dist/` committed at tags

**Status:** done

**Depends:** Task 1.1 (so `dist/` paths in the manifest are stable)

Add `scripts/release.mjs` that: runs `pnpm build`; force-adds `dist/` (overriding `.gitignore`); creates a release commit; tags it `v<version>` from `package.json`; pushes the tag. Update marketplace.json `plugins[0].source` to use the tag (`source: { source: "github", repo: "webpresso/agent-kit", ref: "v<version>" }`) — but for this self-hosted single-plugin layout, `"source": "./"` already resolves to whatever ref the marketplace was added at. Document the release flow in `CONTRIBUTING.md` (or create one). (F1.)

**Files:**
- Create: `scripts/release.mjs`
- Create: `scripts/release.test.ts` (asserts the script's git invocations against a temp repo fixture)
- Modify: `CONTRIBUTING.md` (or create) — add Release section
- Modify: `package.json` — add `release` npm script

**Steps (TDD):**
1. Write `release.test.ts` — runs `release.mjs --dry-run` against a temp repo; asserts the exact git commands queued (`git add -f dist`, `git commit -m`, `git tag v<version>`, `git push origin v<version>`).
2. Run — verify FAIL.
3. Implement.
4. Run — verify PASS.

**Acceptance:**
- [x] `pnpm release --dry-run` prints the planned tag and git commands; does not push.
- [x] `pnpm release` (without `--dry-run`) creates the tag with `dist/` committed at it.
- [x] CONTRIBUTING.md documents the release flow.

## Verification Gates

| Gate | Command | Success Criteria |
|------|---------|-----------------|
| Manifest validity | `claude plugin validate .` | Exits 0 |
| Type safety | `pnpm typecheck` | Zero errors |
| Tests | `pnpm test` | All pass, including new `mcp/`, `hooks/sessionstart/`, `build/validate-*` suites |
| Package validity | `pnpm lint:pkg` (publint + attw) | No errors |
| MCP smoke | `node ./dist/esm/mcp/cli.js` + scripted MCP `tools/list` request | Returns 6 tools (`ak_test`, `ak_lint`, `ak_typecheck`, `ak_qa`, `ak_audit`, `ak_blueprint`) |
| Plugin install dry-run | `claude plugin install ./` (in a temp test consumer) | All hooks register, MCP server starts, slash commands appear under `/ak:*` |
| End-to-end (ingest-lens) | After Task 4.1: `/plugin install agent-kit@webpresso` then trigger an Edit | `ak-pretool-guard` fires; `ak-post-tool` runs lint after edit; SessionStart injects routing |
| Public-package isolation | `webpresso/agent-kit/__tests__/export-isolation.test.ts` (existing) | No imports from `webpresso/monorepo` |
| Release artifact | `git ls-files dist \| wc -l` at any release tag | > 0 (dist committed) |

## Edge Cases and Error Handling

| Edge case | Likelihood | Severity | Mitigation | Owner task |
|-----------|------------|----------|------------|------------|
| `dist/` not committed at the marketplace ref → hooks 404 | High (default behavior of repo) | CRITICAL | `scripts/release.mjs` force-adds `dist/` at tags. Marketplace consumers are documented to install at tag refs only. | 5.1 |
| Two parallel tasks both modify `package.json#bin` | High during refactor | HIGH | All bin entries declared in Task 1.1 upfront. Subsequent tasks edit only their own implementation files. | 1.1 |
| `just` and `pnpm` produce divergent test results | Medium | MEDIUM | Backend-equivalence integration test in Task 1.4 acceptance. | 1.4 |
| ingest-lens has `agent-kit` as both library dep and plugin | Certain | LOW | Library dep is required (`agent-kit.config.ts` imports `defineAgentKitConfig`). Documented in Task 4.1. | 4.1 |
| `claude plugin validate` not on CI runner | Medium | LOW | `lint:pkg` skips validation step gracefully when `claude` CLI is absent. | 1.2 |
| User's `.agent/routing.md` exceeds 200KB | Low | LOW | SessionStart hook truncates with a notice; documented in `routing.md` template. | 3.1 |
| Marketplace pull fails offline → cached plugin disappears | Low | MEDIUM | Document `CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE=1` env var in README. | docs (post-merge) |
| MCP SDK breaking change between minor versions | Low | MEDIUM | Pin `@modelcontextprotocol/sdk` to `^1.29.0` (caret allows minors). Add a renovate constraint. | 1.4 |
| Plugin install on Claude Code <v1.0.33 (no `/plugin` command) | Low | LOW | Document minimum version requirement in README (matches context-mode's note). | docs |

## Cross-Plan References

- **Parent:** `cross-repo: webpresso/monorepo → webpresso/blueprints/draft/webpresso-public-extraction-roadmap` (verified: directory exists at `/Users/ozby/repos/webpresso/monorepo/webpresso/blueprints/draft/webpresso-public-extraction-roadmap`).
- **Sibling — `planned/agent-kit-parity-pass`:** That blueprint plans `.agent/mcp.json` → `.cursor/mcp.json` fan-out for non-Claude IDEs (Cursor, Aider, Cline). This blueprint ships `mcpServers` inside `plugin.json` for Claude Code. Both coexist; same MCP server may be referenced from both places. **Coordination:** when `agent-kit` ships its own MCP server (this blueprint), the `.agent/mcp.json` template in parity-pass should include an entry for it pointing to `npx -y @webpresso/agent-kit mcp` (npm-installed path, since non-Claude IDEs don't use `${CLAUDE_PLUGIN_ROOT}`).
- **Sibling — `draft/promote-parent-roadmaps`:** Different domain (internal blueprint hierarchy DX). No conflict.
- **Sibling — `draft/scaffold-audit-clean-baseline`:** Different domain (audit baseline scaffolding). No conflict.
- **Supersedes:** `agent-hooks` scaffolder under `src/cli/commands/init/scaffolders/agent-hooks/` (removed in Task 4.2).

## Alternatives Considered

| Option | Why rejected |
|--------|--------------|
| Separate `webpresso/agent-kit-marketplace` repo | Extra repo to maintain. Docs and wshobson recommend co-hosting. |
| Many small sub-plugins (per skill) | Premature fragmentation at 15 skills. Revisit at >30. |
| Skip MCP server, just wire hooks | Hooks alone don't fix the "agent constructs lossy CLI strings" pain. MCP gives schema-validated tools — the actual DX upgrade. |
| Keep `ak setup --with agent-hooks` as the primary install path | Two install paths confuse consumers; manual wiring is dead once plugin install works. |
| Use `InstructionsLoaded` hook for routing injection | Observability-only — cannot inject context (F13). |
| Distribute `dist/` via a published npm package only (no committed `dist/`) | Marketplace install is a git clone, not `npm install`. Without committed `dist/`, the plugin is broken on install. F1. |
| Add `dist/` to `main`'s checked-in tree | Pollutes diffs on every PR; conflicts in feature branches. Tag-only commit (Task 5.1) keeps `main` clean. |

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| F1 — `dist/` not present at marketplace ref breaks plugin install | CRITICAL | Release script (Task 5.1) commits `dist/` at tags only; consumers documented to use tag refs. |
| F2 — MCP SDK breaking change | MEDIUM | Pin `^1.29.0`; integration smoke test runs against the actual published SDK. |
| F4 — `package.json#bin` write contention in parallel waves | HIGH | All bins centralized in Task 1.1. |
| F7 — `just`/`pnpm` backend drift | MEDIUM | Backend-equivalence integration test; explicit `agent-kit.config.ts#testBackend` override. |
| Hook bin path resolution failure on Windows | LOW | `${CLAUDE_PLUGIN_ROOT}` substitution is OS-portable per Claude Code docs. Add a CI matrix entry if needed (out of scope for this blueprint). |
| Parallel agent step on ingest-lens repo (Task 4.1) ships a broken plugin | MEDIUM | Task 4.1 explicitly verifies each hook fires before removing manual entries. Atomic per hook — partial failure leaves both paths active until verified. |

## Technology Choices

| Choice | Version | Rationale |
|--------|---------|-----------|
| `@modelcontextprotocol/sdk` | `^1.29.0` | Latest as of 2026-04-26 (verified via npm registry). MIT license. ESM-only. Node ≥18. `./server` subpath provides `Server` class + `StdioServerTransport`. |
| `zod-to-json-schema` | `^3` | Convert `zod` schemas (already a dep at `^4.3.6`) into JSON Schema for MCP tool descriptors. |
| `zod` | already `^4.3.6` | No version bump needed. |
| Plugin manifest schema version | unspecified | Docs don't require a schema version field; `claude plugin validate` is the source of truth. |
| Hook handler type for MCP-callable hooks | `command` | Bins ship as compiled JS; `mcp_tool` hook type would require an indirection that doesn't help here. |
| Routing-injection hook event | `SessionStart` matcher `startup\|resume` | F13: `InstructionsLoaded` is observability-only. SessionStart supports JSON-output context injection. |
| Marketplace plugin source form | `"source": "./"` (relative) + tag pinning via `ref` | Single-plugin self-hosted layout; matches context-mode. |

## Non-Goals

- Renaming the plugin or breaking the `ak` CLI surface.
- Open-sourcing private monorepo recipes (`just`, PM2). `ak mcp` shells out to whatever recipes the consumer has.
- Replacing the symlinker. Cursor, Aider, Cline, Gemini still use `.agent/` fan-out.
- Adding new audits, skills, or scaffolders beyond what's needed for the plugin manifest.
- Multi-plugin marketplace split. Defer until skill count or domain separation justifies it.
- Windows CI matrix expansion.
- Changing Claude Code minimum version requirement messaging beyond a single README note.

## Refinement Summary

| Metric | Value |
|--------|-------|
| Findings total | 13 |
| Critical | 1 (F1 — `dist/` distribution) |
| High | 3 (F2, F4, F5) |
| Medium | 6 (F6, F7, F8, F13, plus 2 from Edge Cases) |
| Low | 3 (F3, F9, F10, F14) |
| Fixes applied | 13/13 inline + new Task 5.1 |
| Cross-plans updated | 1 noted (`agent-kit-parity-pass` coordination on `.agent/mcp.json`) |
| Edge cases documented | 9 |
| Risks documented | 6 |
| **Parallelization score** | **B** (RW0=3, RW1=2, CPR=2.0, CP=0) |
| **Critical path** | 6 waves (1.1 → 1.4 → 2.2 → 2.4 → 4.1 → 4.2) |
| **Max parallel agents** | 4 (Wave 2) |
| **Total tasks** | 12 (was 10 — added 1.4 split + 5.1) |
| **Blueprint compliant** | 12/12 (all have Status, Depends, Files, Steps (TDD), Acceptance) |
