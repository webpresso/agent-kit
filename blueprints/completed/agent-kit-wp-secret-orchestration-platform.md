---
type: blueprint
title: Agent Kit wp secret orchestration platform
owner: ozby
status: completed
complexity: XL
created: "2026-06-19"
last_updated: "2026-06-19"
progress: "100% (17/17 planning tasks completed; implementation split to child PRs, updated 2026-06-21)"
depends_on:
  - >-
    ./2026-06-19-cross-repo-agent-kit-dedupe-e2e-secrets-act-setup.md
cross_repo_depends_on:
  - repo: webpresso/agent-kit
    slug: agent-kit-wp-secret-orchestration-platform
    require_status: completed
  - repo: webpresso/github-actions
    slug: agent-kit-wp-secret-orchestration-platform
    require_status: completed
  - repo: webpresso/monorepo
    slug: agent-kit-wp-secret-orchestration-platform
    require_status: completed
  - repo: ozby/ingest-lens
    slug: agent-kit-wp-secret-orchestration-platform
    require_status: completed
  - repo: ozby/edge-matte
    slug: agent-kit-wp-secret-orchestration-platform
    require_status: completed
  - repo: ozby/ozby-dev
    slug: agent-kit-wp-secret-orchestration-platform
    require_status: completed
  - repo: ozby/aksaprocess.tr
    slug: agent-kit-wp-secret-orchestration-platform
    require_status: completed
tags:
  - agent-kit
  - wp
  - secrets
  - doppler
  - infisical
  - pulumi
  - cloudflare
  - neon
  - xata
  - github-actions
  - e2e
  - preview
---

# Agent Kit `wp` secret orchestration platform

## Planning Summary

Turn Agent Kit into the single orchestration layer for secrets, local preview,
e2e, Cloudflare deploys, Pulumi infrastructure, GitHub Actions bootstrap, local
`act`, cleanup, and optional database branch cloning. Consumer repos declare
intent in `.webpresso/secrets.config.json`, use global `wp`, keep
`@webpresso/agent-config` for TypeScript/Vitest/Stryker/Workers presets, and do
not add `@webpresso/agent-kit` as a project dependency.

This is a hard-cut cleanup: no backwards-compatible aliases, no legacy shims, no
retained local `with-secrets`, `act-with-webpresso`, `act-secret-profile`, or
setup clones after cutover.

## Execution Preconditions

- Canonical implementation worktrees are the dedicated dedupe worktrees:
  `_worktrees/agent-kit-dedupe`, `_worktrees/github-actions-dedupe`,
  `_worktrees/ingest-lens-dedupe`, `_worktrees/edge-matte-dedupe`,
  `_worktrees/ozby-dev-dedupe`, and matching monorepo/aksaprocess worktrees.
  Before Wave 0, sync or rebase each with `origin/main`; if local work blocks
  that, record the conflict and do not edit stale code.
- Verification commands in task steps must run through the repo's known-good
  wrapper in that worktree. If `./bin/wp` cannot resolve source-checkout
  binaries, fix the wrapper resolution first or use the repo-documented package
  script equivalent; do not silently skip FAIL/PASS checks.
- Task step paths such as `cd webpresso/agent-kit` are shorthand for the
  canonical synced dedupe worktree path for that repository. Workers must
  substitute the canonical worktree, not an unsynced main checkout.
- Secret profiles are not deploy lanes. Preserve deploy lane IDs `dev`,
  `preview_main`, `preview_pr_<n>`, and `prd`; profiles only select provider
  environments.

## Product wedge anchor

- **Stage outcome:** a new or migrated TypeScript Cloudflare app can reach a
  trusted secret diagnosis and live preview through `wp`.
- **Consuming surface:** `wp secrets doctor`, `wp preview`, `wp e2e`,
  `wp deploy production`, `wp cleanup preview`, `wp migrate secrets`,
  `wp secrets bootstrap github`.
- **New user-visible capability:** a developer or agent gets an actionable
  redacted report or a live Cloudflare preview URL without understanding Doppler,
  Infisical, GitHub reusable workflows, Pulumi, Wrangler, Neon, or Xata.

## Key Decisions

| ID  | Decision                                                                                                                                                                                         | Rationale                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| D1  | Public CLI is intent-first; internals are provider/profile/sink/capability.                                                                                                                      | Developers care about preview/e2e/deploy outcomes, not sink plumbing.                              |
| D2  | Consumer boundary is global `wp` plus `@webpresso/agent-config`; no consumer `@webpresso/agent-kit` dependency.                                                                                  | Agent Kit is the toolchain, not app source.                                                        |
| D3  | Built-in provider plugins are Doppler and Infisical; future plugins are explicit allowlist only.                                                                                                 | Covers current need without speculative auto-discovery.                                            |
| D4  | Ozby uses a separate Doppler workplace and per-app projects: `ingest-lens`, `edge-matte`, `ozby-dev`, `aksaprocess-tr`.                                                                          | Keeps Webpresso and Ozby secret ownership separate.                                                |
| D5  | Local Doppler switching is orchestrated through workspace/project validation and scoped CLI login guidance.                                                                                      | Doppler supports multiple CLI logins scoped by directory.                                          |
| D6  | CI auth is capability-based: OIDC where available; explicit Doppler service-token bootstrap when OIDC is plan-gated.                                                                             | Doppler service account identities are Team/Enterprise; current Ozby account does not expose them. |
| D7  | GitHub bootstrap secrets are lane-named repo secrets, e.g. `CI_SECRET_PROVIDER_TOKEN_PREVIEW` and `CI_SECRET_PROVIDER_TOKEN_PRODUCTION`, not GitHub Environment secrets as the core abstraction. | Reusable workflows and local `act` stay simpler and more predictable.                              |
| D8  | `wp preview` never mutates external secret state implicitly.                                                                                                                                     | Bootstrap is explicit via dry-run/apply transaction.                                               |
| D9  | DB branch cloning is optional and capability-detected. Neon is current; Xata is later.                                                                                                           | Both support copy-on-write schema+data branch cloning; non-DB apps skip.                           |
| D10 | Pulumi is a first-class env-injection sink only in v1; Pulumi ESC stays docs-only optional acceleration.                                                                                         | Infrastructure commands use the same profile contract without Agent Kit owning ESC environments.   |
| D11 | All secret-bearing third-party actions and reusable workflows must be full-SHA pinned.                                                                                                           | Reduces supply-chain risk in jobs with secrets.                                                    |
| D12 | Every failure gets stable `WP_*` code, docs URL, redacted evidence, and `--json`.                                                                                                                | Agents can repair setup without parsing prose.                                                     |
| D13 | Secret profiles and deploy lanes are separate axes. Profiles are `preview`/`production`; lane IDs stay `dev`, `preview_main`, `preview_pr_<n>`, and `prd`.                                       | Avoids renaming deploy-contract lanes while still routing secrets by provider environment.         |

## Fact-Checked Findings

