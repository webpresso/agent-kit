---
type: blueprint
title: Claude plugin native runtime hardening
owner: ozby
status: planned
complexity: L
created: '2026-06-01'
last_updated: '2026-06-01'
progress: '0% (reconciled to pure-native; distribution scope folded into the global-distribution blueprint, residual = readiness coverage + hooks-doctor diagnostics)'
depends_on: []
tags:
  - claude-plugin
  - hooks
  - mcp
  - native-runtime
  - package-surface
---

# Claude plugin native runtime hardening

> **Scope correction (2026-06-01 refinement).** An earlier draft framed this
> blueprint as the fix for the `plugin:webpresso:webpresso` MCP `-32000`. That
> framing is **withdrawn**: it was empirically disproven. `node dist/esm/cli/cli.js mcp`
> **works in 0.22.0** and **no-ops only in the published 0.21.5** — so bare-`node`
> launching is not the failure; a compiled-`mcp` build regression is. The `-32000`
> fix lives in `2026-06-01-agent-kit-global-distribution-mcp-runtime-fix.md`
> (publish a working build + single global binary via `vp install -g`). This
> blueprint is re-scoped to an **optional launcher-determinism hardening** that
> must not block or duplicate that fix.

## Product wedge anchor

- **Stage outcome:** plugin hook/MCP launch is deterministic on machines without
  `bun` or `mise` — today `bin/wp.js` → `bin/_run.js` can spawn `bun` for the
  source fallback or require a `mise`-pinned Node, so a contributor lacking
  either gets a non-obvious launch failure of *hooks*, not just `mcp`.
- **Consuming surface:** `.claude-plugin/plugin.json` hook + MCP commands and
  `wp hooks doctor`.
- **New user-visible capability:** a contributor can run the webpresso plugin
  hooks/MCP with only the published package present — no `bun`/`mise`
  prerequisite — and `wp hooks doctor` reports the launch mode and any missing
  artifact reason.

## Planning Summary

> **Ownership reconciliation (2026-06-01 final).** The native-distribution
> mechanics — runtime optional-dependencies, staging a real host `bin/wp`, and
> the **pure-native** plugin manifest — are now owned end-to-end by
> `2026-06-01-agent-kit-global-distribution-mcp-runtime-fix.md` (Tasks 1.2–1.5).
> This blueprint **no longer carries a competing execution plan** for them; its
> Phase 2 and Task 3.1 below are **superseded** by that canonical blueprint and
> must not be executed here. What remains uniquely scoped to this blueprint is
> the **launcher-diagnostics + readiness-coverage residual**: `wp hooks doctor`
> reporting the effective launch mode / missing-artifact reason, and extending
> public-readiness + package-surface checks to catch a plugin missing its native
> runtime artifacts.

The decided architecture is **pure-native, no node**: the plugin manifest points
MCP and every hook at a real host binary staged inside the plugin root
(`${CLAUDE_PLUGIN_ROOT}/bin/wp` with `mcp` / `hook <name>` args). Claude strips
external symlinks on caching and runs no install, so the launcher cannot be a
`node_modules/.bin` symlink to a sibling optional-dep — it must be a real staged
file. The earlier "point Claude at `node dist/esm/cli/cli.js` and drop `_run.js`"
minimal fix is **withdrawn**: native per-platform binaries are the intended
single-global-binary architecture, not a deferred fallback. `bin/wp.js` →
`bin/_run.js` remains only the **source-dev** launcher for running from an
uncompiled clone (dev vs prod), not a parallel production shim.

## Fact Check Findings

