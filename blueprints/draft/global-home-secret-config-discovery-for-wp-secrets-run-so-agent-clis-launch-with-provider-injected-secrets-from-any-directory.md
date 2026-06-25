---
type: blueprint
status: draft
complexity: M
created: "2026-06-22"
last_updated: "2026-06-22"
progress: "0% (drafted)"
depends_on: []
cross_repo_depends_on: []
tags: [secrets, cli, dx, wp-secrets-run, with-secrets]
---

# Global/home secret-config discovery for wp secrets run so agent CLIs launch with provider-injected secrets from any directory

**Goal:** Let `wp secrets run -- <cmd>` (and the `with-secrets` launcher `wp init` already advertises) resolve a secret config from a global/home location and inject provider secrets into a child that runs in the **user's original working directory** — so agent CLIs (Claude Code, Codex) and GUI clients can be launched from anywhere with no eager per-shell secret fetch and no direct `doppler` call in the user's shell.

## Product wedge anchor

- **Stage outcome:** Tier-1 agent-CLI support (Claude Code, Codex) per [`catalog/agent/rules/supported-agent-clis.md`](../../catalog/agent/rules/supported-agent-clis.md): secret injection must work for the supported CLIs in real developer use, not only inside a repo root.
- **Consuming surface:** the `wp secrets run` CLI verb and the `with-secrets -- <cmd>` launcher that `wp init` writes into Codex/Claude guidance (`src/cli/commands/init/index.ts:567,572`).
- **New user-visible capability:** a developer can launch `claude` / `codex` / Cursor from _any_ directory and have Context7/Exa (and other) keys injected by the secret provider — replacing eager `doppler secrets get`/`launchctl setenv` in shell rc files, satisfying the `agent-guide.md` "never cache credentials to disk; lazy-resolve via the wrapper" rule globally rather than only repo-locally.

## Context / Problem (why this is blocked today)