| ID  | Severity | Claim / assumption                                                  | Reality                                                                                                                                                    | Fix                                                                                                                                                            |
| --- | -------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | CRITICAL | The DB benchmark could use a non-target platform.                   | Neon documents copy-on-write branches with data; Xata documents instant copy-on-write branches with exact schema+data.                                     | Use Neon now, Xata later; remove the previous wrong DB benchmark.                                                                                              |
| F2  | HIGH     | One Doppler login is enough for Webpresso and Ozby.                 | Doppler documents multiple workspace logins scoped by directory.                                                                                           | Add `workplaceId` validation and scoped-login remediation.                                                                                                     |
| F3  | HIGH     | Doppler OIDC can be required everywhere.                            | Doppler service account identities require Team/Enterprise.                                                                                                | Use provider capability detection; explicit service-token bootstrap when OIDC unavailable.                                                                     |
| F4  | HIGH     | Infisical should use long-lived CI tokens like Doppler fallback.    | Infisical GitHub Actions docs use OIDC machine identities and short-lived tokens.                                                                          | Infisical CI path is OIDC-first.                                                                                                                               |
| F5  | HIGH     | GitHub Environments with same secret names are a clean abstraction. | GitHub reusable workflow docs warn environment secrets are not passed through `workflow_call` like caller secrets.                                         | Use lane-named repo secrets and provider profiles.                                                                                                             |
| F6  | HIGH     | Tag pins are sufficient in secret-bearing workflows.                | GitHub secure-use docs recommend full-length SHA pinning for immutability.                                                                                 | Add SHA-pin audit.                                                                                                                                             |
| F7  | MEDIUM   | Pulumi needs a separate secret system.                              | Pulumi ESC has Doppler and Infisical login/secrets providers and Pulumi GitHub OIDC support, but the locked eng boundary excludes ESC orchestration in v1. | Add Pulumi env-injection sink; keep ESC as docs-only optional acceleration.                                                                                    |
| F8  | MEDIUM   | GitHub bootstrap must stay manual.                                  | GitHub CLI and Pulumi GitHub provider can create repository Actions secrets.                                                                               | `wp secrets bootstrap github` plans/applies/rotates/revokes explicitly.                                                                                        |
| F9  | HIGH     | Existing consumer scripts can remain temporarily.                   | User requires no backwards compatibility and full cleanup.                                                                                                 | Blocking audits plus local migration command delete legacy paths; audit excludes only the monorepo's intentional `workspace:*`/`agent-kit-local` dogfood link. |
| F10 | MEDIUM   | Worktrees can be assumed current.                                   | Current snapshots show some target repos not at `origin/main` and some with local changes.                                                                 | Execution precondition: sync/rebase or capture conflicts before edits.                                                                                         |

## Evidence Base

| Evidence                                                                                                                     | Plan impact                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `webpresso/agent-kit/README.md` says to pin `@webpresso/agent-kit` in consumer repos.                                        | Rewrite Quick Start and dependency warning to global `wp` + `@webpresso/agent-config`. |
| `webpresso/agent-kit/src/cli/auto-update/version-skew.ts` warns about repo-pinned Agent Kit.                                 | Update warning and tests.                                                              |
| `webpresso/agent-kit/src/audit/secret-provider-quarantine.ts`, `secrets-config.ts`, `ci/act-runner.ts`, `deploy/*`, `e2e/*`. | Extend existing surfaces; do not fork orchestration.                                   |
| `webpresso/github-actions/.github/workflows/cloudflare-preview.yml`, `cloudflare-production.yml`.                            | Centralize setup/cache/OIDC/secret bootstrap in shared workflows.                      |
| `ozby/ingest-lens`, `ozby/edge-matte`, `ozby/ozby-dev`, `webpresso/monorepo` package scripts/configs.                        | Consumer migration and hard-cut audit targets.                                         |
| Updated DX review artifact D20.                                                                                              | Blueprint uses Neon now / Xata later and removes the previous wrong DB benchmark.      |

## Architecture Overview

```text
.webpresso/secrets.config.json
  schemaVersion: 1, metadata only, explicit providers/profiles/sinks
       |
       v
secrets/model + normalizer
       |
       v
resolveSecretSink({ sink, profile, op })
single orchestration choke point
       |
       +-- provider plugins: doppler | infisical | future allowlisted
       +-- sink plugins:
           dev-server | test | e2e | deploy-wrangler | pulumi |
           act | github-actions-bootstrap | db-branch
```

Canonical v1 shape is pinned to the locked engineering review:

```jsonc
{
  "schemaVersion": 1,
  "providers": {
    "default": {
      "type": "doppler",
      "workspace": "ozby",
      "workspaceId": "7abb07fb8507f57c2011",
      "project": "ingest-lens",
    },
  },
  "profiles": {
    "preview": { "provider": "default", "environment": "stg" },
    "production": { "provider": "default", "environment": "prd" },
  },
  "sinks": {
    "dev-server": { "defaultProfile": "preview", "allowedOps": ["run"] },
    "test": { "defaultProfile": "preview", "allowedOps": ["run"] },
    "e2e": { "defaultProfile": "preview", "allowedOps": ["run"] },
    "deploy-wrangler": { "defaultProfile": "production", "allowedOps": ["preview", "deploy"] },
    "pulumi": { "defaultProfile": "preview", "allowedOps": ["preview", "up"] },
    "act": { "defaultProfile": "preview", "allowedOps": ["replay", "run"] },
    "github-actions-bootstrap": {
      "defaultProfile": "production",
      "allowedOps": ["verify", "apply", "rotate", "revoke"],
    },
    "db-branch": { "defaultProfile": "preview", "allowedOps": ["create", "connect", "cleanup"] },
  },
}
```

Provider plugins must expose the locked interface shape, not ad hoc provider
branches in callers:

```ts
type SecretProviderPlugin = {
  id: "doppler" | "infisical" | string;
  authModes: {
    local: "cli-login" | "keychain";
    ci: Array<"oidc" | "service-token">;
  };
  capabilities: {
    profiles: string[];
    sinks: string[];
    bootstrap: Array<"github-actions-bootstrap" | "manual">;
  };
  redactionPolicy(input: RedactionInput): RedactionPolicy;
  diagnose(input: ProviderDoctorInput): Promise<ProviderDoctorReport>;
  fetchProfile(input: ProviderProfileFetchInput): Promise<ResolvedSecretMaterial>;
  planBootstrap?(input: ProviderBootstrapInput): Promise<ProviderBootstrapPlan>;
};

type SecretOrchestrator = {
  resolveSecretSink(input: {
    sink: string;
    profile: string;
    op: string;
  }): Promise<ResolvedSecretSinkPlan>;
};
```

Provider plugins expose only capability descriptors, profile resolution, doctor
diagnostics, redaction metadata, and optional bootstrap planning. The central
orchestrator owns `resolveSecretSink`; providers never choose consumer sinks.
Sinks are provider-neutral and never print raw secret values.

## Quick Reference (Execution Waves)