| ID | Severity | Claim | Verified reality | Blueprint fix |
| --- | --- | --- | --- | --- |
| F1 | ~~CRITICAL~~ → MEDIUM | Bare `node` launching is the cause of the MCP `-32000`. | **Disproven.** `node dist/esm/cli/cli.js mcp` works in 0.22.0 and no-ops only in published 0.21.5 → the cause is a compiled-`mcp` build regression, not the launcher. The real residual issue is that `bin/_run.js` can re-dispatch to `bun`/`mise`, adding avoidable hook-launch failure modes. | Drop the "fixes `-32000`" claim (the fix is publishing a working build — canonical blueprint). For Claude surfaces, the decided launcher is the pure-native `${CLAUDE_PLUGIN_ROOT}/bin/wp` (no `node`, no `_run.js` re-dispatch) — owned by canonical Task 1.4. |
| F2 | CRITICAL | Native runtime artifacts are already available to installed Claude plugins. | Source has `bin/runtime-manifest.json`, but the installed plugin has neither `bin/runtime-manifest.json` nor `bin/runtime`. | Stage/package runtime manifest and binaries, and fail readiness when installed/packed artifacts would be missing. |
| F3 | HIGH | A plugin-local `node_modules/.bin/wp-agent-kit-runtime` symlink is a valid plugin launcher. | **Disproven.** Claude strips external symlinks when it caches a directory-source plugin and runs no install step, so a `.bin` symlink to a sibling optional-dep does not survive caching. | Reject the `.bin` symlink (and global launchers). The launcher must be a **real staged file** at `${CLAUDE_PLUGIN_ROOT}/bin/wp`, copied in by `wp setup` before Claude caches the directory. Owned by the canonical blueprint (Task 1.3/1.4). |
| F4 | HIGH | A universal plugin manifest can select `bin/runtime/<target>/wp` by itself. | Claude plugin MCP config is static `command`/`args`; no documented target conditional exists in `plugin.json`. | `vp install -g` resolves the one platform package via optional-dependency `os`/`cpu` filtering; `wp setup` then stages that native binary to a real `${CLAUDE_PLUGIN_ROOT}/bin/wp` file (no `.bin` entry, no symlink). Owned by the canonical blueprint. |
| F5 | MEDIUM | Timeout increases would fix the MCP connection failure. | Repo policy says timeouts are diagnostics, not fixes. The actual `-32000` cause is the 0.21.5 compiled-`mcp` regression (see the global-distribution blueprint), not a timeout or slow launcher. | Keep timeouts unchanged; add `wp hooks doctor` diagnostics for launch mode and any missing-artifact reason. |
| F7 | ~~HIGH~~ → resolved | The plugin needs per-platform native runtime packages to launch deterministically. | The earlier YAGNI objection is **withdrawn.** The decided model is one global native binary shared by PATH `wp`, plugin MCP, and hooks (`vp install -g` + pure-native manifest); per-platform packages are the delivery mechanism for that single binary, not speculative scope. | Build + publish the `RUNTIME_TARGETS` matrix as optional-deps. Owned by the canonical blueprint (Task 1.1/1.2); not gated, not deferred. |
| F6 | MEDIUM | Existing package-surface checks fully cover this issue. | `wp_audit(kind="package-surface")` passes, but current checks did not catch the installed plugin missing native runtime artifacts. | Extend public-readiness/tarball checks to inspect runtime files and plugin manifest launcher policy. |

Technology sources: Claude plugin hooks and MCP support plugin-root commands via `${CLAUDE_PLUGIN_ROOT}` and static command/args configuration; npm package docs define `files`, `bin`, `optionalDependencies`, `os`, and `cpu` as the package-surface controls used by this design.

## Key Decisions

| Decision | Rationale |
| --- | --- |
| **Pure-native, no node.** MCP + every hook launch a real staged `${CLAUDE_PLUGIN_ROOT}/bin/wp` (args `["mcp"]` / `["hook","<name>"]`). | The native binary IS the one global binary; no `node`, no `bun`, no `*.js` entrypoint, no `_run.js` re-dispatch for Claude surfaces. Distribution mechanics owned by the canonical blueprint. |
| **Single launcher only — no shim.** The native `bin/wp` *is* the launch path for Claude surfaces; `bin/wp.js`→`_run.js` survives only as the source-dev launcher for uncompiled clones. | Repo policy: delete legacy, don't shim. A parallel production launcher is exactly the garbage this refinement removes. |
| **No separate `wp-agent-kit-runtime` bin.** The manifest names `bin/wp` directly; the staged file is the platform's native `wp`. | Dropped as redundant — a second bin name only adds surface with no consumer. |
| Native per-platform runtime packages are the delivery mechanism, **not deferred / not gated** (F7 resolved). | They are how the single global binary reaches each platform; owned by the canonical blueprint (Task 1.1/1.2). |
| Do not raise hook/MCP timeouts. | Timeouts are diagnostics under repo policy. |

