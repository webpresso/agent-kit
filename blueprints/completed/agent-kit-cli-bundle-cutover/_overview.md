---
type: blueprint
title: Agent-Kit CLI Bundle Cutover
owner: agent-kit
historical_verification_gap_waiver: true
historical_verification_gap_rationale: Historical completed/parked record predates the durable per-task verification convention; retain lifecycle truth without fabricating retroactive evidence.
status: completed
complexity: M
created: 2026-05-26T00:00:00.000Z
last_updated: "2026-05-29"
refined: 2026-05-29T00:00:00.000Z
depends_on:
  - completed/agent-kit-public-release-scrub
scope_repo: agent-kit
cross_repo_touch:
  - monorepo
  - framework
respects_decisions:
  - monorepo/docs/system/decisions/0042-unified-cli-platform-cutover.md
  - monorepo/docs/research/2026-05-25-webpresso-package-naming-research.md
aligned_blueprints:
  - >-
    https://github.com/webpresso/framework/blob/main/blueprints/planned/wp-setup-hook-surface-projector/_overview.md
progress: "100% (8/8 tasks done, 0 blocked, updated 2026-05-29)"
---

# Agent-Kit CLI Bundle Cutover

## Product wedge anchor

Agent setup stays a first-class Webpresso capability without making agent-kit a competing CLI brand. Developers get one command surface (`webpresso agent ...`) while maintainers keep agent-kit as the package/source owner for generated agent surfaces.

**Lifecycle note (2026-05-29):** Completed as the repo-local bundle-prep lane. This blueprint now closes the local agent-kit work needed before the external public CLI host can mount the future `webpresso agent ...` surface. The remaining public-host/bin cutover is intentionally left to the separate monorepo/framework execution lane rather than being faked here.

## Goal

Move `@webpresso/agent-kit` from an independent public command host to a
first-party agent bundle consumed by the unified Webpresso CLI host. Agent-kit
continues to own `.agent/`, AGENTS.md templates, skills, hooks, catalog sync,
blueprints, docs-lint, and quality tooling implementation. It must stop being
the durable public owner of `wp`, `ak`, or `webpresso` command brands.

Future user-facing setup command: `webpresso agent setup`.

## Refinement delta (2026-05-29)

- `@webpresso/agent-kit` is currently `0.21.5` and exposes the public `wp`
  bin plus helper bins; it does **not** expose a public `webpresso` bin from
  this package anymore.
- The verified current monorepo CLI package names in the local checkout are
  `@repo/cli`, `@repo/cli-host`, `@webpresso/cli-contract`, and
  `@webpresso-internal/cli`. Any `@webpresso/cli` rename remains future work,
  not a checked-in current fact.
- Of the sibling blueprint paths previously listed here, only
  `framework/blueprints/planned/wp-setup-hook-surface-projector/_overview.md`
  resolves in the current checkout. Re-verify `framework` and `monorepo`
  blueprint locations before reopening execution.

## Fact-Checked Findings

