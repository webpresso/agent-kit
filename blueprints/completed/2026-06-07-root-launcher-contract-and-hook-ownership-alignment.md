---
type: blueprint
title: Root launcher contract and hook ownership alignment
owner: ozby
status: completed
completed_at: "2026-06-07"
complexity: M
created: "2026-06-07"
last_updated: "2026-06-07"
progress: "100% (6/6 tasks done, 0 blocked, verified and finalized 2026-06-07)"
depends_on: []
tags:
  - distribution
  - hooks
  - launcher
  - native-runtime
  - package-surface
---

# Root launcher contract and hook ownership alignment

## Product wedge anchor

- **Stage outcome:** turn the shipped tactical launcher fixes into one explicit shared contract.
- **Consuming surface:** root `package.json#bin`, root `bin/wp`, global self-refresh / launcher
  repair, `public-readiness`, `package-surface`, `wp hooks doctor`, and hook diagnostics.
- **New user-visible capability:** diagnostics distinguish the hard-cut root `bin/wp` entrypoint
  from plugin-owned native launch surfaces and bounded stale OMX hook repair.

## Planning Summary

This completed blueprint is the canonical launcher-policy record after the
2026-06-07 thin-root release unblock. It documents the shipped hard cut:
`package.json#bin.wp = bin/wp`, no `bin/wp.js` compatibility shim, plugin-owned
native launch surfaces staying pure-native, and Homebrew wording remaining
bootstrap-only.

Root package contract:

- `package.json#bin.wp = bin/wp`
- root `bin/wp` is the real JavaScript dispatcher with a Node shebang
- native payload ownership is externalized to runtime packages and plugin-owned native launch surfaces

Plugin/native contract:

- plugin-owned launch surfaces keep the pure-native, no-node contract
- root package `bin/wp` is **not** a plugin-native payload and is the JS dispatcher
- OMX plugin-cache repair is a bounded stale-surface rewrite for positively identified stale OMX
  plugin hooks, not a permanent agent-kit ownership model

## Source references

- npm `bin` maps command names to package-local files and links them for global/package installs:
  <https://docs.npmjs.com/cli/v7/configuring-npm/package-json/#bin>
- Node shebang launchers use an interpreter line such as `#!/usr/bin/env node` and require executable
  permission for direct script execution:
  <https://nodejs.org/learn/command-line/run-nodejs-scripts-from-the-command-line>
- zsh startup-file semantics distinguish `.zshenv`, `.zprofile`, `.zshrc`, `.zlogin`, and `.zlogout`;
  broadly sourced files must stay quiet / non-TTY-safe:
  <https://zsh.sourceforge.io/Intro/intro_3.html>
- Homebrew Bundle is bootstrap tooling, not exact patch-version locking; Homebrew is rolling release,
  and `brew bundle` has no Brewfile lock concept:
  <https://docs.brew.sh/Brew-Bundle-and-Brewfile#versions>

## Architecture Overview

```text
Root npm package
  package.json#bin.wp -> bin/wp
  bin/wp              -> real JS dispatcher (Node shebang, executable, not symlink)
  root tarball        -> no native runtime payload trees

Runtime/plugin payloads
  runtime packages    -> own platform-native binaries
  Claude plugin cache -> owns native ${CLAUDE_PLUGIN_ROOT}/bin/wp surfaces
  OMX plugin cache    -> bounded agent-kit stale-surface repair only when stale hooks are detected
```

## Key Decisions

| Decision                                                              | Rationale                                                                                                   |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Add one shared launcher-policy module.                                | Avoid duplicated heuristics across setup, readiness, package-surface, and hooks doctor.                     |
| Set `rootContractMode = "js-dispatcher-externalized-runtime"`.        | Names the shipped split: JS dispatcher in root, native runtime payloads externalized.                       |
| Keep `package.json#bin.wp = bin/wp`; do **not** move to `bin/wp.js`.  | npm `bin` already maps the public `wp` command to a package-local executable.                               |
| Validate root `bin/wp` as a real JS dispatcher file.                  | It must be executable, have a Node shebang, not be a symlinked runtime target, and not be a native payload. |
| Keep pure-native/no-node only on plugin-owned native launch surfaces. | Completed plugin hardening remains true without misapplying plugin constraints to the root npm dispatcher.  |
| Bound agent-kit repairs to agent-kit's own root launcher.             | Agent-kit must not become permanent owner of external plugin caches.                                        |
| Treat OMX cache rewriting as bounded stale-surface repair only.       | Durable ownership belongs in OMX setup/plugin generation.                                                   |
| Describe `Brewfile` only as Node bootstrap.                           | `.node-version` and `.nvmrc` own exact `24.16.0`; Homebrew formulae are not exact patch locks.              |