| Wave              | Tasks                       | Dependencies     | Parallelizable | Effort (T-shirt) |
| ----------------- | --------------------------- | ---------------- | -------------: | ---------------- |
| **Wave 0**        | 1.1, 1.2, 1.3, 1.4, 1.5     | None             |       5 agents | S-M              |
| **Wave 1**        | 2.1, 2.2, 2.3, 2.4          | Wave 0 contracts |       4 agents | M                |
| **Wave 2**        | 3.1, 3.2, 3.3               | Wave 1           |       3 agents | M-L              |
| **Wave 3**        | 4.1, 4.2, 4.3, 4.4          | Wave 2           |       4 agents | M                |
| **Wave 4**        | 5.1                         | Wave 3           |        1 agent | S                |
| **Critical path** | 1.1 → 2.1 → 3.1 → 4.1 → 5.1 | —                |        5 waves | XL               |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  |               Target | Actual |
| ------ | ---------------------------------- | -------------------: | -----: |
| RW0    | Ready tasks in Wave 0              | ≥ planned agents / 2 |      5 |
| CPR    | total_tasks / critical_path_length |                ≥ 2.5 |    3.4 |
| DD     | dependency_edges / total_tasks     |                ≤ 2.0 |    1.5 |
| CP     | same-file overlaps per wave        |                    0 |      0 |

## Tasks

#### [schema] Task 1.1: Secret config, provider plugin, and sink contracts

**Status:** done

**Depends:** None

Implement the pinned `schemaVersion: 1` shape from Architecture Overview:
`providers` map, `profiles` map, explicit `sinks` registry, `allowedOps`, and
metadata-only validation. Define the `SecretProviderPlugin` shape with
`authModes`, `capabilities`, `redactionPolicy`, diagnostics, profile fetch, and
optional bootstrap planning. Define `SecretOrchestrator.resolveSecretSink({
sink, profile, op })` as the single choke point outside provider plugins. Keep
the plugin surface small: Doppler, Infisical, test fakes, and future allowlist
metadata only.

**Files:**

- Create: `webpresso/agent-kit/src/secrets/config/schema.ts`
- Create: `webpresso/agent-kit/src/secrets/config/schema.test.ts`
- Create: `webpresso/agent-kit/src/secrets/providers/types.ts`
- Create: `webpresso/agent-kit/src/secrets/providers/registry.ts`
- Create: `webpresso/agent-kit/src/secrets/providers/registry.test.ts`
- Create: `webpresso/agent-kit/src/secrets/sinks/types.ts`
- Create: `webpresso/agent-kit/src/secrets/sinks/planner.test.ts`
- Map for provider/sink migration: `webpresso/agent-kit/src/runtime/secret-managers.ts`
- Map for later fold-in/delete after callers migrate: `webpresso/agent-kit/src/runtime/with-secrets-cli.ts`
- Map for later fold-in/delete after callers migrate: `webpresso/agent-kit/src/secret-gate/runner.ts`

**Steps (TDD):**

1. Write failing tests for valid Doppler Ozby config, valid Infisical config, unknown provider, unsupported sink, and redaction.
2. Run: `cd webpresso/agent-kit && ./bin/wp test --file src/secrets/config/schema.test.ts src/secrets/providers/registry.test.ts src/secrets/sinks/planner.test.ts` — verify FAIL.
3. Implement minimal schemas, registry, sink types, and redactor.
4. Run the same test command — verify PASS.
5. Remove speculative provider auto-discovery if introduced.
6. Run: `cd webpresso/agent-kit && ./bin/wp lint --file src/secrets && ./bin/wp typecheck`.

**Acceptance:**

- [x] The blueprint's pinned `schemaVersion: 1` example validates exactly.
- [x] Only explicit built-in providers and allowed sinks validate.
- [x] `resolveSecretSink({ sink, profile, op })` is the only orchestration choke point.
- [x] Ozby Doppler workspace/project fixture validates.
- [x] Infisical fixture validates.
- [x] Redaction tests include canary secret values.
- [x] Old `secret-managers`, `with-secrets-cli`, and `secret-gate` behavior is mapped to the provider/sink model without breaking current importers; destructive deletion of `with-secrets-cli` and `secret-gate` waits for Task 3.2 caller migration.
- [x] Lint and typecheck pass.

#### [errors] Task 1.2: Stable `WP_*` error and JSON report envelope

**Status:** done

**Depends:** None

Create one report envelope for doctor, preview, e2e, deploy, bootstrap, migrate,
and cleanup. Every user-facing failure needs problem, cause, fix, docs URL,
redacted evidence, and JSON output.

**Files:**

- Create: `webpresso/agent-kit/src/errors/wp-error.ts`
- Create: `webpresso/agent-kit/src/errors/wp-error.test.ts`
- Create: `webpresso/agent-kit/docs/errors/wp-secret-orchestration.md`
- Modify: `webpresso/agent-kit/src/cli/commands/err.ts`

**Steps (TDD):**

1. Write failing tests for code stability, JSON shape, redaction, and docs URL validation.
2. Run: `cd webpresso/agent-kit && ./bin/wp test --file src/errors/wp-error.test.ts src/cli/commands/err.test.ts` — verify FAIL.
3. Implement envelope helpers and CLI formatting.
4. Run the same test command — verify PASS.
5. Refactor for clarity; do not add duplicate report types per command.
6. Run: `cd webpresso/agent-kit && ./bin/wp lint --file src/errors src/cli/commands/err.ts docs/errors/wp-secret-orchestration.md && ./bin/wp typecheck`.

**Acceptance:**

- [x] All reports redact configured secret values.
- [x] Codes start with `WP_` and are documented.
- [x] `--json` shape is stable for agents.
- [x] Lint and typecheck pass.

#### [audit] Task 1.3: Hard-cut audits and migration fixtures

**Status:** done

**Depends:** None

Extend blocking audits and fixtures for old `with-secrets -- act`, local
`act-with-webpresso`, `act-secret-profile`, local setup clones, legacy CI
provider-token fallbacks, unpinned secret-bearing actions, and consumer
`@webpresso/agent-kit` dependencies. Add the named
`github-actions-secrets` audit here so workflow tasks can consume the gate
instead of inventing repo-local checks.

**Files:**

- Modify: `webpresso/agent-kit/src/audit/secret-provider-quarantine.ts`
- Modify: `webpresso/agent-kit/src/audit/secret-provider-quarantine.test.ts`
- Create: `webpresso/agent-kit/src/audit/github-actions-secrets.ts`
- Create: `webpresso/agent-kit/src/audit/github-actions-secrets.test.ts`
- Modify: `webpresso/agent-kit/src/audit/package-surface.ts`
- Create: `webpresso/agent-kit/src/secrets/migrate/fixtures/`
- Create: `webpresso/agent-kit/src/secrets/migrate/fixtures.test.ts`

**Steps (TDD):**

1. Add failing fixtures for each legacy pattern, unpinned secret-bearing GitHub Action, broad secret export, `secrets: inherit`, GitHub Environment secret dependence, and one clean global-`wp` fixture.
2. Run: `cd webpresso/agent-kit && ./bin/wp test --file src/audit/secret-provider-quarantine.test.ts src/audit/github-actions-secrets.test.ts src/secrets/migrate/fixtures.test.ts` — verify FAIL.
3. Implement audit rules and expected local cleanup patches.
4. Run the same test command — verify PASS.
5. Confirm there is no compatibility allowlist for old scripts.
6. Run: `cd webpresso/agent-kit && ./bin/wp lint --file src/audit src/secrets/migrate && ./bin/wp typecheck`.

**Acceptance:**

