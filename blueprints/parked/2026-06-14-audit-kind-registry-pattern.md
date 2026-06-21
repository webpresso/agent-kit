---
type: blueprint
title: Audit kind registry pattern
owner: ozby
status: parked
complexity: M
created: '2026-06-14'
last_updated: '2026-06-21'
progress: '0% (0/6 tasks done, 0 blocked, updated 2026-06-21)'
parked_reason: >-
  Refresh needed before execution: current audit kind inventory and MCP audit switch count
  drifted; duplicate github-actions-secrets entry should be reconciled first.
refined: true
depends_on: []
cross_repo_depends_on: []
tags:
  - architecture
  - ocp
  - dry
  - audit
  - mcp
---

# Audit kind registry pattern

**Goal:** Replace the 27-case `switch(kind)` in `src/mcp/tools/audit.ts:92-418` with a lazy registry so new audit kinds are added without modifying dispatch.

## Product wedge anchor

- **Stage outcome:** webpresso audit-family extensibility (CLAUDE.md § agent-kit audit family: `wp audit tech-debt | architecture-drift | bucket-boundary | …`). The next audit kind on the roadmap — `bucket-boundary` (Phase 3 of the platform-tenant-split roadmap, named in `UBIQUITOUS_LANGUAGE.md`) — must be wired into the `wp audit <kind>` / `wp_audit` dispatch, and today that requires hand-editing the 27-case switch and its `never`-exhaustiveness tail.
- **Consuming surface:** the `wp audit <kind>` CLI verb and the `wp_audit` MCP tool (`src/mcp/tools/audit.ts`), which both route through the dispatch this blueprint replaces.
- **New user-visible capability:** a contributor adding `wp audit bucket-boundary` registers one descriptor in its own audit module and the `wp audit` / `wp_audit` surface picks it up — no dispatch edit, and `registry.test.ts` fails closed if a declared `AUDIT_KINDS` entry has no descriptor (catching the "added the kind, forgot to wire it" gap that the current switch hides).

> **Scoping note (blueprint-scoping rule):** this anchor names a concrete near-term audit kind (`bucket-boundary`) that the switch currently blocks. The refactor is in-scope only because that consumer pull exists; it does **not** wire `bucket-boundary` itself (non-goal) — it removes the dispatch friction that addition would otherwise incur.

## Technology Choices

| Choice | Rationale |
| ------ | --------- |
| Interface-based registry of lazy thunks | Leverages existing TS patterns; no new deps. Each registry value is `() => Promise<AuditDescriptor>` so the module load stays deferred. |
| Lazy `await import()` inside each registry thunk | Preserves current per-case lazy-loading — only the invoked audit module (and its transitive deps) loads. A static `descriptors[]` array would eagerly import all 27 modules at MCP-tool surface load; the thunk map avoids that. |
| Descriptors exported from existing audit modules | Avoids creating a new `descriptors/` directory; keeps audit shape co-located with audit logic (KISS). |
| `#audit/*` path alias | Already mapped in tsconfig to `./src/audit/*.ts`. |

## Fact-Check Findings

