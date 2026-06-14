---
type: blueprint
title: Audit kind registry pattern
owner: ozby
status: planned
complexity: M
created: '2026-06-14'
last_updated: '2026-06-14'
progress: '0% (0/6 tasks done, 0 blocked)'
refined: true
depends_on: []
cross_repo_depends_on: []
tags:
  - architecture
  - ocp
  - dry
  - audit
  - mcp
worktree_owner_id: ''
worktree_owner_branch: ''
---

# Audit kind registry pattern

**Goal:** Replace the 27-case `switch(kind)` in `src/mcp/tools/audit.ts:92-411` with a registry so new audit kinds are added without modifying dispatch.

## Technology Choices

| Choice | Rationale |
| ------ | --------- |
| Interface-based registry | Leverages existing TS patterns; no new deps. |
| Dynamic `await import()` per descriptor | Preserves current lazy-loading; avoids pulling all audit modules into the MCP server startup. |
| Descriptors exported from existing audit modules | Avoids creating a new `descriptors/` directory; keeps audit shape co-located with audit logic (KISS). |
| `#audit/*` path alias | Already mapped in tsconfig to `./src/audit/*.ts`. |

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality | Fix Applied |
| -- | -------- | ----- | ---------------- | ----------- |
| F1 | HIGH | `audit.ts` has a 27-case switch. | Confirmed: 27 `case` statements at `src/mcp/tools/audit.ts:93-406`. | — |
| F2 | HIGH | Adding a new audit requires editing dispatch. | Confirmed: each case hardcodes the import and invocation in `audit.ts`. | Tasks 1.2–1.5 remove this coupling. |
| F3 | MEDIUM | ~49 audit source files. | **Corrected:** there are 103 `.ts` files in `src/audit/` (mix of source + test). ~50 non-test source modules. Many modules are not yet wired to the switch (only 27 of 50+ have cases). Registry enumeration will surface unwired modules. | File count corrected in blueprint. |
| F4 | MEDIUM | Test command uses `./bin/wp test --file`. | Confirmed: `bin/wp` is a `/usr/bin/env node` script wrapping the repo toolchain. `./bin/wp typecheck` and `./bin/wp lint` also available. | Verification gates updated. |
| F5 | LOW | All cases use `summarizeRepoAudit`. | 22 cases use `summarizeRepoAudit`. 5 cases use custom summary logic: `hook-surface`, `no-relative-package-scripts`, `tph`, `tph-e2e`, `bundle-budget`. 3 cases are `async`. | Descriptor interface must accommodate all patterns. |
| F6 | LOW | All imports use `#audit/*`. | `bundle-budget` imports from `../../vite/local.js` (not `#audit/*`). | Descriptor must support arbitrary module paths. |

## Tasks

#### [architecture] Task 1.1: Define audit descriptor interface

**Status:** todo

**Depends:** None

Define the `AuditDescriptor` interface that replaces the switch-case dispatch. Each descriptor maps a `kind` string to a module path + export name + run function. The interface must accommodate both sync and async `run`, and both the standard `{ok, checked, violations}` result shape and the custom shapes used by `hook-surface`, `no-relative-package-scripts`, `tph`, `tph-e2e`, and `bundle-budget`.

**Files:**

- Create: `src/audit/types.ts`

**Steps (TDD):**

1. Write failing test in `src/audit/types.test.ts` that imports the interface and verifies it accepts a minimal descriptor shape.
2. Run: `./bin/wp test --file src/audit/types.test.ts` — verify FAIL
3. Define and export in `src/audit/types.ts`:
   ```ts
   import type { AkAuditInput } from '#mcp/tools/audit.js'
   export interface AuditDescriptor<K extends string = string> {
     kind: K
     run(input: AkAuditInput): Promise<AuditPayload> | AuditPayload
   }
   export type { AuditPayload }
   ```
   (Re-export or import `AuditPayload` from `audit.ts` to avoid duplication; if circular-import risk, define a minimal local type.)
4. Run: `./bin/wp test --file src/audit/types.test.ts` — verify PASS
5. Run: `./bin/wp lint` and `./bin/wp typecheck`

**Acceptance:**

- [ ] `AuditDescriptor` interface is typed and exported from `src/audit/types.ts`.
- [ ] Interface accepts both sync and async `run` functions.
- [ ] `./bin/wp typecheck` passes.
- [ ] `./bin/wp lint` passes.