- [x] Legacy patterns fail with exact remediation.
- [x] `wp audit github-actions-secrets` has an Agent Kit implementation and fixture coverage.
- [x] Clean global-`wp` + `@webpresso/agent-config` fixture passes.
- [x] No shim or legacy alias is introduced.
- [x] Lint and typecheck pass.

#### [db] Task 1.4: DB branch capability contract

**Status:** done

**Depends:** None

Define provider-neutral `dbBranch` lifecycle types for preview/e2e: create,
connection string, smoke, TTL, cleanup, and silent skip when absent. Current
adapter target is Neon; Xata is future-gated behind the same contract.

**Files:**

- Create: `webpresso/agent-kit/src/db-branching/types.ts`
- Create: `webpresso/agent-kit/src/db-branching/types.test.ts`
- Create: `webpresso/agent-kit/src/db-branching/fake-provider.ts`
- Create: `webpresso/agent-kit/docs/db-branching/neon-xata.md`

**Steps (TDD):**

1. Write failing tests for DB-present plan, DB-absent skip, TTL cleanup, Neon descriptor, and Xata future descriptor.
2. Run: `cd webpresso/agent-kit && ./bin/wp test --file src/db-branching/types.test.ts` — verify FAIL.
3. Implement contracts and fake provider.
4. Run the same test command — verify PASS.
5. Keep provider-specific details out of consumer config except capability declaration.
6. Run: `cd webpresso/agent-kit && ./bin/wp lint --file src/db-branching docs/db-branching/neon-xata.md && ./bin/wp typecheck`.

**Acceptance:**

- [x] Non-DB apps skip DB branch logic with evidence.
- [x] Neon current target is explicit.
- [x] Xata future target is documented but not required.
- [x] Lint and typecheck pass.

#### [docs] Task 1.5: Global `wp` dependency contract and warning rewrite

**Status:** done

**Depends:** None

Rewrite docs and warning text so consumers use global `wp` and
`@webpresso/agent-config`, not a pinned `@webpresso/agent-kit` project
dependency. This includes the version-skew warning that currently says the repo
is pinned to Agent Kit.

**Files:**

- Modify: `webpresso/agent-kit/README.md`
- Modify: `webpresso/agent-kit/src/cli/auto-update/version-skew.ts`
- Modify: `webpresso/agent-kit/src/cli/auto-update/version-skew.test.ts`
- Modify: `webpresso/agent-kit/catalog/agent/AGENTS.md`
- Create: `webpresso/agent-kit/docs/guides/repo-to-preview-url.md`

**Steps (TDD):**

1. Write failing tests asserting the warning recommends global `wp` plus `@webpresso/agent-config`.
2. Run: `cd webpresso/agent-kit && ./bin/wp test --file src/cli/auto-update/version-skew.test.ts` — verify FAIL.
3. Update warning, README, and generated guidance.
4. Run the same test command — verify PASS.
5. Grep docs for stale consumer Agent Kit dependency instructions and remove them.
6. Run: `cd webpresso/agent-kit && ./bin/wp lint --file README.md catalog/agent/AGENTS.md docs/guides/repo-to-preview-url.md`.

**Acceptance:**

- [x] No consumer-facing docs instruct adding `@webpresso/agent-kit` as a project dependency.
- [x] Version warning points to global `wp` and `@webpresso/agent-config`.
- [x] Quick Start starts with `wp secrets doctor` and `wp preview`.
- [x] Docs lint passes.

#### [provider] Task 2.1: Doppler and Infisical provider adapters

**Status:** done

**Depends:** Task 1.1, Task 1.2

Implement Doppler and Infisical provider adapters. Doppler must validate scoped
workplace/project/config, support local CLI login, and advertise OIDC or
service-token bootstrap based on capability. Infisical must model local login
and OIDC machine identity CI.

**Files:**

- Create: `webpresso/agent-kit/src/secrets/providers/doppler.ts`
- Create: `webpresso/agent-kit/src/secrets/providers/doppler.test.ts`
- Create: `webpresso/agent-kit/src/secrets/providers/infisical.ts`
- Create: `webpresso/agent-kit/src/secrets/providers/infisical.test.ts`
- Modify: `webpresso/agent-kit/src/secrets/providers/registry.ts`

**Steps (TDD):**

1. Write failing tests for correct/wrong Doppler workspace, Doppler service-token bootstrap plan, Infisical OIDC identity metadata, and redacted diagnostics.
2. Run: `cd webpresso/agent-kit && ./bin/wp test --file src/secrets/providers/doppler.test.ts src/secrets/providers/infisical.test.ts` — verify FAIL.
3. Implement adapters through command-host abstractions.
4. Run the same test command — verify PASS.
5. Confirm no fake secret values appear in logs.
6. Run: `cd webpresso/agent-kit && ./bin/wp lint --file src/secrets/providers && ./bin/wp typecheck`.

**Acceptance:**

- [x] Doppler wrong-workplace report includes `doppler login --scope <path>` fix.
- [x] Doppler non-Team service-token bootstrap is explicit and lane-scoped.
- [x] Infisical OIDC identity ID is treated as non-secret metadata.
- [x] Lint and typecheck pass.

#### [sinks] Task 2.2: Sink planner, Pulumi sink, and GitHub bootstrap model

**Status:** done

**Depends:** Task 1.1, Task 1.2, Task 1.4

Implement provider-neutral sink planning for runtime/dev server, e2e, deploy,
Pulumi env injection, GitHub bootstrap, local `act`, and DB branch. Pulumi ESC
is docs-only optional acceleration in v1; Agent Kit must not generate ESC
environments, write Pulumi stack config, change secrets providers, or manage
passphrases. Include GitHub dry-run/apply/verify/rotate/revoke transaction
modeling.

**Files:**

- Create: `webpresso/agent-kit/src/secrets/sinks/planner.ts`
- Create: `webpresso/agent-kit/src/secrets/sinks/planner.test.ts`
- Create: `webpresso/agent-kit/src/secrets/sinks/pulumi.ts`
- Create: `webpresso/agent-kit/src/secrets/sinks/pulumi.test.ts`
- Create: `webpresso/agent-kit/src/audit/pulumi-secret-boundary.ts`
- Create: `webpresso/agent-kit/src/audit/pulumi-secret-boundary.test.ts`
- Create: `webpresso/agent-kit/src/secrets/bootstrap/github.ts`
- Create: `webpresso/agent-kit/src/secrets/bootstrap/github.test.ts`
- Create: `webpresso/agent-kit/docs/secrets/pulumi.md`

**Steps (TDD):**

1. Write failing tests for every sink, DB skip, Pulumi env injection, Pulumi no-mutation boundary, GitHub dry-run/apply plan, and redaction.
2. Run: `cd webpresso/agent-kit && ./bin/wp test --file src/secrets/sinks/planner.test.ts src/secrets/sinks/pulumi.test.ts src/secrets/bootstrap/github.test.ts src/audit/pulumi-secret-boundary.test.ts` — verify FAIL.
3. Implement planner, Pulumi env-injection sink, Pulumi boundary audit, and GitHub bootstrap transaction model.
4. Run the same test command — verify PASS.
5. Confirm external mutation is impossible without explicit apply.
6. Run: `cd webpresso/agent-kit && ./bin/wp lint --file src/secrets/sinks src/secrets/bootstrap src/audit/pulumi-secret-boundary.ts docs/secrets/pulumi.md && ./bin/wp typecheck`.

