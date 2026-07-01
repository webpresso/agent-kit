---
type: blueprint
owner: webpresso
title: "Consumer scaffold dedupe"
status: parked
complexity: M
created: "2026-07-01"
last_updated: "2026-07-01"
progress_pct: 45
progress: "Agent-config Playwright quality scaffold surface is implemented; final consumer smoke deletion waits for package publication."
parked_reason: "Waiting for @webpresso/agent-config release containing ./playwright/quality-scaffold before deleting remaining consumer root smoke specs."
depends_on:
  - "webpresso/monorepo#101: consumer duplication gate"
---

# Consumer scaffold dedupe

## Goal

Move generic, repeated consumer scaffold files out of hand-maintained consumer repos and into the public setup/config surface that consumers already depend on.

## Scope

- Add public `@webpresso/agent-config` Playwright quality-scaffold helpers so consumers can run the shared smoke test without committing duplicate root `e2e/smoke.spec.ts` and `e2e/fixtures/smoke.html` files.
- Keep consumer-specific E2E configs and app-specific suites local.
- Record setup-owned agent README/docs-template/changelog placeholders as upstream-owned surfaces with audit coverage before consumer deletion.

## Architecture before

- Consumers hand-maintain identical or format-only-different quality scaffold smoke specs and fixtures.
- Consumers carry boilerplate README/template placeholder files that are generic setup instructions rather than repo-specific policy.
- The monorepo duplication gate can report some repeated surfaces, but `@webpresso/agent-config` does not yet provide a reusable Playwright scaffold surface for consumers to depend on.

## Architecture after

- `@webpresso/agent-config/playwright/quality-scaffold` exports a baseline Playwright config factory and a package-owned smoke spec/fixture path.
- Consumers with only the generic root smoke scaffold keep a tiny `playwright.config.ts` wrapper and delete duplicate smoke spec/fixture files.
- Consumers with real app-specific E2E suites remain local and only delete setup/docs placeholder files when safe.

## Tasks

#### [config] Task 1.1: Add agent-config Playwright quality scaffold surface

**Status:** done

**Depends:** None

Add a public agent-config subpath that exposes a config factory and package-owned smoke test directory for generic consumer scaffold smoke checks.

**Acceptance:**

- [x] Exported subpath is listed in package exports and tshy exports.
- [x] Tests prove the factory points at package-owned smoke specs and preserves caller overrides.
- [x] Package build/typecheck tests pass for the new surface.

#### [consumer] Task 1.2: Migrate consumers off duplicate smoke scaffold files

**Status:** blocked

**Blocked:** Waiting for @webpresso/agent-config release containing `./playwright/quality-scaffold` before downstream consumers can import it in CI.

**Depends:** Task 1.1

Update consumers that only need the generic root quality smoke scaffold to use the upstream config factory and delete duplicate local smoke spec/fixture files.

**Acceptance:**

- [ ] Duplicate root smoke spec/fixture files are removed where not repo-specific.
- [ ] Consumer E2E smoke checks still pass.
- [ ] App-specific E2E suites are not collapsed into the generic scaffold.

#### [audit] Task 1.3: Extend duplication lock for remaining setup placeholders

**Status:** done

**Depends:** Task 1.1

Extend the consumer duplication gate to include smoke fixture and template-only changelog boilerplate, and document placeholders that setup owns.

**Acceptance:**

- [x] Duplication gate fails if the generic fixture/changelog boilerplate reappears across consumers without exception.
- [x] Verification evidence is recorded before PR readiness.

## Verification

- `pnpm exec vitest run packages/agent-config/src/playwright/quality-scaffold.test.ts packages/agent-config/src/export-isolation.test.ts` passed (7 tests).
- `pnpm --filter @webpresso/agent-core run build` then `pnpm --dir packages/agent-config exec tsc --noEmit` passed.
- `pnpm --filter @webpresso/agent-config run build` passed.
- `pnpm --dir packages/agent-config exec playwright test --config /tmp/agent-config-quality-scaffold.config.mjs` passed (1 package-owned smoke test).

Planned final gates:

- `vp run --filter @webpresso/agent-config test`
- `vp run --filter @webpresso/agent-config typecheck`
- Consumer targeted E2E/config tests for migrated repos.

## Trust Dossier

### Readiness Verdict

- promotion-ready: false
- unresolved-count: 2
- verified-at: 2026-07-01T00:00:00.000Z
- verified-head: pending-consumer-migration
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                    | Evidence                                                      |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| C1  | Consumers still carry duplicated generic smoke scaffolds until a package-owned replacement is published. | repo:consumer duplication audit output                        |
| C2  | `@webpresso/agent-config/playwright/quality-scaffold` provides the package-owned replacement surface.    | repo:packages/agent-config/src/playwright/quality-scaffold.ts |

### Material Decisions

| ID  | Decision                  | Chosen option                                           | Rejected alternatives                                  | Rationale                                                          |
| --- | ------------------------- | ------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------ |
| D1  | Smoke scaffold ownership  | Publish package-owned Playwright quality scaffold first | Delete consumer smoke specs before replacement release | Keeps consumer E2E commands green while moving ownership upstream. |
| D2  | Consumer migration timing | Keep root smoke deletion blocked until package release  | Import unpublished package subpath in consumer CI      | Avoids red downstream PRs against current published agent-config.  |

### Promotion Gates

| Gate               | Command                                       | Expected outcome | Last result        |
| ------------------ | --------------------------------------------- | ---------------- | ------------------ |
| package-tests      | targeted Vitest and Playwright smoke commands | pass             | pass on 2026-07-01 |
| consumer-migration | downstream consumer PR checks                 | pass             | pending            |

### Residual Unknowns

- Exact published version carrying the new agent-config subpath.
- Timing for deleting the remaining root smoke spec/fixture from consumers after publication.
