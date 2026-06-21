---
type: blueprint
title: CLI contract and framework package alignment
owner: agent-kit
status: parked
complexity: M
created: '2026-06-15'
last_updated: '2026-06-21'
progress: '0% (0/0 tasks done, 0 blocked, updated 2026-06-21)'
parked_reason: >-
  Dependency-gated: contract adoption is done, but framework rename is not an active
  published dependency; keep parked until external rename is scheduled.
depends_on:
  - completed/agent-kit-cli-bundle-cutover
cross_repo_depends_on: []
tags:
  - agent-kit
  - cli
  - contract
  - framework
  - package-boundary
---

# CLI contract and framework package alignment

**Goal:** keep `agent-kit` aligned with the published shared CLI contract package and the upcoming framework package rename, while preserving a small, explicit public package surface.

## Why this exists

The bundle surface has already moved off the local contract copy and onto the published `@webpresso/cli-contract`. The remaining alignment work is mostly naming and policy:

- keep bundle typing/metadata aligned to the published contract;
- update any policy/test/package-surface references that still point at the old framework package name;
- avoid reintroducing local contract copies or monorepo-specific package paths.

## Verified current facts

- `agent-kit` bundle code now imports `@webpresso/cli-contract` directly.
- `src/cli/bundle/contract.ts` is deleted on the `cli-contract-adoption` branch.
- `agent-kit` still contains policy/test references to `@webpresso/framework`.
- These references are mostly package-surface, policy, and quality-engine classification surfaces, not the primary runtime bundle implementation.

## Scope

### Phase 1 — contract alignment
- Keep bundle code and tests pinned to the published `@webpresso/cli-contract` package.
- Prevent local contract copies from reappearing.

### Phase 2 — framework rename alignment
- Once the framework package rename plan is executed, update relevant policy/test/package-surface references from `@webpresso/framework` to the final framework package name.
- Keep this narrowly scoped to real references; do not broaden the agent-kit public surface.

## Non-goals

- Do not make `agent-kit` own the framework package transition.
- Do not add new public package surfaces in `agent-kit`.
- Do not reintroduce temporary compatibility shims.

## Required evidence

- bundle tests still pass against the published contract package.
- no local `src/cli/bundle/contract.ts` file exists.
- any future framework-name references in policy/tests are updated only when the framework rename is real and published.
