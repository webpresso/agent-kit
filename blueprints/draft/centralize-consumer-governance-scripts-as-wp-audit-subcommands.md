---
type: blueprint
status: draft
complexity: M
created: '2026-06-12'
last_updated: '2026-06-12'
progress: '50% (Track A complete)'
depends_on: []
cross_repo_depends_on: []
tags: []
---

# Centralize consumer governance scripts as wp audit subcommands

**Goal:** centralize consumer governance scripts as wp audit subcommands

## Product wedge anchor

- **Stage outcome:** consumer repos call `wp audit <cmd>` instead of maintaining local copies of governance scripts
- **Consuming surface:** `.husky/pre-commit` hooks and `.github/workflows/ci.yml` in all consumer repos (ingest-lens, edge-matte, ozby-dev)
- **New user-visible capability:** governance scripts are DRY — update once in agent-kit, all consumers get the fix on next version bump

## Planning Summary

- Goal input: `centralize consumer governance scripts as wp audit subcommands`
- Complexity: `M`
- Draft slug: `centralize-consumer-governance-scripts-as-wp-audit-subcommands`
- Output path: `blueprints/draft/centralize-consumer-governance-scripts-as-wp-audit-subcommands.md`

## Architecture Overview

```text
Before:
  consumer repo
    scripts/verify-secrets-policy.ts     (local copy)
    scripts/check-no-dev-vars.ts         (local copy)
    scripts/audit-secret-provider-quarantine.ts  (local copy)
    .husky/pre-commit → bun scripts/...
    .github/workflows/ci.yml → bun scripts/...

After:
  @webpresso/agent-kit
    src/audit/lib/secrets-policy.ts      (shared types)
    src/audit/secrets-policy.ts          (wp audit secrets-policy)
    src/audit/no-dev-vars.ts             (wp audit no-dev-vars)
    src/audit/secret-provider-quarantine.ts  (wp audit secret-provider-quarantine)
    src/audit/secrets-config.ts          (wp audit secrets-config)
    src/audit/test-affected.ts           (wp test --affected)
    → wired into REPO_AUDIT_REGISTRY

  consumer repo
    .husky/pre-commit → wp audit secrets-policy
    .github/workflows/ci.yml → wp audit secrets-policy, wp audit no-dev-vars, ...
```

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Shared types module | `src/audit/lib/secrets-policy.ts` | Avoids duplication across audit subcommands |
| Workspace-aware mutation testing | `wp test --affected` | Supports multi-package and single-app repos |
| Registry wiring | `REPO_AUDIT_REGISTRY` | Consistent discoverability via `wp audit --list` |

## Quick Reference (Execution Waves)

| Wave              | Tasks | Dependencies | Parallelizable |
| ----------------- | ----- | ------------ | -------------- |
| **Wave 0 (done)** | Track A (1.1–1.5) | None | complete |
| **Wave 1**        | 2.1 ingest-lens | Track A | 1 agent |
| **Wave 1**        | 2.2 edge-matte | Track A | 1 agent |
| **Wave 1**        | 2.3 ozby-dev | Track A | 1 agent |
| **Critical path** | Track A → Wave 1 | — | 3 parallel agents |

## Track A — agent-kit implementation (complete)

### Phase 1: Port governance scripts into wp audit [Complexity: M]

#### Task 1.1: Shared types module

**Status:** done

**Depends:** None

Created `src/audit/lib/secrets-policy.ts` with shared types used across secrets-related audit subcommands.

**Files:**

- Created: `src/audit/lib/secrets-policy.ts`

**Acceptance:**

- [x] Shared types exported and consumed by downstream audit modules
- [x] No circular dependencies

#### Task 1.2: Port verify-secrets-policy.ts as wp audit secrets-policy

**Status:** done

**Depends:** Task 1.1

Ported `verify-secrets-policy.ts` from consumer repos into `src/audit/secrets-policy.ts` with full test coverage.

**Files:**

- Created: `src/audit/secrets-policy.ts`
- Created: `src/audit/secrets-policy.test.ts`

**Acceptance:**

- [x] Implementation passes all tests
- [x] Wired into REPO_AUDIT_REGISTRY

#### Task 1.3: Port check-no-dev-vars.ts as wp audit no-dev-vars

**Status:** done

**Depends:** Task 1.1

Ported `check-no-dev-vars.ts` from consumer repos into `src/audit/no-dev-vars.ts` with full test coverage.

**Files:**

- Created: `src/audit/no-dev-vars.ts`
- Created: `src/audit/no-dev-vars.test.ts`

**Acceptance:**

- [x] Implementation passes all tests
- [x] Wired into REPO_AUDIT_REGISTRY

#### Task 1.4: Port audit-secret-provider-quarantine.ts as wp audit secret-provider-quarantine

**Status:** done

**Depends:** Task 1.1

Ported `audit-secret-provider-quarantine.ts` from consumer repos into `src/audit/secret-provider-quarantine.ts` with full test coverage.

**Files:**

