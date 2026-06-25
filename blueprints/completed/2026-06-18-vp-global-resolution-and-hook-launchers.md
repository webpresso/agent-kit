---
type: blueprint
title: Global vp resolution and packaged hook launcher repair
status: completed
complexity: M
owner: agent-kit
created: "2026-06-18"
last_updated: "2026-06-19"
progress: "100%"
tags:
  - setup
  - update
  - hooks
  - release
---

# Global vp resolution and packaged hook launcher repair

## Summary

Fix the setup/update path that refreshes global tooling so it resolves a
user-global-capable `vp` executable instead of accidentally using a project or
Vite+ runtime-local `vp`. Repair managed hook launchers so generated
path-stable hooks execute packaged internal hook wrappers that exist in the npm
package.

This PR intentionally does not embed Vite+ into `wp`; standalone install policy
and release asset integrity checks remain follow-up scope.

## Acceptance

- [x] Global-capable `vp` lookup scans PATH candidates, resolves symlinks, and
      rejects project `node_modules` and `.vite-plus/js_runtime` candidates.
- [x] `wp setup`, auto-update, and `wp update` global refresh paths execute an
      absolute global-capable `vp` command.
- [x] Managed hook launchers execute packaged internal `bin/wp-*.js` wrappers
      without relying on shell PATH.
- [x] Internal hook wrappers are included in packed artifacts but are not
      exposed in `package.json#bin`.
- [x] `wp gain` continues to render the Webpresso gain output; RTK-only output
      is treated as stale global `wp` fallout rather than a source change.

## Tasks

#### [setup] Task 1.1: Resolve global-capable `vp` for setup/update callers [Complexity: S]

**Status:** done
**Depends:** None

**Files:**

- Add: `src/cli/global-vp.ts`
- Modify: `src/cli/auto-update/detect-pm.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-kit-global/index.ts`
- Modify: `src/cli/commands/init/scaffolders/codex-cli/index.ts`
- Modify: `src/cli/commands/init/scaffolders/omx/index.ts`
- Modify: `src/cli/commands/package-manager.ts`

**Change:** Resolve a user-global-capable `vp` by scanning PATH, realpathing candidates, rejecting project/runtime-local shims, and passing the absolute command to global refresh paths.

**Verify:** Targeted resolver/setup/update tests, build, typecheck, lint.

**Acceptance:**

- [x] Runtime-local and project-local `vp` candidates are skipped.
- [x] Setup, auto-update, OMX/Codex refresh, and `wp update` use the resolved launch plan.

---

#### [hooks] Task 1.2: Package internal managed hook wrappers [Complexity: S]

**Status:** done
**Depends:** Task 1.1

**Files:**

- Add: `bin/wp-sessionstart-routing.js`
- Add: `bin/wp-pretool-guard.js`
- Add: `bin/wp-post-tool.js`
- Add: `bin/wp-guard-switch.js`
- Add: `bin/wp-stop-qa.js`
- Add: `bin/wp-precompact-snapshot.js`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/index.ts`
- Modify: `package-surface.json`

**Change:** Add internal hook wrapper files and render managed launchers that execute those packaged files with `process.execPath` after changing to the repository root.

**Verify:** Hook scaffolder smoke tests and package manifest dry-run test.

**Acceptance:**

- [x] Hook launchers are path-stable and do not rely on shell PATH.
- [x] Internal wrappers are packed but not exposed as public `package.json#bin` entries.

---

#### [verification] Task 1.3: Lock the stale-`wp` and release-surface behavior [Complexity: XS]

**Status:** done
**Depends:** Task 1.1, Task 1.2

**Files:**

- Modify: `src/build/package-manifest.test.ts`
- Modify: targeted setup/update/hook tests

**Change:** Add targeted regression coverage for the resolver, absolute command usage, managed hook packaging, and existing `wp gain` output while leaving `wp gain` source unchanged.

**Verify:** Targeted Vitest suite and final PR gates.

**Acceptance:**

- [x] Current `wp gain` output remains covered without source changes.
- [x] Final verification gates pass.

## Verification

- [x] Targeted Vitest coverage for setup/update `vp` resolution and hook launchers.
- [x] `npm pack --dry-run` includes internal hook wrappers.
- [x] `vp run build`
- [x] `vp run typecheck`
- [x] `vp run lint`
- [x] `vp run verify:paths`
- [x] `vp run verify:secrets`
- [x] `vp run changeset:status`

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                                        |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-18-vp-global-resolution-and-hook-launchers.md |

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
