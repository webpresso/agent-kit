---
type: blueprint
status: completed
title: CI Act Default Architecture Contract Hardening
owner: webpresso
complexity: M
created: '2026-06-17'
last_updated: '2026-06-17'
progress: '85% (default image manifest verified; contract hardening + tests implemented; final verification complete)'
depends_on: []
cross_repo_depends_on: []
tags:
  - ci
  - act
  - arm64
  - apple-silicon
---

# Ci-act-default-architecture-contract-hardening

**Goal:** keep Apple Silicon `wp ci act` defaults correct by verifying the shipped default image manifest and pinning the image/architecture contract with literal tests instead of inference.

## Verified fact

- `docker buildx imagetools inspect ghcr.io/catthehacker/ubuntu:full-latest` on 2026-06-17 returned a multi-arch manifest with both `linux/amd64` and `linux/arm64`, so the shipped default image is compatible with an Apple Silicon `linux/arm64` default.

## Tasks

#### [ci] Task 1.1: Make one source of truth for default architecture selection

**Status:** done

Keep `resolveDefaultContainerArchitecture()` in `src/ci/act-runner.ts` as the single default selector and route helper default injection through it.

**Files:**

- Modify: `src/ci/act-runner.ts`
- Modify: `src/ci/act-helper.ts`

#### [ci] Task 1.2: Pin the shipped default image/architecture pairing

**Status:** done

Add a guard that validates the shipped default image only for the verified supported architectures, so future default changes must stay paired.

**Files:**

- Modify: `src/ci/act-runner.ts`
- Modify: `src/ci/act-runner.test.ts`

#### [qa] Task 1.3: Replace mirror-style tests with literal behavior cases

**Status:** done

Add explicit Apple Silicon macOS, Intel macOS, Linux arm64, override-wins, and shipped-default-image validation cases.

**Files:**

- Modify: `src/ci/act-runner.test.ts`
- Modify: `src/ci/act-helper.test.ts`
- Modify: `src/cli/commands/ci.test.ts`

## Verification Gates

| Gate | Command | Status |
| --- | --- | --- |
| Focused tests | `./bin/wp test --file src/ci/act-runner.test.ts src/ci/act-helper.test.ts src/cli/commands/ci.test.ts` | passed |
| Focused lint | `./bin/wp lint src/ci/act-runner.ts src/ci/act-runner.test.ts src/ci/act-helper.ts src/ci/act-helper.test.ts src/cli/commands/ci.test.ts` | passed |
| Typecheck | `./bin/wp typecheck` | passed |
| CLI dry-run | `./bin/wp ci act --workflow ci-e2e --dry-run` | passed |

## Non-goals

- changing the shipped default runner image away from `ghcr.io/catthehacker/ubuntu:full-latest`
- changing generic secret-gate or workflow-path behavior outside `ci act`
- adding network-time manifest lookup into runtime command execution
