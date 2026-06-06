---
type: blueprint
title: Agent-kit single global native binary + MCP `-32000` fix
owner: ozby
status: in-progress
complexity: L
created: '2026-06-01'
last_updated: '2026-06-06'
progress: '85% (active native-runtime execution lane; changeset, runtime optional-deps/publish policy, host-bin staging code, pure-native manifest, targeted proof-lane tests, and local runtime staging/package-surface verification landed; thin-root root-tarball cutover is now the first blocker before external publish + Claude cutover smoke)'
depends_on: []
tags:
  - mcp
  - distribution
  - native-runtime
  - vp-global
  - wp-setup
---

# Agent-kit single global native binary + MCP `-32000` fix

## Product wedge anchor

- **Stage outcome:** the `plugin:webpresso:webpresso` MCP server and the `wp_*` dev-workflow tools
  are dead (`-32000`); restoring them unblocks the agent dev loop for every plugin consumer.
- **Consuming surface:** `.claude-plugin/plugin.json` (`mcpServers.webpresso` + hook commands) and the
  `wp setup` verb.
- **New user-visible capability:** after `wp setup`, the webpresso plugin launches a **native compiled
  `wp` binary** (no `node`, no JS shim) that is the one global binary shared by PATH `wp`, the plugin
  MCP, and hooks — refreshed every setup like omx/omc/codex/claude.

## Planning Summary

`/mcp` → `Failed to reconnect to plugin:webpresso:webpresso: -32000`.

**Empirically verified root cause:** the published, compiled **0.21.5** `mcp` no-ops
(`node dist/esm/cli/cli.js mcp` exits 0, zero output, no JSON-RPC). **0.22.0 works** (compiled and
source). So the failure is a **build regression in the shipped 0.21.5**, and the plugin is pinned to
that broken copy via `~/.claude/settings.json` `enabledPlugins.webpresso.source.directory` →
`~/.vite-plus/.../@webpresso/agent-kit`. A redundant `enabledPlugins.agent-kit` entry (from a
source-clone `wp setup`) duplicates it.

**Launcher reality (verified in `bin/_run.js`):** the launcher is already native-first.
`buildLaunchPlan` (`_run.js:236-247`) tries `bin/runtime/<target>/wp` (native, `mode:'runtime'`,
sets `WP_COMPILED_RUNTIME=1` + `WP_MCP_TOOL_MODE=registry`), then `node dist`, then `bun src`.
`RUNTIME_BIN_ARGS` (`_run.js:35-42`) already maps `wp`→`mcp` and `wp-*`→`hook <name>`, and
`wp hook <name>` already exists (`cli.ts:45,277`). But native is **dormant**: `package.json`
`optionalDependencies` contains non-runtime tooling only, `bin/runtime/` is unstaged, and `@webpresso/agent-kit-runtime-*` is
unpublished (npm 404); latest is still 0.21.5 → everything falls back to broken node-dist.

**Current repo check (2026-06-06, refreshed):** the package has advanced to **0.29.0**, and the
runtime/package plumbing is now materially cut over in-repo: prepared root `optionalDependencies`
declare the 5 `@webpresso/agent-kit-runtime-*` packages at the root version, release policy now
publishes the runtime matrix by default, `package.json#bin.wp` points at `bin/wp`,
`.claude-plugin/plugin.json` launches `${CLAUDE_PLUGIN_ROOT}/bin/wp mcp`, and
`ensureAgentKitGlobal` / staging now know how to copy the host runtime to a real `bin/wp`.
However, the earlier self-contained-root assumption has now been withdrawn: after runtime build +
stage populate the publishable trees, the root tarball still packs `bin/runtime/**`,
`dist/runtime/**`, and `dist/runtime-packages/**`, producing an oversized root package that fails
publish. The remaining repo-owned blocker is therefore the thin-root package-surface cutover in
`2026-06-06-agent-kit-thin-root-package-surface-release-unblock.md`; external publish/cutover proof
comes only after that blocker clears.
Recent completed blueprints on 2026-06-02/03 mean this plan should **reuse** the canonical public-surface
and lifecycle proof lanes (`wp_audit(kind="package-surface")`, `scripts/public-readiness.ts`,
`wp_audit(kind="blueprint-lifecycle")`) rather than invent new audit surfaces.

