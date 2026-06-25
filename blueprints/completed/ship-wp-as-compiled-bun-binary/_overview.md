---
type: blueprint
title: Ship `wp` as compiled Bun runtime artifacts while keeping the library surface Node-safe
owner: ozby
status: completed
complexity: L
created: "2026-05-29"
last_updated: "2026-05-29"
progress: "100% (runtime cutover implemented and verified on 2026-05-29)"
depends_on: []
cross_repo_depends_on: []
tags: [runtime, distribution, mcp, plugin, bun, packaging]
---

# Ship `wp` as compiled Bun runtime artifacts while keeping the library surface Node-safe

**Goal:** Ship the runtime-owned executable surfaces (`wp`, Claude plugin MCP,
plugin hooks) on top of **compiled Bun binaries** so published/plugin-installed
execution paths no longer resolve `src/*.ts` at runtime, while **keeping the
library/export surface on the existing Node + `dist/esm` contract**.

This refinement intentionally narrows the draft's over-broad claim. Compiling
`wp` does **not** by itself remove every `bun src/**/*.ts` invocation from local
build/release workflows. The shippable bar here is: **no published or
plugin-installed runtime path resolves TypeScript source files**. Repo-local
build scripts remain out of scope unless a separate hard-cut blueprint is
approved.

## Product wedge anchor

- **Stage outcome:** a third party can install the Claude plugin from a release
  ref or install `@webpresso/agent-kit` from npm and get a working MCP server +
  hook surface with no `ERR_MODULE_NOT_FOUND` from missing `src/*.ts`.
- **Consuming surfaces:**
  1. **Claude plugin marketplace path** — git-cloned release artifact under
     `.claude-plugin/` + `bin/`.
  2. **npm package path** — packed `@webpresso/agent-kit` tarball plus
     platform-selected runtime binaries.
  3. **Library subpaths** — `@webpresso/agent-kit/vitest/node`,
     `/oxlint`, `/tsconfig/*`, etc., which must keep working under Node.
- **New user-visible capability:** the plugin connects reliably from a clean
  install and `wp` runtime commands execute from compiled artifacts rather than
  unpublished `.ts` paths.

## Planning Summary

- Goal input: `Ship wp as a compiled bun library`
- Interpreted target: the existing active blueprint
  `ship-wp-as-compiled-bun-binary` (no exact
  `ship-wp-as-compiled-bun-library` blueprint exists in this repo as of
  2026-05-29)
- Blueprint path:
  `blueprints/in-progress/ship-wp-as-compiled-bun-binary/_overview.md`
- Core correction: **compile the runtime surfaces, not the exported library
  surface**
- Parallelization correction: maximize ready width by splitting independent MCP,
  CLI-routing, artifact-staging, and release-wiring work rather than serializing
  them behind the first runtime fix
- Validation scope:
  - SDK-backed MCP `initialize` + `tools/list` succeeds through the installed
    runtime path
  - Claude plugin hooks execute with no `src/*.ts` resolution
  - packed Node library subpaths still resolve
  - package/plugin release surfaces stay within existing tarball/public-readiness
    guardrails

## Fact-Checked Findings

