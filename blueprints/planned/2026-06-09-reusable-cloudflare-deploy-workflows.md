---
type: blueprint
title: "agent-kit: reusable Cloudflare deploy workflows"
owner: ozby
status: planned
complexity: L
created: "2026-06-09"
last_updated: "2026-06-09"
progress: "0% (planned)"
depends_on:
  - 2026-06-02-agent-kit-wp-deploy-orchestrator-toolchain-isolation
  - 2026-05-30-cross-project-wp-execution-map
tags:
  - agent-kit
  - github-actions
  - reusable-workflows
  - cloudflare
  - deploy
---

# agent-kit: reusable Cloudflare deploy workflows

**Goal:** Add reusable GitHub workflow shells for Cloudflare preview and production deploys while keeping provider-specific deploy plumbing in consumer repos behind `deploy.adapterModule`.

## Planning Summary

- Goal input: reusable deploy harness in `agent-kit` adopted by `ozby-dev`, `edge-matte`, and `ingest-lens`
- Complexity: `L`
- Planned output: two reusable workflows plus shared docs and tests
- Key boundary: workflow shell becomes shared; verification/deploy/smoke commands remain caller-owned

## Architecture Overview

```text
agent-kit
  ├── wp deploy + adapter contract (existing)
  ├── cloudflare-preview.yml      (NEW reusable workflow shell)
  ├── cloudflare-production.yml   (NEW reusable workflow shell)
  └── shared CI/provider bootstrap docs + tests

consumer repo
  ├── agent-kit.config.ts deploy.adapterModule (existing / expanded)
  ├── repo-local deploy scripts and provider logic
  └── thin caller workflows that pass install/verify/deploy/smoke commands
```

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Reuse unit | GitHub reusable workflows (`workflow_call`) | The deploy flow is multi-job and secret-aware; composite actions are too small a unit. |
| Shared scope | workflow shell only | `edge-matte` and `ingest-lens` share setup/trigger structure but not verification/deploy payloads. |
| Secret transport | repo provider metadata + explicit CI bootstrap secret | Cross-owner `secrets: inherit` should not be the primary design. |
| Shared setup | inline Node/Corepack/Bun bootstrap in workflow | Current consumer repos use different caller-local setup actions. |
| Ref strategy | immutable SHA pins tied to released `agent-kit` tags | Prevent drift in shared workflow callers. |

## Quick Reference (Execution Waves)

| Wave              | Tasks | Dependencies | Parallelizable |
| ----------------- | ----- | ------------ | -------------- |
| **Wave 0**        | 1.1, 1.2 | None | 2 agents |
| **Wave 1**        | 2.1, 2.2 | Wave 0 | 2 agents |
| **Critical path** | 1.1 → 2.1 | -- | 2 waves |

### Phase 1: Shared workflow shell [Complexity: M]

#### [infra] Task 1.1: Add preview/production reusable workflows

**Status:** todo

**Depends:** None

Create `cloudflare-preview.yml` and `cloudflare-production.yml` under
`.github/workflows/`. They must own checkout/setup/lane handling and accept
caller-provided install/verify/deploy/smoke commands through `workflow_call`
inputs.

**Files:**

- Create: `.github/workflows/cloudflare-preview.yml`
- Create: `.github/workflows/cloudflare-production.yml`

**Steps (TDD):**

1. Add failing tests/fixtures for reusable workflow input and lane expectations where coverage exists.
2. Implement preview reusable workflow with `preview_main` / `preview_pr_<n>` / destroy-on-close behavior.
3. Implement production reusable workflow with optional release-version validation.
4. Verify syntax and fixture/test coverage.

**Acceptance:**

- [ ] Reusable workflows exist and parse cleanly
- [ ] Preview workflow resolves canonical internal lanes
- [ ] Production workflow supports caller-owned release gating
- [ ] No caller-local setup action dependency remains in shared workflows

#### [infra] Task 1.2: Add shared provider-bootstrap helper/docs

**Status:** todo

**Depends:** None

Extend the existing secret-manager contract for CI use: shared workflow reads
`.webpresso/secrets.config.json`, bootstraps the configured provider using an
explicit CI secret, and then runs caller commands.

**Files:**

- Modify: docs covering `wp config secrets` / `with-secrets -- <cmd>`
- Modify/Create: workflow-side helper source/tests as needed under `src/`

**Steps (TDD):**

1. Add failing coverage for provider-config-driven bootstrap expectations.
2. Implement CI bootstrap around the existing `doppler` / `infisical` model.
3. Document the contract for caller workflows.
4. Verify helper/tests/docs stay aligned.

**Acceptance:**

- [ ] CI bootstrap uses repo-committed provider metadata
- [ ] Supports `doppler` and `infisical`
- [ ] Does not invent a second secret contract separate from `wp config secrets`
- [ ] Docs explain bootstrap secret requirements and limitations

### Phase 2: Downstream adoption contract [Complexity: M]

#### [docs] Task 2.1: Document caller workflow contract and pinning

**Status:** todo

**Depends:** Task 1.1, Task 1.2

Document the required caller inputs, SHA pinning rules, and repo-local
responsibilities that must not migrate into `agent-kit`.

**Files:**

- Modify: `README.md`
- Modify/Create: deploy workflow docs/runbook under `docs/`

**Acceptance:**

- [ ] Caller interface is documented with examples
- [ ] SHA pinning to released workflow refs is explicit
- [ ] Repo-local deploy adapter/provider responsibility is explicit

#### [qa] Task 2.2: Verify shared harness against consumer expectations

**Status:** todo

**Depends:** Task 1.1, Task 1.2

Run focused verification to prove the reusable shell matches the current
consumer workflow needs without centralizing their repo-specific logic.

**Acceptance:**

- [ ] Shared workflow shell covers `edge-matte` and `ingest-lens` trigger/setup overlap
- [ ] Caller-provided verification/deploy/smoke command model is proven
- [ ] Released-tag SHA pin strategy is documented and testable

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Type safety | repo typecheck recipe | Zero errors |
| Lint | repo lint recipe | Zero violations |
| Tests | repo test recipe (targeted) | All pass |
| Workflow validation | GitHub workflow syntax / fixture validation | Reusable workflows parse and match contract |

## Cross-Plan References

| Type | Blueprint | Relationship |
| ---- | --------- | ------------ |
| Upstream | `2026-06-02-agent-kit-wp-deploy-orchestrator-toolchain-isolation` | Shared deploy substrate already shipped |
| Upstream | `2026-05-30-cross-project-wp-execution-map` | Downstream repo ownership boundaries are already documented |
| Downstream | `ozby-dev: shared reusable deploy workflow adoption` | Consumer adoption of reusable shell |
| Downstream | `edge-matte: shared reusable deploy workflow adoption` | Consumer adoption of reusable shell |
| Downstream | `ingest-lens: shared reusable deploy workflow adoption` | Consumer adoption of reusable shell |

## Non-goals

- Moving Cloudflare/Pulumi/Neon provider logic into `agent-kit`
- Standardizing all consumer verification matrices into one shared block
- Switching custom-domain preview consumers onto `workers.dev` previews