A real consumer (a developer's global shell) needs MCP/provider keys injected when launching agent CLIs from arbitrary directories and from GUI apps. `wp secrets run` is the sanctioned local injector, but three source-level facts make it usable only from a directory that _directly_ contains a `schemaVersion:1` config:

1. **Command/plan layer is CWD-only.** `src/cli/commands/secrets.ts` → `readCommittedSecretsConfig(cwd)` reads `join(cwd, '.webpresso/secrets.config.json')` with no parent walk-up and no home/XDG fallback. Launching from `~/projectX/sub` cannot find a personal config at `~/.webpresso/...`.
2. **Config dir and child cwd are coupled.** `src/runtime/executor.ts` `spawnRuntimeCommandSync`/`buildRuntimeSpawnOptions` use a single `options.cwd` as _both_ the secret-config search root _and_ the launched child's working directory. So you cannot "read config from a fixed dir but run `claude` in `$PWD`" — `cd`-ing to a config dir would force the child into the wrong directory.
3. **Two readers with partial overlap + a lossy runtime adapter.** _(Corrected per Codex review — F2.)_ The command/plan layer parses `schemaVersion:1` `{providers,profiles,sinks}` (`src/secrets/config/schema.ts:149`). The runtime fetch layer (`src/runtime/secrets-config.ts`) is **not** legacy-only: `parseSchemaVersion1Config` already accepts a `schemaVersion:1` file and maps `providers.default.{type,project}` → `{manager,projectId}` (`secrets-config.ts:151,170`), and it **already does git-root/ancestor discovery** (`secrets-config.ts:28,47`). So a v1 config that includes `providers.default` _can_ satisfy both readers today. The genuine gaps are narrower:
   - (a) **Command layer is CWD-only** — `readCommittedSecretsConfig` reads `join(cwd,'.webpresso/secrets.config.json')` and errors if absent (`secrets.ts:279`); no walk-up/home fallback. This is the primary blocker (the runtime layer already discovers).
   - (b) **Runtime adapter is lossy** — it reads only `providers.default` (`secrets-config.ts:154`) and ignores other providers/profiles, so a multi-provider v1 config mis-maps at fetch time.
   - (c) **Legacy short-form fails the command schema** — `{manager,projectId}` configs (e.g. edge-matte) error `Unsupported schemaVersion "undefined"` at `schema.ts:149`.

Compounding (out of scope to fix here, but relevant): a global-vs-repo `wp` version skew (global 2.3.2 vs repo-pinned ranges) surfaces a skew warning when the global CLI runs inside a pinned repo.

## Architecture Overview

```text
BEFORE (repo-root only)
  $PWD must == config dir
  wp secrets run --                command layer: readCommittedSecretsConfig($PWD)  [CWD-only, schemaVersion:1]
    └─ spawnRuntimeCommandSync      runtime layer: readSecretsConfig($PWD) [walk-up, legacy schema]
         cwd = $PWD (config) ALSO = child cwd   ← coupled

AFTER (global launcher)
  $PWD = any project dir;  config resolved separately
  wp secrets run --config-dir <resolved> --   (or WP_SECRETS_CONFIG_DIR / discovery)
    ├─ discovery order: explicit flag/env → $PWD → git root → $XDG_CONFIG_HOME/webpresso → $HOME/.webpresso
    ├─ ONE schema (schemaVersion:1) read by both layers via a shared loader/adapter
    └─ spawnRuntimeCommandSync(configDir=<resolved>, childCwd=$PWD)  ← decoupled
```

## Key Decisions

| Decision           | Choice                                                                                                                                                                                                                                                                                                                                                                                                         | Rationale                                                                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Discovery scope    | Ordered fallback: explicit `--config-dir`/`WP_SECRETS_CONFIG_DIR` → cwd → git root → `$XDG_CONFIG_HOME/webpresso` → `$HOME/.webpresso`. **HOME/XDG fallback is gated (F3):** when cwd is inside a git repo that has NO committed config, the HOME config must NOT auto-inject; require explicit opt-in (`--config-dir`/env) OR a HOME config that declares `allowedRoots`/workspace matchers covering the cwd. | Reachable from any dir, but prevents a personal HOME config from silently injecting the wrong project's secrets inside an unconfigured repo (default sink `dev-server`/profile `preview`, `secrets.ts:156`). |
| cwd decoupling     | Separate `configDir` (search root) from `childCwd` (where the spawned command runs); default `childCwd` = `$PWD`                                                                                                                                                                                                                                                                                               | Lets a global launcher inject secrets while the child still runs in the user's project dir                                                                                                                   |
| Schema unification | Make both the command layer and runtime layer read a single `schemaVersion:1` config via one shared loader (adapter for legacy `{manager,projectId}` during migration)                                                                                                                                                                                                                                         | Removes the dual-reader trap; one file satisfies plan + fetch                                                                                                                                                |
| Surface            | Expose via `wp secrets run` flags/env first; optionally ship the `with-secrets` bin (already referenced in `src/cli/wrapped-wp.ts`) as a thin wrapper over the same path                                                                                                                                                                                                                                       | Keeps one implementation; `with-secrets` becomes sugar, not a second code path                                                                                                                               |
| Degrade-not-hang   | Discovery + provider fetch get explicit budgets and return clear errors, never block                                                                                                                                                                                                                                                                                                                           | Matches `agent-guide.md` "Discovery paths must degrade, not hang"                                                                                                                                            |

## Quick Reference (Execution Waves)

| Wave              | Tasks           | Dependencies   | Parallelizable | Effort (T-shirt) |
| ----------------- | --------------- | -------------- | -------------- | ---------------- |
| **Wave 0**        | 1.1, 1.2        | None           | 2 agents       | S                |
| **Wave 1**        | 1.3, 1.4        | Wave 0         | 2 agents       | S                |
| **Wave 2**        | 1.5, 1.6        | 1.3, 1.4 / 1.4 | 2 agents       | XS-S             |
| **Critical path** | 1.1 → 1.3 → 1.5 | —              | 3 waves        | M                |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target               | Actual     |
| ------ | ---------------------------------- | -------------------- | ---------- |
| RW0    | Ready tasks in Wave 0              | ≥ planned agents / 2 | 2          |
| CPR    | total_tasks / critical_path_length | ≥ 2.5                | 2.0 (6/3)  |
| DD     | dependency_edges / total_tasks     | ≤ 2.0                | 0.83 (5/6) |
| CP     | same-file overlaps per wave        | 0                    | 0          |

**Parallelization score: B** — CP = 0 and DD is low, but CPR 2.0 sits just under the 2.5 target and RW0 = 2 is modest. This is acceptable for a small, intentionally-scoped 6-task feature; the chain `1.1 → 1.3 → 1.5` is a genuine data dependency (locator → executor cwd-decoupling → `with-secrets` sugar) and is not artificially serialized. Not worth splitting further for a design-only blueprint.

**Refinement delta (F1):** the draft's critical path was listed as `1.1 → 1.3 → 1.5 → 1.6` (4 waves); 1.6 depends on 1.4 (not 1.5), so the true critical path is `1.1 → 1.3 → 1.5` (3 waves). Corrected above.

**Note:** Use t-shirt sizing (XS/S/M/L/XL) for individual task estimates, NOT day/week estimates. Scoped commands in every task below use the repo recipe surface: `wp test --file <paths>`, `wp lint --file <paths>`, `wp typecheck --file <paths>` (per `catalog/agent/rules/cmd-execution.md`).

**Lifecycle:** Blueprint frontmatter `status` is one of `draft`, `planned`, `parked`, `in-progress`, `completed`, `archived`. There is no blueprint-level `blocked` status; when a task waits on an external dependency, set the task **Status:** to `blocked` with a non-empty **Blocked:** line.

> [!NOTE]
> This blueprint is **design-only**. It defines the work; implementation is intentionally deferred (created via `wp blueprint new`, pushed as a PR for review before any code is written).

### Phase 1: Global secret-config discovery + cwd decoupling [Complexity: M]

#### [backend] Task 1.1: Shared config locator with ordered fallback

**Status:** todo

**Depends:** None

Add a single resolver that returns the secret-config file path and its containing dir using this order: explicit `--config-dir`/`WP_SECRETS_CONFIG_DIR`, then `$PWD/.webpresso/secrets.config.json`, then the git top-level, then `$XDG_CONFIG_HOME/webpresso/secrets.config.json`, then `$HOME/.webpresso/secrets.config.json`. It must short-circuit on the first existing file and apply a bounded filesystem/git probe (no unbounded walk; degrade with a clear "no config found, searched: …" error). This replaces the CWD-only `readCommittedSecretsConfig` in `src/cli/commands/secrets.ts` and is shared with the runtime layer (Task 1.2).

**Files:**

- Create: `src/secrets/config/locate.ts`
- Create: `src/secrets/config/locate.test.ts`
- Modify: `src/cli/commands/secrets.ts`

**Steps (TDD):**

1. Write failing tests: each fallback tier resolves; explicit override wins; missing config yields a structured error listing searched paths; git-probe is bounded.
2. Run `wp test --file <this task's test file(s)>` — verify FAIL.
3. Implement the locator; wire `secrets.ts` to use it.
4. Run `wp test --file <this task's test file(s)>` — verify PASS.
5. Refactor (cognitive complexity ≤ 8).

**Acceptance:**

- [ ] Locator resolves all five tiers with documented precedence
- [ ] **(F3)** Inside a git repo with no committed config, HOME/XDG does NOT auto-inject — requires explicit `--config-dir`/`WP_SECRETS_CONFIG_DIR` or a HOME config whose `allowedRoots`/workspace matcher covers the cwd; otherwise a structured "repo has no config; refusing HOME fallback" error
- [ ] Missing-config path returns a structured `WP_SECRETS_CONFIG_MISSING` error listing searched locations
- [ ] No unbounded walk; probe is budgeted
- [ ] Scoped lint + tests pass; commands recorded in task notes

#### [backend] Task 1.2: Single schemaVersion:1 loader shared by command + runtime layers

**Status:** todo

**Depends:** None

_(Reshaped per Codex review — F4: NOT greenfield.)_ The runtime reader already has `parseSchemaVersion1Config` (`src/runtime/secrets-config.ts:151`) and git-root/ancestor discovery (landed via the completed blueprint `2026-06-20-global-wp-schema-v1-secret-contract` on `fix/global-wp-secret-contract-20260620`). The remaining work is to make that adapter **non-lossy**: today it reads only `providers.default` (`secrets-config.ts:154`) and discards other providers/profiles, so the runtime fetch can't honor a profile that points at a non-`default` provider. Extend it to resolve the provider named by the active profile (shared with the command layer's `resolveSecretSink` provider lookup), keep the legacy `{manager,projectId}` shim (`secrets-config.ts:205`) for in-flight repos, and expose one shared loader entry both layers import. **Expect merge conflicts** in `src/runtime/secrets-config.ts` and `src/cli/commands/secrets.ts` if the contract branch is still in flight — rebase on it first.

