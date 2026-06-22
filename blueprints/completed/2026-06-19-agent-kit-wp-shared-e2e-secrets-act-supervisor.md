---
type: blueprint
title: "Agent Kit: shared wp surfaces for secrets, act, e2e supervision"
owner: agent-kit
status: completed
completed_at: '2026-06-19'
complexity: L
created: "2026-06-19"
last_updated: "2026-06-19"
progress: "100% (repo-owned secret profiles, direct/replay ci-act mode, strict supervisor cleanup assertions, blocking audits, supervision consolidation, and local setup-action removal landed)"
depends_on: []
cross_repo_depends_on:
  - repo: ozby/repos
    slug: 2026-06-19-cross-repo-agent-kit-dedupe-e2e-secrets-act-setup
    require_status: in-progress
tags:
  - wp
  - act
  - secrets
  - e2e
  - process-supervisor
  - audit
---

# Agent Kit: shared wp surfaces for secrets, act, e2e supervision

**Goal:** Make Agent Kit the single owner of shared `wp` CLI/MCP logic for secret profile parsing, local `act`, process supervision, and anti-duplication/security audits used by downstream consumers.

## Scope

- Secret profile schema for `.webpresso/secrets.config.json`
- OIDC-only CI validation
- `wp ci act --secret-profile <profile>` direct/replay execution contract
- Local-provider auth path for `act`
- Strict subprocess supervision for wrangler/workerd/e2e flows
- Blocking audits for duplicates and security regressions

## Tasks

1. Add or tighten secret-profile parsing and validation. ✅
2. Add/finish `wp ci act` dual-mode behavior and redacted diagnostics. ✅
3. Add/finalize strict process-tree supervision and cleanup assertions. ✅
4. Add blocking audits for:
   - raw `with-secrets -- act`
   - local act-secret-profile clones
   - consumer `@webpresso/agent-kit` project dependency
   - unpinned secret-bearing third-party actions
   - CI token fallback drift ✅
5. Cover each contract with targeted tests. ✅

#### [supervision] Task 3.1: Finalize strict process-tree supervision and cleanup assertions

**Status:** done

**Depends:** None

**Files:** Modify `src/e2e/execution.ts`, `src/secret-gate/runner.ts`,
`src/runtime/executor.ts`, `src/utils/process-supervisor.ts`; add focused
supervisor tests in `src/e2e/execution.supervisor.test.ts` and
`src/secret-gate/runner.supervisor.test.ts`.

**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"wp test --file src/runtime/secrets-config.test.ts --file src/ci/act-runner.test.ts --file src/cli/commands/ci.test.ts --file src/e2e/execution.supervisor.test.ts --file src/secret-gate/runner.supervisor.test.ts --file src/audit/secret-provider-quarantine.test.ts --file src/cli/commands/init/config.test.ts --file src/cli/commands/init/scaffold-base-kit.test.ts","exit_code":0,"kind":"integration","result":"pass","target_files":["src/runtime/secrets-config.ts","src/ci/act-runner.ts","src/cli/commands/ci.ts","src/e2e/execution.ts","src/secret-gate/runner.ts","src/audit/secret-provider-quarantine.ts","src/cli/commands/init/config.ts","src/cli/commands/init/scaffold-base-kit.ts"],"ts":"2026-06-19T14:35:00Z"},{"agent":"codex","command":"wp typecheck","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-19T14:35:00Z"}]
```

**Acceptance:**

- [x] E2E execution uses detached child process groups and bounded abort-time cleanup.
- [x] Secret-gate supervision escalates hung children from `SIGTERM` to `SIGKILL`.
- [x] Shared runtime/executor paths consume the same supervision contract.
- [x] Focused supervisor, act, audit, and init verification passes.

## Current completion evidence

- `wp ci act` public contract now accepts repo-owned `secretProfile` names from `.webpresso/secrets.config.json`.
- `wp ci act` now supports explicit `direct` and generated `replay` modes; replay
  uses a temporary workflow file and is documented as non-security-equivalent to GitHub CI/OIDC.
- Public `secretEnvProfile` / non-canonical runtime selector compatibility was removed from the `wp ci act` surface.
- The E2E execution runner now uses detached child process groups, explicit
  abort/timeout kill handling, and public MCP `timeoutMs` propagation.
- The secret-gate runner now escalates hung children from `SIGTERM` to
  `SIGKILL` after a bounded grace window, with focused supervisor tests.
- Runtime config merges committed repo-owned secret profiles with runtime `.git/webpresso/secrets.json` data.
- Added blocking audits for:
  - raw `with-secrets -- act`
  - local `act-with-webpresso` / `act-secret-profile` clones
  - consumer-local `@webpresso/agent-kit` dependencies
  - legacy CI token fallbacks
  - non-SHA third-party action refs in secret-bearing workflows
  - missing `id-token: write` on secret-bearing workflows
- Deleted the dead `src/ci/act-helper.ts` legacy helper surface.
- Removed the consumer-scaffolded local `setup-webpresso` GitHub action and its
  version-resolution helper template; base-kit CI now installs global `wp`
  directly instead of requiring a repo-local `@webpresso/agent-kit` dependency.

## Verification

- `wp test`
- `wp typecheck`
- targeted tests for secret profiles / act / supervisor / audits
- `wp test --file src/runtime/secrets-config.test.ts --file src/ci/act-runner.test.ts --file src/cli/commands/ci.test.ts --file src/e2e/execution.supervisor.test.ts --file src/secret-gate/runner.supervisor.test.ts --file src/audit/secret-provider-quarantine.test.ts --file src/cli/commands/init/config.test.ts --file src/cli/commands/init/scaffold-base-kit.test.ts`
- `wp typecheck`

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| -- | ----- | -------- |
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-19-agent-kit-wp-shared-e2e-secrets-act-supervisor.md |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| -- | -------- | ------------- | --------------------- | --------- |
| D1 | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| ---- | ------- | ---------------- | ----------- |
| lifecycle | wp audit blueprint-lifecycle | pass | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

None.