## Ownership boundary (supersedes the former Scope gate)

The former "Scope gate" gated native packages behind a YAGNI proof; that gate is
**removed** — F7 is resolved and the native matrix is the decided architecture.
Execution ownership now splits cleanly:

- **Owned by `2026-06-01-agent-kit-global-distribution-mcp-runtime-fix.md`
  (do NOT execute here):** runtime optional-deps (its Task 1.2), staging a real
  host `bin/wp` (its Task 1.3), the pure-native `plugin.json` flip + manifest
  tests (its Task 1.4), and publish/cutover (its Task 1.5).
- **Unique residual owned by THIS blueprint:** Task 1.2 (extend public-readiness
  + package-surface checks to fail when a plugin would ship without its native
  runtime artifacts) and Task 3.2 (`wp hooks doctor` launch-mode + missing-artifact
  diagnostics). Task 4.1 smoke verifies the residual. **Superseded** here (retained
  only as cross-references to the canonical tasks): Task 1.1 (manifest policy/flip
  → canonical 1.4), Phase 2 / Tasks 2.1–2.2 (optional-deps + staging → canonical
  1.2/1.3), and Task 3.1 (move MCP/hooks to native bin → canonical 1.4).

## Cross-references

- The MCP `-32000` fix is **not** here — see
  `2026-06-01-agent-kit-global-distribution-mcp-runtime-fix.md`.
- Unrelated to `2026-06-01-mcp-managed-vitest-launcher-finalization.md`.

## Quick Reference (Execution Waves)

> **Post-reconciliation, only the residual executes here:** Task 1.2
> (readiness/package-surface coverage) and Task 3.2 (`wp hooks doctor`
> diagnostics), verified by Task 4.1. Tasks 1.1, 2.1, 2.2, and 3.1 are
> **superseded** by the global-distribution blueprint and are not run from this
> plan. The wave table below is retained for historical context.

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| --- | --- | --- | --- | --- |
| Wave 0 | 1.1, 1.2 | None | 2 agents | S |
| Wave 1 | 2.1, 2.2 | Wave 0 | 2 agents | S-M |
| Wave 2 | 3.1, 3.2 | Wave 1 | 2 agents | S |
| Wave 3 | 4.1 | Wave 2 | 1 agent | S |
| Critical path | 1.1 → 2.1 → 3.1 → 4.1 | — | 4 waves | L |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| --- | --- | --- | --- |
| RW0 | Ready tasks in Wave 0 | ≥ 2 | 2 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 1.75 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 1.0 |
| CP | same-file overlaps per wave | 0 | 0 |

Refinement delta: CPR is below the ideal parallel target because plugin manifest, packaging, diagnostics, and release checks intentionally serialize around shared package surfaces. This is acceptable for a safety-critical launcher fix.

## Phase 1: failing policy and package tests [Complexity: M]

#### [manifest] Task 1.1: Lock Claude plugin launcher policy

**Status:** dropped
**Dropped:** superseded by canonical blueprint Task 1.4 (pure-native `plugin.json` +
manifest tests). Do not execute here. The allowed launcher is the real staged
`${CLAUDE_PLUGIN_ROOT}/bin/wp` (args `["mcp"]` / `["hook","<name>"]`); manifest
tests reject `node`, `bun`, any `*.js` entrypoint, and any symlinked target.

**Depends:** None

Add tests that reject bare `node`, bare `bun`, global `wp`, and `bin/wp.js` in Claude plugin hook/MCP runtime surfaces. The allowed MCP command is the real staged `${CLAUDE_PLUGIN_ROOT}/bin/wp` (not a `.bin` symlink). Hook commands must call the same native bin with hook subcommands.

**Files:**

- Modify: `src/build/validate-plugin-manifest.test.ts`
- Modify: `.claude-plugin/plugin.json`

**Steps (TDD):**