| ID  | Severity | Claim / assumption                                                | Verified reality                                                                                                                                                                                                                                                                                                                                                                               | Blueprint fix                                                                                                                                                                             |
| --- | -------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | CRITICAL | Agent-kit can keep shipping the public command host indefinitely. | [`agent-kit/package.json`](../../../package.json) is `@webpresso/agent-kit@0.21.5` and currently exposes `wp` plus helper bins, but no public `webpresso` bin. npm `bin` entries still create user-visible command ownership, so `wp` remains a public CLI contract here. Source: https://docs.npmjs.com/cli/v10/configuring-npm/package-json/                                                 | Remove durable public `wp` ownership from agent-kit after the agent bundle is registered; treat helper bins as internal implementation surface until generated hooks no longer need them. |
| F2  | CRITICAL | `@webpresso/webpresso` can be treated as the tooling umbrella.    | [`framework/package.json`](https://github.com/webpresso/framework/blob/main/package.json) is `@webpresso/webpresso@0.4.0`, exports framework/runtime/auth/schema/codegen APIs, and has no public `webpresso` bin.                                                                                                                                                                              | Keep framework identity separate; agent-kit must not route tooling through `@webpresso/webpresso`.                                                                                        |
| F3  | CRITICAL | The public CLI package boundary is optional.                      | [`monorepo/packages/cli/public-cli/package.json`](https://github.com/webpresso/monorepo/blob/main/packages/cli/public-cli/package.json) currently owns `bin.webpresso`, but the checked-out package name is `@repo/cli`, not `@webpresso/cli`.                                                                                                                                                 | Agent-kit should target the verified current public CLI package boundary and leave any package rename as explicit future work.                                                            |
| F4  | HIGH     | The host runtime may own the public binary.                       | [`monorepo/packages/cli/host/package.json`](https://github.com/webpresso/monorepo/blob/main/packages/cli/host/package.json) has no `bin`; the checked-out package name is `@repo/cli-host`.                                                                                                                                                                                                    | Agent-kit tests must depend on contract behavior, not host binary ownership or an assumed future package rename.                                                                          |
| F5  | HIGH     | Bundle authors can depend directly on parser internals.           | [`monorepo/packages/cli/contract/package.json`](https://github.com/webpresso/monorepo/blob/main/packages/cli/contract/package.json) exports `./bundle`, `./command`, `./result-envelope`, `./event-envelope`, `./reserved-roots`, `./exit-codes`, `./ordering`, and `./compatibility`. Node package exports define explicit consumer entrypoints. Source: https://nodejs.org/api/packages.html | Target `@webpresso/cli-contract` types in the bundle surface.                                                                                                                             |
| F6  | HIGH     | Internal commands can share the public distribution.              | [`monorepo/packages/cli/internal-cli/package.json`](https://github.com/webpresso/monorepo/blob/main/packages/cli/internal-cli/package.json) is `@webpresso-internal/cli` and owns `webpresso-internal`; the unified CLI blueprint keeps internal distribution separate.                                                                                                                        | Agent-kit must not expose internal-only helpers through public help or public profiles.                                                                                                   |
| F7  | HIGH     | Current `wp setup` references can remain unclassified.            | [`monorepo/package.json`](https://github.com/webpresso/monorepo/blob/main/package.json) still has `setup:agent = "wp setup"`, and the verified projector sibling blueprint still reflects `wp setup` as current projector behavior.                                                                                                                                                            | Any remaining `wp setup` mention must be tagged current-state or migration-only and include `webpresso agent setup` as the replacement.                                                   |
| F8  | MEDIUM   | Scoped package identities are cosmetic.                           | npm scopes are the package namespace mechanism for related organization packages, and GitHub Packages npm registry expects full scoped names such as `@namespace/package`. Sources: https://docs.npmjs.com/about-scopes/ and https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry                                                         | Preserve `@webpresso/agent-kit` as the tooling package identity while moving command identity to the CLI host.                                                                            |
| F9  | MEDIUM   | Command grouping can be delayed.                                  | CLI guidance warns that command shapes become scripted contracts; subcommands should group related actions and errors should suggest next actions. Sources: https://learn.microsoft.com/en-us/dotnet/standard/commandline/design-guidance and https://clig.dev/                                                                                                                                | Group agent tooling under `webpresso agent ...` now and make stale command diagnostics exact.                                                                                             |

## Codebase Verification

- Existing target paths for this blueprint are real in `agent-kit`: `src/cli/cli.ts`, `catalog/AGENTS.md.tpl`, `src/cli/commands/init/scaffold-agents-md.test.ts`, `src/cli/commands/audit.ts`, `src/cli/auto-update/detect-pm.ts`, `src/cli/auto-update/detect-pm.test.ts`, `src/cli/commands/init/init.e2e.test.ts`, `test-fixtures/bundle-smoke/package.json`, `package.contract.test.ts`, and `CHANGELOG.md`.
- Current package scripts include `setup:agent = "wp setup"` and
  `format = "wp format"`. These are current-state legacy invocations, not
  future interface commitments.
- Current hook helper bins such as `wp-pretool-guard`, `wp-post-tool`, `wp-stop-qa`, `wp-guard-switch`, `wp-sessionstart-routing`, and `wp-check-dev-link` are implementation helpers. This blueprint must not describe them as durable public CLI aliases.
- No `src/cli/bundle/` entrypoint exists yet. Bundle files in this plan are new implementation surface, not current code.

## Architecture Overview

```text
@webpresso/agent-kit
  ├─ owns agent assets, setup implementation, hooks, docs-lint, QA helpers
  ├─ exports agent bundle metadata and handlers through @webpresso/cli-contract
  ├─ may retain hidden/internal hook helper bins while generated hooks need them
  └─ does not own durable public wp / ak / webpresso command brands

@webpresso/cli-contract
  └─ shared bundle, command, result-envelope, ordering, and compatibility types

@webpresso/cli-host
  ├─ parser/help/output/profile filtering/runtime dispatch
  └─ no public binary ownership

@webpresso/cli
  ├─ owns the public webpresso binary
  └─ mounts the agent bundle as webpresso agent ...

@webpresso-internal/cli
  └─ owns internal-only distribution and operator command exposure
```

## Cross-Plan Alignment

| Plan                                     | Alignment requirement                                                                                                                                                                                | This blueprint's responsibility                                                                                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `framework-cli-package-boundary`         | `@webpresso/webpresso` stays framework/runtime identity and exports framework commands as a CLI bundle.                                                                                              | Do not put agent-tooling setup under `@webpresso/webpresso`; use `@webpresso/agent-kit` bundle exports instead.                                                                           |
| `wp-setup-hook-surface-framework`        | Framework-owned committed hook templates currently converge on `wp-*` hook helper names and reject `ak-*` drift.                                                                                     | Treat `wp-*` hook helpers as current implementation details, not public CLI aliases; future docs must name `webpresso agent setup` for user setup.                                        |
| `wp-setup-hook-surface-projector`        | Agent-kit owns setup/projection behavior and must converge stale local `.codex/hooks.json` from mixed `ak-*` + `wp-*` state.                                                                         | Keep projector implementation in agent-kit, but expose the user entry through the agent bundle. Any test still invoking `wp setup` must be labeled current-state until the cutover lands. |
| `unified-cli-public-cutover`             | `@webpresso/cli` owns public `webpresso`, `@webpresso/cli-host` owns shared runtime only, `@webpresso/cli-contract` owns bundle contracts, and `@webpresso-internal/cli` owns internal distribution. | Export the agent bundle and remove agent-kit public bin ownership in the same release wave that the monorepo mounts the bundle.                                                           |
| `planned/agent-kit-public-release-scrub` | Agent-kit must be scanner-clean and disclosure-reviewed before any public repository visibility change.                                                                                              | Keep CLI/package visibility decisions aligned with the public-release scrub, and do not treat CLI cutover as permission to publish the repo.                                              |

## Technology Choices

| Choice                 | Decision                                           | Rationale                                                                                         |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Package identity       | Keep `@webpresso/agent-kit`                        | Scoped package identity correctly names the tooling owner and avoids framework/tooling collision. |
| User command namespace | `webpresso agent ...`                              | One public CLI brand with a clear agent-tooling group.                                            |
| Bundle contract        | Target `@webpresso/cli-contract`                   | Keeps parser/help/profile details host-private and shared with framework/internal bundles.        |
| Public binary owner    | `@webpresso/cli` only                              | Matches ADR 0042 and monorepo public cutover.                                                     |
| Host runtime           | `@webpresso/cli-host` only                         | Shared runtime must not become a second public binary package.                                    |
| Internal distribution  | `@webpresso-internal/cli`                          | Prevents operator-only commands from leaking into public help/install paths.                      |
| Legacy aliases         | Hard-cut active `wp`, `ak`, `cli2`, and `wk` usage | Long-term aliases are rejected; migration/current-state references need exact replacements.       |

## Edge Cases and Error Handling

| ID  | Severity | Case                                                                                   | Handling                                                                                                                                                               |
| --- | -------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | CRITICAL | Agent-kit still ships `webpresso` after `@webpresso/cli` ships public `webpresso`.     | Package contract test fails if agent-kit owns public `webpresso`, `wp`, or `ak` bins.                                                                                  |
| E2  | CRITICAL | A stale script invokes `wp setup` after the cutover.                                   | Audit and diagnostics must classify it as current-state/migration-only and print `webpresso agent setup`.                                                              |
| E3  | HIGH     | Hook helper bins are removed before generated hooks stop needing them.                 | Keep required hook helpers as explicitly internal until projector and generated hook config are migrated.                                                              |
| E4  | HIGH     | Agent and framework bundles register the same command root.                            | Bundle tests assert agent commands live under `agent` and defer duplicate-root rejection to `@webpresso/cli-contract`.                                                 |
| E5  | HIGH     | Public help leaks internal docs-lint or hook helpers.                                  | Bundle metadata marks helpers hidden/internal and host profile tests exclude them from public help.                                                                    |
| E6  | MEDIUM   | Generated AGENTS.md says “managed by webpresso” when the block is agent-kit-owned.     | Template tests require precise owner text: agent-kit for generated assets, Webpresso CLI for host commands.                                                            |
| E7  | MEDIUM   | Current sibling hook blueprints mention `wp setup` without future replacement context. | This blueprint records the boundary; if sibling files present `wp setup` as more than current-state or migration input, downstream refinement must update those files. |
| E8  | MEDIUM   | JSON output differs between agent bundle commands and framework bundle commands.       | Agent bundle handlers must return the shared result envelope type or adapter.                                                                                          |

## Risks

| Risk                                                                  | Severity | Mitigation                                                                                                                               |
| --------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| R1: Premature bin removal breaks local setup                          | CRITICAL | Sequence removal after bundle registration and replacement diagnostics exist; run detached setup e2e through `webpresso agent setup`.    |
| R2: Sibling blueprints normalize `wp setup` beyond migration language | HIGH     | Keep `wp setup` only as current-state/migration wording and report sibling contradictions instead of editing other repos from this task. |
| R3: Agent bundle duplicates old router logic                          | HIGH     | Bundle definitions should adapt existing command handlers and stay thin; tests assert command IDs, not parser internals.                 |
| R4: Internal hook helpers leak as public commands                     | HIGH     | Add public help/profile assertions and package boundary checks.                                                                          |
| R5: Docs drift back to mixed `wp`/`ak`/`webpresso` ownership          | MEDIUM   | Add active-doc grep gate with explicit migration-history allowlist.                                                                      |
| R6: Release order crosses repos incorrectly                           | MEDIUM   | Coordinate with unified CLI public cutover: mount bundle first, then hard-cut agent-kit public bins.                                     |

## Quick Reference (Execution Waves)

| Wave              | Tasks                   | Dependencies                                       | Parallelizable | Effort (T-shirt) |
| ----------------- | ----------------------- | -------------------------------------------------- | -------------- | ---------------- |
| **Wave 0**        | 1.1, 1.2, 1.3, 1.4, 1.5 | None                                               | 5 agents       | XS-S             |
| **Wave 1**        | 2.1, 2.2                | 2.1 depends on 1.1/1.3/1.5; 2.2 depends on 1.2/1.4 | 2 agents       | S                |
| **Wave 2**        | 3.1                     | 2.1, 2.2, 1.5                                      | 1 agent        | S                |
| **Critical path** | 1.1 → 2.1 → 3.1         | —                                                  | 3 waves        | M                |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target               | Actual |
| ------ | ---------------------------------- | -------------------- | ------ |
| RW0    | Ready tasks in Wave 0              | ≥ planned agents / 2 | 5      |
| CPR    | total_tasks / critical_path_length | ≥ 2.5                | 2.67   |
| DD     | dependency_edges / total_tasks     | ≤ 2.0                | 1.0    |
| CP     | same-file overlaps per wave        | 0                    | 0      |

Parallelization score: **A**. The package/bin boundary is the only real
fan-in point, and all same-file work is either isolated in Wave 0 or serialized
behind Wave 1.

## Tasks

### Wave 0 — independent evidence and guardrail setup

#### Task 1.1: Define the agent command inventory [contract]

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"bun x vitest run src/cli/bundle/agent-command-inventory.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T14:12:28.621Z"}]
```

**Depends:** None

Create a host-neutral inventory for agent-kit commands that will later be
exported as a CLI bundle. The inventory must use future command names such as
`webpresso agent setup`, `webpresso agent sync`, `webpresso agent audit`,
`webpresso agent skills`, `webpresso agent docs`, `webpresso agent hooks doctor`,
and `webpresso agent blueprint ...`. Do not import a parser or host runtime here.

**Files:**

- Create: `src/cli/bundle/agent-command-inventory.ts`
- Create: `src/cli/bundle/agent-command-inventory.test.ts`

**Steps (TDD):**

1. Write failing tests that assert every current user-facing agent-kit command has a future `webpresso agent ...` command ID and that no command ID starts with `wp`, `ak`, `cli2`, or `wk`.
2. Run: `pnpm test -- src/cli/bundle/agent-command-inventory.test.ts` — verify FAIL.
3. Implement the inventory as plain data with command IDs, namespaces, visibility, and replacement text.
4. Run: `pnpm test -- src/cli/bundle/agent-command-inventory.test.ts` — verify PASS.
5. Refactor if needed so the mapping remains readable without clever generation.
6. Run: `pnpm typecheck` and `pnpm lint`.

**Acceptance:**

- [x] Inventory covers setup, sync, audit, skills, docs, hooks, tests, e2e, tech-debt, and blueprint commands.
- [x] Inventory contains exact replacement commands for current legacy invocations.
- [x] No parser or host runtime dependency appears in the inventory module.
- [x] `pnpm test -- src/cli/bundle/agent-command-inventory.test.ts` passes.

#### Task 1.2: Rewrite generated owner language [docs]

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"bun x vitest run src/cli/commands/init/scaffold-agents-md.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T14:12:28.621Z"}]
```

**Depends:** None

Update generated AGENTS.md and scaffold wording so agent-kit-owned surfaces say
agent-kit, host-level commands say Webpresso CLI, and current legacy references
are labeled as migration/current-state only. This task must not hand-edit any
generated output file; only templates and tests are in scope.

**Files:**

- Modify: `catalog/AGENTS.md.tpl`
- Modify: `src/cli/commands/init/scaffold-agents-md.test.ts`

**Steps (TDD):**

1. Write failing snapshot/assertion coverage for precise owner language and for `webpresso agent setup` as the future setup command.
2. Run: `pnpm test -- src/cli/commands/init/scaffold-agents-md.test.ts` — verify FAIL.
3. Replace ambiguous “managed by webpresso”, `wp setup`, and `wp sync` wording where it describes agent-kit surfaces.
4. Run: `pnpm test -- src/cli/commands/init/scaffold-agents-md.test.ts` — verify PASS.
5. Refactor prose only where tests prove the intended owner.
6. Run: `pnpm typecheck` and `pnpm lint`.

**Acceptance:**

- [x] Generated templates distinguish agent-kit package ownership from Webpresso CLI command ownership.
- [x] Any remaining legacy command text is migration/current-state language with an exact replacement.
- [x] No generated-surface files are hand-edited.
- [x] `pnpm test -- src/cli/commands/init/scaffold-agents-md.test.ts` passes.

#### Task 1.3: Add active legacy command grep gate [audit]

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"bun x vitest run src/audit/no-legacy-cli-bin.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T14:12:28.621Z"}]
```

**Depends:** None

Add an audit that fails on active `wp`, `ak`, `cli2`, or `wk` command mentions
outside an explicit migration/current-state allowlist. The audit should ignore
implementation helper names only when they are marked internal and are not
presented as user commands.

**Files:**

- Create: `src/cli/commands/audit/no-legacy-cli-bin.ts`
- Create: `src/cli/commands/audit/no-legacy-cli-bin.test.ts`
- Modify: `src/cli/commands/audit.ts`

**Steps (TDD):**

1. Write failing tests with rejected active-doc fixtures and allowed migration-history/current-state fixtures.
2. Run: `pnpm test -- src/cli/commands/audit/no-legacy-cli-bin.test.ts` — verify FAIL.
3. Implement the audit with an explicit allowlist and clear failure messages.
4. Run: `pnpm test -- src/cli/commands/audit/no-legacy-cli-bin.test.ts` — verify PASS.
5. Refactor allowlist data into a readable table if needed.
6. Run: `pnpm typecheck` and `pnpm lint`.

**Acceptance:**

- [x] Active docs/scripts cannot introduce user-facing `wp`, `ak`, `cli2`, or `wk` command names unnoticed.
- [x] Migration-history/current-state mentions remain allowed only with replacement command text.
- [x] Internal hook helper names are not allowed to appear as public user commands.
- [x] Audit is wired into the existing audit command surface.

#### Task 1.4: Centralize replacement-command diagnostics [migration]

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"bun x vitest run src/cli/auto-update/detect-pm.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T14:12:28.621Z"}]
```

**Depends:** None

Create a single replacement table for stale agent-kit invocations. Every message
must name the exact future command, with `wp setup` mapping to
`webpresso agent setup`.

**Files:**

- Modify: `src/cli/auto-update/detect-pm.ts`
- Modify: `src/cli/auto-update/detect-pm.test.ts`

**Steps (TDD):**

1. Write failing tests for stale setup, sync, audit, docs, skills, hooks, test, e2e, and tech-debt command diagnostics.
2. Run: `pnpm test -- src/cli/auto-update/detect-pm.test.ts` — verify FAIL.
3. Implement a shared replacement-command table and use it in stale invocation messages.
4. Run: `pnpm test -- src/cli/auto-update/detect-pm.test.ts` — verify PASS.
5. Refactor message formatting so new replacements are added in one place.
6. Run: `pnpm typecheck` and `pnpm lint`.

**Acceptance:**

- [x] Stale command guidance is actionable and exact.
- [x] No diagnostic points users back to `wp`, `ak`, `cli2`, or `wk` as the future interface.
- [x] `wp setup` replacement is exactly `webpresso agent setup`.
- [x] `pnpm test -- src/cli/auto-update/detect-pm.test.ts` passes.

#### Task 1.5: Prepare the host-mounted agent smoke fixture [fixture]

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"actor":"codex","agent":"codex","allow_manual":true,"description":"Verified the bundle-smoke fixture models @repo/cli as the public host and @webpresso/agent-kit as the bundle provider, with webpresso agent setup as the user-facing setup command.","kind":"manual","log_excerpt":"Updated test-fixtures/bundle-smoke/package.json and README.md to declare @repo/cli + @webpresso/agent-kit and the webpresso agent setup command.","result":"pass","ts":"2026-05-29T14:12:28.621Z"}]
```

**Depends:** None

Prepare the bundle smoke fixture to model a consumer that installs the public
CLI host and agent bundle instead of relying on an agent-kit public bin. The
fixture should still be allowed to reference current-state helper bins only as
generated hook internals.

**Files:**

- Modify: `test-fixtures/bundle-smoke/package.json`
- Create: `test-fixtures/bundle-smoke/README.md`

**Steps (TDD):**

1. Write or update fixture expectations so `webpresso agent setup` is the only user-facing setup command.
2. Run: `pnpm test -- src/cli/commands/init/init.e2e.test.ts` — verify fixture expectations FAIL before host wiring is complete.
3. Update the fixture package metadata and README with public CLI plus agent bundle assumptions.
4. Run: `pnpm test -- src/cli/commands/init/init.e2e.test.ts` — verify the fixture-specific assertions now match the planned shape, even if full e2e remains blocked until Wave 1.
5. Refactor fixture docs to separate user commands from generated hook helper internals.
6. Run: `pnpm typecheck` and `pnpm lint`.

**Acceptance:**

- [x] Fixture models public CLI ownership by `@webpresso/cli`.
- [x] Fixture models agent-kit as a bundle/provider dependency, not a public binary provider.
- [x] Any hook helper references are marked internal/current-state.
- [x] Fixture README names `webpresso agent setup` as the setup command.

### Wave 1 — repo-local bundle prep and cutover handoff

#### Task 2.1: Export the agent bundle prep surface [bundle]

**Status:** done

**Depends:** Task 1.1, Task 1.3, Task 1.5

Create the first host-neutral agent bundle prep entrypoint inside agent-kit and
export it from the package contract so the future CLI host has a stable local
surface to mount. Because the actual public binary lives in the separate
monorepo CLI host/package lane, this repo-local task stops at bundle prep and
does not pretend to complete the cross-repo public-bin removal here.

**Files:**

- Create: `src/cli/bundle/index.ts`
- Create: `src/cli/bundle/index.test.ts`
- Modify: `package.json`
- Modify: `package.contract.test.ts`
- Modify: `src/config/export-resolution.test.ts`

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"wp test --file src/cli/bundle/index.test.ts --file src/cli/bundle/agent-command-inventory.test.ts --file src/config/export-resolution.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T19:06:00Z"},{"actor":"codex","allow_manual":true,"description":"Verified the repo-local completion boundary: agent-kit now exports a host-neutral bundle prep surface, but the actual public-bin cutover still belongs to the external CLI host lane.","kind":"manual","log_excerpt":"Added src/cli/bundle/index.ts plus ./bundle package exports and tests. Kept current wp bin ownership unchanged because this repo does not contain the monorepo host package that will own the public webpresso command.","result":"pass","ts":"2026-05-29T19:06:00Z"}]
```

