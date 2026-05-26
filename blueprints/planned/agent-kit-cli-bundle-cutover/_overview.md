---
type: blueprint
title: Agent-Kit CLI Bundle Cutover
owner: agent-kit
status: planned
complexity: M
created: 2026-05-26
last_updated: 2026-05-26
refined: 2026-05-26
scope_repo: /Users/ozby/repos/webpresso/agent-kit
cross_repo_touch:
  - /Users/ozby/repos/webpresso/monorepo
  - /Users/ozby/repos/webpresso/framework
respects_decisions:
  - monorepo/docs/system/decisions/0042-unified-cli-platform-cutover.md
  - monorepo/docs/research/2026-05-25-webpresso-package-naming-research.md
aligned_blueprints:
  - /Users/ozby/repos/webpresso/framework/blueprints/planned/framework-cli-package-boundary/_overview.md
  - /Users/ozby/repos/webpresso/framework/blueprints/planned/wp-setup-hook-surface-framework/_overview.md
  - /Users/ozby/repos/webpresso/framework/blueprints/planned/wp-setup-hook-surface-projector/_overview.md
  - /Users/ozby/repos/webpresso/monorepo/webpresso/blueprints/planned/unified-cli-public-cutover/_overview.md
---

# Agent-Kit CLI Bundle Cutover

## Product wedge anchor

Agent setup stays a first-class Webpresso capability without making agent-kit a competing CLI brand. Developers get one command surface (`webpresso agent ...`) while maintainers keep agent-kit as the package/source owner for generated agent surfaces.


## Goal

Move `@webpresso/agent-kit` from an independent public command host to a
first-party agent bundle consumed by the unified Webpresso CLI host. Agent-kit
continues to own `.agent/`, AGENTS.md templates, skills, hooks, catalog sync,
blueprints, docs-lint, and quality tooling implementation. It must stop being
the durable public owner of `wp`, `ak`, or `webpresso` command brands.

Future user-facing setup command: `webpresso agent setup`.

## Fact-Checked Findings

| ID | Severity | Claim / assumption | Verified reality | Blueprint fix |
| --- | --- | --- | --- | --- |
| F1 | CRITICAL | Agent-kit can keep shipping the public `webpresso` bin. | `/Users/ozby/repos/webpresso/agent-kit/package.json` is `@webpresso/agent-kit@0.19.0` and currently maps both `wp` and `webpresso` to `./src/cli/cli.ts`. npm `bin` entries install user-visible command names, so this is public API ownership. Source: https://docs.npmjs.com/cli/v10/configuring-npm/package-json/ | Remove durable public `wp`, `ak`, and `webpresso` host ownership from agent-kit after the agent bundle is registered. |
| F2 | CRITICAL | `@webpresso/webpresso` can be treated as the tooling umbrella. | `/Users/ozby/repos/webpresso/framework/package.json` is `@webpresso/webpresso@0.3.8`, exports framework/runtime/auth/schema/codegen APIs, and has no public `webpresso` bin. | Keep framework identity separate; agent-kit must not route tooling through `@webpresso/webpresso`. |
| F3 | CRITICAL | The public CLI package boundary is optional. | `/Users/ozby/repos/webpresso/monorepo/packages/cli/public-cli/package.json` currently owns `bin.webpresso`; ADR 0042 and the unified CLI blueprint assign public binary ownership to `@webpresso/cli`. | Agent-kit exports a bundle; `@webpresso/cli` owns public `webpresso`. |
| F4 | HIGH | The host runtime may own the public binary. | `/Users/ozby/repos/webpresso/monorepo/packages/cli/host/package.json` has no `bin`; the unified CLI blueprint says `@webpresso/cli-host` is parser/help/output/profile runtime only. | Agent-kit tests must depend on contract behavior, not host binary ownership. |
| F5 | HIGH | Bundle authors can depend directly on parser internals. | `/Users/ozby/repos/webpresso/monorepo/packages/cli/contract/package.json` exports `./bundle`, `./command`, `./result-envelope`, `./reserved-roots`, `./exit-codes`, `./ordering`, and `./compatibility`. Node package exports define explicit consumer entrypoints. Source: https://nodejs.org/api/packages.html | Target `@webpresso/cli-contract` types in the bundle surface. |
| F6 | HIGH | Internal commands can share the public distribution. | `/Users/ozby/repos/webpresso/monorepo/packages/cli/internal-cli/package.json` is `@webpresso-internal/cli` and owns `webpresso-internal`; the unified CLI blueprint keeps internal distribution separate. | Agent-kit must not expose internal-only helpers through public help or public profiles. |
| F7 | HIGH | Current `wp setup` references can remain unclassified. | `/Users/ozby/repos/webpresso/monorepo/package.json` still has `setup:agent = "wp setup"`, and framework hook-surface blueprints reference `wp setup` as current projector behavior. Long-term `wp`, `ak`, `cli2`, and `wk` aliases are not supported by the canonical cutover facts. | Any remaining `wp setup` mention must be tagged current-state or migration-only and include `webpresso agent setup` as the replacement. |
| F8 | MEDIUM | Scoped package identities are cosmetic. | npm scopes are the package namespace mechanism for related organization packages, and GitHub Packages npm registry expects full scoped names such as `@namespace/package`. Sources: https://docs.npmjs.com/about-scopes/ and https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry | Preserve `@webpresso/agent-kit` as the tooling package identity while moving command identity to the CLI host. |
| F9 | MEDIUM | Command grouping can be delayed. | CLI guidance warns that command shapes become scripted contracts; subcommands should group related actions and errors should suggest next actions. Sources: https://learn.microsoft.com/en-us/dotnet/standard/commandline/design-guidance and https://clig.dev/ | Group agent tooling under `webpresso agent ...` now and make stale command diagnostics exact. |

