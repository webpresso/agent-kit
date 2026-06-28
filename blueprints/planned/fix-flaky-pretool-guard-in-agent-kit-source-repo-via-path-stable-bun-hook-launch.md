---
type: blueprint
title: Fix flaky pretool-guard in agent-kit source repo via path-stable hook launcher
status: planned
complexity: S
owner: ozby
created: "2026-06-27"
last_updated: "2026-06-27"
progress: "0% (0/4 tasks done, 0 blocked, updated 2026-06-27)"
tags:
  - hooks
  - dx
  - reliability
  - path-stability
---

# Fix flaky pretool-guard in agent-kit source repo via path-stable hook launcher

## Product wedge anchor

- **Stage outcome:** VISION 'Locked safety surfaces' + agent-guide.md 'Generated hook runtimes must be path-stable' — a webpresso engineer working in the agent-kit source repo can rely on the pretool-guard instead of fighting it.
- **Consuming surface:** The generated Claude/Codex pretool-guard hook command (buildDirectWpHookCommand into .claude/settings.json and .codex/hooks.json), emitted by wp setup from src/cli/commands/init/scaffolders/agent-hooks/index.ts.
- **New user-visible capability:** Every Write/Edit in the agent-kit source repo runs the guard reliably; no more spurious 'wp not found on PATH' denials that block legitimate edits.

## Summary

In the **agent-kit source repo only**, the pretool-guard hook intermittently denies a Write/Edit with `wp not found on PATH. Install with vp install -g @webpresso/agent-kit and re-run wp setup` — even though `wp` is installed.

### Root cause (reproduced)

The source-repo hook command (`buildDirectWpHookCommand`, agent-hooks/index.ts:104) runs the baked node plus `bin/wp hook <subcommand>` under `WP_FORCE_SOURCE=1`; a non-zero inner exit trips the fail-closed `PRETOOL_GUARD_MISSING_DENY` (index.ts:64). Two path-instabilities cause that under a sanitized hook PATH:

1. The baked node is the **vite-plus shim**; when `wp setup` runs under bun/compiled-wp, `resolveNodeForHookLauncher` (index.ts:79-82) bakes the shim via its `pathCandidates('node')` fallback. The shim needs a real `node` on PATH; under a minimal PATH it aborts (`vp: Recursion detected`) -> exit 1.
2. The inner bun source-launch resolves bun by **bare name** (`bin/_run.js:543`). Off a sanitized PATH the spawn ENOENTs -> exit 1.

**Intermittent, not deterministic:** the deny appears only when the hook PATH lacks a real node/bun, which varies by host/session. (Observed live in this session: the same guard fail-opened on a cold start and denied when warm.)

### Reproduction

`env PATH=/usr/bin:/bin WP_FORCE_SOURCE=1 /Users/ozby/.vite-plus/bin/node ROOT/bin/wp hook pretool-guard` -> `vp: Recursion detected` exit 1 (false deny). `env PATH=/usr/bin:/bin /opt/homebrew/bin/bun ROOT/src/cli/cli.ts hook pretool-guard` -> `{}` exit 0 (correct).

### Fix — hook-time launcher prelude (resolved when the hook fires, NOT setup-baked)

For the source repo (`sourceRepoHooksMustForceSource(repoRoot)`), replace the node+bin/wp indirection with a POSIX prelude that picks the launcher **at hook time** (surviving bun moving, a runtime built after setup, or a sanitized PATH), preferring path-stable + fast:

1. The compiled `bin/runtime/ID/wp` binary if `-x` (absolute, fast, install-faithful per cmd-execution.md). NOTE `bin/runtime/` is **gitignored** (0 tracked files), present only after a local build, so a _preference_, not a requirement.
2. else an **absolute** bun (`$BUN` or an absolute candidate dir that is `-x`) launching `REPOROOT/src/cli/cli.ts hook SUBCOMMAND`.
3. else **fail closed**: emit the existing pretool deny / json-only fallback. Never emit a path-unstable bare `bun`.

Hard constraints (codex review): quote every path; absolute candidates only; **no `command -v`, no `eval`, no bare `bun`**; require `-x`; preserve `status -eq 2 then exit 2` exactly; never fall back from a compiled-runtime exit-2 policy denial to bun. Consumers keep today's node+bin/wp command unchanged.

### Considered & rejected

- **Single absolute path baked at setup time** — not temporally stable for version-manager bun and goes stale when `bin/runtime` appears/disappears. Superseded by hook-time resolution.
- **Resolve bun absolutely but keep node+bin/wp** — still depends on the vp-node shim. Rejected.
- **Compiled-binary-only** — fails in fresh unbuilt clones. Adopted only as first _preference_.
- **Bare `bun` last resort** — path-unstable under sanitized PATH; replaced by fail-closed deny.

### Tradeoff (named)

When runtime hooks are enabled, `bin/_run.js` (buildLaunchPlan) routes source-repo hook dispatch through the compiled runtime to mirror the install contract; the new command bypasses `_run.js`, but the chain's first preference (compiled binary if present) preserves the install-faithful path. `bin/_run.test.ts` keeps testing `buildLaunchPlan` directly and stays green; note there it no longer covers the generated hook's shipped path.

### Out of scope / locked