- Created: `src/audit/secret-provider-quarantine.ts`
- Created: `src/audit/secret-provider-quarantine.test.ts`

**Acceptance:**

- [x] Implementation passes all tests
- [x] Wired into REPO_AUDIT_REGISTRY

#### Task 1.5: Add wp audit secrets-config and wp test --affected

**Status:** done

**Depends:** Task 1.1

Added `src/audit/secrets-config.ts` (validates `.webpresso/secrets.config.json`) and `wp test --affected` (workspace-aware mutation testing supporting multi-package and single-app repos).

**Files:**

- Created: `src/audit/secrets-config.ts`
- Created: `src/audit/secrets-config.test.ts`

**Acceptance:**

- [x] secrets-config validates `.webpresso/secrets.config.json`
- [x] `wp test --affected` works for multi-package and single-app repos
- [x] Wired into REPO_AUDIT_REGISTRY

---

## Track B — consumer repo migration (pending)

### Phase 2: Replace local scripts with wp audit calls [Complexity: S per repo]

#### Task 2.1: ingest-lens — replace bun scripts/ calls with wp audit

**Status:** todo

**Depends:** Track A complete + new agent-kit version published

Replace all `bun scripts/verify-secrets-policy.ts`, `bun scripts/check-no-dev-vars.ts`, and related calls in `.husky/pre-commit` and `.github/workflows/ci.yml` with their `wp audit` equivalents. Remove the now-redundant local script files.

**Files:**

- Modify: `.husky/pre-commit`
- Modify: `.github/workflows/ci.yml`
- Delete: `scripts/verify-secrets-policy.ts` (if present)
- Delete: `scripts/check-no-dev-vars.ts` (if present)
- Delete: `scripts/audit-secret-provider-quarantine.ts` (if present)

**Steps:**

1. Bump `@webpresso/agent-kit` to the version containing Track A
2. Replace each `bun scripts/<name>.ts` call with `wp audit <subcommand>`
3. Run full CI locally to verify
4. Delete removed script files

**Acceptance:**

- [ ] No local governance script copies remain
- [ ] `.husky/pre-commit` and CI use `wp audit` exclusively
- [ ] CI passes

#### Task 2.2: edge-matte — replace bun scripts/ calls + add missing CI

**Status:** todo

**Depends:** Track A complete + new agent-kit version published

Replace governance script calls with `wp audit` equivalents. Additionally add missing mutation CI, lore CI, and security-scan workflows that are absent from edge-matte.

**Files:**

- Modify: `.husky/pre-commit`
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/mutation.yml` (if missing)
- Create: `.github/workflows/lore.yml` (if missing)
- Create: `.github/workflows/security-scan.yml` (if missing)

**Steps:**

1. Bump `@webpresso/agent-kit` catalog pin
2. Replace governance script calls with `wp audit` equivalents
3. Add missing CI workflow files following ingest-lens as reference
4. Run full CI locally to verify

**Acceptance:**

- [ ] No local governance script copies remain
- [ ] Mutation CI present and green
- [ ] Lore CI present and green
- [ ] Security-scan CI present and green
- [ ] CI passes

#### Task 2.3: ozby-dev — full wp setup from scratch + CI workflows

**Status:** todo

**Depends:** Track A complete + new agent-kit version published

Run `wp setup` from scratch in ozby-dev and wire up full CI workflows (governance, mutation, lore, security-scan).

**Files:**

- Create/Modify: `.husky/pre-commit`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/mutation.yml`
- Create: `.github/workflows/lore.yml`
- Create: `.github/workflows/security-scan.yml`

**Steps:**

1. Add `@webpresso/agent-kit` as dev dependency
2. Run `wp setup` to scaffold hooks and config
3. Wire CI workflows following ingest-lens and edge-matte as reference
4. Verify all governance audits pass

**Acceptance:**

- [ ] `wp setup` completed without errors
- [ ] All CI workflows present and green
- [ ] `wp audit --list` shows all subcommands available

---

## Verification Gates

| Gate        | Command                            | Success Criteria |
| ----------- | ---------------------------------- | ---------------- |
| Type safety | `pnpm -r typecheck`                | Zero errors      |
| Lint        | `pnpm -r lint`                     | Zero violations  |
| Tests       | `pnpm -r test`                     | All pass         |
| Full QA     | `wp qa`                            | All pass         |

## Cross-Plan References

| Type       | Blueprint | Relationship |
| ---------- | --------- | ------------ |
| Upstream   | None      |              |
| Downstream | ingest-lens, edge-matte, ozby-dev consumer migrations | Track B |

## Non-goals

- Porting non-governance scripts (build helpers, deployment scripts) into agent-kit
- Changing the semantics of any ported audit — Track A is a pure port

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Agent-kit publish delay blocks Track B | Medium | Track B can proceed with local `pnpm link` against the agent-kit clone |
| Consumer CI relies on exact script exit codes | Low | Verify exit code parity in Task 2.1 before deleting scripts |