| ID  | Severity     | Claim in draft                                                                                                             | Reality verified on 2026-05-29                                                                                                                                                                            | Fix                                                                                                                                                                     |
| --- | ------------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **CRITICAL** | npm `optionalDependencies` + postinstall are sufficient for both npm installs and Claude plugin installs.                  | The Claude plugin marketplace path is a **git clone of a release ref**, not an npm install. npm lifecycle hooks and optional deps do not run in that clone.                                               | Split distribution into two explicit lanes: **plugin release artifact lane** (committed binaries at release refs) and **npm tarball lane** (platform runtime packages). |
| F2  | **HIGH**     | The library surface currently breaks under Node because root `package.json#imports` still points at `src/*.ts`.            | `src/config/export-resolution.test.ts` and `package.contract.test.ts` already pass; `dist/esm/package.json` rewrites `#` imports for built library files, so the library contract is **already working**. | Remove the root-imports rewrite task. Keep the library/export surface unchanged and add regression coverage only.                                                       |
| F3  | **HIGH**     | The MCP connection-close issue is only theoretical.                                                                        | A real SDK-backed probe against `node ./bin/wp.js mcp` returned **`MCP error -32000: Connection closed`** on 2026-05-29.                                                                                  | Keep the stdio lifetime fix, but verify it with a real SDK client handshake instead of raw-stdin heuristics.                                                            |
| F4  | **HIGH**     | Runtime filesystem discovery of `src/mcp/tools/*.ts` / `dist/esm/mcp/tools/*.js` is compatible with a compiled Bun binary. | `src/mcp/server.ts` + `src/mcp/auto-discover.ts` rely on `readdir()` + dynamic `import()` from a tools directory. Bun docs only guarantee bundled code/assets when they are imported/embedded.            | Add a **compiled-mode static tool registry** (or equivalent explicit inclusion path) and guard it against drift.                                                        |
| F5  | **HIGH**     | Plugin metadata is already aligned while touching runtime surfaces.                                                        | `package.json` and `.claude-plugin/marketplace.json` were at `0.21.5`, but `.claude-plugin/plugin.json` was still `0.21.3` when inspected on 2026-05-29.                                                  | Add plugin-manifest version-sync coverage as part of the binary cutover.                                                                                                |
| F6  | **HIGH**     | The no-`.ts` guarantee can cover “everywhere, including dev” within this blueprint.                                        | The repo still intentionally runs many build/release entrypoints as `bun src/...`. Compiling `wp` does not remove those.                                                                                  | Narrow scope to **published/plugin-installed runtime entrypoints**. Track any repo-wide compiled-script hard-cut separately if needed.                                  |
| F7  | **MEDIUM**   | New one-off verification scripts are the best way to prove package/plugin safety.                                          | The repo already has `package.contract.test.ts`, `scripts/public-consumer-smoke.ts`, `scripts/public-readiness.ts`, and `wp audit package-surface`.                                                       | Extend the existing gates instead of inventing parallel verification surfaces.                                                                                          |
| F8  | **MEDIUM**   | Adding platform runtime packages is a local package.json tweak.                                                            | The repo currently behaves like a single published package. Platform packages would widen the workspace/release topology.                                                                                 | If per-platform packages are chosen, explicitly update workspace/release/package-surface contracts and keep the new public API minimal.                                 |
| F9  | **LOW**      | Bun only supports the exact five targets listed in the draft.                                                              | Current Bun docs list a larger target matrix, including musl and Windows ARM64 variants.                                                                                                                  | Choose and document an explicit **first supported matrix** instead of implying Bun is limited to five targets.                                                          |
| F10 | **MEDIUM**   | `wp hook <name>` had to wait on MCP/runtime work.                                                                          | The hook router is a pure CLI delegation lane and can be implemented before binary work.                                                                                                                  | Move hook routing to Wave 0 so runtime-bin rewiring can start immediately afterward.                                                                                    |
| F11 | **MEDIUM**   | Plugin artifact staging and publish-flow wiring are one atomic task.                                                       | Release-like plugin smoke only needs staged binaries; workflow wiring can happen later.                                                                                                                   | Split staging from release-flow wiring to unblock earlier plugin verification.                                                                                          |

## Evidence Base

- `package.json`
  - `files[]` excludes `src/`
  - `bin.wp` and plugin hook bins still point at JS launchers
  - root `imports` are source-first today
- `.claude-plugin/plugin.json`
  - still uses `node ${CLAUDE_PLUGIN_ROOT}/bin/wp.js mcp`
  - version mismatch versus package/marketplace manifests
- `.claude-plugin/marketplace.json`
  - plugin source is `./`, which aligns with the repo-clone release-artifact
    contract from the completed plugin-marketplace blueprint
- `src/mcp/cli.ts`
  - `runStdioServer()` returns after `server.connect()` + `writeSentinel()`
- `src/mcp/server.ts` and `src/mcp/auto-discover.ts`
  - tool registration depends on runtime directory scans and dynamic imports
- `dist/esm/package.json`
  - already rewrites internal `#` imports to built `.js` targets
- `src/config/export-resolution.test.ts` and `package.contract.test.ts`
  - passed on 2026-05-29, proving current packed library subpaths are still
    Node-resolvable
- `npm pack --dry-run --json`
  - confirmed tarball has `bin/`, `dist/`, and `.claude-plugin/`, but no `src/`
- Bun official docs (`/oven-sh/bun` via Context7, queried 2026-05-29)
  - compile target matrix
  - embedded asset/file guidance
  - explicit `bun` condition support
- npm official docs (`/npm/cli` via Context7, queried 2026-05-29)
  - `optionalDependencies`
  - `cpu` / `os` package metadata behavior

## Corrected Architecture

```text
Lane A: Claude plugin marketplace / release-ref clone
  git clone of release ref
    ├─ .claude-plugin/plugin.json        (still invoked via node launcher)
    ├─ bin/wp.js                         tiny host selector, no source fallback
    └─ bin/runtime/<target>/wp[.exe]     committed compiled Bun binaries

Lane B: npm package install
  npm install @webpresso/agent-kit
    ├─ bin/wp.js                         same tiny host selector
    ├─ optionalDependencies              host platform runtime package(s)
    └─ node_modules/@webpresso/agent-kit-runtime-<target>/...

Lane C: library consumers
  import '@webpresso/agent-kit/vitest/node'
    ├─ root exports -> dist/esm/*.js
    └─ dist/esm/package.json imports map handles internal # aliases

Invariant:
  published/plugin-installed runtime entrypoints may execute JS selectors,
  but they must never resolve src/*.ts at runtime.
```