**Files:**

- Modify: `src/runtime/secrets-config.ts`
- Create: `src/runtime/secrets-config.adapter.test.ts`
- Modify: `src/secrets/config/schema.ts` (export shared loader entry if needed)

**Steps (TDD):**

1. Write failing tests: a single `schemaVersion:1` file drives both the plan (`resolveSecretSink`) and the fetch (`fetchSecretsForConfig`); legacy short-form still parses via the shim.
2. Run scoped tests — verify FAIL.
3. Implement adapter/loader.
4. Run scoped tests — verify PASS.

**Acceptance:**

- [ ] One `schemaVersion:1` file satisfies plan + fetch
- [ ] Legacy `{manager,projectId}` config still resolves via shim (with deprecation note)
- [ ] Scoped lint + tests pass

#### [backend] Task 1.3: Decouple config-dir from child cwd in the executor

**Status:** todo

**Depends:** Task 1.1

Extend the runtime executor so the secret-config search root and the launched child's working directory are independent. Add `configDir` (defaults to discovery result) distinct from `childCwd` (defaults to `$PWD`). Secret resolution (`resolveRuntimeEnvironment`, `secrets-config.ts` discovery) uses `configDir`; the spawned process runs in `childCwd`. **(F5 — wider blast radius than the draft assumed):**