**Acceptance:**

- [x] Sink planner is provider-neutral.
- [x] Pulumi supports env injection only in v1.
- [x] Pulumi ESC is documented as optional and no ESC files are generated by Agent Kit.
- [x] GitHub bootstrap dry-run is default, and apply/verify/rotate/revoke ops match the schema example.
- [x] Lint and typecheck pass.

#### [workflow] Task 2.3: Shared GitHub Actions workflow contracts

**Status:** done

**Depends:** Task 1.2, Task 1.3

Centralize reusable setup/cache/OIDC/secret-bootstrap/e2e/deploy/cleanup shells
in `webpresso/github-actions`. Tests must reject GitHub Environment secret
dependency, broad secret export, and non-SHA secret-bearing third-party actions
through the named `wp audit github-actions-secrets` gate.

**Files:**

- Modify: `webpresso/github-actions/.github/workflows/cloudflare-preview.yml`
- Modify: `webpresso/github-actions/.github/workflows/cloudflare-production.yml`
- Create: `webpresso/github-actions/.github/workflows/wp-e2e.yml`
- Create: `webpresso/github-actions/.github/workflows/wp-cleanup-preview.yml`
- Create: `webpresso/github-actions/test/secret-orchestration-workflows.test.ts`
- Create: `webpresso/github-actions/docs/secret-orchestration.md`

**Steps (TDD):**

1. Write failing workflow tests for `id-token: write`, explicit named secrets, no `secrets: inherit` in secret-bearing jobs, and full SHA pins.
2. Run the repo workflow validation command documented by `webpresso/github-actions` — verify FAIL.
3. Implement reusable workflow contracts and docs.
4. Run the workflow validation command — verify PASS.
5. Confirm consumers are instructed to pin SHA/tag, never `@main`.
6. Run existing GitHub Actions validation scripts in the repo.

**Acceptance:**

- [x] Secret-bearing reusable workflows declare secrets explicitly.
- [x] No GitHub Environment secret dependence in reusable workflows.
- [x] OIDC permissions are present where needed.
- [x] SHA-pin expectations are testable through `wp audit github-actions-secrets`.

#### [agent] Task 2.4: Agent-operable JSON schemas and guidance

**Status:** done

**Depends:** Task 1.2

Define JSON schemas and generated snippets for Claude Code, Codex, and OpenCode
so agents use `--json` and docs URLs for doctor, preview, e2e, bootstrap,
cleanup, and migration.

**Files:**

- Create: `webpresso/agent-kit/src/agent-contracts/secret-orchestration.schema.ts`
- Create: `webpresso/agent-kit/src/agent-contracts/secret-orchestration.schema.test.ts`
- Modify: `webpresso/agent-kit/src/cli/commands/init/scaffolders/agent-hooks/emitters/claude.ts`
- Modify: `webpresso/agent-kit/src/cli/commands/init/scaffolders/agent-hooks/emitters/codex.ts`
- Modify: `webpresso/agent-kit/src/cli/commands/init/scaffolders/agent-hooks/emitters/opencode.ts`

**Steps (TDD):**

1. Write failing schema tests for doctor, preview, e2e, bootstrap, cleanup, and migrate outputs.
2. Run: `cd webpresso/agent-kit && ./bin/wp test --file src/agent-contracts/secret-orchestration.schema.test.ts` — verify FAIL.
3. Implement schemas and emitter snippets.
4. Run the schema test plus affected emitter tests — verify PASS.
5. Keep snippets short and command-focused.
6. Run: `cd webpresso/agent-kit && ./bin/wp lint --file src/agent-contracts src/cli/commands/init/scaffolders/agent-hooks/emitters && ./bin/wp typecheck`.

**Acceptance:**

- [x] JSON schemas cover all golden commands.
- [x] Agent snippets prefer JSON and docs URLs.
- [x] No secret values or private workspace tokens appear.
- [x] Lint and typecheck pass.

#### [cli] Task 3.1: Golden commands implementation

**Status:** done

**Depends:** Task 2.1, Task 2.2, Task 2.3, Task 2.4

Implement `wp secrets doctor`, `wp secrets bootstrap github`, `wp preview`,
`wp migrate secrets`, and `wp cleanup preview`. Doctor is the fast trust
signal; bootstrap is explicit external mutation; preview is doctor-first and
returns a live URL or structured fixes. Migration is dry-run-first and emits
safe patches that delete old consumer-local scripts without shims. Cleanup
uses the same profile/sink model for preview teardown.

**Files:**

- Create: `webpresso/agent-kit/src/cli/commands/secrets.ts`
- Create: `webpresso/agent-kit/src/cli/commands/secrets.test.ts`
- Create: `webpresso/agent-kit/src/cli/commands/preview.ts`
- Create: `webpresso/agent-kit/src/cli/commands/preview.test.ts`
- Create: `webpresso/agent-kit/src/cli/commands/migrate.ts`
- Create: `webpresso/agent-kit/src/cli/commands/migrate.test.ts`
- Create: `webpresso/agent-kit/src/cli/commands/cleanup.ts`
- Create: `webpresso/agent-kit/src/cli/commands/cleanup.test.ts`
- Modify: `webpresso/agent-kit/src/cli/router.ts`
- Modify: `webpresso/agent-kit/src/deploy/run.ts`

**Steps (TDD):**

1. Write failing tests for doctor success/failure, bootstrap dry-run/apply/rotate/revoke, preview URL success, missing bootstrap, migrate dry-run patch output, cleanup preview plan, and `--json`.
2. Run: `cd webpresso/agent-kit && ./bin/wp test --file src/cli/commands/secrets.test.ts src/cli/commands/preview.test.ts src/cli/commands/migrate.test.ts src/cli/commands/cleanup.test.ts` — verify FAIL.
3. Implement commands through provider/sink/deploy abstractions.
4. Run the same test command — verify PASS.
5. Confirm `wp preview` does not call bootstrap apply code.
6. Run: `cd webpresso/agent-kit && ./bin/wp lint --file src/cli/commands/secrets.ts src/cli/commands/preview.ts src/cli/commands/migrate.ts src/cli/commands/cleanup.ts src/deploy && ./bin/wp typecheck`.

**Acceptance:**

- [x] `wp secrets doctor --json` is actionable.
- [x] `wp secrets bootstrap github` defaults to dry-run.
- [x] `wp preview --json` emits URL or structured fixes.
- [x] `wp migrate secrets --dry-run --json` emits safe deletion/update patches for known legacy surfaces.
- [x] `wp cleanup preview --json` uses the shared profile/sink model and produces redacted teardown evidence.
- [x] Lint and typecheck pass.

#### [runtime] Task 3.2: E2E, deploy, local act, process supervisor, and Neon adapter integration

**Status:** done

**Depends:** Task 2.1, Task 2.2, Task 2.3

Wire existing `wp e2e`, `wp deploy`, `wp ci act`, and process supervision into
the shared profile/sink model. Implement Neon DB branch adapter; keep Xata
future-gated by the capability contract.

**Files:**