## Key Decisions

| Decision                  | Choice                                                                  | Rationale                                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime artifact          | Compiled Bun binaries for `wp` runtime behavior                         | Removes dependency on published `src/*.ts` for the shipped runtime path                                                                            |
| Host selection            | Keep a tiny checked-in **Node JS selector** (`bin/wp.js` family)        | One cross-platform selector can serve both git-cloned plugin refs and npm installs; avoids Bun-on-consumer and avoids per-platform manifest sprawl |
| Scope of compiled cutover | `wp` + plugin hook runtime surfaces only                                | Keeps the blueprint aligned with the user-visible failure and avoids a repo-wide build-script rewrite                                              |
| Plugin lane               | Release refs carry committed platform binaries                          | Plugin marketplace clone path cannot rely on npm lifecycle/install hooks                                                                           |
| npm lane                  | Platform runtime packages via `optionalDependencies`                    | Keeps the main tarball small while allowing host selection at runtime                                                                              |
| Library lane              | Keep current `dist/esm` + `exports` contract                            | Existing tests already prove it; rewriting root imports would be churn without value                                                               |
| MCP tool registration     | Explicit compiled-mode registry                                         | Runtime directory scanning is too fragile for compiled artifacts                                                                                   |
| Task splitting            | Separate router, staging, and release wiring                            | Widens the DAG without introducing same-file conflicts                                                                                             |
| Supported targets (v1)    | `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`, `windows-x64` | Covers the current common matrix; musl/Windows ARM64 stay explicit non-goals until demanded                                                        |

## Quick Reference (Execution Waves)

| Wave              | Tasks                        | Dependencies      | Parallelizable | Effort (T-shirt) |
| ----------------- | ---------------------------- | ----------------- | -------------- | ---------------- |
| **Wave 0**        | 1.1, 1.2, 1.3, 1.4, 1.5, 1.6 | None              | 6 agents       | XS-M             |
| **Wave 1**        | 2.1, 2.2, 2.3, 2.4           | Wave 0 (targeted) | 4 agents       | S-M              |
| **Wave 2**        | 2.5, 3.1, 3.2                | Wave 1 (targeted) | 3 agents       | S-M              |
| **Wave 3**        | 4.1                          | Wave 2            | 1 agent        | S                |
| **Critical path** | 1.3 → 2.2 → 2.5 → 4.1        | —                 | 4 waves        | L                |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target               | Actual             |
| ------ | ---------------------------------- | -------------------- | ------------------ |
| RW0    | Ready tasks in Wave 0              | ≥ planned agents / 2 | **6**              |
| CPR    | total_tasks / critical_path_length | ≥ 2.5                | **14 / 4 = 3.5**   |
| DD     | dependency_edges / total_tasks     | ≤ 2.0                | **16 / 14 = 1.14** |
| CP     | same-file overlaps per wave        | 0                    | **0** (planned)    |

**Parallelization score: A** — Wave 0 is fully saturated, plugin and npm lanes
both start in Wave 1, and the only unavoidable serial bottleneck is the final
dual-surface gate.

---

## Phase 1: Foundations

#### [mcp] Task 1.1: Keep the stdio MCP server alive under a real SDK client

**Status:** done

**Depends:** None

Fix only the proven stdio lifetime failure first: on 2026-05-29 a real SDK
client talking to `node ./bin/wp.js mcp` received `MCP error -32000:
Connection closed`. This task is intentionally narrower than tool-registration
work so it can run in parallel with the compiled-registry lane. The outcome
must be a server that stays alive until client disconnect or explicit shutdown.

**Files:**

- Modify: `src/mcp/cli.ts`
- Create or modify: `src/mcp/cli.integration.test.ts`

**Steps (TDD):**

1. Write a failing SDK-backed integration test that launches `node ./bin/wp.js
mcp`, performs `initialize`, then `tools/list`, and asserts the connection
   stays open long enough to list tools.
2. Run: `wp_test({"files":["src/mcp/cli.integration.test.ts"]})` — verify FAIL.
3. Implement the stdio lifetime fix so the server remains alive until the
   client disconnects or shutdown is requested.
4. Re-run: `wp_test({"files":["src/mcp/cli.integration.test.ts"]})` — verify PASS.
5. Run: `vp run build` and manually confirm the built JS runtime still serves
   MCP over stdio.

**Acceptance:**

- [x] SDK-backed `initialize` + `tools/list` pass through the current runtime path
- [x] The process stays alive until the client closes stdin / disconnects
- [x] Shutdown still removes the MCP sentinel cleanly

#### [mcp] Task 1.2: Add a compile-safe tool registration path

**Status:** done

**Depends:** None