- The split must live on `resolveRuntimeEnvironment` (`executor.ts:89`), not only `spawnRuntimeCommandSync`, because callers use it directly.
- **`buildRuntimeProcessEnv` (`executor.ts:40`) prepends `<cwd>/node_modules/.bin` to PATH** — this MUST stay bound to `childCwd`, never `configDir`, or local command resolution breaks. Assert this in tests.
- Three callsites bypass `spawnRuntimeCommandSync` and call `resolveRuntimeEnvironment` + `buildRuntimeProcessEnv` with a single cwd today; each must adopt `configDir`/`childCwd` (default both to their current cwd to preserve behavior): `src/deploy/run.ts:85`, `src/e2e/execution.ts:151`, `src/cli/commands/quality-runner.ts:280`.

**Files:**

- Modify: `src/runtime/executor.ts`
- Modify: `src/runtime/executor.test.ts`
- Modify: `src/deploy/run.ts`
- Modify: `src/e2e/execution.ts`
- Modify: `src/cli/commands/quality-runner.ts`

**Steps (TDD):**

1. Write failing test: secrets resolved from `configDir` while the child observes `childCwd` as its `process.cwd()`.
2. Run scoped tests — verify FAIL.
3. Implement the split (keep back-compat default where both equal `$PWD`).
4. Run scoped tests — verify PASS.

**Acceptance:**