## Ownership boundary

Agent-kit owns preserving/repairing its own root package launcher at `bin/wp`, reporting the shared
root contract in readiness/audit/doctor surfaces, and bounded stale-surface detection/rewrite for
positively identified stale OMX plugin hooks.

OMX durably owns plugin-cache hook generation, future setup/plugin refresh behavior for its generated
hook surfaces, and the fix that removes the need for agent-kit stale-surface repair.

**Stale-surface repair removal condition:** delete the agent-kit OMX repair after OMX
setup/plugin generation ships a stable fix and `wp hooks doctor --skip-mcp` identifies no stale OMX
plugin-cache hook surfaces across a fresh setup and upgraded existing-user cache fixture.

## Quick Reference (Execution Waves)

| Wave          | Tasks           | Dependencies  | Parallelizable | Effort  |
| ------------- | --------------- | ------------- | -------------- | ------- |
| Wave 0        | 1.1, 1.4        | None          | 2 agents       | S, XS   |
| Wave 1        | 1.2, 1.3, 1.5   | 1.1           | 3 agents       | M, M, S |
| Wave 2        | 1.6             | 1.2, 1.3, 1.5 | 1 agent        | S       |
| Critical path | 1.1 → 1.2 → 1.6 | —             | 3 waves        | M       |

### Phase 1: shared launcher contract [Complexity: M]

#### [policy] Task 1.1: Add the shared root launcher-policy module

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/launcher/root-contract.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-07T19:12:18.354Z"}]
```

**Depends:** None

Create a shared policy module that exposes the root contract mode, expected root bin path, and a
validator for a real JS dispatcher file. The validator must reject native payloads, symlinks, and
symlinked runtime targets.

**Files:**

- Create: `src/launcher/root-contract.ts`
- Create: `src/launcher/root-contract.test.ts`

**Steps (TDD):**

1. Add failing tests for `rootContractMode = "js-dispatcher-externalized-runtime"` and expected path
   `bin/wp`.
2. Add fixture tests accepting an executable JS dispatcher with a Node shebang.
3. Add fixture tests rejecting a native-looking binary, any symlink, and any symlinked
   `bin/runtime/<target>/wp` target.
4. Implement the minimal shared contract module.
5. Run `wp_test` on the focused test file.

**Acceptance:**

- [x] Shared module names `rootContractMode = "js-dispatcher-externalized-runtime"`.
- [x] Shared module exports expected root bin path `bin/wp`.
- [x] Validator accepts a real executable JS dispatcher with a Node shebang.
- [x] Validator rejects native payload bytes, symlinks, and symlinked runtime targets.

#### [setup] Task 1.2: Use the shared contract in global self-refresh / launcher repair

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/cli/commands/init/scaffolders/agent-kit-global/index.test.ts","exit_code":0,"kind":"integration","result":"pass","target_files":["src/cli/commands/init/scaffolders/agent-kit-global/index.ts","src/cli/commands/init/scaffolders/agent-kit-global/index.test.ts"],"ts":"2026-06-07T19:12:18.354Z"}]
```

**Depends:** Task 1.1

Update `ensureAgentKitGlobal` and root launcher repair so agent-kit repairs only its own root
`bin/wp` back to the JS dispatcher contract. It must not overwrite plugin-owned native launch
surfaces.

**Files:**

- Modify: `src/cli/commands/init/scaffolders/agent-kit-global/index.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-kit-global/index.test.ts`

**Steps (TDD):**

1. Add a failing test where root `bin/wp` drifted to a native/runtime payload and setup repairs it.
2. Add a failing test proving plugin-owned native launch paths are not repaired or replaced.
3. Replace local root-bin assumptions with the shared launcher-policy module.
4. Run `wp_test` on touched setup tests.

**Acceptance:**

- [x] `ensureAgentKitGlobal` repairs agent-kit's own root `bin/wp` to the dispatcher contract.
- [x] Repair code does not clobber plugin-owned native launch surfaces.
- [x] Diagnostic output names `js-dispatcher-externalized-runtime`.
- [x] No `package.json#bin.wp` move to `bin/wp.js` is introduced.