Replace runtime-only filesystem discovery with a compiled-mode-safe
registration path. `src/mcp/server.ts` + `src/mcp/auto-discover.ts` currently
depend on `readdir()` + dynamic `import()` from a tools directory, which is too
fragile for compiled artifacts. This task owns the explicit compiled registry;
the completeness guard is split later so implementation and drift-proofing can
run in separate waves.

**Files:**

- Modify: `src/mcp/server.ts`
- Modify as needed: `src/mcp/auto-discover.ts`
- Create: `src/mcp/tools/_registry.ts`
- Create or modify: `src/mcp/server.compiled.test.ts`

**Steps (TDD):**

1. Write a failing test that proves compiled-mode tool registration can list
   and invoke tools without runtime directory scans.
2. Run: `wp_test({"files":["src/mcp/server.compiled.test.ts","src/mcp/auto-discover.test.ts"]})`
   — verify FAIL.
3. Implement the explicit compiled-mode registry while preserving safe
   disk-based auto-discovery for non-compiled execution.
4. Re-run the same command — verify PASS.

**Acceptance:**

- [x] Compiled mode does not depend on runtime directory scans
- [x] Existing auto-discovery tests still pass for non-compiled disk execution

#### [build] Task 1.3: Define the supported target matrix and compile helper

**Status:** done

**Depends:** None

Encode the first supported Bun target matrix and add a single helper that can
build host and cross-platform runtime binaries deterministically. This task is
only about build orchestration and artifact naming, not about release/tag
staging or npm packaging. Keep the public matrix intentionally narrow and
documented so later release/package-surface work has a stable contract.

**Files:**

- Create: `src/build/compile-runtime-binaries.ts`
- Create: `src/build/compile-runtime-binaries.test.ts`
- Modify: `package.json` (`build` adjunct script such as `build:runtime-binaries`)

**Steps (TDD):**

1. Write a failing test for the compile helper covering target enumeration,
   artifact naming, and host-target build invocation.
2. Run: `wp_test({"files":["src/build/compile-runtime-binaries.test.ts"]})`
   — verify FAIL.
3. Implement the compile helper using the selected Bun target matrix.
4. Re-run: `wp_test({"files":["src/build/compile-runtime-binaries.test.ts"]})`
   — verify PASS.
5. Run: `vp run build:runtime-binaries` on the host target and record the
   emitted artifact layout.

**Acceptance:**

- [x] Target matrix is explicit and documented in code/tests
- [x] Host-target binary build is reproducible
- [x] Cross-target artifact naming is stable
- [x] No release/package metadata changes are mixed into this task

#### [backend] Task 1.4: Add `wp hook <name>` routing before binary rewiring

**Status:** done

**Depends:** None

Add the unified `wp hook <name>` route as an independent lane instead of
serializing it behind MCP/runtime work. This task is purely CLI routing and
delegation to existing hook handlers; it does not require compiled binaries to
exist first. Doing it early widens the graph and removes an artificial blocker
from later runtime-bin rewiring.

**Files:**

- Modify: `src/cli/cli.ts`
- Create: `src/cli/commands/hook.ts`
- Create: `src/cli/commands/hook.test.ts`

**Steps (TDD):**

1. Write failing tests proving `wp hook <name>` delegates to the existing five
   plugin hook behaviors.
2. Run: `wp_test({"files":["src/cli/commands/hook.test.ts","src/cli/cli.test.ts"]})`
   — verify FAIL.
3. Implement the hook router with no duplicated hook logic.
4. Re-run the same command — verify PASS.

**Acceptance:**

- [x] `wp hook <name>` covers the five plugin hook names
- [x] Hook handlers keep existing stdin/env behavior
- [x] No hook business logic is duplicated

#### [plugin] Task 1.5: Align plugin manifest contract with the binary plan

**Status:** done

**Depends:** None

Keep the Claude plugin surface on a stable Node launcher contract while
removing ambiguity from versioning and executable expectations. The plugin
manifest should continue to invoke `node ${CLAUDE_PLUGIN_ROOT}/bin/wp.js ...`
until the host selector is ready; what must change now is the version-sync
coverage and the expectation that the launcher resolves **compiled runtime
artifacts**, not `dist/esm` or `src/*.ts`.

**Files:**

- Modify: `.claude-plugin/plugin.json`
- Modify: `src/build/validate-plugin-manifest.test.ts`

**Steps (TDD):**

1. Extend the plugin-manifest test to fail when `plugin.json` version drifts
   from `package.json`, or when runtime commands point at `.ts` or `dist/esm`
   entrypoints instead of the JS selector contract.
2. Run: `wp_test({"files":["src/build/validate-plugin-manifest.test.ts"]})`
   — verify FAIL.
3. Update the manifest and validation accordingly.
4. Re-run: `wp_test({"files":["src/build/validate-plugin-manifest.test.ts"]})`
   — verify PASS.

**Acceptance:**

