---
type: blueprint
title: "secret orchestration WP error envelope"
owner: codex
status: completed
complexity: S
created: '2026-06-19'
last_updated: '2026-06-19'
progress: '100% (WP_* error envelope slice shipped and verified)'
depends_on: []
cross_repo_depends_on: []
tags:
  - secrets
  - agent-kit
  - errors
  - json
  - docs
---

# secret orchestration WP error envelope

## Summary

Shipped the first stable `WP_*` error-envelope surface for secret orchestration:
a validated docs URL contract, JSON envelope helper with recursive redaction, and
`wp err --json ...` support that wraps failed command output into a structured
problem/cause/fix/docs/evidence payload.

This blueprint records the repo-local execution evidence for Task 1.2 of the
larger cross-repo secret-orchestration ultragoal.

## Tasks

#### [errors] Task 1.2: Add the stable WP error envelope and docs mapping

**Status:** done

**Depends:** None

Added a reusable error-envelope helper under `src/errors/`, exposed an aliasable
`#errors/*` import path, taught `wp err` to emit structured JSON envelopes for
failed commands when metadata is provided, and documented the initial secret
orchestration codes in `docs/errors/`.

**Files:**

- Create: `src/errors/wp-error.ts`
- Create: `src/errors/wp-error.test.ts`
- Modify: `src/cli/commands/err.ts`
- Modify: `src/cli/commands/err.test.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `docs/errors/wp-secret-orchestration.md`

**Acceptance:**

- [x] `WP_*` codes validate through a single helper.
- [x] Docs URLs are restricted to `docs/errors/*.md` with optional anchors.
- [x] JSON envelopes contain `problem`, `cause`, `fix`, `docsUrl`, and redacted `evidence`.
- [x] `wp err --json ...` emits the structured envelope for failed commands.

## Verification

- `./bin/wp test --file src/errors/wp-error.test.ts --file src/cli/commands/err.test.ts`
- `./bin/wp lint --file src/errors --file src/cli/commands/err.ts --file docs/errors/wp-secret-orchestration.md`
- `./bin/wp typecheck`