#### [audit] Task 1.3: Reuse the shared contract in public-readiness and package-surface

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/audit/package-surface.test.ts --file scripts/public-readiness.test.ts","exit_code":0,"kind":"integration","result":"pass","target_files":["src/audit/package-surface.ts","src/audit/package-surface.test.ts","scripts/public-readiness.ts","scripts/public-readiness.test.ts"],"ts":"2026-06-07T19:12:18.354Z"}]
```

**Depends:** Task 1.1

Update root package readiness and package-surface checks so thin-root acceptance comes from the shared
launcher contract, not local heuristics.

**Files:**

- Modify: `scripts/public-readiness.ts`
- Modify: `scripts/public-readiness.test.ts`
- Modify: `src/audit/package-surface.ts`
- Modify: `src/audit/package-surface.test.ts`

**Steps (TDD):**

1. Add failing tests proving `public-readiness` accepts root `bin/wp` only through the shared contract.
2. Add failing tests proving `package-surface` accepts the thin-root launcher through the same contract
   and still rejects packed native payload trees.
3. Replace local launcher heuristics with the shared module.
4. Run `wp_test` on touched readiness and package-surface tests.

**Acceptance:**

- [x] Public-readiness reports the shared root contract mode.
- [x] Package-surface reports the shared root contract mode.
- [x] Thin-root acceptance does not come from local duplicated heuristics.
- [x] Denials for `bin/runtime/**`, `dist/runtime/**`, and `dist/runtime-packages/**` remain intact.

#### [docs] Task 1.4: Align Node bootstrap docs and config with official version semantics

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","audit_kind":"docs-frontmatter","command":"./bin/wp audit docs-frontmatter","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-07T19:12:18.354Z"}]
```

**Depends:** None

Clean docs/templates so `Brewfile` is described only as bootstrap for `node@24`; exact Node
`24.16.0` remains owned by `.node-version` and `.nvmrc`.

**Files:**

- Modify: `Brewfile`
- Modify: `catalog/base-kit/Brewfile.tmpl`
- Modify: `docs/getting-started.md`
- Modify: any other docs that claim Brew provides an exact Node patch lock

**Steps (TDD):**

1. Search docs/templates for claims that `Brewfile` or Homebrew pins exact Node patch versions.
2. Update wording so Homebrew is bootstrap-only and `.node-version` / `.nvmrc` own exact `24.16.0`.
3. Preserve zsh startup-file guidance: quiet PATH/env changes only in broadly sourced files;
   interactive aliases/functions only in interactive shell files.
4. Run `wp_audit(kind="docs-frontmatter")` and relevant docs audits if available.

**Acceptance:**

- [x] No repo doc claims Brew provides an exact patch-version lock for Node.
- [x] `Brewfile` is described only as bootstrap for `node@24`.
- [x] `.node-version` and `.nvmrc` remain the exact `24.16.0` owners.
- [x] zsh startup-file docs do not encourage noisy or TTY-assuming `.zshenv` snippets.

#### [hooks] Task 1.5: Bound hooks doctor root-contract reporting and OMX compatibility detection

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/hooks/doctor.test.ts","exit_code":0,"kind":"integration","result":"pass","target_files":["src/hooks/doctor.ts","src/hooks/doctor.test.ts"],"ts":"2026-06-07T19:12:18.354Z"}]
```

**Depends:** Task 1.1

Update `wp hooks doctor` so it reports the explicit root launcher contract and bounds any OMX
plugin-cache rewrite to positively identified stale OMX plugin hooks. Diagnostics must say durable
ownership belongs to OMX setup/plugin generation.

**Files:**

- Modify: `src/hooks/doctor.ts`
- Modify: `src/hooks/doctor.test.ts`

**Steps (TDD):**

1. Add failing tests for root-contract reporting: expected path `bin/wp`, contract mode, and
   dispatcher-vs-native explanation.
2. Add failing tests proving stale OMX plugin-cache detection only matches positively identified stale
   OMX hook surfaces.
3. Add failing tests proving unrelated plugin caches and plugin-owned native launch surfaces are not
   rewritten by agent-kit.
4. Implement bounded reporting/rewrite behavior through the shared launcher-policy module.
5. Run `wp_test` on touched hooks doctor tests.

**Acceptance:**

- [x] `wp hooks doctor --skip-mcp` reports the root contract mode and expected `bin/wp` path.
- [x] Diagnostics distinguish root JS dispatcher from plugin-owned native launch surfaces.
- [x] OMX plugin-cache rewriting is labeled bounded stale-surface repair.
- [x] Unrelated plugin caches are not rewritten.
- [x] Diagnostics state durable ownership belongs to OMX setup/plugin generation.

#### [qa] Task 1.6: Prove the end-to-end launcher contract and real paths

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/launcher/root-contract.test.ts --file src/cli/commands/init/scaffolders/agent-kit-global/index.test.ts --file src/hooks/doctor.test.ts --file src/audit/package-surface.test.ts --file scripts/public-readiness.test.ts --file src/mcp/cli.integration.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-07T19:12:18.354Z"},{"agent":"codex","audit_kind":"package-surface","command":"./bin/wp audit package-surface","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-07T19:12:18.354Z"},{"agent":"codex","audit_kind":"blueprint-lifecycle","command":"./bin/wp audit blueprint-lifecycle","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-07T19:12:18.354Z"},{"agent":"codex","command":"./bin/wp typecheck && ./bin/wp lint --file <touched-files> && --file ./bin/wp hooks doctor --skip-mcp && --file ./bin/wp setup --help","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-07T19:12:18.354Z"}]
```

**Depends:** Task 1.2, Task 1.3, Task 1.5

Run focused and broad verification gates, including real-path smoke proofs.

**Files:**

- Modify: none unless verification reveals a defect

**Steps (TDD):**

1. Run focused `wp_test` for touched launcher, setup, readiness, package-surface, and hooks doctor
   test files.
2. Run `wp_typecheck` and `wp_lint`.
3. Run required audits.
4. Run real-path proofs: `wp setup --help`, temp repo
   `wp setup --dry-run --host none --without base-kit --yes`, and `wp hooks doctor --skip-mcp`.
5. Record dated results before later moving the blueprint to `completed`.

**Acceptance:**

- [x] Focused test files pass through `wp_test`.
- [x] `wp_typecheck` passes.
- [x] `wp_lint` passes.
- [x] Required audits pass.
- [x] Real-path proofs pass and are recorded with dates.

## Verification Gates

| Gate                | Tool / command                                                      | Success Criteria                                                                        |
| ------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Focused tests       | `wp_test` on touched files                                          | Shared contract, setup repair, hooks doctor, readiness, and package-surface tests pass. |
| Typecheck           | `wp_typecheck`                                                      | No TypeScript errors.                                                                   |
| Lint                | `wp_lint`                                                           | No lint/style errors.                                                                   |
| Package surface     | `wp_audit(kind="package-surface")`                                  | Thin-root acceptance is shared-contract based; native payload trees stay denied.        |
| Docs frontmatter    | `wp_audit(kind="docs-frontmatter")`                                 | Blueprint/docs metadata remains valid.                                                  |
| Blueprint lifecycle | `wp_audit(kind="blueprint-lifecycle")`                              | New blueprint remains planned; completed blueprints stay completed.                     |
| Roadmap links       | `wp_audit(kind="roadmap-links")` if cross-links change              | All cross-blueprint links resolve.                                                      |
| Setup help smoke    | `wp setup --help`                                                   | Root launcher starts from the expected path.                                            |
| Temp setup dry run  | temp repo `wp setup --dry-run --host none --without base-kit --yes` | Setup resolves without mutating external plugin ownership.                              |
| Hooks doctor smoke  | `wp hooks doctor --skip-mcp`                                        | Doctor reports bounded root contract and compatibility diagnostics.                     |

## Cross-Plan References

- `blueprints/completed/2026-06-06-agent-kit-thin-root-package-surface-release-unblock.md` remains
  the canonical completed thin-root root-package decision.
- `blueprints/completed/2026-06-01-claude-plugin-native-runtime-hardening.md` remains the canonical
  completed plugin-owned pure-native/no-node launcher decision.
- `blueprints/completed/2026-06-01-agent-kit-global-distribution-mcp-runtime-fix.md` remains the
  canonical completed native distribution and publish/cutover decision.

## Non-goals

- Do not move `package.json#bin.wp` to `bin/wp.js`.
- Do not reopen, demote, or rewrite completed blueprint lifecycle truth.
- Do not make agent-kit the durable owner of OMX plugin-cache generation.
- Do not pack native runtime payloads into the root package.
- Do not claim Homebrew pins exact Node patch versions.

## Risks

| Risk                                                               | Impact                                                             | Mitigation                                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Shared contract validates plugin-native surfaces as root surfaces. | False failures or clobbering valid native plugin launchers.        | Keep the module explicitly scoped to root package `bin/wp`.                          |
| OMX stale-surface repair becomes permanent.                        | Ownership drift from OMX into agent-kit.                           | Keep the repair bounded, diagnostic, and removable once OMX owns the stale-hook fix. |
| Docs imply Brewfile exact patch locking.                           | Contributors trust a non-locking mechanism for exact Node control. | Make `.node-version` / `.nvmrc` the only exact `24.16.0` owners.                     |

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                                                    |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-07-root-launcher-contract-and-hook-ownership-alignment.md |

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