- [x] `.claude-plugin/plugin.json` version matches `package.json`
- [x] MCP + hook commands resolve through the JS selector contract only
- [x] No plugin runtime command points at `.ts` or `dist/esm`

#### [library] Task 1.6: Freeze the existing Node library contract as a regression guard

**Status:** done

**Depends:** None

The refined plan removes the draft's root-imports rewrite because the library
contract already works. This task encodes that decision durably so later binary
work cannot accidentally break `@webpresso/agent-kit/vitest/node` and sibling
subpaths while chasing the runtime fix. Extend existing package-contract/export
resolution coverage; do not introduce a second verification surface.

**Files:**

- Modify: `package.contract.test.ts`
- Modify as needed: `src/config/export-resolution.test.ts`

**Steps (TDD):**

1. Add failing assertions that the binary cutover does not alter the current
   packed Node subpath import contract.
2. Run: `wp_test({"files":["src/config/export-resolution.test.ts","package.contract.test.ts"]})`
   — verify FAIL.
3. Adjust tests/contracts only until they express the intended invariant.
4. Re-run the same command — verify PASS.

**Acceptance:**

- [x] Packed library subpaths remain Node-resolvable
- [x] No new root-imports rewrite task is required to keep library consumers working
- [x] The binary blueprint now treats the library lane as protected, not in flux

---

## Phase 2: Runtime selection and distribution lanes

#### [shim] Task 2.1: Introduce runtime-only JS selectors and rewire runtime bins

**Status:** done

**Depends:** Task 1.3, Task 1.4

Add the dedicated selector for runtime-owned bins and rewire those bins through
the new `wp hook <name>` route in one file-owning task. Keeping selector
creation and runtime-bin rewiring together avoids a two-step serial chain while
still isolating the work from plugin release staging and npm package topology.

**Files:**

- Create: `bin/_run-runtime.js`
- Modify: `bin/wp.js`
- Modify: `bin/wp-pretool-guard.js`
- Modify: `bin/wp-post-tool.js`
- Modify: `bin/wp-stop-qa.js`
- Modify: `bin/wp-guard-switch.js`
- Modify: `bin/wp-sessionstart-routing.js`
- Create: `scripts/runtime-bin-launcher.test.ts`

**Steps (TDD):**

1. Write failing launcher tests that prove runtime bins no longer prefer source
   files and instead resolve a host binary or throw an actionable missing-binary
   error.
2. Run: `wp_test({"files":["scripts/runtime-bin-launcher.test.ts"]})`
   — verify FAIL.
3. Implement the runtime selector and rewire only the runtime-owned bin shims.
4. Re-run the same command — verify PASS.

**Acceptance:**

- [x] Runtime-owned bins never resolve `src/*.ts`
- [x] Hook bins route through `wp hook <name>` after selector resolution
- [x] Missing host binaries fail with actionable diagnostics
- [x] Docs/dev helper bins are untouched by this blueprint

#### [plugin-release] Task 2.2: Stage compiled runtime artifacts into plugin release refs

**Status:** done

**Depends:** Task 1.3, Task 1.5

Teach the release artifact flow to place compiled runtime binaries inside the
git-cloned plugin surface so Claude marketplace installs can work without npm
install hooks. This task is intentionally limited to **artifact staging**; the
release workflow wiring is split out so end-to-end plugin proof can run in
parallel with publish-flow integration.

**Files:**

- Create: `scripts/stage-plugin-runtime-artifacts.ts`
- Create or modify: `scripts/stage-plugin-runtime-artifacts.test.ts`

**Steps (TDD):**

1. Add a failing test or scripted dry-run that asserts the staged release
   artifact includes the selected runtime binaries at the expected paths.
2. Run the narrow verification surface for that script/test — verify FAIL.
3. Implement runtime-artifact staging.
4. Re-run the same verification — verify PASS.

**Acceptance:**

- [x] Release-tag/plugin-clone artifacts include the expected host binaries
- [x] The plugin lane no longer relies on npm lifecycle hooks for runtime binaries
- [x] Artifact layout is stable enough for selector-based plugin smoke tests

#### [npm] Task 2.3: Add per-platform runtime packages for npm installs

**Status:** done

**Depends:** Task 1.3

Introduce the npm distribution lane for runtime binaries without bloating the
main tarball. The main package keeps the JS selector; platform runtime packages
carry the actual Bun binary payloads and are discovered at runtime through
`optionalDependencies`. Avoid a postinstall symlink layer unless verification
shows the selector cannot resolve package-installed binaries directly.

**Files:**

- Create: `packages/agent-kit-runtime-darwin-arm64/package.json`
- Create: `packages/agent-kit-runtime-darwin-x64/package.json`
- Create: `packages/agent-kit-runtime-linux-x64/package.json`
- Create: `packages/agent-kit-runtime-linux-arm64/package.json`
- Create: `packages/agent-kit-runtime-windows-x64/package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json` (`optionalDependencies` and any minimal metadata required)
- Modify as needed: package-surface/release metadata files

