---
type: blueprint
title: Cross-project `wp` downstream execution map
owner: ozby
historical_zero_task_waiver: true
historical_zero_task_rationale: Historical completed planning record predates the task-level blueprint format and is retained as a durable downstream execution map.
status: completed
complexity: L
created: '2026-05-30'
last_updated: '2026-06-07'
progress: '100% (2026-06-07 deploy-adoption refresh: IngestLens stays wp-first on shipped wp deploy/wp ci act/wp_* surfaces; EdgeMatte stays split with local deploy specifics)'
depends_on: []
tags:
  - wp
  - cross-project
  - execution-map
  - agent-kit
  - framework
  - monorepo
  - ingest-lens
  - edge-matte
---

# Cross-project `wp` downstream execution map

**Goal:** keep `agent-kit` as the durable cross-repo source of truth for the
completed `wp` base/runtime work and the downstream adoption order across
`framework`, `monorepo`, `ingest-lens`, and `edge-matte`.

## 2026-06-07 deploy-adoption refresh

This map was refreshed after the deploy-orchestrator/toolchain-isolation work
closed upstream in `agent-kit` and the remaining work became downstream
adoption. The effective program still has four tracks, but the thin-consumer
repos now align around the shipped surfaces instead of a new upstream rewrite:

1. **Framework** — rewrite the legacy projector lane in place so it becomes the
   repo-owned `wp`-first framework adoption lane.
2. **Monorepo** — keep the existing `wp`-first framework-consumer lane, revive
   the public CI/secret-surface adopter lane, and add a bounded Cloudflare
   deploy-contract inventory follow-up instead of forcing full deploy unification.
3. **IngestLens** — continue the `wp`-first thin-consumer lane, adopt
   `wp deploy`, `wp ci act`, and the canonical `wp_*` QA verbs, and keep any
   app-specific deploy/runtime details behind the existing local adapter seam.
4. **EdgeMatte** — keep the shipped `vp` + `wp` split, finish the in-progress
   shared deploy-contract lane, and scope thin-consumer cleanup to already-shipped
   upstream surfaces only.

## Locked operator decisions

| Decision | Choice | Why it matters |
| --- | --- | --- |
| Framework direction | force `wp`-first | downstream work should consume shipped `agent-kit` surfaces instead of reviving the older unified-CLI cutover assumptions |
| Monorepo direction | force `wp`-first | monorepo remains a framework consumer and public-surface adopter, not a second command owner |
| IngestLens direction | true `wp`-first thin consumer | it should converge on the base `wp` contract only |
| EdgeMatte direction | keep `vp` + `wp` split | the repo must stay aligned to the currently shipped upstream surface, not an aspirational local `wp`-only model |
| Monorepo deploy scope | inventory + planned follow-up only | the repo has too many Cloudflare apps to force full deploy-contract unification in the same pass |
| Planning artifact policy | use each repo's configured blueprint root | repo-owned PRDs/test specs must not live under `.agent/planning/plans` |

## Ownership ledger

| Surface | Owner | Status | Boundary |
| --- | --- | --- | --- |
| Cross-project execution map | `agent-kit` | completed | This repo is the durable dependency/order source of truth |
| Base `wp` package + generic quality verbs | `agent-kit` | completed | Framework-neutral setup, sync, audit, test, lint, typecheck, format, install/run/exec ownership |
| `wp` extension runtime | `agent-kit` | completed | Host/runtime discovery and diagnostics for extension packages |
| Framework/project command bundle | `framework` | downstream planned | Reusable framework/project behavior stays outside base `agent-kit` |
| Framework consumer adoption | `monorepo` | downstream planned/in-progress | Consume framework + base `wp`; do not recreate a private command host |
| Thin-consumer adoption | `ingest-lens`, `edge-matte` | downstream planned/in-progress | Consume shipped shared rails only; keep app/runtime/deploy specifics local |
| Shared deploy contract | `agent-kit` policy + repo-local adopters | mixed | `wp deploy` stays the managed upstream orchestrator; provider-specific deploy plumbing stays in repo-local adapters |

## Active downstream lane topology (documentary view refreshed 2026-06-07)