## Codebase Verification

- Existing target paths for this blueprint are real in `agent-kit`: `src/cli/cli.ts`, `catalog/AGENTS.md.tpl`, `src/cli/commands/init/scaffold-agents-md.test.ts`, `src/cli/commands/audit.ts`, `src/cli/auto-update/detect-pm.ts`, `src/cli/auto-update/detect-pm.test.ts`, `src/cli/commands/init/init.e2e.test.ts`, `test-fixtures/bundle-smoke/package.json`, `package.contract.test.ts`, and `CHANGELOG.md`.
- Current package scripts include `setup:agent = "wp setup"` and `format = "WP_SKIP_UPDATE_CHECK=1 wp format"`. These are current-state legacy invocations, not future interface commitments.
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

| Plan | Alignment requirement | This blueprint's responsibility |
| --- | --- | --- |
| `framework-cli-package-boundary` | `@webpresso/webpresso` stays framework/runtime identity and exports framework commands as a CLI bundle. | Do not put agent-tooling setup under `@webpresso/webpresso`; use `@webpresso/agent-kit` bundle exports instead. |
| `wp-setup-hook-surface-framework` | Framework-owned committed hook templates currently converge on `wp-*` hook helper names and reject `ak-*` drift. | Treat `wp-*` hook helpers as current implementation details, not public CLI aliases; future docs must name `webpresso agent setup` for user setup. |
| `wp-setup-hook-surface-projector` | Agent-kit owns setup/projection behavior and must converge stale local `.codex/hooks.json` from mixed `ak-*` + `wp-*` state. | Keep projector implementation in agent-kit, but expose the user entry through the agent bundle. Any test still invoking `wp setup` must be labeled current-state until the cutover lands. |
| `unified-cli-public-cutover` | `@webpresso/cli` owns public `webpresso`, `@webpresso/cli-host` owns shared runtime only, `@webpresso/cli-contract` owns bundle contracts, and `@webpresso-internal/cli` owns internal distribution. | Export the agent bundle and remove agent-kit public bin ownership in the same release wave that the monorepo mounts the bundle. |