**Steps (TDD):**

1. Write failing package-contract coverage that expects the main package to
   declare the runtime packages as optional dependencies with the supported
   matrix.
2. Run the narrow package-contract/package-surface verification — verify FAIL.
3. Add the platform packages and minimal root wiring.
4. Re-run the same verification — verify PASS.

**Acceptance:**

- [x] Main package does not carry all platform binaries directly
- [x] Runtime packages are limited to the explicit supported matrix
- [x] Workspace/release metadata is updated consistently if the repo becomes multi-package

#### [qa] Task 2.4: Add a compiled-registry completeness guard

**Status:** done

**Depends:** Task 1.2

Once compiled mode stops scanning the filesystem, tool drift becomes the new
risk: a maintainer can add `src/mcp/tools/foo.ts` and forget to register it in
the compiled registry. Add a small guard that compares the tool directory with
the compiled registry contract so the binary path cannot silently lag behind the
disk path.

**Files:**

- Create: `src/mcp/tools/registry-completeness.test.ts`

**Steps (TDD):**

1. Write a failing test that compares the compiled registry against the tool
   directory and flags missing runtime registrations.
2. Run: `wp_test({"files":["src/mcp/tools/registry-completeness.test.ts"]})`
   — verify FAIL.
3. Adjust the compiled registry contract until the test passes.
4. Re-run the same command — verify PASS.

**Acceptance:**

- [x] Compiled registry drift is caught automatically
- [x] Adding a new MCP tool now requires one explicit, test-enforced registration step

#### [release] Task 2.5: Wire plugin runtime artifact staging into the publish flow

**Status:** done

**Depends:** Task 2.2

Integrate the already-tested plugin runtime staging step into the actual release
workflow. This is split from Task 2.2 so the release-like plugin smoke can
start as soon as staging works, instead of waiting on workflow/publish edits.

**Files:**

- Modify: `.github/workflows/release.yml`
- Modify: `scripts/release-publish.ts`
- Create or modify: `src/build/plugin-release-flow.test.ts`

**Steps:**

1. Add a failing dry-run release/workflow assertion that the publish path
   invokes runtime-artifact staging before plugin-facing artifact verification.
2. Run the narrow release-flow verification — verify FAIL.
3. Wire the staging step into release publish/workflow code.
4. Re-run the same verification — verify PASS.

**Acceptance:**

- [x] Release workflow invokes plugin runtime staging
- [x] Publish flow and staged plugin artifact layout stay aligned
- [x] Workflow wiring no longer blocks end-to-end plugin smoke

---

## Phase 3: End-to-end proofs

#### [qa] Task 3.1: Prove the plugin release-ref lane end to end

**Status:** done

**Depends:** Task 1.1, Task 2.1, Task 2.2, Task 2.4

Exercise a release-like plugin artifact exactly the way Claude Code consumes
it: selector-based `node .../bin/wp.js mcp`, `initialize`, `tools/list`, and
all plugin hook invocations. Reuse existing hook/MCP verification surfaces where
possible instead of creating a parallel smoke universe.

**Files:**

- Modify as needed: `src/hooks/doctor.ts`
- Create: `src/build/plugin-runtime-release.integration.test.ts`

**Steps (TDD):**

1. Write a failing integration test that stages a release-like plugin artifact
   and performs an SDK-backed MCP handshake plus hook invocations through the
   selector path.
2. Run: `wp_test({"files":["src/build/plugin-runtime-release.integration.test.ts"]})`
   — verify FAIL.
3. Implement the missing staging/selector/runtime pieces.
4. Re-run the same command — verify PASS.
5. Run: `vp run hooks:doctor` against the staged artifact path if the doctor
   surface needs an artifact-aware mode.

**Acceptance:**

- [x] Release-like plugin artifact serves MCP successfully
- [x] `tools/list` returns the expected tool set
- [x] All plugin hook entrypoints execute without `src/*.ts` resolution
- [x] Plugin lane failures are diagnosable through existing doctor/smoke surfaces

#### [qa] Task 3.2: Prove the packed npm lane end to end

**Status:** done

**Depends:** Task 1.1, Task 1.2, Task 1.6, Task 2.1, Task 2.3

Extend the packed-consumer smoke so an npm-installed consumer exercises the
selector + optionalDependency runtime path and still keeps the library/export
contract green. This task proves the main package can stay slim while the host
runtime still resolves cleanly from installed platform packages.

**Files:**

- Modify: `scripts/public-consumer-smoke.ts`
- Modify as needed: `package.contract.test.ts`

**Steps (TDD):**

1. Add a failing packed-consumer scenario that installs the tarball, invokes the
   runtime selector, and verifies library subpath imports still resolve.