| Repo | Blueprint / lane | Lifecycle | Role in the program |
| --- | --- | --- | --- |
| `agent-kit` | `2026-05-30-agent-kit-base-wp-core` | completed | upstream base `wp` contract |
| `agent-kit` | `2026-05-30-agent-kit-wp-extension-runtime` | completed | upstream extension host/runtime |
| `framework` | `blueprints/planned/wp-setup-hook-surface-projector/_overview.md` | planned | rewritten in place as the active framework-owned `wp`-first adoption lane |
| `monorepo` | `webpresso/blueprints/planned/2026-05-30-monorepo-wp-first-framework-consumer.md` | planned | main framework-consumer adoption lane |
| `monorepo` | `webpresso/blueprints/planned/secret-aware-ci-act-helper-adoption/_overview.md` | planned | public CI/secret-surface adopter lane |
| `monorepo` | `webpresso/blueprints/in-progress/unified-cli-public-cutover/_overview.md` | in-progress | background evidence + setup/CI rename source of truth during the forced `wp`-first transition |
| `monorepo` | `webpresso/blueprints/planned/cloudflare-deploy-contract-inventory/_overview.md` | planned | bounded deploy-inventory follow-up |
| `ingest-lens` | `blueprints/planned/2026-06-02-ingest-lens-wp-deploy-adapter-toolchain-isolation.md` | planned | `wp`-first thin-consumer + deploy adoption lane using shipped `wp deploy`, `wp ci act`, and `wp_*` surfaces |
| `ingest-lens` | `blueprints/planned/public-ci-surface-adoption/_overview.md` | planned | public CI/secret-surface adopter lane aligned to the canonical secret gate |
| `edge-matte` | `blueprints/planned/2026-06-02-edge-matte-wp-deploy-adapter-toolchain-isolation.md` | planned | split thin-consumer cleanup lane; preserve `vp` + `wp` and keep deploy specifics local |
| `edge-matte` | `blueprints/in-progress/2026-05-29-edge-matte-shared-cloudflare-deploy-contract.md` | in-progress | active shared deploy-contract adopter/proof lane |

## Execution order

```text
completed: agent-kit-base-wp-core
  -> completed: agent-kit-wp-extension-runtime
    -> framework wp-first adoption lane
      -> monorepo wp-first framework-consumer lane

completed: agent-kit-base-wp-core + completed: agent-kit-wp-deploy-orchestrator-toolchain-isolation
  -> ingest-lens wp-first thin-consumer + deploy-adapter lane
  -> edge-matte split thin-consumer cleanup lane

completed/public helper surfaces
  -> monorepo public CI + secret-surface lane
  -> ingest-lens public CI + secret-surface lane

edge-matte deploy-contract lane (in progress)
  -> monorepo deploy-contract inventory follow-up
```

## Repo-specific guardrails

### Framework
- adopt shipped `agent-kit` runtime/bundle boundaries rather than rebuilding them
- keep framework commands on the framework-owned public `webpresso` surface
- keep agent setup on `webpresso agent setup`
- move repo-owned planning artifacts under `blueprints/`, not `.agent/planning/plans`

### Monorepo
- consume framework extraction rather than recreating a private host
- keep `webpresso/blueprints/` as the blueprint root
- finish the public CI/secret-surface migration against the shipped helper contract
- do bounded deploy inventory only in this pass

### IngestLens
- stay a base-`wp` thin consumer
- use shipped `wp deploy`, `wp ci act`, and `wp_*` QA verbs rather than local generic wrappers
- normalize stale cross-repo dependency metadata to completed upstream slugs
- keep local CI/secret policy limited to preset/profile ownership and the canonical `with-secrets -- <cmd>` gate
- keep app/runtime/deploy specifics behind the existing local deploy adapter/config seam

### EdgeMatte
- preserve the shipped `vp install` / `vp run ...` plus `wp setup` / `wp audit` / `wp typecheck` split
- tie thin-consumer cleanup to the in-progress deploy-contract lane instead of creating a second deploy track
- only replace local direct tools when the shared upstream surface already exists today
- keep provider-specific deploy logic local; `wp deploy` is the shared orchestrator, not a second deploy architecture

## Verification gates

Each downstream repo should prove only the contract it actually owns:

| Repo | Minimum fresh proof |
| --- | --- |
| `framework` | blueprint/docs validation for the rewritten lane, plus repo health checks required by the framework contract |
| `monorepo` | blueprint lifecycle validation under `webpresso/blueprints/`, plus focused CI/secret-surface checks for the touched lane |
| `ingest-lens` | `wp deploy --dry-run`, `wp ci act` dry-run, focused `wp_*` QA/toolchain checks, and blueprint lifecycle |
| `edge-matte` | retained `vp` + `wp` split proof, deploy-contract checks, any touched toolchain-isolation proof, and blueprint lifecycle / architecture checks as needed |
| `agent-kit` | blueprint lifecycle validation for this refreshed coordination map |

## Acceptance

- [x] The downstream lane topology matches the currently observed repo-local blueprints.
- [x] Forced framework + monorepo `wp`-first direction is recorded here.
- [x] Thin-consumer differences between IngestLens and EdgeMatte remain explicit.
- [x] Deploy remains “managed upstream orchestrator + local adapter”.
- [x] Monorepo deploy-contract scope is bounded to inventory/follow-up in this program.
- [x] Planning artifacts are expected under each repo's blueprint root, not `.agent/planning/plans`.