| ID | Severity | Claim | Verified Reality | Fix Applied |
| -- | -------- | ----- | ---------------- | ----------- |
| F1 | HIGH | `audit.ts` has a 27-case switch. | Confirmed: 27 `case` statements in the `switch(kind)` body (`src/mcp/tools/audit.ts:92-418`; file is 471 lines). | — |
| F2 | HIGH | Adding a new audit requires editing dispatch. | Confirmed: each case hardcodes the import and invocation in `audit.ts`. | Tasks 1.2–1.5 remove this coupling. |
| F3 | MEDIUM | ~49 audit source files. | **Corrected:** there are 103 `.ts` files in `src/audit/` (mix of source + test). ~50 non-test source modules. Many modules are not yet wired to the switch (only 27 of 50+ have cases). Registry enumeration will surface unwired modules. | File count corrected in blueprint. |
| F4 | MEDIUM | Test command uses `./bin/wp test --file`. | Confirmed: `bin/wp` is a `/usr/bin/env node` script wrapping the repo toolchain. `./bin/wp typecheck` and `./bin/wp lint` also available. | Verification gates updated. |
| F5 | HIGH | "22 cases use `summarizeRepoAudit`; 5 custom: `hook-surface`, `no-relative-package-scripts`, `tph`, `tph-e2e`, `bundle-budget`." | **Corrected:** **25 cases call `summarizeRepoAudit`**. `tph` (`audit.ts:209-210`) and `tph-e2e` (`audit.ts:224-225`) both `return summary: summarizeRepoAudit(kind, auditResult)` with the standard `{ok}` shape — they are **not** custom; they differ only by import source (the runner). Genuinely special = **exactly 3**: `bundle-budget` (`summarizeExitCode`, line 195), `hook-surface` (`passed: auditResult.passed`, line 286), `no-relative-package-scripts` (inline summary, lines 397-400). | F5 rewritten; `tph`/`tph-e2e` moved out of the special task into a standard batch (Task 1.3); special task (1.4) reduced to 3 cases. |
| F6 | LOW | All imports use `#audit/*`. | `bundle-budget` resolves through `../../vite/local.js` (canonical home `src/vite/local.ts`), not `#audit/*`. | Descriptor thunk must support arbitrary module paths. |

## Tasks

#### [architecture] Task 1.1: Define audit descriptor interface

**Status:** todo

**Depends:** None

Define the `AuditDescriptor` interface plus the **lazy-thunk** registry value type that replaces the switch-case dispatch. Each registry entry maps a `kind` string to a `() => Promise<AuditDescriptor>` thunk so the underlying audit module loads only when invoked (preserving current per-case `await import()` laziness). The descriptor's `run` must accommodate both sync and async results, and both the standard `{ok, checked, violations}` result shape and the 3 custom shapes used by `bundle-budget`, `hook-surface`, and `no-relative-package-scripts`.

**Files:**

- Create: `src/audit/types.ts`

**Steps (TDD):**

1. Write failing test in `src/audit/types.test.ts` that imports the interface and the thunk type and verifies it accepts a minimal descriptor shape and a `() => Promise<AuditDescriptor>` loader.
2. Run: `./bin/wp test --file src/audit/types.test.ts` — verify FAIL
3. Define and export in `src/audit/types.ts`:
   ```ts
   import type { AkAuditInput } from '#mcp/tools/audit.js'
   export interface AuditDescriptor<K extends string = string> {
     kind: K
     run(input: AkAuditInput): Promise<AuditPayload> | AuditPayload
   }
   export type AuditDescriptorLoader = () => Promise<AuditDescriptor>
   export type { AuditPayload }
   ```
   (Re-export or import `AuditPayload` from `audit.ts` to avoid duplication; if circular-import risk, define a minimal local type.)
4. Run: `./bin/wp test --file src/audit/types.test.ts` — verify PASS
5. Run: `./bin/wp lint` and `./bin/wp typecheck`

**Acceptance:**

- [ ] `AuditDescriptor` interface and `AuditDescriptorLoader` thunk type are typed and exported from `src/audit/types.ts`.
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

#### [audit] Task 1.3: Convert multi-export, runner-backed, and remaining standard cases batch B

**Status:** todo

**Depends:** Task 1.1

Convert the 11 remaining standard-pattern cases (all of which produce `summarizeRepoAudit({ok})` output and differ only by import source).