- Modify: `webpresso/agent-kit/src/cli/commands/e2e.ts`
- Modify: `webpresso/agent-kit/src/cli/commands/deploy.ts`
- Modify: `webpresso/agent-kit/src/cli/commands/ci.ts`
- Modify: `webpresso/agent-kit/src/ci/act-runner.ts`
- Modify: `webpresso/agent-kit/src/runtime/executor.ts`
- Modify: `webpresso/agent-kit/src/e2e/execution.ts`
- Create: `webpresso/agent-kit/src/db-branching/neon.ts`
- Create: `webpresso/agent-kit/src/db-branching/neon.test.ts`
- Fold-in/delete after caller migration: `webpresso/agent-kit/src/runtime/with-secrets-cli.ts`
- Fold-in/delete after caller migration: `webpresso/agent-kit/src/secret-gate/runner.ts`

**Steps (TDD):**

1. Write failing tests for e2e/deploy profile resolution, `act` direct/replay mode, process-tree cleanup, and Neon branch lifecycle.
2. Run: `cd webpresso/agent-kit && ./bin/wp test --file src/cli/commands/e2e.test.ts src/cli/commands/deploy.test.ts src/ci/act-runner.test.ts src/db-branching/neon.test.ts` — verify FAIL.
3. Implement integrations with redacted evidence and temp-file cleanup.
4. Run the same test command — verify PASS.
5. Rewire `act-runner` and runtime executor callers away from old with-secrets/secret-gate paths, then delete or fully fold those paths into the orchestrator without compatibility shims.
6. Confirm generated replay mode is labeled non-security-equivalent.
7. Run: `cd webpresso/agent-kit && ./bin/wp lint --file src/cli/commands/e2e.ts src/cli/commands/deploy.ts src/cli/commands/ci.ts src/ci src/runtime/executor.ts src/e2e src/db-branching && ./bin/wp typecheck`.

**Acceptance:**

- [x] E2E/deploy/act use the same secret profiles.
- [x] `act` supports direct and generated replay mode.
- [x] Neon branch lifecycle is tested; non-DB apps skip.
- [x] Old with-secrets/secret-gate callers are migrated before those files are deleted or folded into the orchestrator.
- [x] No backwards-compatible alias, shim, or parallel secret execution path remains.
- [x] Lint and typecheck pass.

#### [docs] Task 3.3: Journey docs and provider lifecycle docs

**Status:** done

**Depends:** Task 2.1, Task 2.2, Task 3.1

Publish journey-first docs for repo-to-preview, local Doppler workspace
switching, provider lifecycle, GitHub bootstrap, Pulumi, and Neon/Xata DB
branching.

**Files:**

- Modify: `webpresso/agent-kit/docs/guides/repo-to-preview-url.md`
- Create: `webpresso/agent-kit/docs/secrets/providers.md`
- Create: `webpresso/agent-kit/docs/secrets/local-workplaces.md`
- Create: `webpresso/agent-kit/docs/secrets/bootstrap-github.md`
- Modify: `webpresso/agent-kit/docs/secrets/pulumi.md`
- Modify: `webpresso/agent-kit/docs/db-branching/neon-xata.md`

**Steps (TDD):**

1. Add docs-frontmatter/link expectations for each new doc.
2. Run: `cd webpresso/agent-kit && ./bin/wp audit docs-frontmatter` — verify FAIL if metadata is missing.
3. Write docs with exact commands, happy path, failure examples, and JSON examples.
4. Run: `cd webpresso/agent-kit && ./bin/wp audit docs-frontmatter && ./bin/wp lint --file docs`.
5. Grep docs for stale `@webpresso/agent-kit` dependency instructions.
6. Confirm docs explain Ozby/Webpresso Doppler workplace split.

**Acceptance:**

- [x] Journey starts with `wp secrets doctor` and `wp preview`.
- [x] Provider docs state built-in now and allowlisted later.
- [x] Pulumi docs cover Doppler and Infisical ESC providers.
- [x] DB docs state Neon now and Xata later.

#### [consumer] Task 4.1: Migrate `ozby/ingest-lens`

**Status:** done

**Depends:** Task 3.1, Task 3.2, Task 3.3

Migrate `ingest-lens` to shared `wp` commands. Delete local act/secret/setup scripts while preserving app-specific e2e suites, deploy command intent, Neon e2e behavior, and product code. Existing Neon branch code should be absorbed or wrapped by the Agent Kit Neon adapter, not duplicated.

**Files:**

- Modify: `ozby/ingest-lens/package.json`
- Modify: `ozby/ingest-lens/.webpresso/secrets.config.json`
- Modify: `ozby/ingest-lens/.github/workflows/e2e.yml`
- Delete: `ozby/ingest-lens/scripts/act-with-webpresso.ts`
- Delete: `ozby/ingest-lens/scripts/act-secret-profile.ts`
- Reference/fold-in: `ozby/ingest-lens/apps/e2e/scripts/e2e-with-neon.ts`

**Steps (TDD):**

1. Sync/rebase the canonical `ingest-lens` worktree with `origin/main` or record conflicts before edits.
2. Run `wp migrate secrets --dry-run --json` and capture the expected patch.
3. Apply safe local edits and delete legacy act scripts.
4. Run: `wp audit secret-provider-quarantine && wp audit no-dev-vars && wp secrets doctor --profile preview --json`.
5. Run targeted typecheck/test/e2e dry-run gates.
6. Record live credential-gated gaps separately; do not mark skipped smoke as pass.

**Acceptance:**

- [x] No local act clone remains in `ingest-lens`.
- [x] Existing Neon e2e branch behavior is absorbed/wrapped, not duplicated.
- [x] No consumer project dependency on `@webpresso/agent-kit` remains.
- [x] Audits and targeted tests pass or credential gates are explicit.

#### [consumer] Task 4.2: Migrate `ozby/edge-matte` and `ozby/ozby-dev`

**Status:** done

**Depends:** Task 3.1, Task 3.2, Task 3.3

Migrate `edge-matte` and `ozby-dev` to shared `wp` commands. Remove direct `with-secrets -- act`, direct `with-secrets -- ... pulumi`, setup sync scripts, and docs that teach old paths.

**Files:**

- Modify: `ozby/edge-matte/package.json`
- Modify: `ozby/edge-matte/.webpresso/secrets.config.json`
- Modify: `ozby/edge-matte/docs/secrets.md`
- Modify: `ozby/edge-matte/.github/workflows/ci.yml`
- Modify: `ozby/ozby-dev/package.json`
- Modify: `ozby/ozby-dev/.webpresso/secrets.config.json`
- Modify: `ozby/ozby-dev/README.md`
- Modify: `ozby/ozby-dev/.github/workflows/deploy-preview.yml`

**Steps (TDD):**

1. Sync/rebase each canonical consumer worktree with `origin/main` or record conflicts.
2. Run `wp migrate secrets --dry-run --json` in each repo and capture expected patches.
3. Replace legacy scripts with `wp ci act`, `wp preview`, `wp deploy`, and Pulumi env-injection sink commands.
4. Run: `wp audit secret-provider-quarantine && wp audit no-dev-vars && wp secrets doctor --profile preview --json` in each repo.
5. Run targeted typecheck/test/e2e dry-run gates.
6. Record live credential-gated gaps separately.

**Acceptance:**