> **Execution alignment (2026-06-06).** This remains the canonical in-progress native-runtime
> blueprint, but publish/cutover execution is now explicitly blocked on the in-progress thin-root
> package-surface cutover in `2026-06-06-agent-kit-thin-root-package-surface-release-unblock.md`.
> Keep `2026-06-01-claude-plugin-native-runtime-hardening.md` in `planned/` as the downstream
> residual proof lane, and do **not** open additional cutover blueprints unless publish/cutover
> reveals genuinely new repo-owned scope outside Task 1.5, the thin-root plan, and the hardening residual.

**Target (decided): pure-native plugin launch, no node.** The manifest points directly at a host
native binary that is a real file in the plugin root:
```json
"mcpServers": { "webpresso": { "command": "${CLAUDE_PLUGIN_ROOT}/bin/wp", "args": ["mcp"] } }
```
Verified against the plugins reference: `command` can be any executable; `${CLAUDE_PLUGIN_ROOT}` is
substituted; **Claude runs no install and strips symlinks resolving outside the plugin root on
caching** — so `bin/wp` must be a **real, host-matching file inside the plugin root** (not the JS
shim, not a `node_modules/.bin` symlink). `vp install -g` aligns: it resolves the host optional-dep
native binary; `wp setup` then stages it to a real `bin/wp` before `claude plugin update` caches the
directory.

## Fact Check Findings

| ID | Severity | Claim | Verified reality | Blueprint fix |
| --- | --- | --- | --- | --- |
| F1 | CRITICAL | The `-32000` is the launcher using bare `node`. | Disproven: `node dist/...js mcp` works in 0.22.0, no-ops in 0.21.5 → build regression, not launcher. | Publish a working build; do not rely on launcher change to fix MCP. (Task 1.1) |
| F2 | CRITICAL | The plugin can launch a native `node_modules/.bin/wp-agent-kit-runtime`. | Claude strips symlinks resolving outside the plugin root on caching and runs no install — a `.bin` symlink to a sibling optional-dep does not survive. | `bin/wp` must be a real staged file inside the plugin root. (Task 1.3, 1.4) |
| F3 | HIGH | Staging yields a stable `bin/wp`. | `stage-plugin-runtime-artifacts.ts:51-52` stages per-target `bin/runtime/<target>/wp`, not a host `bin/wp`. Static `plugin.json` can't pick `<target>`. | Add a host-resolve step: copy `bin/runtime/<host-target>/wp` → real `bin/wp` during `wp setup`. (Task 1.3) |
| F4 | HIGH | Hooks-native is large additional scope. | `wp hook <name>` already exists (`cli.ts:277`) and `RUNTIME_BIN_ARGS` already maps the `wp-*` hooks. | Migrate manifest hooks to `${CLAUDE_PLUGIN_ROOT}/bin/wp hook <name>` — low-cost. (Task 1.4) |
| F5 | HIGH | One global binary serves PATH `wp` + plugin + hooks. | `vp install -g @webpresso/agent-kit` (canonical, `detect-pm.ts:43`) resolves the host runtime optional-dep. | Reuse the `detect-pm` builder; refresh on every `wp setup`. (Task 1.2, 1.3) |
| F6 | MEDIUM | The setup path force-updates dev clones too. | Dev clones are detected by `detectGitInstall` (`detect-pm.ts:72`); clobbering destroys the dev-link. | `wp setup` self-update skips source/git clones; honors `WP_SKIP_AUTO_INSTALL`. (Task 1.3) |
| F7 | MEDIUM | A new bespoke verifier is needed for the publishable package surface. | Completed 2026-06-02/03 blueprints already established `package-surface`, `public-readiness`, and `blueprint-lifecycle` as the canonical proof lanes. | Reuse those existing gates; do not add a parallel audit stack. (Tasks 1.2, 1.5) |

## Key Decisions

| Decision | Rationale |
| --- | --- |
| Pure-native manifest: `${CLAUDE_PLUGIN_ROOT}/bin/wp mcp` + `… hook <name>`. | No node, no JS shim, no symlink; path-stable; one native binary for MCP + hooks. |
| `bin/wp` is a real host binary staged in the plugin root (not `.bin`, not a per-target path). | Caching strips external symlinks + no install; static `plugin.json` can't select `<target>`. |
| Fix `-32000` by publishing a working build, not by changing the launcher. | Bare `node` works in 0.22.0; native is bun-compiled from the same source, so it would not have rescued 0.21.5. |
| One global binary via `vp install -g`, refreshed on `wp setup`. | The native binary that `vp` resolves IS the one binary; mirrors omx/omc/codex/claude. |
| Drop the separate `wp-agent-kit-runtime` bin; reuse the `detect-pm` install builder. | No second bin, no second install command (DRY); the manifest names `bin/wp` directly. |
| Pure-native has no node fallback. | Accepted trade-off; load-bearing on staging + a readiness check that the cached `bin/wp` is a real executable. |
| Reuse the shipped proof lanes. | Recent completed blueprints already hardened `package-surface`, `public-readiness`, and `blueprint-lifecycle`; this plan should extend those surfaces, not fork them. |