---

#### [audit] Task 1.2: Convert standard-pattern cases batch A

**Status:** todo

**Depends:** Task 1.1

Convert the 14 standard-pattern switch cases that each import from their own `#audit/<name>` module and use `summarizeRepoAudit`. Each audit module (`src/audit/<name>.ts`) gets an exported `AuditDescriptor`. The cases are: `package-surface`, `reference-parity-matrix`, `agents`, `blueprint-readme-drift`, `blueprint-lifecycle`, `architecture-drift`, `cloudflare-deploy-contract`, `absolute-path-policy`, `no-first-party-mjs`, `roadmap-links`, `tech-debt`, `ai-contracts`, `toolchain-isolation`, `session-memory-hardcut`.

**Files:**

- Modify: `src/audit/package-surface.ts`
- Modify: `src/audit/reference-parity-matrix.ts`
- Modify: `src/audit/agents.ts`
- Modify: `src/audit/blueprint-readme-drift.ts`
- Modify: `src/audit/blueprint-lifecycle-sql.ts`
- Modify: `src/audit/architecture-drift.ts`
- Modify: `src/audit/cloudflare-deploy-contract.ts`
- Modify: `src/audit/absolute-path-policy.ts`
- Modify: `src/audit/no-first-party-mjs.ts`
- Modify: `src/audit/roadmap-links.ts`
- Modify: `src/audit/tech-debt.ts`
- Modify: `src/audit/ai-contracts.ts`
- Modify: `src/audit/toolchain-isolation.ts`
- Modify: `src/audit/session-memory-hardcut.ts`

**Steps (TDD):**

1. Write a test in `src/audit/descriptors-batch-a.test.ts` that imports all 14 descriptors and verifies each has a unique `kind`, a `run` function, and the `kind` matches the AUDIT_KINDS list.
2. Run: `./bin/wp test --file src/audit/descriptors-batch-a.test.ts` — verify FAIL
3. For each module, add an exported descriptor:
   ```ts
   import type { AuditDescriptor } from '#audit/types.js'
   import type { AkAuditInput } from '#mcp/tools/audit.js'
   export const packageSurfaceDescriptor: AuditDescriptor<'package-surface'> = {
     kind: 'package-surface',
     run(input: AkAuditInput) {
       const result = auditPackageSurface(input.cwd ?? input.directory ?? process.cwd())
       return {
         passed: result.ok,
         summary: `${result.ok ? 'package-surface audit passed' : `package-surface audit failed with ${result.violations?.length ?? 0} violation${(result.violations?.length ?? 0) === 1 ? '' : 's'}`}`,
         kind: 'package-surface',
         details: result,
       }
     },
   }
   ```
4. Run: `./bin/wp test --file src/audit/descriptors-batch-a.test.ts` — verify PASS
5. Run: `./bin/wp lint` and `./bin/wp typecheck`

**Acceptance:**

- [ ] All 14 audit modules export a typed `AuditDescriptor`.
- [ ] Each descriptor's `kind` matches the corresponding AUDIT_KINDS entry.
- [ ] `./bin/wp test --file src/audit/descriptors-batch-a.test.ts` passes.
- [ ] `./bin/wp lint` passes.
- [ ] `./bin/wp typecheck` passes.

---

#### [audit] Task 1.3: Convert multi-export and remaining standard cases batch B

**Status:** todo

**Depends:** Task 1.1

Convert the 9 remaining standard-pattern cases. Four come from the multi-export module `#audit/repo-guardrails` (`catalog-drift`, `docs-frontmatter`, `commit-message`, `no-relative-package-scripts`). Five are standalone standard cases (`open-source-licenses`, `secrets-policy`, `no-dev-vars`, `secret-provider-quarantine`, `secrets-config`). The `commit-message` case additionally validates `input.messageFile`.

**Files:**

- Modify: `src/audit/repo-guardrails.ts`
- Modify: `src/audit/open-source-licenses.ts`
- Modify: `src/audit/secrets-policy.ts`
- Modify: `src/audit/no-dev-vars.ts`
- Modify: `src/audit/secret-provider-quarantine.ts`
- Modify: `src/audit/secrets-config.ts`