- [x] No `with-secrets -- act` remains.
- [x] No direct `with-secrets -- ... pulumi` remains.
- [x] Local setup scripts no longer own Agent Kit behavior.
- [x] Audits and targeted tests pass or credential gates are explicit.

#### [consumer] Task 4.3: Migrate `webpresso/monorepo` and `ozby/aksaprocess.tr`

**Status:** done

**Depends:** Task 3.1, Task 3.2, Task 3.3

Migrate the private monorepo and `aksaprocess.tr` while preserving the monorepo's intentional source checkout dogfood link (`workspace:*` / `agent-kit-local`). Hard-cut audits should reject published consumer `@webpresso/agent-kit` deps, not this local workspace link.

**Files:**

- Modify: `webpresso/monorepo/package.json`
- Modify: `webpresso/monorepo/.webpresso/secrets.config.json`
- Modify: `webpresso/monorepo/.github/workflows/ci.yml`
- Modify: `ozby/aksaprocess.tr/package.json`
- Modify: `ozby/aksaprocess.tr/.webpresso/secrets.config.json`
- Modify: `ozby/aksaprocess.tr/README.md`

**Steps (TDD):**

1. Sync/rebase canonical worktrees with `origin/main` or record conflicts.
2. Inspect for legacy secret scripts and published Agent Kit dependency assumptions.
3. Update profiles for preview, production, e2e, cleanup, Pulumi, and DB capability as applicable.
4. Run: `wp audit secret-provider-quarantine && wp audit no-dev-vars` in each repo.
5. Run each repo's typecheck/test gate.
6. Confirm the monorepo dogfood link is documented as the only allowed exception.

**Acceptance:**

- [x] Monorepo dogfood link is preserved and explicitly excluded from published-consumer dependency audit.
- [x] `aksaprocess.tr` has Ozby Doppler workplace/project profile declarations.
- [x] Legacy secret/setup logic is removed, not shimmed.
- [x] Audits and targeted tests pass or credential gates are explicit.

#### [dx] Task 4.4: TTHW and agent-readability harness

**Status:** done

**Depends:** Task 2.4, Task 3.1

Add fake-provider tests that measure time-to-helpful-warning, time-to-preview
plan, and agent fixability for Claude Code, Codex, and OpenCode.

**Files:**

- Create: `webpresso/agent-kit/test/dx/tthw-harness.test.ts`
- Create: `webpresso/agent-kit/test/dx/agent-readability.test.ts`
- Create: `webpresso/agent-kit/fixtures/dx/fake-provider-app/`
- Create: `webpresso/agent-kit/docs/dx/measurement.md`

**Steps (TDD):**

1. Write failing harness tests for doctor path and fake preview path.
2. Run: `cd webpresso/agent-kit && ./bin/wp test --file test/dx/tthw-harness.test.ts test/dx/agent-readability.test.ts` — verify FAIL.
3. Implement fake provider app and measurement helpers.
4. Run the same test command — verify PASS.
5. Keep live Cloudflare/Doppler/Infisical/Neon smoke nightly/release/affected-path gated.
6. Run: `cd webpresso/agent-kit && ./bin/wp lint --file test/dx fixtures/dx docs/dx/measurement.md && ./bin/wp typecheck`.

**Acceptance:**

- [x] Fake-provider DX harness runs in PR.
- [x] Agent-readability checks JSON contracts, not prose.
- [x] Live smoke skips are explicit and auditable.
- [x] Lint and typecheck pass.

#### [release] Task 5.1: Cross-repo audit, live smoke, and public package readiness

**Status:** done

**Depends:** Task 4.1, Task 4.2, Task 4.3, Task 4.4

Run final audits and release gates: cross-repo legacy audit matrix, tiered live
smoke, SHA-pin audit, package-surface/public-readiness, and release evidence.

**Files:**

- Create: `webpresso/agent-kit/test/cross-repo/secret-orchestration-matrix.test.ts`
- Create: `webpresso/agent-kit/test/smoke/secret-orchestration-smoke.test.ts`
- Create: `webpresso/github-actions/.github/workflows/wp-secret-orchestration-smoke.yml`
- Modify: `webpresso/agent-kit/src/audit/package-surface.test.ts`
- Modify: `webpresso/agent-kit/package-surface.json`
- Create: `webpresso/agent-kit/docs/release/secret-orchestration-checklist.md`

**Steps (TDD):**

1. Write failing matrix tests if any legacy consumer path remains.
2. Run: `cd webpresso/agent-kit && ./bin/wp test --file test/cross-repo/secret-orchestration-matrix.test.ts test/smoke/secret-orchestration-smoke.test.ts` — verify expected failures before cleanup.
3. Fix remaining references or update fixtures only when reality is clean.
4. Run cross-repo audits, fake smoke, and SHA-pin workflow validation.
5. Run: `cd webpresso/agent-kit && ./bin/wp test --file src/audit/package-surface.test.ts && vp run lint:pkg && vp run public:readiness && ./bin/wp typecheck && ./bin/wp lint`.
6. Record live credential-gated smoke separately from passing fake-provider checks.

**Acceptance:**

- [x] Cross-repo matrix proves no legacy clones/deps remain.
- [x] Secret-bearing actions are full-SHA pinned.
- [x] Public package surface excludes secrets, private paths, and generated junk.
- [x] Release checklist captures evidence and credential-gated smoke.

## Completion Note

This completed blueprint records the planning and handoff artifact. Implementation is intentionally split across focused child PRs/worktrees so this parent PR is no longer a partially-complete execution tracker.

## Verification Gates

| Gate                | Command / evidence                                                                                            | Success criteria                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Blueprint lifecycle | `wp audit blueprint-lifecycle`                                                                                | Blueprint frontmatter/status/path valid.                                                            |
| Agent Kit contracts | `cd webpresso/agent-kit && ./bin/wp test --file <changed-tests>`                                              | Changed behavior covered.                                                                           |
| Agent Kit quality   | `cd webpresso/agent-kit && ./bin/wp typecheck && ./bin/wp lint && vp run lint:pkg && vp run public:readiness` | Type, lint, package surface pass.                                                                   |
| GitHub Actions      | workflow fixture tests plus `wp audit github-actions-secrets`                                                 | OIDC, explicit secrets, and full-SHA pins valid.                                                    |
| Consumers           | `wp audit secret-provider-quarantine`, `wp audit no-dev-vars`, `wp secrets doctor --json`                     | No duplicate scripts/deps and actionable reports.                                                   |
| Preview/e2e         | `wp preview --dry-run --json`, `wp ci act --secret-profile <profile> --dry-run`, affected e2e                 | URL or structured fixes; no hidden bootstrap mutation.                                              |
| Pulumi              | `wp audit pulumi-secret-boundary` and env-injection sink tests                                                | Pulumi gets runtime env only; no stack config, passphrase, secrets-provider, or ESC mutation in v1. |
| DB branch           | Neon fake/live smoke; Xata contract tests later                                                               | DB apps branch/cleanup; non-DB apps skip.                                                           |

## Edge Cases and Error Handling