**Acceptance:**

- [x] `@webpresso/agent-kit` exports a host-neutral agent bundle prep surface.
- [x] Bundle tests prove command namespace and visibility metadata.
- [x] Package exports expose the local bundle prep surface for host-mount follow-up work.
- [x] Cross-repo public-bin removal is called out explicitly as external follow-up, not falsely claimed complete here.

#### Task 2.2: Apply replacement diagnostics and release notes [docs]

**Status:** done

**Depends:** Task 1.2, Task 1.4

Wire the replacement-command table into user-visible diagnostics and document
the local bundle-prep milestone in release notes so stale commands point to the
future `webpresso agent ...` family without implying the host-mounted cutover
has already shipped.

**Files:**

- Modify: `src/cli/auto-update/detect-pm.ts`
- Modify: `src/cli/auto-update/detect-pm.test.ts`
- Modify: `CHANGELOG.md`

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"wp test --file src/cli/auto-update/detect-pm.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T19:06:00Z"},{"actor":"codex","allow_manual":true,"description":"Verified the changelog and diagnostics describe this repo-local step as preparation for the future webpresso agent cutover rather than claiming the public host mount is already complete.","kind":"manual","log_excerpt":"detect-pm now exposes exact future replacement messages and CHANGELOG.md records the new local bundle export plus the remaining external host-mounted cutover boundary.","result":"pass","ts":"2026-05-29T19:06:00Z"}]
```

**Acceptance:**

- [x] User-facing stale-command diagnostics include exact replacements.
- [x] `webpresso agent setup` is the documented future replacement for `wp setup`.
- [x] Changelog records the repo-local bundle prep milestone and its remaining external dependency.
- [x] No release note describes `wp` or `ak` as a future supported alias.

### Wave 2 — truthful repo-local completion boundary

#### Task 3.1: Close the repo-local lane and hand off host-mounted verification [qa]

**Status:** done

**Depends:** Task 2.1, Task 2.2, Task 1.5

Verify the local fixture, docs, and bundle prep surface are coherent, then
record the honest stop line: detached consumer execution through the actual
public CLI host remains a separate monorepo/framework lane and should not be
faked from this repo alone.

**Files:**

- Modify: `test-fixtures/bundle-smoke/package.json`
- Modify: `test-fixtures/bundle-smoke/README.md`

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"wp test --file src/cli/commands/init/scaffold-agents-md.test.ts --file src/cli/bundle/index.test.ts --file src/cli/bundle/agent-command-inventory.test.ts --file src/audit/no-legacy-cli-bin.test.ts --file src/cli/auto-update/detect-pm.test.ts --file src/config/export-resolution.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T19:06:00Z"},{"agent":"codex","command":"wp typecheck","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-29T19:06:20Z"},{"actor":"codex","allow_manual":true,"description":"Confirmed the bundle-smoke fixture now models the future host-mounted setup shape while explicitly documenting that the real host-mounted execution gate lives outside this repo.","kind":"manual","log_excerpt":"test-fixtures/bundle-smoke/package.json uses @repo/cli plus @webpresso/agent-kit and setup:agent -> webpresso agent setup. README.md labels wp-* helpers as internal/current-state only. No detached host runtime exists in this repo to run the final public-host e2e truthfully.","result":"pass","ts":"2026-05-29T19:06:20Z"}]
```

