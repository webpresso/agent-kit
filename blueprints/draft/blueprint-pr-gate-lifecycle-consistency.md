---
type: blueprint
status: draft
complexity: S
created: "2026-07-01"
last_updated: "2026-07-01"
progress: "0% (planned)"
depends_on: []
cross_repo_depends_on: []
tags: [ci, governance, blueprints]
---

# Blueprint PR gate lifecycle consistency

**Goal:** Future-proof the PR Blueprint gate so a completed or otherwise terminal-looking blueprint cannot remain under `blueprints/draft/` and still pass required PR checks.

## Problem

PR #339 merged with `blueprints/draft/fix-session-memory-snapshot-bench-gate.md` even though the blueprint text had 100% completion evidence and checked acceptance criteria. The repo already has lifecycle validation for draft/completed folder consistency, but the required PR `Blueprint gate` only ran `wp audit blueprint-pr-coverage`, so lifecycle drift was not part of that required gate.

## Acceptance

- [ ] The PR-required `Blueprint gate` runs blueprint lifecycle consistency in addition to coverage.
- [ ] A regression test fails if the CI workflow stops invoking the lifecycle audit in the `Blueprint gate` job.
- [ ] The merged PR #339 blueprint is moved to `blueprints/completed/` and frontmatter matches its shipped state.
- [ ] Targeted CI workflow tests pass.
- [ ] `wp audit blueprint-lifecycle` passes for the repository.

## Non-goals

- Reworking the blueprint lifecycle model.
- Changing branch protection settings outside repository-owned CI configuration.