- **Four** come from the multi-export module `#audit/repo-guardrails` (`catalog-drift`, `docs-frontmatter`, `commit-message`, `no-relative-package-scripts` — note: `no-relative-package-scripts` is the one *special* member of this module and is handled in Task 1.4; the three standard members here are `catalog-drift`, `docs-frontmatter`, `commit-message`).
- **Two** are runner-backed standard cases: `tph` (`audit.ts:209-210`) and `tph-e2e` (`audit.ts:224-225`). Both return `summary: summarizeRepoAudit(kind, auditResult)` with the standard `{ok}` shape — they are **standard**, not special; they only differ by importing their result from the TPH runner (`#audit/audit-tph-runner` / `#audit/audit-tph-e2e-runner`) rather than a plain audit function. (Corrected per F5.)
- **Five** are standalone standard cases (`open-source-licenses`, `secrets-policy`, `no-dev-vars`, `secret-provider-quarantine`, `secrets-config`). The `commit-message` case additionally validates `input.messageFile`.

**Files:**

- Modify: `src/audit/repo-guardrails.ts` (descriptors for `catalog-drift`, `docs-frontmatter`, `commit-message`)
- Modify: `src/audit/audit-tph-runner.ts` (descriptor for `tph`)
- Modify: `src/audit/audit-tph-e2e-runner.ts` (descriptor for `tph-e2e`)
- Modify: `src/audit/open-source-licenses.ts`
- Modify: `src/audit/secrets-policy.ts`
- Modify: `src/audit/no-dev-vars.ts`
- Modify: `src/audit/secret-provider-quarantine.ts`
- Modify: `src/audit/secrets-config.ts`

**Steps (TDD):**

1. Write a test in `src/audit/descriptors-batch-b.test.ts` that imports all 11 descriptors and verifies unique `kind`, presence of `run`, and AUDIT_KINDS membership.
2. Run: `./bin/wp test --file src/audit/descriptors-batch-b.test.ts` — verify FAIL
3. Add exported descriptors to each module. For the three standard `repo-guardrails` exports, ensure each descriptor references the correct function (`auditCatalogDrift`, `auditDocsFrontmatter`, `auditCommitMessageFile`). For `commit-message`, include the `messageFile` guard in the descriptor's `run`. For `tph`/`tph-e2e`, the descriptor's `run` calls the runner and wraps the result with `summarizeRepoAudit(kind, auditResult)` — no special violation-formatting is needed (it is standard output).
4. Run: `./bin/wp test --file src/audit/descriptors-batch-b.test.ts` — verify PASS
5. Run: `./bin/wp lint` and `./bin/wp typecheck`

**Acceptance:**

- [ ] All 11 descriptors exported from their respective modules.
- [ ] `repo-guardrails.ts` exports three standard descriptors with distinct kinds (`catalog-drift`, `docs-frontmatter`, `commit-message`).
- [ ] `tph` / `tph-e2e` descriptors return `summarizeRepoAudit`-shaped output (standard, not custom).
- [ ] `commit-message` descriptor validates `messageFile` input.
- [ ] `./bin/wp test --file src/audit/descriptors-batch-b.test.ts` passes.
- [ ] `./bin/wp lint` passes.
- [ ] `./bin/wp typecheck` passes.

---

#### [audit] Task 1.4: Convert special-pattern cases

**Status:** todo

**Depends:** Task 1.1

Convert the **3** genuinely-special cases that use non-standard result shapes or import paths (corrected from 4 per F5 — `tph`/`tph-e2e` moved to Task 1.3 because they use standard `summarizeRepoAudit` output):

- `bundle-budget` — uses `summarizeExitCode` (`audit.ts:195`) and resolves through `../../vite/local.js` (canonical home `src/vite/local.ts`), not `#audit/*`.
- `hook-surface` — custom `passed: auditResult.passed` mapping (`audit.ts:286`).
- `no-relative-package-scripts` — inline summary string (`audit.ts:397-400`); lives in the `repo-guardrails` module.

**Files:**

- Modify: `src/vite/local.ts` (descriptor home for `bundle-budget`, where `runBundleBudgetCli` / the `summarizeExitCode` path lives)
- Modify: `src/audit/hook-surface.ts`
- Modify: `src/audit/repo-guardrails.ts` (descriptor for `no-relative-package-scripts`)