- [ ] Child runs in `childCwd`; secrets come from `configDir`
- [ ] **(F5)** `node_modules/.bin` PATH injection stays bound to `childCwd` (asserted in a test)
- [ ] **(F5)** `deploy/run.ts`, `e2e/execution.ts`, `quality-runner.ts` updated; defaults preserve current single-cwd behavior
- [ ] Existing single-cwd callers unaffected (default preserves behavior)
- [ ] Scoped lint + tests pass

#### [backend] Task 1.4: `wp secrets run` flags/env (`--config-dir`, `WP_SECRETS_CONFIG_DIR`, child cwd)

**Status:** todo

**Depends:** Task 1.1

Surface the new capability on the command: accept `--config-dir <path>` and `WP_SECRETS_CONFIG_DIR`, pass the discovered config dir + `childCwd=$PWD` through `runSecretsRun` to the executor. Preserve existing deploy sinks (`pulumi`, `github-actions-bootstrap`) unchanged.

**Files:**

- Modify: `src/cli/commands/secrets.ts`
- Modify: `src/cli/commands/secrets.test.ts`

**Steps (TDD):**

1. Failing test: `wp secrets run --config-dir X -- <cmd>` resolves config from X and runs `<cmd>` in `$PWD`.
2. Scoped tests — FAIL.
3. Implement flag/env wiring.
4. Scoped tests — PASS.

**Acceptance:**

- [ ] `--config-dir` and `WP_SECRETS_CONFIG_DIR` honored
- [ ] Deploy sink behavior unchanged
- [ ] Scoped lint + tests pass

#### [docs] Task 1.5: `with-secrets` launcher sugar + init guidance

**Status:** todo

**Depends:** Task 1.3, Task 1.4

Make the `with-secrets -- <cmd>` form already referenced in `src/cli/wrapped-wp.ts` and `wp init` output resolve to the same code path (thin wrapper, no second implementation). Update `wp init` text so the Codex/Claude launch instructions reflect global discovery.

**Files:**

- Modify: `src/cli/commands/init/index.ts`
- Create/Modify: the `with-secrets` bin entry (only if a real bin is desired) + test

**Steps (TDD):**

1. Failing test: `with-secrets -- env` injects provider keys using global discovery and runs in `$PWD`.
2. Scoped tests — FAIL → implement → PASS.

**Acceptance:**

- [ ] `with-secrets` is sugar over `wp secrets run` (one code path)
- [ ] `wp init` guidance updated
- [ ] Scoped lint + tests pass

#### [docs] Task 1.6: Provider docs + migration note

**Status:** todo

**Depends:** Task 1.4

Document the discovery order, the home/XDG config location, the `--config-dir`/`WP_SECRETS_CONFIG_DIR` knobs, and how to migrate a legacy `{manager,projectId}` config to `schemaVersion:1`. Cross-link `agent-guide.md` (lazy-resolve / never-cache-to-disk).

**Files:**

- Modify: `docs/secrets/providers.md`
- Modify: `docs/errors/wp-secret-orchestration.md`

**Steps:**

1. Write the discovery + migration sections.
2. Run `wp audit docs-frontmatter` / docs lint.

**Acceptance:**

- [ ] Discovery order + global config location documented
- [ ] Legacy→schemaVersion:1 migration documented
- [ ] Docs lint passes

---

## Verification Gates

| Gate        | Command                                                                                 | Success Criteria                          |
| ----------- | --------------------------------------------------------------------------------------- | ----------------------------------------- |
| Type safety | repo typecheck recipe                                                                   | Zero errors                               |
| Lint        | repo lint recipe (scoped)                                                               | Zero violations                           |
| Tests       | repo test recipe (scoped)                                                               | All pass                                  |
| Full QA     | repo full-QA recipe                                                                     | All pass                                  |
| Behavior    | `wp secrets run --config-dir <home> -- printenv CONTEXT7_API_KEY` from an unrelated dir | Prints the value; child cwd == launch dir |

## Cross-Plan References