1. Add failing manifest tests for MCP and all command hooks.
2. Run `wp_test` for `src/build/validate-plugin-manifest.test.ts` and verify FAIL.
3. Update the manifest only after tests describe the policy.
4. Run `wp_test` for the same file and verify PASS.
5. Run `wp_lint` and `wp_typecheck` for changed files.

**Acceptance:**

- [ ] Tests fail on the current `node` manifest.
- [ ] Plugin manifest contains no bare `node`, bare `bun`, global `wp`, or `bin/wp.js` launcher.
- [ ] MCP uses the real staged `${CLAUDE_PLUGIN_ROOT}/bin/wp` plus `args: ["mcp"]`.
- [ ] Hook commands use the same `${CLAUDE_PLUGIN_ROOT}/bin/wp` plus `hook <name>` args.

#### [package] Task 1.2: Prove packed/installed runtime artifacts are required

**Status:** todo

**Depends:** None

**Status (residual — UNIQUE to this blueprint):** todo. This is the one Phase-1
task that is NOT superseded — it extends readiness/package-surface coverage so a
plugin can never ship missing its native runtime artifacts. Coordinate with the
canonical blueprint's Task 1.2 (which adds the optional-deps) but keep this
coverage check here.

Add regression tests proving the package/readiness lane fails when runtime packages, runtime manifest, the real staged `${packageRoot}/bin/wp` launcher, or staged `bin/runtime` artifacts are missing.

**Files:**

- Modify: `scripts/public-readiness.ts`
- Modify: related public-readiness/staging tests

**Steps (TDD):**

1. Add failing tests for missing `bin/runtime-manifest.json`, missing `bin/runtime/<target>/wp`, missing runtime optional dependencies, and a missing/symlinked staged `bin/wp` (must be a real executable file, not a symlink).
2. Run `wp_test` for the readiness/staging tests and verify FAIL.
3. Implement only the checks needed to pass.
4. Run `wp_test` for the same tests and verify PASS.
5. Run `wp_audit(kind="package-surface")`.

**Acceptance:**

- [ ] Readiness fails before publish if native runtime artifacts are absent.
- [ ] Readiness checks the packed package surface, not only source-tree files.
- [ ] Package-surface audit remains passing.

## Phase 2: runtime dependency and staging repair [Complexity: M]

#### [runtime] Task 2.1: Wire platform runtime packages as optional dependencies

**Status:** dropped
**Dropped:** superseded by canonical blueprint Task 1.2. Do not execute here. Note
the design correction: the manifest names `bin/wp` directly, so there is **no**
separate `wp-agent-kit-runtime` bin — each runtime package ships its native `wp`.

**Depends:** Task 1.2

Use the existing `RUNTIME_TARGETS` matrix to declare all platform runtime packages as optional dependencies of `@webpresso/agent-kit` with the current package version. Each runtime package ships its native `wp` binary (no separate `wp-agent-kit-runtime` bin — that was dropped as redundant).

**Files:**

- Modify: `package.json`
- Modify: `scripts/stage-plugin-runtime-artifacts.ts`
- Modify: `src/build/runtime-targets.ts` if a shared bin-name constant is needed

**Steps (TDD):**

1. Add tests that inspect generated root and runtime package manifests.
2. Run `wp_test` for staging/package-manifest tests and verify FAIL.
3. Add optional dependency generation and runtime bin alias generation.
4. Run `wp_test` for the same tests and verify PASS.
5. Run `wp_typecheck` and `wp_lint`.

**Acceptance:**

- [ ] Root package declares all runtime packages as optional dependencies.
- [ ] Runtime package manifests include `os`, `cpu`, `files: ["bin"]`, and `bin.wp` (the native binary; no `wp-agent-kit-runtime`).
- [ ] Version wiring cannot drift from root package version.

#### [stage] Task 2.2: Stage native runtime artifacts into plugin/package surfaces

**Status:** dropped
**Dropped:** superseded by canonical blueprint Task 1.3 (stage the host binary to a
real `${packageRoot}/bin/wp`). Do not execute here.

**Depends:** Task 1.2

Make staging copy the runtime manifest and target binaries into the package/plugin surface used by Claude release installs. The host target is staged to a real `${packageRoot}/bin/wp` file; preserve existing `bin/runtime/<target>/wp` candidates for non-Claude launcher diagnostics.

