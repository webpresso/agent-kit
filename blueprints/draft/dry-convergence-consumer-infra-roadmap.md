---
type: blueprint
title: "DRY Convergence — centralize consumer infra into agent-config via a shared core"
owner: ozby
status: draft
complexity: XL
created: "2026-06-28"
last_updated: "2026-06-28"
progress: "10% (Wave A foundation in PR webpresso/agent-kit#291: @webpresso/agent-core + agent-config re-exports)"
tags:
  - dry
  - extraction
  - agent-config
  - agent-core
---

# DRY Convergence — centralize consumer infra into agent-config (via a shared core)

**Type:** Parent roadmap (multi-wave, multi-repo). Each wave becomes its own
per-repo `wp blueprint` + PR.

**Status:** draft

## ⚠️ CORRECTION (2026-06-28) — read first; supersedes earlier sections

Earlier sections assumed a `@webpresso/webpresso` "framework facade" and made
`@webpresso/agent-kit` the consumer import target. **Both are wrong.** Verified
package topology (see memory `webpresso-package-topology`):

- **No `@webpresso/webpresso` package exists.**
- **Consumers import `@webpresso/agent-config` ONLY (+ `@webpresso/runtime-env`),
  never `@webpresso/agent-kit`.** ingest's pnpm-workspace literally comments
  "agent-config is the consumer-installed package surface."
- `@webpresso/agent-config` (`agent-kit/packages/agent-config`, v0.2.0) is the
  **consumer surface**, currently **config-only** (tsconfig/vitest/stryker) and
  **standalone** (deps: vite/vitest only). `@webpresso/agent-kit` (root, v2.x) is
  the internal `wp` engine — not a consumer import.

**Corrected architecture (decided):** introduce a **new shared low-level package
`@webpresso/agent-core`** (`agent-kit/packages/agent-core`) hosting the generic
primitives (repo-root, process-tree, e2e port/health + fail-closed secret-env,
release-version validation). BOTH `@webpresso/agent-kit` and
`@webpresso/agent-config` depend on it. `@webpresso/agent-config` re-exports the
consumer subset; consumers import only `@webpresso/agent-config/<subpath>`.
agent-kit replaces its internal copies (`project-root.ts`, `process-tree.ts`,
`process-supervisor.ts`) with `agent-core`.