**Steps (TDD):**

1. Write a test in `src/audit/descriptors-batch-b.test.ts` that imports all 9 descriptors and verifies unique `kind`, presence of `run`, and AUDIT_KINDS membership.
2. Run: `./bin/wp test --file src/audit/descriptors-batch-b.test.ts` — verify FAIL
3. Add exported descriptors to each module. For the four `repo-guardrails` exports, ensure each descriptor references the correct function (`auditCatalogDrift`, `auditDocsFrontmatter`, `auditCommitMessageFile`, `auditNoRelativePackageScripts`). For `commit-message`, include the `messageFile` guard in the descriptor's `run`.
4. Run: `./bin/wp test --file src/audit/descriptors-batch-b.test.ts` — verify PASS
5. Run: `./bin/wp lint` and `./bin/wp typecheck`

**Acceptance:**

- [ ] All 9 descriptors exported from their respective modules.
- [ ] `repo-guardrails.ts` exports four descriptors with distinct kinds.
- [ ] `commit-message` descriptor validates `messageFile` input.
- [ ] `./bin/wp test --file src/audit/descriptors-batch-b.test.ts` passes.
- [ ] `./bin/wp lint` passes.
- [ ] `./bin/wp typecheck` passes.

---

#### [audit] Task 1.4: Convert special-pattern cases

**Status:** todo

**Depends:** Task 1.1

Convert the 4 cases that use non-standard result shapes or import paths: `hook-surface` (custom `passed`/`details.violations` mapping), `tph` and `tph-e2e` (custom violation format from runner), and `bundle-budget` (imports from `../../vite/local.js` instead of `#audit/*`, uses `summarizeExitCode`).

**Files:**

- Modify: `src/audit/hook-surface.ts`
- Modify: `src/audit/audit-tph-runner.ts`
- Modify: `src/audit/audit-tph-e2e-runner.ts`
- Modify: `src/audit/bundle-budget.ts` (or `src/vite/local.ts` — check which is the canonical home for the `runBundleBudgetCli` function)

**Steps (TDD):**

1. Write a test in `src/audit/descriptors-special.test.ts` that imports all 4 descriptors and verifies `kind` uniqueness, `run` presence, and AUDIT_KINDS membership.
2. Run: `./bin/wp test --file src/audit/descriptors-special.test.ts` — verify FAIL
3. Add exported descriptors. For `hook-surface`, inline the custom `passed`/`details.violations` mapping. For `tph`/`tph-e2e`, inline the violation-formatting logic. For `bundle-budget`, reference the correct import path (`../../vite/local.js`).
4. Run: `./bin/wp test --file src/audit/descriptors-special.test.ts` — verify PASS
5. Run: `./bin/wp lint` and `./bin/wp typecheck`

**Acceptance:**

- [ ] All 4 special-pattern descriptors exported.
- [ ] `bundle-budget` descriptor correctly imports from `../../vite/local.js`.
- [ ] `hook-surface` descriptor preserves the custom `passed`/`violations` shape.
- [ ] `./bin/wp test --file src/audit/descriptors-special.test.ts` passes.
- [ ] `./bin/wp lint` passes.
- [ ] `./bin/wp typecheck` passes.

---

#### [mcp] Task 1.5: Build registry and replace switch dispatch

**Status:** todo

**Depends:** Task 1.2, Task 1.3, Task 1.4

Create `src/audit/registry.ts` that aggregates all 27 descriptors into a `Map<AuditKind, AuditDescriptor>`. Replace the `switch(kind)` body in `src/mcp/tools/audit.ts:92-411` with a registry lookup. Remove the now-unused `summarizeRepoAudit`, `summarizeExitCode`, and helper functions if no longer referenced.

**Files:**

- Create: `src/audit/registry.ts`
- Create: `src/audit/registry.test.ts`
- Modify: `src/mcp/tools/audit.ts`

**Steps (TDD):**

1. Write `src/audit/registry.test.ts`:
   - Test that the registry has exactly 27 entries.
   - Test that every `AUDIT_KINDS` kind is registered (run `AUDIT_KINDS.filter(k => !registry.has(k))` — should be empty).
   - Test that every registry entry has a unique `kind`.
   - Test that the registry has no extra entries beyond AUDIT_KINDS.
