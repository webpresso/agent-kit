---
type: blueprint
title: "secret orchestration hard-cut audits and fixtures"
owner: codex
status: completed
complexity: M
created: '2026-06-19'
last_updated: '2026-06-19'
progress: '100% (hard-cut audit slice shipped and verified)'
depends_on: []
cross_repo_depends_on: []
tags:
  - secrets
  - audits
  - workflows
  - fixtures
  - migration
---

# secret orchestration hard-cut audits and fixtures

## Summary

Shipped the hard-cut audit slice for secret orchestration: expanded legacy local
wrapper detection, added a standalone `github-actions-secrets` audit for
reusable workflow secret contracts, tightened `package-surface` around consumer
`@webpresso/agent-kit` dependencies, and added migration fixtures that prove
legacy setups fail while the clean global-`wp` + `@webpresso/agent-config`
baseline passes.

This blueprint records the repo-local execution evidence for Task 1.3 of the
larger cross-repo secret-orchestration ultragoal.

## Tasks

#### [audit] Task 1.3: Extend hard-cut audits and add migration fixtures

**Status:** done

**Depends:** None

Added the first reusable workflow secret-policy audit, extended the quarantine
audit to catch legacy local act/setup helpers, added a consumer-local
`@webpresso/agent-kit` package-surface rule, and recorded clean/legacy migration
fixtures under `src/secrets/migrate/fixtures/`.

**Files:**

- Modify: `src/audit/secret-provider-quarantine.ts`
- Modify: `src/audit/secret-provider-quarantine.test.ts`
- Create: `src/audit/github-actions-secrets.ts`
- Create: `src/audit/github-actions-secrets.test.ts`
- Modify: `src/audit/package-surface.ts`
- Modify: `src/audit/package-surface.test.ts`
- Modify: `src/cli/commands/audit-core.ts`
- Modify: `src/cli/commands/audit-core.test.ts`
- Modify: `src/mcp/tools/_shared/audit-kinds.ts`
- Modify: `src/mcp/tools/audit.ts`
- Modify: `src/mcp/tools/audit.test.ts`
- Create: `src/secrets/migrate/fixtures/legacy-local-scripts/**`
- Create: `src/secrets/migrate/fixtures/clean-global-wp/**`
- Create: `src/secrets/migrate/fixtures.test.ts`

**Acceptance:**

- [x] Legacy local wrapper patterns fail through hard-cut audits.
- [x] `github-actions-secrets` exists as a standalone audit kind in CLI and MCP dispatch.
- [x] Consumer-local `@webpresso/agent-kit` package manifests fail package-surface.
- [x] The clean global-`wp` + `@webpresso/agent-config` fixture passes the hard-cut audits.

## Verification

- `./bin/wp test --file src/audit/secret-provider-quarantine.test.ts --file src/audit/github-actions-secrets.test.ts --file src/audit/package-surface.test.ts --file src/secrets/migrate/fixtures.test.ts --file src/cli/commands/audit-core.test.ts --file src/mcp/tools/audit.test.ts`
- `./bin/wp lint --file src/audit/secret-provider-quarantine.ts --file src/audit/secret-provider-quarantine.test.ts --file src/audit/github-actions-secrets.ts --file src/audit/github-actions-secrets.test.ts --file src/audit/package-surface.ts --file src/audit/package-surface.test.ts --file src/secrets/migrate/fixtures.test.ts --file src/cli/commands/audit-core.ts --file src/cli/commands/audit-core.test.ts --file src/mcp/tools/_shared/audit-kinds.ts --file src/mcp/tools/audit.ts --file src/mcp/tools/audit.test.ts`
- `./bin/wp typecheck`
