---
type: blueprint
title: "secret orchestration hard-cut audits and fixtures"
owner: codex
status: completed
complexity: M
created: "2026-06-19"
last_updated: "2026-06-19"
progress: "100% (hard-cut audit slice shipped and verified)"
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

> [!NOTE]
> Historical scope note: this document records the audit/fixture slice only. The later completed blueprint [`2026-06-20-global-wp-schema-v1-secret-contract.md`](./2026-06-20-global-wp-schema-v1-secret-contract.md) is the compatibility-preserving public contract; legacy `wp config secrets` and local wrapper compatibility were retained.

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

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                                                  |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-19-secret-orchestration-hard-cut-audits-and-fixtures.md |

### Material Decisions

| ID  | Decision                                                                   | Chosen option                          | Rejected alternatives                                      | Rationale                                                                       |
| --- | -------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| D1  | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate      | Command                      | Expected outcome | Last result                      |
| --------- | ---------------------------- | ---------------- | -------------------------------- |
| lifecycle | wp audit blueprint-lifecycle | pass             | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

None.
