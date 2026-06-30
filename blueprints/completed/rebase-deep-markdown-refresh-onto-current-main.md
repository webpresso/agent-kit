---
type: blueprint
status: completed
complexity: XS
created: "2026-06-26"
last_updated: "2026-06-30"
progress: "100% (merged in PR #275; verification recorded)"
depends_on: []
cross_repo_depends_on: []
tags:
  - docs
  - rebase
  - mergeability
---

# Rebase deep markdown refresh onto current main

## Goal

Make PR #275 merge cleanly on current `main` without reintroducing the retired `WP_ROUTING_BLOCK` path or deleting completed blueprint records during a docs refresh.

## Scope

- replay the docs/metadata refresh on top of current `origin/main`
- keep current `src/hooks/shared/instruction-surfaces*` behavior from `main`
- restore the two completed `webpresso/blueprints/**` records
- fix the dangling `TODOS.md` prose reference introduced by deleting `TODOS.md`

## Tasks

#### [git] Task 1.1: Rebase the stale PR commit onto current main

**Status:** done

**Files:**

- Modify: branch history for `agent/deep-markdown-refresh`

**Acceptance:**

- [x] Branch is rebuilt from current `origin/main`
- [x] Stale `instruction-surfaces*` conflicts are resolved in favor of current `main`

#### [docs] Task 1.2: Keep the refresh consistent with repo policy

**Status:** done

**Files:**

- Modify: `docs/research/2026-05-11-agent-asset-trilogy-ceo-plan.md`
- Restore: `webpresso/blueprints/completed/fold-webpresso-quality-engine-into-webpresso-agent-kit-decision-4/_overview.md`
- Restore: `webpresso/blueprints/completed/initial-agent-kit-extraction/_overview.md`

**Acceptance:**

- [x] No new stale `TODOS.md` reference remains in touched docs
- [x] Completed blueprint records are not deleted by this PR

## Verification Gates

| Gate                  | Command                                                                                                             | Success criteria               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Focused tests         | `./bin/wp test --file src/hooks/shared/instruction-surfaces.test.ts`                                                | Passes on rebased branch       |
| Docs checks           | `./bin/docs-check-internal-links.js && ./bin/docs-check-refs.js && ./bin/docs-check-stale.js && ./bin/docs-lint.js` | All pass                       |
| Formatting            | `vp run format --check`                                                                                             | Passes                         |
| Mergeability evidence | `gh pr view 275 --json mergeable`                                                                                   | Reports `MERGEABLE` after push |

## Non-goals

- rewriting the docs refresh itself beyond mergeability/policy fixes
- changing current routing-source behavior on `main`