2. Run: `./bin/wp test --file src/audit/registry.test.ts` — verify FAIL
3. Create `src/audit/registry.ts`:
   ```ts
   import { AUDIT_KINDS, type AuditKind } from '#mcp/tools/_shared/audit-kinds.js'
   import type { AuditDescriptor } from '#audit/types.js'
   // import all descriptors from tasks 1.2-1.4
   const descriptors: AuditDescriptor[] = [/* all 27 */]
   export const auditRegistry = new Map<AuditKind, AuditDescriptor>(
     descriptors.map(d => [d.kind as AuditKind, d])
   )
   ```
4. Run: `./bin/wp test --file src/audit/registry.test.ts` — verify PASS
5. In `src/mcp/tools/audit.ts`, replace the `switch(kind)` body (lines 92-411) with:
   ```ts
   const descriptor = auditRegistry.get(kind as AuditKind)
   if (!descriptor) {
     return { passed: false, summary: `Unknown audit kind: ${kind}`, kind, details: `No descriptor registered for "${kind}".` }
   }
   return descriptor.run(input)
   ```
   Keep `summarizeRepoAudit` and `summarizeExitCode` only if descriptors reference them (prefer inlining into descriptors).
6. Run: `./bin/wp test --file src/mcp/tools/audit.test.ts` — verify PASS
7. Run: `./bin/wp lint` and `./bin/wp typecheck`

**Acceptance:**

- [ ] `src/mcp/tools/audit.ts` contains no `switch(kind)` statement.
- [ ] `dispatch` function is < 20 lines.
- [ ] `./bin/wp test --file src/audit/registry.test.ts` passes all 4 assertions.
- [ ] `./bin/wp test --file src/mcp/tools/audit.test.ts` passes.
- [ ] `./bin/wp typecheck` — zero errors.
- [ ] `./bin/wp lint` — zero violations.

---

#### [qa] Task 1.6: Integration verification

**Status:** todo

**Depends:** Task 1.5

Smoke-test that all 27 audit kinds still work end-to-end after the switch removal. Spot-check a sample of audit kinds and verify output shape matches the pre-refactor output.

**Files:**

- None (verification only)

**Steps (TDD):**

1. Run a sample of audits and verify they pass/fail as expected:
   ```bash
   ./bin/wp audit package-surface
   ./bin/wp audit tech-debt
   ./bin/wp audit secrets-policy
   ./bin/wp audit hook-surface
   ./bin/wp audit tph
   ```
2. Verify each returns a `{passed, kind, details}` structured result.
3. If any existing test exercises audit dispatch, run full test suite:
   ```bash
   ./bin/wp test
   ```

**Acceptance:**

- [ ] All sampled audit kinds return structured `{passed, kind, details}` results.
- [ ] Full test suite passes (`./bin/wp test`).
- [ ] No regression: audit output shape matches pre-refactor shape.

---

## Edge Cases

| ID | Edge Case | Severity | Mitigation |
| -- | --------- | -------- | ---------- |
| E1 | Registry drift: a new kind added to AUDIT_KINDS but no descriptor registered. | HIGH | `registry.test.ts` asserts `AUDIT_KINDS.filter(k => !registry.has(k))` is empty. |
| E2 | Extra descriptors: a descriptor exists for a kind NOT in AUDIT_KINDS. | MEDIUM | `registry.test.ts` asserts `registry.size === AUDIT_KINDS.length`. |
| E3 | Duplicate descriptors: two descriptors claim the same `kind`. | HIGH | `Map` constructor rejects duplicates (last wins). Test verifies `registry.size` matches `descriptors` array length after dedup. |
| E4 | Circular imports: registry imports descriptors which import from registry. | HIGH | Registry is a leaf module that only imports `AuditDescriptor` type (from `types.ts`) and descriptors (from audit modules). Audit modules import only the type from `types.ts`. No audit module imports `registry.ts`. |
| E5 | `bundle-budget` imports from `../../vite/local.js` — a relative path outside `#audit/*`. | MEDIUM | Descriptor interface accepts arbitrary module paths; the descriptor's `run` function handles the import. The registry only references the descriptor object, not the module path. |
| E6 | Async audits (`blueprint-lifecycle`, `cloudflare-deploy-contract`, `tph`, `tph-e2e`) must not break. | HIGH | `AuditDescriptor.run` returns `Promise<AuditPayload> | AuditPayload`. Registry dispatch `await`s the result. Test coverage for async descriptors. |