## Technology Choices

| Choice | Decision | Rationale |
| --- | --- | --- |
| Package identity | Keep `@webpresso/agent-kit` | Scoped package identity correctly names the tooling owner and avoids framework/tooling collision. |
| User command namespace | `webpresso agent ...` | One public CLI brand with a clear agent-tooling group. |
| Bundle contract | Target `@webpresso/cli-contract` | Keeps parser/help/profile details host-private and shared with framework/internal bundles. |
| Public binary owner | `@webpresso/cli` only | Matches ADR 0042 and monorepo public cutover. |
| Host runtime | `@webpresso/cli-host` only | Shared runtime must not become a second public binary package. |
| Internal distribution | `@webpresso-internal/cli` | Prevents operator-only commands from leaking into public help/install paths. |
| Legacy aliases | Hard-cut active `wp`, `ak`, `cli2`, and `wk` usage | Long-term aliases are rejected; migration/current-state references need exact replacements. |

## Edge Cases and Error Handling

| ID | Severity | Case | Handling |
| --- | --- | --- | --- |
| E1 | CRITICAL | Agent-kit still ships `webpresso` after `@webpresso/cli` ships public `webpresso`. | Package contract test fails if agent-kit owns public `webpresso`, `wp`, or `ak` bins. |
| E2 | CRITICAL | A stale script invokes `wp setup` after the cutover. | Audit and diagnostics must classify it as current-state/migration-only and print `webpresso agent setup`. |
| E3 | HIGH | Hook helper bins are removed before generated hooks stop needing them. | Keep required hook helpers as explicitly internal until projector and generated hook config are migrated. |
| E4 | HIGH | Agent and framework bundles register the same command root. | Bundle tests assert agent commands live under `agent` and defer duplicate-root rejection to `@webpresso/cli-contract`. |
| E5 | HIGH | Public help leaks internal docs-lint or hook helpers. | Bundle metadata marks helpers hidden/internal and host profile tests exclude them from public help. |
| E6 | MEDIUM | Generated AGENTS.md says “managed by webpresso” when the block is agent-kit-owned. | Template tests require precise owner text: agent-kit for generated assets, Webpresso CLI for host commands. |
| E7 | MEDIUM | Current sibling hook blueprints mention `wp setup` without future replacement context. | This blueprint records the boundary; if sibling files present `wp setup` as more than current-state or migration input, downstream refinement must update those files. |
| E8 | MEDIUM | JSON output differs between agent bundle commands and framework bundle commands. | Agent bundle handlers must return the shared result envelope type or adapter. |

## Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| R1: Premature bin removal breaks local setup | CRITICAL | Sequence removal after bundle registration and replacement diagnostics exist; run detached setup e2e through `webpresso agent setup`. |
| R2: Sibling blueprints normalize `wp setup` beyond migration language | HIGH | Keep `wp setup` only as current-state/migration wording and report sibling contradictions instead of editing other repos from this task. |
| R3: Agent bundle duplicates old router logic | HIGH | Bundle definitions should adapt existing command handlers and stay thin; tests assert command IDs, not parser internals. |
| R4: Internal hook helpers leak as public commands | HIGH | Add public help/profile assertions and package boundary checks. |
| R5: Docs drift back to mixed `wp`/`ak`/`webpresso` ownership | MEDIUM | Add active-doc grep gate with explicit migration-history allowlist. |
| R6: Release order crosses repos incorrectly | MEDIUM | Coordinate with unified CLI public cutover: mount bundle first, then hard-cut agent-kit public bins. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| --- | --- | --- | --- | --- |
| **Wave 0** | 1.1, 1.2, 1.3, 1.4, 1.5 | None | 5 agents | XS-S |
| **Wave 1** | 2.1, 2.2 | 2.1 depends on 1.1/1.3/1.5; 2.2 depends on 1.2/1.4 | 2 agents | S |
| **Wave 2** | 3.1 | 2.1, 2.2, 1.5 | 1 agent | S |
| **Critical path** | 1.1 → 2.1 → 3.1 | — | 3 waves | M |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| --- | --- | --- | --- |
| RW0 | Ready tasks in Wave 0 | ≥ planned agents / 2 | 5 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 2.67 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 1.0 |
| CP | same-file overlaps per wave | 0 | 0 |