Consumer hook shape unchanged; fail-closed deny policy unchanged (only stop firing it spuriously); **win32 out of scope** (POSIX sh); secret surfaces and policy validators untouched; 20s source-repo JIT hook timeout (index.ts:440-457) left as-is.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-27T21:40:52.458Z
- verified-head: 741b2bef55a9d90f57ed09bcaf40e0d32f54769e
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                                                                                                   | Evidence                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| C1  | The source-repo hook command runs the baked node plus bin/wp with the hook subcommand under WP_FORCE_SOURCE=1, and a non-zero inner exit triggers the fail-closed deny.                 | repo:src/cli/commands/init/scaffolders/agent-hooks/index.ts; repo:src/cli/commands/init/source-repo-hook-policy.ts |
| C2  | The inner bun source-launch resolves bun by bare name, and the baked node can be the vite-plus shim; both fail under a sanitized hook PATH.                                             | repo:bin/\_run.js; repo:src/runtime/command-exists.ts                                                              |
| C3  | The compiled runtime binaries under bin/runtime exist locally but bin/runtime is gitignored, so the fix cannot depend on the binary being present in a fresh clone.                     | repo:.gitignore; repo:bin/runtime-manifest.json                                                                    |
| C4  | An absolute-bun launch of the CLI source returns empty-json exit 0 under a sanitized PATH, while the current node-plus-bin/wp chain fails; the fix routes to the CLI source entrypoint. | repo:src/cli/cli.ts; repo:bin/\_run.js                                                                             |

### Material Decisions

| ID  | Decision                         | Chosen option                                                                         | Rejected alternatives                     | Rationale                                                                                                        |
| --- | -------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| D1  | Launcher resolution timing       | Resolve at hook time via a POSIX prelude                                              | Bake a single absolute path at setup time | A setup-baked path goes stale for version-manager bun and when bin/runtime appears or disappears (codex review). |
| D2  | Launcher preference              | The compiled bin/runtime binary if executable, else an absolute bun on src/cli/cli.ts | Compiled-only; bun-only                   | Compiled is fast and install-faithful but gitignored, so bun-source is the required fallback.                    |
| D3  | Behavior when nothing resolvable | Fail closed with the existing pretool deny                                            | Emit a bare bun last resort               | A bare bun is path-unstable under a sanitized PATH and reintroduces the bug (codex blocking change).             |
| D4  | Consumer command                 | Leave byte-identical to today                                                         | Apply the prelude everywhere              | Consumers run compiled dist and must not require bun; scope stays minimal.                                       |

### Promotion Gates

| Gate       | Command                  | Expected outcome | Last result                      |
| ---------- | ------------------------ | ---------------- | -------------------------------- |
| trust-gate | wp audit blueprint-trust | pass             | pass at 2026-06-27T21:40:52.458Z |

### Residual Unknowns

None.

## Implementation notes

Implementation-time verification (test/typecheck/lint) lives in Task 1.4 below; it is not a draft-to-planned promotion gate because those tests assert behavior this blueprint has not implemented yet.

#### Task 1.1: Injectable launcher resolver (compiled binary then absolute bun, no bare-bun)

**Status:** todo
**Wave:** 0

Pure resolver (injected platform/arch/env/exists-probe): compiled bin/runtime binary (existsSync+executable), then $BUN if absolute and executable, then an absolute candidate dir that is executable (/opt/homebrew/bin/bun, ~/.bun/bin/bun, /usr/local/bin/bun). NO command -v, NO bare bun. Returns a discriminated result (compiled, bun, or none). Existing means existsSync-filtered (command-exists.ts:59-78).

**Acceptance:**

- [ ] Resolver is pure/deterministic; unit-tested for compiled-present, bun-absolute-present, and nothing-resolvable (none).
- [ ] Never returns a bare bun or a relative path.

#### Task 1.2: Emit the hook-time launcher prelude for the source repo

**Status:** todo
**Wave:** 0

When sourceRepoHooksMustForceSource(repoRoot), emit a POSIX prelude resolving the launcher at hook time: prefer the executable compiled runtime binary, else an executable absolute bun on src/cli/cli.ts, else fail closed. Quote all paths; no command -v, eval, or bare bun; preserve status -eq 2 then exit 2; do not fall back from an exit-2 denial to bun. No bin/wp and no vp-node shim. Drop the vestigial WP_FORCE_SOURCE=1 or document why cli.ts needs it.

**Acceptance:**

- [ ] Source-repo command has the compiled-binary branch, the absolute-bun-on-cli.ts branch, and a fail-closed deny when neither is executable.
- [ ] No bin/wp launcher, no vp-node shim, no command -v, no bare bun in the emitted command.
- [ ] Consumer command byte-identical to today; hookCommandEnvPrefix import removed if unused; cognitive complexity at most 8.

#### Task 1.3: Replace the enshrined-bug test plus host-independent regressions

**Status:** todo
**Wave:** 0

Replace the 'uses node instead of bun when source-mode setup emits hook commands' test (around index.test.ts:1153) with substring assertions on the new shape (NOT helper-equality). Add host-independent regressions that stub PATH and place fake executables on disk and assert exit codes.

**Acceptance:**

- [ ] Branch coverage: compiled-present, absolute-bun fallback, and nothing-resolvable then fail-closed deny.
- [ ] Regression: fresh clone (bin/runtime absent) under a sanitized PATH still runs empty-json exit 0; runtime-appears-after-setup is picked up because resolution is at hook time.
- [ ] status -eq 2 then exit 2 preservation asserted.

#### Task 1.4: Scoped verification

**Status:** todo
**Wave:** 1

Verify on the changed surface only.

**Acceptance:**

- [ ] wp test --file src/cli/commands/init/scaffolders/agent-hooks/index.test.ts green.
- [ ] wp typecheck and wp lint green on the changed file.
- [ ] Note in bin/\_run.test.ts that the runtime-hooks to compiled-dispatch contract is no longer exercised by the generated source-repo hook.