## Risks

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Registry size grows unbounded as ~50 audit modules exist but only 27 are wired. | Low | Low | This blueprint does not add kinds (non-goal). Registry test asserts exact size = AUDIT_KINDS.length. Future blueprint can add unwired modules separately. |
| Descriptors duplicate summary-formatting logic from `summarizeRepoAudit`. | Medium | Low | Acceptable: each descriptor owns its summary. If duplication crosses 3+ instances, extract a shared helper in `types.ts`. DRY gate: wait for third concrete use. |
| Removing the switch removes the `never` exhaustiveness check on `kind`. | Low | Low | The `AuditKind` type from AUDIT_KINDS provides compile-time exhaustiveness. The registry test provides runtime exhaustiveness. |

## Non-goals

- Changing audit result shapes.
- Moving audit implementations out of their current files.
- Adding new audit kinds.
- Wiring the ~23 unwired audit modules (separate blueprint).

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Descriptor tests (all batches) | `./bin/wp test --file src/audit/descriptors-batch-a.test.ts --file src/audit/descriptors-batch-b.test.ts --file src/audit/descriptors-special.test.ts` | All pass. |
| Registry tests | `./bin/wp test --file src/audit/registry.test.ts` | All 4 assertions pass. |
| MCP tool tests | `./bin/wp test --file src/mcp/tools/audit.test.ts` | Pass. |
| Smoke-test audits | `./bin/wp audit package-surface && ./bin/wp audit tech-debt && ./bin/wp audit secrets-policy && ./bin/wp audit hook-surface` | All return structured results. |
| Type safety | `./bin/wp typecheck` | Zero errors. |
| Lint | `./bin/wp lint` | Zero violations. |
| Full test suite | `./bin/wp test` | All tests pass. |

---

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| ---- | ----- | ------------ | -------------- | ---------------- |
| **Wave 0** | 1.1 | None | 1 agent | XS |
| **Wave 1** | 1.2, 1.3, 1.4 | Wave 0 (1.1) | 3 agents | M / M / S |
| **Wave 2** | 1.5 | Wave 1 (1.2, 1.3, 1.4) | 1 agent | M |
| **Wave 3** | 1.6 | Wave 2 (1.5) | 1 agent | XS |
| **Critical path** | 1.1 → 1.2 → 1.5 → 1.6 | — | 4 waves | — |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ 3 | 1 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 1.5 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 0.83 |
| CP | same-file overlaps per wave | 0 | 0 |

**Parallelization Score: C** — CPR below target because this is a sequential refactoring (interface → descriptors → registry → switch removal → verify). The critical path is inherently 4 waves long. Waves 1 and 2 yield parallel benefit (3 agents in Wave 1 converting descriptors in parallel). No file conflicts (CP = 0).

---

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 6 |
| Critical | 0 |
| High | 2 |
| Medium | 2 |
| Low | 2 |
| Fixes applied | 6/6 |
| Cross-plans updated | 0 (no downstream deps) |
| Edge cases documented | 6 |
| Risks documented | 3 |
| **Parallelization score** | C (CPR 1.5, Wave 1 has 3 agents) |
| **Critical path** | 4 waves |
| **Max parallel agents** | 3 (Wave 1) |
| **Total tasks** | 6 |
| **Blueprint compliant** | 6/6 |

### Key refinements applied

- **F3 (file count):** Corrected claim from ~49 to 103 total `.ts` files (~50 source modules). Noted that 23+ audit modules are unwired — surfaced as a risk, not a task in this blueprint.
- **F5 (summary patterns):** Identified 5 of 27 cases use non-standard shapes. Split into separate task (1.4) to avoid blocking standard-pattern batches.
- **F6 (import path):** Documented `bundle-budget`'s `../../vite/local.js` import; descriptor interface supports arbitrary paths.
- **Task granularity:** Original 3 tasks expanded to 6 with explicit lane prefixes, TDD steps, and acceptance criteria.
- **Engineering principles:** DRY applied to the 27x duplicated switch boilerplate. Registry interface kept minimal (YAGNI — no plugin system, no dynamic discovery). Descriptors co-located with audit logic (KISS).