## Cross-references

- Supersedes the MCP-failure framing of `2026-06-01-claude-plugin-native-runtime-hardening.md`
  (re-scoped to launcher-determinism hardening; must not claim to fix `-32000`).
- Blocked for release/publish closeout by
  `2026-06-06-agent-kit-thin-root-package-surface-release-unblock.md`
  (root tarball must stop packing runtime payload trees before Task 1.5 can complete).
- Unrelated to `2026-06-01-mcp-managed-vitest-launcher-finalization.md` (vitest seam).
- Reuses the proof surfaces hardened by `blueprints/completed/2026-06-02-agent-kit-wp-deploy-orchestrator-toolchain-isolation.md`
  and `blueprints/completed/2026-06-03-blueprint-lifecycle-hygiene-enforcement.md`.

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| --- | --- | --- | --- | --- |
| Wave 0 | 1.1, 1.2 | None | 2 agents | S-M |
| Wave 1 | 1.3, 1.4 | Wave 0 | 2 agents | M / S |
| Wave 2 | 1.5 | Wave 1 + 1.1 | 1 agent | S |
| Critical path | 1.2 → 1.3 → 1.5 | — | 3 waves | L |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| --- | --- | --- | --- |
| RW0 | Ready tasks in Wave 0 | ≥ 2 | 2 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 1.67 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 1.0 |
| CP | same-file overlaps per wave | 0 | 0 |

Refinement delta: a distribution + launcher fix with an inherent publish→install→cutover chain;
release (1.1) and optional-dep wiring (1.2) parallelize, then scaffolder (1.3) and manifest (1.4)
parallelize, then one-off cutover (1.5). Low CPR is inherent and acceptable.

## Phase 1: native distribution + pure-native launch [Complexity: L]

#### [release] Task 1.1: Cut the changeset for the published `mcp` fix + native runtime publish

**Status:** done

**Depends:** None

The shipped 0.21.5 `mcp` no-ops; HEAD/0.22.x works (verified). Cut a changeset documenting the `mcp`
regression fix, the new runtime optional-dependencies, and the pure-native manifest, so a publishable
release carries a working `mcp` AND the per-target runtime packages. Optionally cite the exact
0.21.5→HEAD fix commit.

**Files:**

- Create: `.changeset/fix-mcp-native-distribution.md`

**Steps (TDD):**

1. `git log --oneline -- src/mcp src/cli/commands/mcp.ts src/cli/cli.ts` to identify/cite the fix commit.
2. Write the changeset (minor) naming: mcp regression fix, runtime optional-deps, pure-native manifest, setup self-update.
3. `vp run changeset:status` to confirm validity.

**Acceptance:**

- [x] Changeset present and valid.
- [ ] Release flow publishes a build whose `mcp` answers `initialize` AND publishes the 5 runtime packages.

#### [runtime] Task 1.2: Declare + publish per-target runtime packages as optional dependencies

**Status:** done

**Depends:** None

Wire the `RUNTIME_TARGETS` matrix as `optionalDependencies` of `@webpresso/agent-kit` (currently `{}`),
ensure `build-runtime-binaries.ts` produces `dist/runtime/<target>/wp` and
`stage-plugin-runtime-artifacts.ts` populates both `bin/runtime/<target>/` and per-target packages,
and ensure `release-publish.ts` publishes the runtime packages. Version-lock the optional deps to the
root version (no drift).

**Files:**

- Modify: `package.json` (optionalDependencies)
- Modify: `src/build/package-manifest.ts`, `scripts/stage-plugin-runtime-artifacts.ts`,
  `scripts/release-publish.ts`, `scripts/public-readiness.ts` (+ their tests)

**Steps (TDD):**

1. Add failing tests: root manifest lists all `@webpresso/agent-kit-runtime-*` optional deps at the
   root version; readiness fails when a target binary or runtime-package manifest is missing.