Parallelization score: **A**. The package/bin boundary is the only real
fan-in point, and all same-file work is either isolated in Wave 0 or serialized
behind Wave 1.

## Tasks

### Wave 0 — independent evidence and guardrail setup

#### Task 1.1: Define the agent command inventory [contract]

**Status:** todo

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

- [ ] Inventory covers setup, sync, audit, skills, docs, hooks, tests, e2e, tech-debt, and blueprint commands.
- [ ] Inventory contains exact replacement commands for current legacy invocations.
- [ ] No parser or host runtime dependency appears in the inventory module.
- [ ] `pnpm test -- src/cli/bundle/agent-command-inventory.test.ts` passes.

#### Task 1.2: Rewrite generated owner language [docs]

**Status:** todo

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

- [ ] Generated templates distinguish agent-kit package ownership from Webpresso CLI command ownership.
- [ ] Any remaining legacy command text is migration/current-state language with an exact replacement.
- [ ] No generated-surface files are hand-edited.
- [ ] `pnpm test -- src/cli/commands/init/scaffold-agents-md.test.ts` passes.

#### Task 1.3: Add active legacy command grep gate [audit]

**Status:** todo

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

- [ ] Active docs/scripts cannot introduce user-facing `wp`, `ak`, `cli2`, or `wk` command names unnoticed.
- [ ] Migration-history/current-state mentions remain allowed only with replacement command text.
- [ ] Internal hook helper names are not allowed to appear as public user commands.
- [ ] Audit is wired into the existing audit command surface.

#### Task 1.4: Centralize replacement-command diagnostics [migration]

**Status:** todo

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

- [ ] Stale command guidance is actionable and exact.
- [ ] No diagnostic points users back to `wp`, `ak`, `cli2`, or `wk` as the future interface.
- [ ] `wp setup` replacement is exactly `webpresso agent setup`.
- [ ] `pnpm test -- src/cli/auto-update/detect-pm.test.ts` passes.

#### Task 1.5: Prepare the host-mounted agent smoke fixture [fixture]

**Status:** todo

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

- [ ] Fixture models public CLI ownership by `@webpresso/cli`.
- [ ] Fixture models agent-kit as a bundle/provider dependency, not a public binary provider.
- [ ] Any hook helper references are marked internal/current-state.
- [ ] Fixture README names `webpresso agent setup` as the setup command.

### Wave 1 — bundle export and cutover behavior

#### Task 2.1: Export the agent bundle and enforce package/bin boundary [bundle]

**Status:** todo

**Depends:** Task 1.1, Task 1.3, Task 1.5

Create the first agent bundle entrypoint against `@webpresso/cli-contract`,
adapt existing command handlers into bundle definitions, and remove durable
public `wp`, `ak`, and `webpresso` bin ownership from `@webpresso/agent-kit`.
Only keep hook/helper bins that are still required by generated hook configs,
and test that they are internal rather than public command brands.

**Files:**

- Create: `src/cli/bundle/index.ts`
- Create: `src/cli/bundle/index.test.ts`
- Modify: `package.json`
- Modify: `package.contract.test.ts`
- Modify: `src/cli/cli.ts`

**Steps (TDD):**

1. Write failing package contract tests that reject public `wp`, `ak`, or `webpresso` bins in agent-kit and allow only documented internal helpers.
2. Write failing bundle tests that import `src/cli/bundle/index.ts` and assert agent commands register under the `agent` namespace.
3. Run: `pnpm test -- package.contract.test.ts src/cli/bundle/index.test.ts` — verify FAIL.
4. Implement the bundle export, package exports, and bin boundary changes.
5. Run: `pnpm test -- package.contract.test.ts src/cli/bundle/index.test.ts` — verify PASS.
6. Run: `pnpm typecheck` and `pnpm lint`.