2. Run: `wp_test({"files":["package.contract.test.ts"]})` — verify FAIL.
3. Extend the packed-consumer smoke to cover the runtime selector lane.
4. Re-run: `wp_test({"files":["package.contract.test.ts"]})` — verify PASS.

**Acceptance:**

- [x] Packed npm consumer resolves a host runtime binary with no `src/*.ts`
- [x] Packed Node library subpaths still work
- [x] Failure modes for missing/omitted optional runtime packages are actionable

---

## Phase 4: Release and guardrail integration

#### [gate] Task 4.1: Integrate dual-lane verification into release/package-surface/public-readiness gates

**Status:** done

**Depends:** Task 2.5, Task 3.1, Task 3.2

Finish the blueprint by wiring both distribution lanes into the repo's existing
public-package safety contract. The release flow must prove: (1) plugin release
refs contain the committed runtime artifacts expected by the selector, (2) npm
tarballs keep a clean surface and resolve the host runtime package, and (3)
library subpaths remain intact. Use the current guardrails instead of inventing
new umbrella scripts.

**Files:**

- Modify: `scripts/public-readiness.ts`
- Modify as needed: `src/audit/package-surface.test.ts`
- Modify as needed: `package-surface.json`
- Modify as needed: release workflow/docs touched by Tasks 2.3-2.5

**Steps (TDD):**

1. Add failing release/package-surface/public-readiness assertions for the new
   plugin-runtime and npm-runtime lanes.
2. Run: `wp_test({"files":["src/audit/package-surface.test.ts","package.contract.test.ts"]})`
   and `wp_audit({"kind":"package-surface"})` — verify FAIL.
3. Implement the final gate wiring.
4. Re-run the same checks plus `vp run public:readiness` — verify PASS.

**Acceptance:**

- [x] Package-surface and public-readiness gates know about both runtime lanes
- [x] Release verification proves plugin clone artifacts and npm tarballs separately
- [x] No shipped/plugin-installed runtime path resolves `src/*.ts`

## Verification Gates

| Gate             | Command                                                                                  | Success Criteria                                  |
| ---------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Build            | `vp run build`                                                                           | Build passes with no selector/runtime regressions |
| Focused tests    | `wp_test({...})` per task                                                                | Targeted files pass                               |
| Type safety      | `wp_typecheck({"cwd":"."})`                                                              | Zero type errors                                  |
| Repo lint        | `vp run lint`                                                                            | Zero lint violations                              |
| Package contract | `wp_test({"files":["src/config/export-resolution.test.ts","package.contract.test.ts"]})` | Library + packed-consumer contract pass           |
| Package surface  | `wp_audit({"kind":"package-surface"})`                                                   | Pass                                              |
| Public readiness | `vp run public:readiness`                                                                | Pass for the updated release/runtime contract     |
| Hooks doctor     | `vp run hooks:doctor`                                                                    | Plugin hook/runtime health passes                 |

## Cross-Plan References

| Type       | Blueprint                                                  | Relationship                                                                                               |
| ---------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Upstream   | `completed/agent-kit-claude-plugin-marketplace`            | Defines the plugin marketplace release-ref clone contract that makes committed plugin artifacts mandatory  |
| Upstream   | `completed/agent-kit-public-npm-cutover-implementation`    | Owns public npm/package-surface/public-readiness expectations that this blueprint must extend, not replace |
| Upstream   | `completed/make-wp-own-generic-tool-runtime-for-consumers` | Establishes runtime-owned command/package-surface boundaries this blueprint must preserve                  |
| Downstream | None                                                       | —                                                                                                          |

## Edge Cases and Error Handling

| Edge Case                                                                      | Risk                                                   | Solution                                                                    | Task          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------- | ------------- |
| Plugin release ref lacks compiled binaries                                     | Marketplace install still fails even if npm lane works | Stage binaries into release refs and smoke them directly                    | 2.2, 3.1      |
| Compiled MCP registry misses a newly added tool                                | Binary lane silently diverges from dev lane            | Registry completeness guard                                                 | 2.4           |
| `npm install --omit=optional` or unsupported platform                          | Main package installs without a runtime binary         | Selector throws an actionable “missing host runtime package” error          | 2.1, 3.2      |
| Library contract is regressed while fixing runtime                             | Public config subpaths break for consumers             | Keep export-resolution + package-contract coverage as a protected invariant | 1.6, 3.2      |
| Plugin manifest version drifts again                                           | Marketplace metadata becomes inconsistent              | Version-sync test                                                           | 1.5           |
| Team conflates compiled-runtime goal with repo-wide compiled-build-script goal | Scope balloons and stalls                              | Keep repo-local `bun src/...` build scripts explicitly out of scope         | F6, Non-goals |
| Hook-router changes and runtime-bin rewiring drift apart                       | Hook bins resolve but target the wrong CLI contract    | Implement router in Wave 0, then rewire bins in a single owning task        | 1.4, 2.1      |

