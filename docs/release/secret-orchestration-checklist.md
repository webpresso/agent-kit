---
type: guide
title: Secret orchestration release checklist
status: draft
created: 2026-06-19
last_updated: 2026-06-19
---

# Secret orchestration release checklist

Ultragoal story: `G001-execute-the-agent-kit-wp-secret-orch`

Required evidence before final completion:

- Agent Kit shared secret surfaces implemented and typechecked
- Shared GitHub Actions preview/production/e2e/cleanup workflows verified
- Consumer repos migrated to committed `schemaVersion: 1` secret metadata
- Consumer `verify:secrets` gates pass with:
  - `wp audit no-dev-vars`
  - `wp audit secret-provider-quarantine`
  - `wp audit secrets-config`
  - `wp secrets doctor --profile preview --json`
- Cross-repo matrix tests pass
- DX harness tests pass

Credential-gated smoke should be recorded separately from the fixture-based
proof surface and must not be represented as passed if skipped.