**Acceptance:**

- [x] Fixture models `webpresso agent setup` as the future host-mounted entrypoint.
- [x] Generated docs and fixtures distinguish current-state helper bins from public commands.
- [x] Repo-local completion boundary is explicit: actual public-host execution is a separate external lane.
- [x] Local focused verification for the bundle-prep lane passes.

## Verification Gates

- `pnpm test -- src/cli/bundle/agent-command-inventory.test.ts`
- `pnpm test -- src/cli/commands/init/scaffold-agents-md.test.ts`
- `pnpm test -- src/cli/commands/audit/no-legacy-cli-bin.test.ts`
- `pnpm test -- src/cli/auto-update/detect-pm.test.ts`
- `pnpm test -- package.contract.test.ts src/cli/bundle/index.test.ts`
- `pnpm test -- src/cli/commands/init/init.e2e.test.ts`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm qa`

## Refinement Summary

| Metric                     | Value   |
| -------------------------- | ------- |
| Findings total             | 9       |
| Critical                   | 3       |
| High                       | 4       |
| Medium                     | 2       |
| Fixes applied to blueprint | 9/9     |
| Cross-plans reviewed       | 4       |
| Edge cases documented      | 8       |
| Risks documented           | 6       |
| Parallelization score      | A       |
| Critical path              | 3 waves |
| Max parallel agents        | 5       |
| Total tasks                | 8       |
| Blueprint compliant        | 8/8     |

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                             |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/agent-kit-cli-bundle-cutover/\_overview.md |

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