**Files:**

- Modify: `scripts/stage-plugin-runtime-artifacts.ts`
- Modify: `scripts/public-readiness.ts`
- Modify: staging/readiness tests

**Steps (TDD):**

1. Add failing tests that stage from fixture runtime builds and assert manifest plus target binaries are present.
2. Run `wp_test` for staging/readiness tests and verify FAIL.
3. Implement manifest and artifact staging.
4. Run `wp_test` for the same tests and verify PASS.
5. Run public readiness and package-surface audit.

**Acceptance:**

- [ ] `bin/runtime-manifest.json` is included in the publishable package/plugin surface.
- [ ] `bin/runtime/<target>/wp` or `wp.exe` exists for every target in the manifest after staging.
- [ ] Missing runtime builds fail loudly with target-specific messages.

## Phase 3: plugin manifest and diagnostics [Complexity: M]

#### [plugin] Task 3.1: Move Claude plugin MCP/hooks to the native bin

**Status:** dropped
**Dropped:** superseded by canonical blueprint Task 1.4. Do not execute here.

**Depends:** Task 2.1, Task 2.2

Update Claude plugin MCP and hook commands to use the real staged `${CLAUDE_PLUGIN_ROOT}/bin/wp` path. Keep hook names and MCP server name unchanged.

**Files:**

- Modify: `.claude-plugin/plugin.json`
- Modify: `src/build/validate-plugin-manifest.test.ts`
- Modify: `src/hooks/doctor.test.ts`

**Steps (TDD):**

1. Extend tests to assert exact MCP and hook command/args shape.
2. Run `wp_test` for manifest and hooks doctor tests and verify FAIL.
3. Update plugin manifest and doctor expectations.
4. Run `wp_test` for the same files and verify PASS.
5. Run `wp_lint` and `wp_typecheck`.

**Acceptance:**

- [ ] MCP server remains named `webpresso`.
- [ ] Hook names and matchers remain unchanged.
- [ ] Manifest uses no JS/TS source entrypoint for Claude startup.

#### [doctor] Task 3.2: Add native runtime startup diagnostics

**Status:** todo

**Depends:** Task 2.1, Task 2.2

Teach hooks doctor to report native runtime availability and give actionable missing-artifact diagnostics without recommending timeout increases.

**Files:**

- Modify: `src/hooks/doctor.ts`
- Modify: `src/hooks/doctor.test.ts`

**Steps (TDD):**

1. Add failing doctor tests for present runtime, missing optional dependency bin, missing manifest, and missing target binary.
2. Run `wp_test` for `src/hooks/doctor.test.ts` and verify FAIL.
3. Implement bounded checks with partial-result warnings.
4. Run `wp_test` for the same file and verify PASS.
5. Run `wp_lint` and `wp_typecheck`.

**Acceptance:**

- [ ] Doctor reports launch mode, target id, manifest path, staged `${CLAUDE_PLUGIN_ROOT}/bin/wp` path, and missing reason.
- [ ] Doctor does not suggest raising Claude MCP/hook timeouts.
- [ ] Diagnostics are bounded and degradable.

## Phase 4: release/readiness verification [Complexity: S]

#### [qa] Task 4.1: Verify package and installed-plugin smoke

**Status:** todo

**Depends:** Task 3.1, Task 3.2

Run the narrow and package-surface checks that prove the plugin would install with native runtime artifacts and start Claude MCP without the JS launcher seam.

**Files:**

- Modify: verification notes in PR/changeset only if required by release process

**Steps (TDD):**

1. Run `wp_test` for changed test files.
2. Run `wp_typecheck`.
3. Run `wp_lint` for changed files.
4. Run `wp_audit(kind="package-surface")` and public readiness.
5. Run an installed-plugin smoke that proves the effective launcher is the real staged native `${CLAUDE_PLUGIN_ROOT}/bin/wp` (no `node` in the process tree).

**Acceptance:**

- [ ] All targeted tests pass.
- [ ] Package-surface and public-readiness checks pass.
- [ ] Smoke output proves `WP_COMPILED_RUNTIME=1` or equivalent native-mode evidence.
- [ ] No timeout setting was increased.