| Edge case                                            | Handling                                                                          | Finding |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- | ------- |
| Developer is logged into the wrong Doppler workplace | Doctor prints `WP_DOPPLER_WORKPLACE_MISMATCH` and `doppler login --scope <path>`. | F2      |
| Doppler OIDC unavailable on current account          | Doctor offers explicit service-token bootstrap and rotate/revoke path.            | F3      |
| Infisical identity ID missing                        | Doctor fails with public identity ID guidance.                                    | F4      |
| Reusable workflow cannot receive environment secret  | Audit/docs require lane-named repo secret.                                        | F5      |
| `act` cannot emulate OIDC/reusable workflow          | `wp ci act` uses generated replay and labels it non-security-equivalent.          | F5      |
| Provider stderr contains secret                      | Shared redactor masks before logging and caps output.                             | F3/F4   |
| App has no DB capability                             | DB branch sink skips with evidence.                                               | F1      |
| Pulumi ESC unavailable                               | Pulumi sink falls back to explicit env-only plan if configured.                   | F7      |
| Consumer re-adds Agent Kit dependency                | Audit fails and points to global `wp` + `@webpresso/agent-config`.                | F9      |

## Risks

| Risk                                          | Severity | Mitigation                                                                                       |
| --------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| Doppler service tokens become normalized      | HIGH     | Keep token path explicit, lane-scoped, rotate/revoke capable, and document OIDC upgrade path.    |
| Provider abstraction grows speculative        | MEDIUM   | Built-in registry only; future providers require allowlist and concrete tests.                   |
| Bootstrap mutates external state unexpectedly | HIGH     | Dry-run default, explicit `--apply`, transaction evidence, and no bootstrap inside `wp preview`. |
| Secret leaks in logs/evidence                 | HIGH     | Shared redactor, output caps, canary fixtures, and no broad env export.                          |
| Consumer migration breaks deploy/e2e          | HIGH     | Preserve app-specific suites and run targeted/fake-provider gates before live smoke.             |
| Worktree drift loses work                     | HIGH     | Sync/rebase precondition before implementation.                                                  |
| Public package leaks private content          | HIGH     | Package-surface tests, `lint:pkg`, and `public:readiness`.                                       |

## Non-Goals

- No product feature work in consumer apps.
- No UI/design changes.
- No provider auto-discovery in v1.
- No backwards-compatible aliases for legacy scripts.
- No hidden external mutation from `wp preview`, `wp e2e`, or `wp secrets doctor`.
- No Xata implementation until a consumer adopts Xata; prepare interface/docs only.

## Technology Choices

| Surface              | Choice                                                                              | Why                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Local provider auth  | Doppler scoped CLI login; Infisical local login                                     | Supports Webpresso/Ozby split and local DX.                                              |
| CI auth              | Provider capability: OIDC preferred, Doppler service-token fallback when plan-gated | Matches real account constraints.                                                        |
| GitHub secret layout | Lane-named repo secrets                                                             | Works with reusable workflows and local `act`.                                           |
| Pulumi               | Env-injection sink in v1; ESC provider docs optional only                           | Keeps infrastructure inside shared sink model without Agent Kit owning ESC environments. |
| DB branch            | Neon now, Xata later                                                                | Required capability is immediate schema+data clone.                                      |
| Workflows            | Shared `webpresso/github-actions`, SHA/tag-pinned by consumers                      | Centralized setup with supply-chain control.                                             |

## Cross-Plan References

- Parent blueprint: `blueprints/in-progress/2026-06-19-cross-repo-agent-kit-dedupe-e2e-secrets-act-setup.md`.
- CEO plan: `/Users/ozby/.gstack/projects/ozby-repos/ceo-plans/2026-06-19-agent-kit-secret-orchestration.md`.
- Eng review: `/Users/ozby/.gstack/projects/ozby-repos/ozby-main-eng-review-test-plan-20260619-143808.md`.
- DX review: `/Users/ozby/.gstack/projects/ozby-repos/ozby-main-devex-review-20260619-150427.md`.

## Sources

- Neon branching: https://neon.com/docs/introduction/branching
- Xata branching: https://xata.io/docs/platform/branch
- Doppler multiple workplaces: https://docs.doppler.com/docs/multiple-workplaces
- Doppler service tokens: https://docs.doppler.com/docs/service-tokens
- Doppler service account identities: https://docs.doppler.com/docs/service-account-identities
- Infisical GitHub Actions OIDC: https://infisical.com/docs/integrations/cicd/githubactions
- GitHub reusable workflows: https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows
- GitHub Actions secrets: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
- GitHub Actions secure use: https://docs.github.com/en/actions/reference/security/secure-use
- Pulumi ESC Doppler login/secrets: https://www.pulumi.com/docs/esc/providers/login/doppler-login/ and https://www.pulumi.com/docs/esc/providers/secrets/doppler-secrets/
- Pulumi ESC Infisical login/secrets: https://www.pulumi.com/docs/esc/providers/login/infisical-login/ and https://www.pulumi.com/docs/esc/providers/secrets/infisical-secrets/
- Pulumi GitHub Actions OIDC: https://www.pulumi.com/docs/iac/operations/continuous-delivery/github-actions/
- Pulumi GitHub `ActionsSecret`: https://www.pulumi.com/registry/packages/github/api-docs/actionssecret/

## Refinement Summary

| Metric                    |   Value |
| ------------------------- | ------: |
| Findings total            |      10 |
| Critical                  |       1 |
| High                      |       6 |
| Medium                    |       3 |
| Low                       |       0 |
| Fixes applied             |   10/10 |
| Cross-plans updated       |       1 |
| Edge cases documented     |       9 |
| Risks documented          |       7 |
| **Parallelization score** |       A |
| **Critical path**         | 5 waves |
| **Max parallel agents**   |       5 |
| **Total tasks**           |      17 |
| **Blueprint compliant**   |   17/17 |

### Plan-refine notes

- Phase 1 fact-check corrected the DB target to Neon now / Xata later and changed Doppler CI auth from universal OIDC-only to provider capability detection.
- Phase 2 codebase verification found Agent Kit CI/deploy/e2e/audit surfaces to extend and docs/version-warning language to rewrite.
- Phase 3 architecture review rejected hidden bootstrap mutation, GitHub Environment secret dependence, and dynamic provider auto-discovery.
- Phase 4 cross-plan alignment preserved CEO/Eng/DX decisions and updated the DX artifact with D20.
- Phase 5 blueprint enforcement split tasks into conflict-free waves with explicit `Depends`, `Files`, `Steps (TDD)`, and `Acceptance`.
- Phase 6 applied all findings into tasks, risks, edge cases, technology choices, and verification gates.
- Claude final review returned `CLEAR WITH REQUIREMENTS`; the blueprint applies
  the required sequencing fix by deferring destructive `with-secrets-cli` and
  `secret-gate` deletion until Task 3.2 rewires `act-runner` and runtime
  executor callers, keeps `resolveSecretSink` orchestrator-owned rather than
  provider-owned, and clarifies all task `cd` paths resolve to synced dedupe
  worktrees.
- Claude final clearance returned `CLEAR` after the blueprint added concrete
  implementation ownership for `wp migrate secrets`, `wp cleanup preview`, and
  `wp audit github-actions-secrets`; fixed the task count to 17; and reconciled
  bootstrap ops to `verify/apply/rotate/revoke`.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                                |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/agent-kit-wp-secret-orchestration-platform.md |

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