**Steps (TDD):**

1. Write a test in `src/audit/descriptors-special.test.ts` that imports all 3 descriptors and verifies `kind` uniqueness, `run` presence, and AUDIT_KINDS membership.
2. Run: `./bin/wp test --file src/audit/descriptors-special.test.ts` — verify FAIL
3. Add exported descriptors. For `bundle-budget`, inline the `summarizeExitCode` mapping and keep the descriptor co-located in `src/vite/local.ts`. For `hook-surface`, inline the custom `passed`/`details.violations` mapping. For `no-relative-package-scripts`, inline the custom summary string from `audit.ts:397-400`.
4. Run: `./bin/wp test --file src/audit/descriptors-special.test.ts` — verify PASS
5. Run: `./bin/wp lint` and `./bin/wp typecheck`

**Acceptance:**

- [ ] All 3 special-pattern descriptors exported.
- [ ] `bundle-budget` descriptor lives in `src/vite/local.ts` and preserves the `summarizeExitCode` mapping.
- [ ] `hook-surface` descriptor preserves the custom `passed`/`violations` shape.
- [ ] `no-relative-package-scripts` descriptor preserves the inline summary.
- [ ] `./bin/wp test --file src/audit/descriptors-special.test.ts` passes.
- [ ] `./bin/wp lint` passes.
- [ ] `./bin/wp typecheck` passes.

---

#### [mcp] Task 1.5: Build lazy registry and replace switch dispatch

**Status:** todo

**Depends:** Task 1.2, Task 1.3, Task 1.4

Create `src/audit/registry.ts` that maps each of the 27 kinds to a **lazy thunk** `() => Promise<AuditDescriptor>` so only the invoked audit module loads (preserving the per-case `await import()` laziness — a static `descriptors[]` array would eagerly load all 27 modules at the MCP-tool surface). Replace the `switch(kind)` body in `src/mcp/tools/audit.ts:92-418` with a registry lookup + thunk resolution. Remove the now-unused `summarizeRepoAudit`/`summarizeExitCode` references from `audit.ts` only if no longer referenced there (they remain owned by the descriptors that inline them).

**Files:**

- Create: `src/audit/registry.ts`
- Create: `src/audit/registry.test.ts`
- Modify: `src/mcp/tools/audit.ts`

**Steps (TDD):**

1. Write `src/audit/registry.test.ts`:
   - Test that the registry has exactly 27 entries.
   - Test that every `AUDIT_KINDS` kind is registered (run `AUDIT_KINDS.filter(k => !registry.has(k))` — should be empty).
   - Test that every registry entry has a unique `kind` (resolve each thunk and assert `descriptor.kind` matches the map key).
   - Test that the registry has no extra entries beyond AUDIT_KINDS.
2. Run: `./bin/wp test --file src/audit/registry.test.ts` — verify FAIL
3. Create `src/audit/registry.ts` using lazy thunks (NOT a static descriptor array):
   ```ts
   import { AUDIT_KINDS, type AuditKind } from '#mcp/tools/_shared/audit-kinds.js'
   import type { AuditDescriptorLoader } from '#audit/types.js'
   // Each value defers the module load until the kind is dispatched.
   export const auditRegistry = new Map<AuditKind, AuditDescriptorLoader>([
     ['package-surface', async () => (await import('#audit/package-surface.js')).packageSurfaceDescriptor],
     ['bundle-budget', async () => (await import('../vite/local.js')).bundleBudgetDescriptor],
     // ...all 27, one lazy thunk each
   ])
   ```
4. Run: `./bin/wp test --file src/audit/registry.test.ts` — verify PASS
5. In `src/mcp/tools/audit.ts`, replace the `switch(kind)` body (lines 92-418) with:
   ```ts
   const load = auditRegistry.get(kind as AuditKind)
   if (!load) {
     return { passed: false, summary: `Unknown audit kind: ${kind}`, kind, details: `No descriptor registered for "${kind}".` }
   }
   const descriptor = await load()
   return descriptor.run(input)
   ```
   The thunk's `await import()` preserves the original per-case lazy load; only the dispatched module enters memory.
