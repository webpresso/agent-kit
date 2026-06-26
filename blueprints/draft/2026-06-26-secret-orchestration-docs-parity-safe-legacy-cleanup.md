---
type: blueprint
status: draft
complexity: M
created: "2026-06-26"
last_updated: "2026-06-26"
progress: "0% (drafted)"
depends_on: []
cross_repo_depends_on: []
tags: [secrets, docs, packaging, public-surface]
---

# Secret orchestration docs parity + safe legacy cleanup

**Goal:** Ship accurate, packaged secret orchestration/operator docs and error docs, add guardrails that fail when shipped doc references drift or stay placeholder-only, and remove the remaining targeted user-facing `with-secrets` wording from the stale Context7 init/setup path without deleting compatibility code.

## Planning Summary

- Goal input: `Secret orchestration docs parity and safe legacy cleanup`
- Complexity: `M`
- Output path: `blueprints/draft/2026-06-26-secret-orchestration-docs-parity-safe-legacy-cleanup.md`
- Default shape: flat file (`blueprints/<status>/<slug>.md`)

## Problem

The repo ships secret orchestration commands and runtime `docsPath` references, but the referenced docs are only partially discoverable, not fully packaged in the npm tarball, and some public entry docs still underspecify the real v1 provider/profile contract. A stale Codex Context7 setup path still advertises `with-secrets` wording even though the intended operator-facing flow is provider-backed launch through the shared `wp` secret contract.

## Scope

- Rewrite secret/operator docs and secret error docs to match the current shipped contract.
- Link those docs from public entry surfaces and ensure tarball inclusion for README/runtime references.
- Extend readiness validation to fail when secret/error docs are missing or placeholder-only.
- Remove targeted stale `with-secrets` copy from init/setup output and mark contradictory blueprint history as superseded.
- Preserve compatibility code and legacy parser/surfaces in runtime/CLI.

## Non-goals

- Removing the legacy `{ manager, projectId }` parser.
- Removing `wp config secrets`, `SECRET_WRAPPER_BINS`, `wp migrate secrets`, `secret-provider-quarantine`, or internal `secretEnvProfile` wiring.
- Changing CLI/API shape beyond the documented copy/packaging updates.

### Phase 1: Docs, packaging, and guardrails [Complexity: M]

#### [docs] Task 1.1: Rewrite public secret/operator docs

**Status:** todo

**Depends:** None

Rewrite `docs/secrets/*` and `docs/errors/wp-secret-orchestration.md` so they document the shipped schema-v1 provider/profile contract, local-vs-committed config split, runtime fetch model, provider-backed launch expectations, doctor/status/run/bootstrap/migrate flows, sink/profile mapping, and actionable `WP_*` failures.

**Acceptance:**

- [ ] Secret/operator docs describe the current contract instead of placeholders/stubs.
- [ ] Error doc enumerates the relevant `WP_*` secret/orchestration failures and fixes.

#### [public-surface] Task 1.2: Link and package referenced docs

**Status:** todo

**Depends:** Task 1.1

Add explicit links from public entry docs and include the referenced docs in `package.json#files` so README links and runtime `docsPath` targets ship in the public tarball.

**Acceptance:**

- [ ] Public entry docs link to the secret/error docs.
- [ ] `npm pack --dry-run --json` includes the referenced secret/error docs.

#### [guardrails] Task 1.3: Readiness/test coverage for shipped docs and stale copy

**Status:** todo

**Depends:** Task 1.2

Extend readiness checks and tests so they fail when shipped README/runtime secret docs are missing or placeholder-only, and update init/setup coverage so no targeted user-facing Context7 output still mentions `with-secrets`.

**Acceptance:**

- [ ] Targeted tests cover shipped doc references and stale init/setup copy removal.
- [ ] `vp run public:readiness` fails on missing/placeholder secret docs.

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Tests | targeted vitest suites | Updated tests pass |
| Readiness | `vp run public:readiness` | Green |
| Package surface | `npm pack --dry-run --json` | Referenced docs included |
| Lint/format | scoped repo wrappers | Green |

