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