| Type       | Blueprint                                                                                                     | Relationship                                                                                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Upstream   | `2026-06-20-global-wp-schema-v1-secret-contract` (completed, branch `fix/global-wp-secret-contract-20260620`) | Landed runtime `schemaVersion:1` parsing + git-root/ancestor discovery. This blueprint **builds on it** (extends the lossy `providers.default` adapter; adds command-layer discovery + HOME/XDG). Rebase Task 1.2/1.4 on it; expect conflicts in `secrets-config.ts` + `secrets.ts`. |
| Downstream | None                                                                                                          |                                                                                                                                                                                                                                                                                      |

## Edge Cases and Error Handling

| Edge Case                                                            | Risk                                                                                  | Solution                                                                                                                                    | Task     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| No config found in any tier                                          | Confusing failure                                                                     | Structured error listing every searched path                                                                                                | 1.1      |
| Repo **with** its own config                                         | Wrong project's secrets                                                               | cwd/git-root tiers win over home                                                                                                            | 1.1      |
| Repo with **NO** committed config, personal HOME config present (F3) | HOME silently injects the wrong project (default sink `dev-server`/profile `preview`) | Gate HOME/XDG fallback: refuse inside an unconfigured git repo unless explicit `--config-dir`/env or HOME `allowedRoots`/matcher covers cwd | 1.1      |
| Legacy `{manager,projectId}` config                                  | Command layer errors on schemaVersion                                                 | Compatibility shim + deprecation note                                                                                                       | 1.2      |
| Slow git probe / network provider                                    | Shell/launch hang                                                                     | Bounded probe + budgeted fetch; degrade with warning                                                                                        | 1.1, 1.3 |
| Whole-project `doppler secrets download` injects unrelated keys      | Over-broad env                                                                        | Documented; optional future allowlist (non-goal here)                                                                                       | 1.6      |

## Non-goals

- Implementing the feature in this PR — this blueprint is design-only and pushed for review first.
- Resolving the global-vs-repo `wp` version skew (separate concern).
- Migrating consumer repos' committed configs (edge-matte/ingest-lens) to `schemaVersion:1` — tracked separately.
- Changing deploy sinks (`pulumi`, `github-actions-bootstrap`) or their semantics.
- Per-key allowlisting of which provider secrets get injected.

## Risks

| Risk                                                                            | Impact                                          | Mitigation                                                                                                                                             |
| ------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HOME config injects wrong secrets in an unconfigured repo (F3, HIGH)            | Wrong-project secrets leak into a child process | Gate HOME/XDG fallback inside a git repo (explicit opt-in or `allowedRoots` matcher); cwd/git-root always beat home; explicit `--config-dir` overrides |
| Reshaping the runtime adapter conflicts with the in-flight contract branch (F4) | Merge pain / regressions                        | Rebase on `fix/global-wp-secret-contract-20260620`; treat Task 1.2 as extend-not-rewrite; parity tests for legacy + v1                                 |
| Decoupling cwd breaks existing single-cwd callers                               | Regressions in deploy/test sinks                | Default `childCwd==configDir==$PWD`; cover existing callers with tests                                                                                 |
| Schema unification destabilizes the runtime reader mid-migration                | Broken secret fetch                             | Adapter + shim + byte-level tests for both shapes                                                                                                      |
| Secrets transiting env                                                          | Leakage                                         | Keep injection in child env only; never write to disk (per `agent-guide.md`)                                                                           |

## Technology Choices

| Component        | Technology                                                                 | Version | Why                                                |
| ---------------- | -------------------------------------------------------------------------- | ------- | -------------------------------------------------- |
| Config discovery | Node `fs` + bounded `git rev-parse`                                        | n/a     | Reuse existing runtime probes; no new deps         |
| Schema           | existing `schemaVersion:1` parser (`src/secrets/config/schema.ts`)         | 1       | Single source of truth                             |
| Provider fetch   | existing `doppler`/`infisical` managers (`src/runtime/secret-managers.ts`) | n/a     | Unchanged; only the config-resolution path changes |