2. `wp_test` for the manifest/readiness tests — verify FAIL.
3. Implement optional-dep generation + staging + publish wiring.
4. `wp_test` for the same tests — verify PASS; run `wp_audit(kind="package-surface")`.

**Acceptance:**

- [x] Root `optionalDependencies` lists all 5 runtime packages at the root version.
- [ ] `vp install -g @webpresso/agent-kit` resolves the host runtime package (os/cpu filtered).
- [x] Readiness fails before publish if any target binary/manifest is missing.

#### [setup] Task 1.3: `ensureAgentKitGlobal` — `vp install -g` + stage host `bin/wp`

**Status:** done
**Progress note:** part (a) `vp install -g` self-update remains **DONE + verified**. Part (b) host
`bin/wp` staging code is now landed, unit-tested in both `ensureAgentKitGlobal` and
`stage-plugin-runtime-artifacts`, and locally proven by a successful `build-runtime-binaries` →
`stage-plugin-runtime-artifacts` → `package-surface` pass on 2026-06-05. The remaining gap is the
external publish/cutover smoke, not local staging behavior.

**Done (a):** `scaffolders/agent-kit-global/index.ts` + `index.test.ts` created;
reuses `buildVpGlobalInstallCommand` (DRY) + real `detectGitInstall` source-clone guard;
non-fatal (warn-only, like `codex-cli`); wired into `init/index.ts` before
`ensureClaudeCodeUserPlugin`, CI-gated. `detect-pm.ts` builder tightened to a
`[string, ...string[]]` tuple. Verified via bun harness: 14/14 branch checks +
real-`detectGitInstall` skip inside this clone (spawn never called).

**Depends:** Task 1.1, Task 1.2

Add a synchronous self-update scaffolder mirroring `ensureGstack` (`scaffolders/gstack/index.ts`):
(a) run `vp install -g @webpresso/agent-kit` (reuse the
`detect-pm.ts:43` builder); (b) resolve the host `RuntimeTarget` (`resolveRuntimeTarget`) and copy the
host `bin/runtime/<target>/wp` → a real `${packageRoot}/bin/wp` so the directory-source plugin caches
a real native binary. Honor `options.dryRun`, `WP_SKIP_AUTO_INSTALL`, and **skip when running from a
source/git clone** (`detectGitInstall`). Wire into `init/index.ts` **before** `ensureClaudeCodeUserPlugin`.

**Files:**

- Create: `src/cli/commands/init/scaffolders/agent-kit-global/index.ts` + `index.test.ts`
- Modify: `src/cli/commands/init/index.ts`
- Modify: `src/cli/auto-update/detect-pm.ts` (export shared builder + `detectGitInstall`)

**Steps (TDD):**

1. Failing tests (DI `spawn`/`fs`): exact `vp install -g` argv on a global install; host `bin/wp`
   staged as a real file; dry-run / skip-env / source-clone all short-circuit.
2. `wp_test` for the new scaffolder test — verify FAIL.
3. Implement scaffolder + wire ordering; reuse `detect-pm` exports (DRY).
4. `wp_test` for the same test — verify PASS; `wp_lint` + `wp_typecheck`.

**Acceptance:**

- [x] `wp setup` refreshes the global install via `vp install -g` synchronously (part a).
- [x] Dry-run / skip-env / source-clone cases perform no install (part a, verified).
- [x] Runs before `ensureClaudeCodeUserPlugin`; reuses the single `detect-pm` builder (no second install command).
- [x] Stages a real host `bin/wp` synchronously in the scaffolder/staging code path (unit-tested); live external proof still depends on publish + cutover.

#### [manifest] Task 1.4: Switch `plugin.json` to pure-native MCP + hooks

**Status:** done

**Depends:** Task 1.2

Point Claude's **plugin manifest MCP surface** at the native binary:
`command: ${CLAUDE_PLUGIN_ROOT}/bin/wp, args:["mcp"]`. Keep hooks **out of the manifest** so
`wp setup` remains the single source of truth for writing consumer hook commands into
`.claude/settings.json` (avoids double-fire). Add manifest tests rejecting `node`, `bun`, any
`*.js` entrypoint, any `node_modules/.bin` launcher, and any duplicate hook declarations. Keep MCP
server name `webpresso` unchanged.

**Files:**