6. Run: `./bin/wp test --file src/mcp/tools/audit.test.ts` — verify PASS
7. Run: `./bin/wp lint` and `./bin/wp typecheck`

**Acceptance:**

- [ ] `src/mcp/tools/audit.ts` contains no `switch(kind)` statement.
- [ ] Registry values are lazy thunks (`() => Promise<AuditDescriptor>`); no static array of 27 eagerly-imported descriptors.
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
   ./bin/wp audit bundle-budget
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
| E1 | Registry drift: a new kind added to AUDIT_KINDS but no descriptor thunk registered. | HIGH | `registry.test.ts` asserts `AUDIT_KINDS.filter(k => !registry.has(k))` is empty. |
| E2 | Extra descriptors: a thunk exists for a kind NOT in AUDIT_KINDS. | MEDIUM | `registry.test.ts` asserts `registry.size === AUDIT_KINDS.length`. |
| E3 | Duplicate keys: two thunks claim the same `kind`. | HIGH | `Map` constructor rejects duplicates (last wins). Test resolves each thunk and verifies `descriptor.kind` matches the map key, and `registry.size === AUDIT_KINDS.length`. |
| E4 | Circular imports: registry imports descriptors which import from registry. | HIGH | Registry is a leaf module that only imports the `AuditDescriptorLoader` type (from `types.ts`) and references modules via lazy `await import()` inside thunks — it never statically imports a descriptor module, and no audit module imports `registry.ts`. Audit modules import only the type from `types.ts`. |
| E5 | `bundle-budget` resolves through `../vite/local.js` — a relative path outside `#audit/*`. | MEDIUM | The thunk performs `await import('../vite/local.js')`; the registry only holds the loader, not a static module reference. Descriptor co-located in `src/vite/local.ts`. |
| E6 | Async audits (`blueprint-lifecycle`, `cloudflare-deploy-contract`, `tph`, `tph-e2e`) must not break. | HIGH | `AuditDescriptor.run` returns `Promise<AuditPayload> | AuditPayload`; dispatch `await`s `load()` then `await`s `run()`. Test coverage for async descriptors. |

## Risks

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Registry size grows unbounded as ~50 audit modules exist but only 27 are wired. | Low | Low | This blueprint does not add kinds (non-goal). Registry test asserts exact size = AUDIT_KINDS.length. Future blueprint can add unwired modules separately. |
| Descriptors duplicate summary-formatting logic from `summarizeRepoAudit`. | Medium | Low | Acceptable: each descriptor owns its summary, but the 25 standard descriptors call the shared `summarizeRepoAudit` helper (not reinvented) — only the 3 special descriptors inline custom logic. DRY gate already satisfied by reusing the existing helper. |
| Removing the switch removes the `never` exhaustiveness check on `kind`. | Low | Low | The `AuditKind` type from AUDIT_KINDS provides compile-time exhaustiveness. The registry test provides runtime exhaustiveness. |

## Non-goals

- Changing audit result shapes.
- Moving audit implementations out of their current files.
- Adding new audit kinds (including `bucket-boundary` — the wedge anchor names it as the *consumer pull* that motivates this refactor, but wiring it is a separate blueprint).
- Wiring the ~23 unwired audit modules (separate blueprint).

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Descriptor tests (all batches) | `./bin/wp test --file src/audit/descriptors-batch-a.test.ts --file src/audit/descriptors-batch-b.test.ts --file src/audit/descriptors-special.test.ts` | All pass. |
| Registry tests | `./bin/wp test --file src/audit/registry.test.ts` | All 4 assertions pass. |
| MCP tool tests | `./bin/wp test --file src/mcp/tools/audit.test.ts` | Pass. |
| Smoke-test audits | `./bin/wp audit package-surface && ./bin/wp audit tech-debt && ./bin/wp audit secrets-policy && ./bin/wp audit hook-surface && ./bin/wp audit bundle-budget` | All return structured results. |
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