## Refinement Summary

Refined per `plan-refine`, then challenged via `/codex` outside-voice review (read-only, against live source). Phase 2 verification was done firsthand; the Codex pass caught one diagnosis error I'd made from an incomplete first read.

| Metric                | Value                                                          |
| --------------------- | -------------------------------------------------------------- |
| Findings total        | 5                                                              |
| Critical              | 0                                                              |
| High                  | 2 (F2 diagnosis overstated; F3 HOME-fallback footgun)          |
| Medium                | 2 (F4 overlap/duplication; F5 cwd blast-radius under-scoped)   |
| Low                   | 1 (F1 wrong critical-path length)                              |
| Fixes applied         | 5/5                                                            |
| Cross-plans updated   | 1 (upstream: `2026-06-20-global-wp-schema-v1-secret-contract`) |
| Parallelization score | B (CPR 2.0, CP 0, RW0 2)                                       |
| Critical path         | 3 waves                                                        |
| Max parallel agents   | 2                                                              |
| Total tasks           | 6                                                              |
| Blueprint compliant   | 6/6 (Depends + Files + Steps(TDD) + Acceptance)                |

**Codex review findings (verdict: needs-work → addressed):**

- **F2 [high]** — "one file can't satisfy both readers" was wrong: the runtime reader already accepts `schemaVersion:1` (`secrets-config.ts:151,170`) and already discovers (`:28,47`). I independently confirmed this against the live file before correcting the diagnosis to "two readers, partial overlap, lossy runtime adapter; command layer is the CWD-only one."
- **F3 [high]** — HOME fallback can silently inject the wrong project's secrets inside an unconfigured repo. Added a gate (explicit opt-in / `allowedRoots` matcher) to Key Decisions, Task 1.1, Edge Cases, Risks.
- **F4 [medium]** — `fix/global-wp-secret-contract-20260620` already landed runtime v1 parsing + discovery (completed blueprint). Reshaped Task 1.2 to extend the existing lossy adapter (not greenfield) and added the upstream cross-plan ref + conflict risk.
- **F5 [medium]** — cwd decoupling must cover `resolveRuntimeEnvironment` + 3 direct callsites (`deploy/run.ts`, `e2e/execution.ts`, `quality-runner.ts`) and keep PATH bound to `childCwd`. Broadened Task 1.3 scope/files/acceptance.

**Verification notes (claims confirmed against source):**

- `src/cli/commands/secrets.ts` `readCommittedSecretsConfig` resolves `join(cwd, '.webpresso/secrets.config.json')` — CWD-only, no walk-up/home fallback. ✓
- `src/runtime/executor.ts` `buildRuntimeSpawnOptions`/`spawnRuntimeCommandSync` use one `options.cwd` for both config search and child cwd. ✓
- `src/secrets/config/schema.ts` `parseSecretsSchema` requires `schemaVersion: 1` with `providers`/`profiles`/`sinks`; valid sink names + ops are fixed enums in `src/secrets/sinks/types.ts`; `dev-server` → `service-runtime` runtime profile (`src/secrets/sinks/planner.ts`). ✓
- `src/runtime/secrets-config.ts` `readSecretsConfig` parses the legacy `{manager,projectId,profiles}` shape and walks up via git — the dual-schema split is real. ✓
- `src/runtime/secret-managers.ts` `fetchFromDoppler` runs `doppler secrets download --no-file --format json --project <id>` (whole-project download) — informs the "over-broad env" edge case. ✓

**Policy gates:** Engineering principles — no speculative abstractions (one shared locator/loader, `with-secrets` is sugar over one code path, no new deps). Public-package safety — the eventual change touches `src/`, `bin` (`with-secrets`), and `docs/`; the implementing PR must run a tarball/package-surface check and keep secrets/private paths out (flagged in Task 1.5 / Non-goals). No package-surface change is made by this design-only blueprint.

**Status:** design-only and intentionally deferred; not promoted to `planned`/`in-progress` and not executed.