**Acceptance:**

- [ ] `@webpresso/agent-kit` exports a host-neutral agent bundle.
- [ ] `@webpresso/agent-kit` no longer owns durable public `wp`, `ak`, or `webpresso` command brands.
- [ ] Remaining helper bins are explicitly internal and covered by contract tests.
- [ ] Bundle tests prove command namespace and visibility metadata.

#### Task 2.2: Apply replacement diagnostics and release notes [docs]

**Status:** todo

**Depends:** Task 1.2, Task 1.4

Wire the replacement-command table into user-visible diagnostics and document the
hard cut in release notes. This task is the documentation half of the bin cutover:
users who encounter stale command names should know exactly what to run next.

**Files:**

- Modify: `src/cli/auto-update/detect-pm.ts`
- Modify: `src/cli/auto-update/detect-pm.test.ts`
- Modify: `CHANGELOG.md`

**Steps (TDD):**

1. Extend failing diagnostics tests to cover release-facing messages for stale setup and sync invocations.
2. Run: `pnpm test -- src/cli/auto-update/detect-pm.test.ts` — verify FAIL if messages still point to legacy commands.
3. Apply the replacement table to diagnostics and add a changelog entry for the `webpresso agent ...` cutover.
4. Run: `pnpm test -- src/cli/auto-update/detect-pm.test.ts` — verify PASS.
5. Refactor duplicated wording back to the shared table if any remains.
6. Run: `pnpm typecheck` and `pnpm lint`.

**Acceptance:**

- [ ] User-facing stale-command diagnostics include exact replacements.
- [ ] Changelog records that agent-kit no longer owns durable public CLI brands.
- [ ] `webpresso agent setup` is the documented replacement for `wp setup`.
- [ ] No release note describes `wp` or `ak` as a future supported alias.

### Wave 2 — detached consumer verification

#### Task 3.1: Verify detached consumer setup through the host-mounted bundle [qa]

**Status:** todo

**Depends:** Task 2.1, Task 2.2, Task 1.5

Run the detached consumer setup flow through the new host-mounted agent command
path. The test must prove generated files, hook commands, docs, and diagnostics
do not require agent-kit-owned public bins. This is the acceptance gate for the
agent-kit side of the unified CLI cutover.

**Files:**

- Modify: `src/cli/commands/init/init.e2e.test.ts`
- Modify: `test-fixtures/bundle-smoke/package.json`
- Modify: `test-fixtures/bundle-smoke/README.md`

**Steps (TDD):**

1. Update e2e expectations to invoke `webpresso agent setup` through the public CLI host fixture.
2. Run: `pnpm test -- src/cli/commands/init/init.e2e.test.ts` — verify FAIL before cutover wiring is complete.
3. Complete fixture and e2e updates for host-mounted setup, generated hook internals, and stale-command diagnostics.
4. Run: `pnpm test -- src/cli/commands/init/init.e2e.test.ts` — verify PASS.
5. Refactor fixture setup only if it duplicates command registration boilerplate.
6. Run: `pnpm qa`.

**Acceptance:**

- [ ] Detached setup works through `webpresso agent setup`.
- [ ] Generated docs and scripts do not call removed public bins.
- [ ] Generated hooks either avoid legacy helper names or mark required helpers internal/current-state.
- [ ] `pnpm qa` passes.

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

| Metric | Value |
| --- | --- |
| Findings total | 9 |
| Critical | 3 |
| High | 4 |
| Medium | 2 |
| Fixes applied to blueprint | 9/9 |
| Cross-plans reviewed | 4 |
| Edge cases documented | 8 |
| Risks documented | 6 |
| Parallelization score | A |
| Critical path | 3 waves |
| Max parallel agents | 5 |
| Total tasks | 8 |
| Blueprint compliant | 8/8 |