- Modify: `.claude-plugin/plugin.json`
- Modify: `src/build/validate-plugin-manifest.test.ts`

**Steps (TDD):**

1. Failing manifest tests: MCP uses `${CLAUDE_PLUGIN_ROOT}/bin/wp` with native args; manifest
   contains no hooks; no `node`/`bun`/`*.js`/`node_modules/.bin` launcher.
2. `wp_test` for `validate-plugin-manifest.test.ts` — verify FAIL.
3. Update `plugin.json`.
4. `wp_test` for the same file — verify PASS; `wp_lint` + `wp_typecheck`.

**Acceptance:**

- [x] MCP launches `${CLAUDE_PLUGIN_ROOT}/bin/wp` with native args.
- [x] No `node`/`bun`/`*.js`/`node_modules/.bin` launcher remains in the manifest.
- [x] Manifest remains hook-free so `wp setup` stays the single source for consumer hook wiring.
- [x] Server name unchanged.

#### [qa] Task 1.5: Cutover + verify native single-binary MCP

**Status:** blocked
**Blocked:** First unblock is `2026-06-06-agent-kit-thin-root-package-surface-release-unblock.md` (the root tarball still packs staged runtime payload trees and fails publish). After that lands, Task 1.5 still requires published runtime packages plus the external Claude plugin cutover / `initialize` smoke, which is not runnable from this repo-only session.
**Repo-local evidence (2026-06-05):** staged `./bin/wp mcp` now answers the MCP handshake directly from the native binary; `initialize` + `notifications/initialized` + `tools/list` returned 25 tools. `./bin/wp hooks --host claude --hosts skip` also passes with native runtime diagnostics (`launchMode=native`, `targetId=darwin-arm64`). After native Bun asset-resolution fixes, `./bin/wp audit guardrails`, `./bin/wp audit package-surface`, and `scripts/public-readiness.ts` also pass against the staged runtime surface. This proves the repo-local native MCP/runtime path but does not replace the external installed-Claude cutover proof below.
**Registry evidence (2026-06-06):** read-only npm registry probes showed
`@webpresso/agent-kit@0.28.0` is already published with the old `bin/wp.js`
surface and without runtime optional dependencies, while all five local runtime
packages for `0.28.0` return 404:
`@webpresso/agent-kit-runtime-darwin-arm64`,
`@webpresso/agent-kit-runtime-darwin-x64`,
`@webpresso/agent-kit-runtime-linux-arm64`,
`@webpresso/agent-kit-runtime-linux-x64`, and
`@webpresso/agent-kit-runtime-windows-x64`. The local Changesets
**Version Packages** bump has now advanced the repo to `0.29.0`; source
install remains CI-safe while `prepack` injects all runtime optional
dependencies into the packed/published manifest at `0.29.0`. Follow-up
read-only registry probes show `@webpresso/agent-kit@0.29.0` and all five
`@webpresso/agent-kit-runtime-*` packages at `0.29.0` return 404, so `0.29.0`
is the correct next publish target.

**Depends:** Task 1.1, Task 1.2, Task 1.3, Task 1.4, thin-root package-surface release unblock blueprint (`2026-06-06-agent-kit-thin-root-package-surface-release-unblock.md`)

One-off cutover (global config, outside the repo). Remove the duplicate `enabledPlugins.agent-kit`
entry; refresh the global install with the published fix; verify native launch.

**Files:**

- Modify: `~/.claude/settings.json` (one-off; prefer `claude plugin marketplace remove`)

**Steps (TDD):**

1. After publish: `vp install -g @webpresso/agent-kit`; run `wp setup` (stages host `bin/wp`).
2. `claude plugin update --scope user webpresso@webpresso`.
3. Verify cached `${CLAUDE_PLUGIN_ROOT}/bin/wp` is a real executable (Mach-O/ELF, not JS, not symlink); `initialize` probe directly to `${CLAUDE_PLUGIN_ROOT}/bin/wp mcp` returns `serverInfo` (no `node` in the process tree).
4. `claude mcp list` → `plugin:webpresso:webpresso … ✓ Connected`.

**Acceptance:**

- [ ] `plugin:webpresso:webpresso` connects; `wp_*` tools work; launcher is the native binary.
- [ ] Exactly one `enabledPlugins.webpresso`; no `agent-kit` duplicate.
- [ ] npm publish (agent-kit + 5 runtime packages) gated on explicit go; `settings.json` backed up.