> **Wave 1 file-conflict note:** Task 1.3 and Task 1.4 both modify `src/audit/repo-guardrails.ts` (Task 1.3 adds the three standard descriptors; Task 1.4 adds the `no-relative-package-scripts` descriptor). If run by separate agents, serialize the `repo-guardrails.ts` edits or assign both repo-guardrails descriptors to one agent. All other Wave 1 files are disjoint.

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ 3 | 1 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 1.5 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 0.83 |
| CP | same-file overlaps per wave | 0 | 1 (`repo-guardrails.ts` in Wave 1; serialize per note above) |

**Parallelization Score: C** — CPR below target because this is a sequential refactoring (interface → descriptors → registry → switch removal → verify). The critical path is inherently 4 waves long. Wave 1 yields parallel benefit (3 agents converting descriptors), with one same-file overlap (`repo-guardrails.ts`) that must be serialized.

---

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 6 |
| Critical | 0 |
| High | 3 |
| Medium | 2 |
| Low | 1 |
| Fixes applied | 6/6 |
| Cross-plans updated | 0 (no downstream deps) |
| Edge cases documented | 6 |
| Risks documented | 3 |
| **Parallelization score** | C (CPR 1.5, Wave 1 has 3 agents, 1 serialized overlap) |
| **Critical path** | 4 waves |
| **Max parallel agents** | 3 (Wave 1) |
| **Total tasks** | 6 |
| **Blueprint compliant** | 6/6 |

### Key refinements applied

- **Product wedge anchor (alignment, HIGH):** Added a `## Product wedge anchor` section naming `bucket-boundary` (platform-tenant-split Phase 3, per `UBIQUITOUS_LANGUAGE.md`) as the concrete near-term audit kind blocked by the switch, with the `wp audit <kind>` / `wp_audit` surface as the consumer. Satisfies the `blueprint-scoping` rule's product-wedge requirement for an OCP refactor that otherwise had no consumer pull.
- **F5 (special-case taxonomy, HIGH):** Corrected from "22 standard / 5 special" to **25 standard / 3 special**. `tph` and `tph-e2e` use `summarizeRepoAudit` (standard output, differ only by runner import) and moved from Task 1.4 into the standard Task 1.3. The genuinely special set is `bundle-budget`, `hook-surface`, `no-relative-package-scripts`. Task 1.4 reduced from 4 to 3 cases.
- **Lazy-loading contradiction (elegance, HIGH):** Resolved the mutual exclusivity between "preserves lazy loading" and "static `descriptors[]` aggregation." The registry now maps to lazy thunks `() => Promise<AuditDescriptor>` (Task 1.1 adds `AuditDescriptorLoader`; Task 1.5 builds the thunk map), keeping `await import()` inside each thunk so only the dispatched module loads.
- **Stale line range:** Corrected `92-411` → `92-418` (file is 471 lines) in the goal, Task 1.5, and F1.
- **Nonexistent file target (per topFix):** Dropped `src/audit/bundle-budget.ts`; named `src/vite/local.ts` as the `bundle-budget` descriptor home in Task 1.4 and the registry thunk.
- **F3 (file count):** Corrected claim from ~49 to 103 total `.ts` files (~50 source modules). 23+ audit modules are unwired — surfaced as a risk, not a task in this blueprint.
- **DRY note:** Clarified that the 25 standard descriptors reuse the existing `summarizeRepoAudit` helper rather than reinventing summary formatting; only the 3 special descriptors inline custom logic.
- **Engineering principles:** DRY applied to the 27x duplicated switch boilerplate. Registry interface kept minimal (YAGNI — no plugin system, no dynamic discovery). Descriptors co-located with audit logic (KISS).