**Also now in scope:** existing consumer `import "@webpresso/agent-kit/..."`
(ingest's `/vite`, `/config/vitest/workers`, …) are themselves violations →
migrate onto `@webpresso/agent-config`.

**Status of the first attempt:** Wave A was built against `@webpresso/agent-kit`
(repo-root/process/dev/deploy/e2e exports) — wrong package. PR
webpresso/agent-kit#286 **closed**; code preserved on branch
`feat/repo-root-export` for reuse when populating `agent-core`. The
implementations themselves (and their tests + Codex-review fixes: strict semver,
getAvailablePort error preservation, fail-closed secret-env) are sound and move
verbatim into `agent-core`.

### Corrected Wave A (agent-core + agent-config surface)
1. Create `packages/agent-core` (`@webpresso/agent-core`) with primitives:
   `findRepoRoot`/`resolveFromRepoRoot`; `terminateProcessTreeWithEscalation`/
   `signalProcessTree`; `getAvailablePort`/`waitForHttpOk`; fail-closed
   `resolveE2eSecretEnv`; `assertSemanticReleaseVersion`/`validateReleaseMetadata`;
   `resolveWorkspaceBinary`/`resolveVpCommand`/`buildChildEnv`. (Reuse the
   reviewed code from the closed branch.)
2. `@webpresso/agent-config` depends on `agent-core` and re-exports the consumer
   subset under stable subpaths (`/repo-root`, `/process`, `/e2e`, `/deploy`, `/dev`).
3. `@webpresso/agent-kit` depends on `agent-core`; delete its internal duplicate
   copies and rewire `#`-importers. (Bigger internal refactor — may be its own PR.)
4. Per-subpath import-stability tests on agent-config; `export-isolation` stays green.

The Wave B–E consumer migrations below still apply, but every consumer import
resolves from **`@webpresso/agent-config`**, not `@webpresso/agent-kit`.

## Goal (durable)

Drive every consumer — `ozby/ingest-lens`, `ozby/aksaprocess.tr`,
`ozby/edge-matte`, and eventually the private `webpresso/monorepo` — to **zero
known generic-infra duplicates from this investigation** ("zero DRY candidates"
is the direction; a final re-investigation after the waves spawns any follow-up
blueprints rather than claiming absolute completion in one shot). All generic
test / e2e / secret / process / deploy infrastructure lives in
`@webpresso/agent-kit` (runtime/CLI/helpers) or `@webpresso/agent-config`
(config presets), and each consumer keeps only genuinely app/provider-specific
code. A **review agent** gates every merge; before-finalize review is mandatory
specifically for agent-kit public-API PRs and high-risk consumer migrations
(small mechanical deletes need only the before-merge gate).

## Split criterion (where things go)

- **`@webpresso/agent-config`** — declarative config presets (vitest, playwright,
  tsconfig, oxlint). Consumer `*.config.ts` should `extend`/spread a preset, not
  redefine. (ingest already does this via `@webpresso/agent-config/vitest/node`.)
- **`@webpresso/agent-kit`** — executable helpers + CLI: process supervision,
  e2e harness/host-adapter, deploy plan/adapter, secret orchestration, repo-root,
  neon/db provisioning contract.
- **Stays in consumer** (extraction-parity rule — NEVER centralize): provider-
  specific deploy plumbing (Cloudflare DNS/wrangler, Pulumi, Neon API calls),
  lane→env mapping, app secret names (turnstile), journey/business tests, suite
  manifests, domain config.

## Load-bearing insight

agent-kit **already exports** most of the shared surface; the bulk of this
program is **migrate-and-delete**, not build:

| Consumer duplication | Already in agent-kit | Action |
| --- | --- | --- |
| `worker-process-lifecycle.ts` (the aborted ingest salvage), ad-hoc `.kill()` | `process-supervisor` → `killProcessTree`, `terminateProcessTreeWithEscalation` (`#shared-utils`) | migrate, delete local |
| `repo-root.ts` / `findRepoRoot` (×3 consumers, ×2 within ingest) | `@webpresso/webpresso/runtime/cli/find-repo-root` (already imported 163× in monorepo) | migrate, delete local |
| e2e orchestration (port alloc, health-wait, host adapter, process kill) | `./e2e` harness + host-adapter pattern, `wp e2e` | move generic bits behind host adapter |
| `e2e/smoke.spec.ts` (×3 byte-identical) | `catalog/base-kit/e2e` fixtures | scaffold from agent-kit |
| `infra/vitest.config.ts` (aksa+edge identical) | `./test-preset` / agent-config vitest preset | extend preset |
| deploy plan/adapter shape (×3) | `./deploy` plan schema + `DeployAdapter` | already adapter-based; keep impls local |
| secret resolution wrappers | `wp secrets run`, `#runtime/executor` | route through CLI |

## DRY-candidate ledger (from 3-agent investigation)

**Tier 0 — migrate to EXISTING agent-kit surface (no new agent-kit code):**
1. Process lifecycle → `process-supervisor` (ingest e2e cleanup; do NOT add the salvage module).
2. `findRepoRoot`/repo-root (ingest ×2, aksa, edge) → framework `find-repo-root`.
3. `e2e/smoke.spec.ts` ×3 → agent-kit base-kit fixture.
4. `infra/vitest.config.ts` (aksa, edge) → agent-config vitest preset (ingest already done).

**Tier 1 — small extractions into agent-kit (new shared code, 2+ real users):**
5. Neon branch provider (`neon-branches.ts`: ingest e2e 387L + ingest deploy 201L — already duplicated within ingest) → agent-kit db/launch provider (contract; Neon impl stays where API calls live, or behind a `launch` db-selector).
6. e2e global-setup pattern (spawn server → waitForHealth → cleanup) ×3 → agent-kit e2e helper with consumer callback for the start command.
7. release-version/release-gate (aksa `release-version.ts` 35L + ingest `release-gate.ts` 79L) → agent-kit release-metadata validation contract (consumers pass their metadata shape).
8. e2e secret-env resolution (the fail-closed `resolveE2eSecretEnv` design from the aborted salvage) → agent-kit `#runtime`/e2e helper, NOT a consumer module.

**Tier 2 — parameterize hybrids so the generic 40–70% can move:**
9. `e2e-with-neon.ts` (ingest, 402L; ~70% generic) → reduce to a thin adapter over agent-kit e2e harness + launch + secrets, passing migration path / env-forward list / worker start command as inputs.
10. deploy orchestration generic bits (process runner, neon provisioning) behind agent-kit; provider calls stay local.

**Never centralize (confirmed):** custom-domain-preflight (aksa), worker-secrets/turnstile (aksa), probe-cloudflare-workers-auth + verify-deploy-contract (edge), neon/pulumi orchestration + lanes + suite manifests + journeys (ingest).

## Wave sequencing (recommended)

Public consumers first (lowest risk, dogfood the surface), monorepo last
(private, heaviest, consumes the settled surface):

- **Wave A — agent-kit readiness:** confirm/extend exports needed by Tier 0/1
  (process-supervisor, find-repo-root re-export, base-kit e2e fixture, e2e
  secret-env helper, release-metadata validator, neon/db provider contract).
  One agent-kit PR per cohesive addition; publish a version.
- **Wave B — ingest-lens migration:** delete local dups, adopt agent-kit surface
  (biggest footprint, two-axis consumer → best proof).
- **Wave C — aksa migration.** **Wave D — edge-matte migration.**
- **Wave E — monorepo** (private): apply the same, dogfooding the now-settled surface.

Each consumer wave: bump the agent-kit dep to the published version, migrate,
delete dups, verify (`wp qa` bookends), review-agent gate, PR, merge.

**Canary before publish (cross-repo cadence guard):** every Wave A surface is
`npm pack`/prerelease-tagged and exercised against ≥1 consumer smoke BEFORE the
final publish. Each public-API mistake otherwise costs a full publish→bump→fix
cycle across N repos, so catch it pre-publish. A1–A6 ship as small per-surface
releases (or one minor of only the stable exports); **A7 is a design spike and
must NOT block consumer deletion work.**

## Review-gate protocol (per repo, per PR)

- **Before merge (MANDATORY, every PR):** run a **review agent**
  (`code-reviewer` / `/codex` / other-model outside voice) on the diff; resolve
  P1s; record the verdict in the PR; CI green (`wp-check` + e2e/preview where
  applicable).
- **Before finalize (agent-kit public-API PRs + high-risk consumer migrations
  only):** additional review pass before the API shape is locked.
- **agent-kit PRs also require:** `export-isolation.test.ts` green; per-new-subpath
  **import-stability tests** (importable, ESM shape, no `#`-private-alias leak, no
  framework/monorepo imports); extraction-parity assertion (nothing
  provider-specific leaked in).
- **A4 secrets boundary (hard):** no logging of secret values, fail closed on
  missing keys, never write `.env`/persist secret files, no app-specific secret
  registry inside agent-kit.

## Verification per wave

- agent-kit waves: unit + `export-isolation` + per-subpath import-stability +
  consumers’ smoke (via canary pack) against the new version.
- consumer waves: `wp typecheck`/`lint`/`test` + e2e/preview green; net **line
  reduction** recorded (DRY proof); no behavior change.

## Multi-model review (incorporated)

Reviewed by **Claude** (author) + **Codex** (gpt, outside voice). GLM-5.2 and
Kimi (opencode-go free tier) stalled with no output and were dropped; a deepseek
attempt was made as backup. Codex's accepted corrections, folded above:
- Reframe "agent-kit already has the surface" → **promote/export-first, then
  migrate-and-delete** (v2.4.1 lacks `./process`/`./repo-root`/`./secrets`/`./release`).
- A1 `./process`: export a **narrow, semantic** API (1–2 stable helpers), not all
  four internal functions wholesale.
- A2: keep `./repo-root` to **root discovery only**; move `resolveWorkspaceBinary`/
  `resolveVpCommand`/`buildChildEnv` to `./dev` (command/env resolution ≠ root
  discovery); constrain the marker-list param (root-semantics footgun).
- A4: consumer **declares required keys + profile + mapping**; agent-kit enforces
  resolution + fail-closed; helper must NOT know app secret names (Turnstile/etc.);
  drop/genericize `resolveE2eAuthSecrets`; honor the secrets boundary above.
- A5: put the release-metadata validator under existing **`./deploy`** (do not add
  a new `./release` surface); keep small/schema-parametric; may defer.
- A6: **parameterize** the smoke fixture if specs diverge by URL/auth/health;
  verify consumers adopt it via setup/sync without generated-surface churn.
- A7: **interface-only spike** — define a minimal launch/db branch interface from
  ingest's two duplicates; do NOT publish a Neon implementation as generic infra.
- Add the canary + per-subpath import-stability tests + secrets boundary (above).

### Wave A export-shape corrections (supersede the table where they differ)
- A1 → `./process`: `terminateProcessTreeWithEscalation` (+ `killProcessTree` only
  if a second caller needs it).
- A2 → `./repo-root`: `findRepoRoot`, `resolveFromRepoRoot` only.
- A2b → `./dev` (or new small export): `resolveWorkspaceBinary`, `resolveVpCommand`,
  `buildChildEnv`.
- A4 → `./e2e`: `resolveE2eSecretEnv({ requiredKeys, profile, resolveRuntimeProfile, logger })`.
- A5 → `./deploy`: `validateReleaseMetadata` / `assertSemanticReleaseVersion`.

## Refined per-wave / per-repo task lists

Verified against agent-kit **v2.4.1** public `exports`. Key finding: the
low-level helpers consumers duplicate are **internal-only** today
(`src/utils/process-supervisor.ts`, `src/cli/process-tree.ts` via `#`-aliases) —
not reachable by agent-kit-only consumers (aksa/edge). Wave A must **promote
them to public subpath exports** (+ add the genuinely-new helpers). No public
`./process`, `./repo-root`, `./secrets`, `./release`, `./db` exists yet.

### Wave A — agent-kit readiness (one PR per cohesive export; publish a version)

| # | New/changed public export | Backing source | New or promote |
| - | --- | --- | --- |
| A1 | `./process` → `killProcessTree`, `forceKillProcessTree`, `terminateProcessTreeWithEscalation`, `terminateWorkerProcessTree` (process-group aware, win32 fallback) | `src/utils/process-supervisor.ts`, `src/cli/process-tree.ts` (exist) | **promote** internal → public |
| A2 | `./repo-root` → `findRepoRoot`, `resolveFromRepoRoot`, `resolveWorkspaceBinary`, `resolveVpCommand` (optional marker-list param for edge's AGENTS.md case) | new module; reference impls in all 3 consumers + framework `find-repo-root` | **new** (consolidate 3 divergent copies) |
| A3 | `./e2e` additions → `getAvailablePort`, `waitForHttpOk`, generic `withLocalServer({start, healthUrl})` (spawn→waitForHealth→cleanup) | new in `src/e2e/`; reference: ingest `e2e-with-neon.ts`, edge `global-setup.ts` | **new** |
| A4 | `./e2e` (or `#runtime`) → fail-closed `resolveE2eSecretEnv({env, resolveRuntimeProfile, logger})` + `resolveE2eAuthSecrets` | design salvaged from aborted ingest PR #33 module | **new** (NOT a consumer module) |
| A5 | `./deploy` addition → `validateReleaseMetadata({metadata, requested})` + `assertSemanticReleaseVersion` (consumer passes its metadata shape) | generalize ingest `release-gate.ts` (79L) + aksa `release-version.ts` (35L) | **new** (contract; impls converge) |
| A6 | base-kit `e2e/smoke.spec.ts` fixture wired through `wp setup`/`catalog` so consumers stop hand-copying the byte-identical test | `catalog/base-kit/e2e/` (exists) | **wire-up** |
| A7 | (decision) Neon/db branch provider: contract under `./launch` db-selector; Neon **API impl** may stay consumer-side per extraction-parity | ingest `neon-branches.ts` (387L e2e + 201L deploy, already dup’d within ingest) | **design call in A** |

Each Wave A PR: `export-isolation.test.ts` green, no monorepo imports, unit tests, review-agent gate.

### Wave B — ingest-lens (after Wave A publishes; bump dep)
- Delete `apps/e2e/src/repo-root.ts` + `infra/src/deploy/repo-root.ts` → `@webpresso/agent-kit/repo-root` (A2).
- `apps/e2e/scripts/e2e-with-neon.ts`: replace ad-hoc `.kill()`/port/health with A1+A3; adopt A4 for secret env. Target: shrink ~402L hybrid toward a thin adapter.
- Collapse the two `neon-branches.ts` (e2e 387L + deploy 201L) into one; back with A7 where possible.
- `infra/src/deploy/release-gate.ts` → A5 validator (keep ingest's rollout/DO specifics as params).
- `apps/e2e/.../smoke` → A6 fixture. Keep: suite-manifest, journeys, lanes, pulumi/neon orchestration, runtime-env-local (its own later sub-blueprint vs agent-kit secrets).

### Wave C — aksa
- Delete `infra/src/deploy/deploy-runner.ts` repo-root bits → A2; route `run`/`runWithInput` through agent-kit process-exec if a public exec helper lands.
- `infra/src/deploy/release-version.ts` (35L) → A5 validator. `e2e/smoke.spec.ts` → A6. `infra/vitest.config.ts` → agent-config vitest preset.
- Keep: `deploy-worker.ts`, `worker-secrets.ts` (turnstile), `custom-domain-preflight.ts`, lanes.

### Wave D — edge-matte
- `deploy-runner.ts` repo-root + `buildChildEnv` → A2 (buildChildEnv PATH-prepend is valuable; fold into A2). `global-setup.ts` (46L) → A3 `withLocalServer`. `e2e/smoke.spec.ts` → A6. `infra/vitest.config.ts` → preset.
- Keep: `probe-cloudflare-workers-auth.ts`, `verify-deploy-contract.ts`.

### Wave E — webpresso/monorepo (private, last)
- Apply A1–A6 across monorepo workers/e2e; it already imports framework `find-repo-root` 163× — converge any local repo-root/process/e2e dups onto the now-settled agent-kit surface. Review-gate as a private repo.

### Per-PR review-gate (every wave, every repo): see "Review-gate protocol" above.

## Done

No consumer (incl. monorepo) has a remaining DRY candidate per a final
re-investigation; all generic infra resolved from agent-kit/agent-config;
every merged PR carries a review-agent verdict.