## Non-goals

- Compiling every repo-local build/release script in `scripts/` or `src/build/`.
- Rewriting the public Node library/export surface away from `dist/esm`.
- Adding musl or Windows ARM64 runtime packages in the first cut.
- Converting docs/dev helper bins (`docs-lint`, `docs-check-*`, dev-link helpers)
  to compiled-runtime selectors in this blueprint.
- Reworking MCP tool behavior beyond what is required for compiled registration
  and stable stdio lifetime.

## Risks

| Risk                                                               | Impact | Mitigation                                                                                       |
| ------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------ |
| Compiled-mode MCP registration is more invasive than expected      | High   | De-risk first with Task 1.2 and drift-guard it in Task 2.4                                       |
| Plugin lane and npm lane diverge in layout                         | High   | Use one selector contract and prove both lanes against it                                        |
| Platform package sprawl complicates release automation             | Medium | Keep the supported matrix explicit and integrate it into existing release/public-readiness gates |
| Binary size or artifact count bloats the wrong surface             | Medium | Keep plugin and npm packaging lanes separate; enforce package-surface checks                     |
| Maintainers accidentally widen scope into all Bun-executed scripts | Medium | Keep the runtime-only scope explicit in docs/tests and non-goals                                 |

## Technology Choices

| Component                | Technology                                                                      | Version / Contract                                            | Why                                                              |
| ------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| Runtime binary           | `bun build --compile`                                                           | current Bun target matrix                                     | Produces self-contained runtime artifacts                        |
| Host selector            | Node JS launcher                                                                | existing shipped `bin/*.js` pattern, narrowed to runtime bins | Cross-platform selection for both plugin clones and npm installs |
| Plugin distribution      | git-cloned release refs                                                         | existing Claude plugin marketplace contract                   | Matches current plugin install reality                           |
| npm runtime distribution | `optionalDependencies` + platform packages                                      | npm package.json contract                                     | Keeps main tarball small                                         |
| Library surface          | `dist/esm` + `exports` + `dist/esm/package.json#imports`                        | existing passing contract                                     | Already works; do not destabilize                                |
| Verification             | existing repo gates (`wp_test`, `wp_audit`, `public-readiness`, `hooks:doctor`) | current repo contract                                         | Reuse proven public-package safety surfaces                      |

## Refinement Summary

| Metric                            | Value   |
| --------------------------------- | ------- |
| Findings total                    | 11      |
| Critical                          | 1       |
| High                              | 5       |
| Medium                            | 4       |
| Low                               | 1       |
| Fixes applied to plan             | 11/11   |
| Cross-plans updated in references | 3       |
| Total tasks                       | 14      |
| Critical path                     | 4 waves |
| Max planned parallel agents       | 6       |
| Parallelization score             | A       |
| Blueprint compliant tasks         | 14/14   |

## Completion Evidence

Verified on 2026-05-29:

- `node bin/wp.js typecheck`
- `node bin/wp.js lint`
- `node bin/wp.js audit no-relative-parent-imports`
- `node bin/wp.js audit absolute-path-policy --root .`
- `node bin/wp.js audit package-surface`
- `printf '' | node bin/wp-pretool-guard.js`
- Focused runtime tests:
  `scripts/bin-launcher.test.ts`, `src/build/runtime-targets.test.ts`,
  `scripts/build-runtime-binaries.test.ts`,
  `scripts/stage-plugin-runtime-artifacts.test.ts`,
  `src/build/package-manifest.test.ts`,
  `src/build/validate-plugin-manifest.test.ts`,
  `src/mcp/tools/_registry.test.ts`, `src/mcp/auto-discover.test.ts`,
  `scripts/release-publish.test.ts`, `src/mcp/cli.integration.test.ts`,
  `src/mcp/server.integration.test.ts`
- Full non-integration suite:
  `node node_modules/vitest/vitest.mjs run --exclude '**/*.integration.test.ts' --testTimeout 30000`
  passed with 367 files and 4669 tests.
- Integration suite was run in smaller batches after the monolithic serialized
  command was terminated by signal 143; every integration file listed by
  `rg --files | rg '\.integration\.test\.ts$'` passed in batch or individual
  execution, including the MCP stdio/server tests and init/setup tests.
- `bun scripts/public-consumer-smoke.ts --setup-only`
- `bun scripts/public-readiness.ts`

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                               |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/ship-wp-as-compiled-bun-binary/\_overview.md |

### Material Decisions

| ID  | Decision                                                                   | Chosen option                          | Rejected alternatives                                      | Rationale                                                                       |
| --- | -------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| D1  | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate      | Command                      | Expected outcome | Last result                      |
| --------- | ---------------------------- | ---------------- | -------------------------------- |
| lifecycle | wp audit blueprint-lifecycle | pass             | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

None.
