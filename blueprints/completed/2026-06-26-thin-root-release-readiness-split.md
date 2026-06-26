---
type: blueprint
title: "Thin-root release readiness split for @webpresso/agent-kit"
owner: ozby
status: completed
complexity: M
created: "2026-06-26"
last_updated: "2026-06-26"
progress: "100%"
depends_on: []
cross_repo_depends_on: []
tags: [release, packaging, readiness, smoke]
---

# Thin-root release readiness split for `@webpresso/agent-kit`

**Goal:** Keep `@webpresso/agent-kit` as a single public package with a thinner default install graph, and split fast public readiness from the slower packed-consumer install proof.

## Success criteria

- `public:readiness` no longer invokes the packed consumer smoke path.
- A new explicit `public:consumer-smoke:setup` script exists and covers the setup-only packed-install proof.
- Root production dependencies exclude repo-only toolchain packages moved to `devDependencies`.
- Tests and package-surface checks enforce the new dependency/readiness boundary.

## Constraints

- No new public package split.
- No `wp` CLI renames.
- Keep `wp_release_readiness` behavior unchanged in this slice.
- No new dependencies.

## Tasks

### 1) Thin the root runtime dependency surface

**Status:** completed

- Move repo-only toolchain packages from `dependencies` to `devDependencies`.
- Preserve runtime-owned `dependencies` and intended `optionalDependencies`.
- Update packed manifest/package-surface tests to lock the boundary.

### 2) Split fast readiness from slow packed-install proof

**Status:** completed

- Remove packed consumer smoke from `scripts/public-readiness.ts`.
- Add `public:consumer-smoke:setup` script alias.
- Emit visible phase progress from `scripts/public-consumer-smoke.ts`.
- Update docs/comments to distinguish fast readiness vs slow smoke.

### 3) Re-verify with targeted tests and packaging checks

**Status:** completed

- Run readiness and smoke unit tests.
- Run package-surface/manifest tests.
- Run dry-run pack validation and confirm moved toolchain deps are not production deps.

## Verification

- `./bin/wp test --file src/cli/commands/init/scaffold-agents-md.test.ts --file scripts/public-readiness.test.ts --file scripts/public-consumer-smoke.test.ts --file src/build/package-manifest.test.ts`
- `./bin/wp lint --file docs/getting-started.md --file docs/guides/session-memory.md --file package.json --file scripts/public-consumer-smoke.test.ts --file scripts/public-consumer-smoke.ts --file scripts/public-consumer-smoke-progress.ts --file scripts/public-readiness.test.ts --file scripts/public-readiness.ts --file src/build/package-manifest.test.ts --file src/cli/commands/init/scaffold-agents-md.ts --file blueprints/draft/2026-06-26-thin-root-release-readiness-split.md`
- `./bin/wp typecheck --file src/cli/commands/init/scaffold-agents-md.ts --file scripts/public-consumer-smoke.ts --file scripts/public-readiness.ts --file src/build/package-manifest.test.ts`
- `./bin/wp audit tph`
- `./bin/wp audit blueprint-lifecycle`
- `vp run build`
- `vp run public:readiness`
- `vp run public:consumer-smoke:setup`
- `npm pack --ignore-scripts --dry-run --json`

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-26T12:37:35.000Z
- verified-head: 1e3c2ccc2a965463224f0f3efda7bba275d05d44
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                                 | Evidence                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `public:readiness` no longer shells into packed consumer smoke.                                                       | repo:scripts/public-readiness.ts; repo:scripts/public-readiness.test.ts                                                             |
| C2  | Packed install proof remains explicitly covered by `public:consumer-smoke:setup`.                                     | repo:package.json; repo:scripts/public-consumer-smoke.ts; repo:scripts/public-consumer-smoke.test.ts                                |
| C3  | Root production dependencies exclude the moved repo-only toolchain packages while keeping runtime-owned dependencies. | repo:package.json; repo:src/build/package-manifest.test.ts                                                                          |
| C4  | Packed consumer setup stays within prompt-budget and scaffold-contract expectations.                                  | repo:src/cli/commands/init/scaffold-agents-md.ts; repo:scripts/public-consumer-smoke.ts; repo:scripts/public-consumer-smoke.test.ts |

### Material Decisions

| ID  | Decision                        | Chosen option                                                                              | Rejected alternatives                                                       | Rationale                                                                                                                                                                         |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Public package structure        | Keep one public `@webpresso/agent-kit` package with a thinner runtime-owned install graph. | Split into multiple public packages.                                        | Matches the stated release contract while reducing default install weight.                                                                                                        |
| D2  | Release proof split             | Make `public:readiness` fast/local and keep packed install as an explicit smoke command.   | Keep packed setup inside default readiness.                                 | Preserves the proof while reducing default readiness wall time.                                                                                                                   |
| D3  | Packed setup timeout handling   | Scope a measured longer timeout only to the packed `setup` phase.                          | Raise the global smoke timeout or leave the false timeout failure in place. | Cold packed `npm exec --package PACKED_TARBALL_PATH -- wp setup` was measured above five minutes; the scoped bound fixes the wrong-workload timeout without masking other phases. |
| D4  | Executable blueprint governance | Backfill an in-document Trust Dossier for the completed blueprint.                         | Leave the completed blueprint without trust metadata.                       | Satisfies executable-blueprint trust audits and preserves lifecycle history in place.                                                                                             |

### Promotion Gates

| Gate        | Command                                                                                                                                                                                              | Expected outcome | Last result        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------ |
| lifecycle   | ./bin/wp audit blueprint-lifecycle                                                                                                                                                                   | pass             | pass on 2026-06-26 |
| tph         | ./bin/wp audit tph                                                                                                                                                                                   | pass             | pass on 2026-06-26 |
| smoke-tests | ./bin/wp test --file scripts/public-readiness.test.ts --file scripts/public-consumer-smoke.test.ts --file src/build/package-manifest.test.ts --file src/cli/commands/init/scaffold-agents-md.test.ts | pass             | pass on 2026-06-26 |

### Residual Unknowns

None.
