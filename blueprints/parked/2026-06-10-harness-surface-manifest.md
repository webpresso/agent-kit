---
type: blueprint
title: "Harness-surface manifest with editable/locked declaration"
owner: ozby
status: parked
complexity: M
created: "2026-06-10"
last_updated: "2026-06-15"
progress: "Implemented in PR #139; parked for legal lifecycle transition from planned pending finalization"
parent_roadmap: 2026-06-10-self-improving-harness-roadmap
refined: true
tags:
  - agent-kit
  - harness
  - audit
---

# Harness-surface manifest with editable/locked declaration

## Implementation Update (2026-06-15)

Implemented in PR #139 on branch `work/ultragoal-9-blueprints-20260614221933`.
Task status and acceptance checkboxes below were reconciled from the landed code paths and focused verification evidence in this PR. The file is parked because CI enforces the legal first transition from `planned`; finalization can move parked/resumed work through the lifecycle after merge.

## Product wedge anchor

- **Stage outcome:** the "editable-surface declaration" gap in
  `docs/research/2026-06-10-harness-competitor-analysis.md` (compulsory
  capability rated ❌).
- **Consuming surface:** `wp audit harness-surfaces`, the `wp_audit` MCP enum,
  and the canonical manifest consumed by the weakness-mining and overlay
  blueprints.
- **New user-visible capability:** a maintainer can answer "what harness
  surfaces are editable, locked, kit-owned, or consumer-owned" from one
  validated file instead of reading guard, setup, and sync source.

## Planning Summary

Self-Harness starts from a declared editable surface. Agent-kit's boundary is
currently implicit across guard code, sync rules, and conventions. This
blueprint hardens the now-partial implementation of a machine-readable manifest
and drift audit.

Current repo state verified on 2026-06-14:

1. `catalog/agent/harness-surfaces.yaml`, `src/audit/harness-surfaces.ts`,
   `src/audit/harness-surfaces.test.ts`, and
   `src/audit/harness-surfaces.integration.test.ts` already exist.
2. `wp audit harness-surfaces` already passes through the CLI registry in
   `src/cli/commands/audit.ts`.
3. `wp_audit` does **not** yet expose `harness-surfaces`: the shared enum in
   `src/mcp/tools/_shared/audit-kinds.ts` omits it, and
   `src/mcp/tools/audit.ts` has no dispatch case.
4. The existing manifest schema uses `lifecycle: locked|governed|experimental`
   and `owner: agent-kit|oh-my-codex`-style strings, not the original
   `editable|locked` + `owner: kit|consumer` wording. This blueprint preserves
   the shipped shape and adds the missing fail-closed invariants rather than
   churn the schema names.
5. `package.json#files` publishes `catalog`, so manifest changes are public
   package surface changes and must keep private/runtime-only content out.

Locked surfaces stay hard-coded policy even if the manifest drifts:
pretool-guard and guard hooks, permission policies / deny wording, and secret
handling / `with-secrets` execution paths are never editable by an automated
harness path.

## Technology Choices

| Choice                                                        | Rationale                                                                                                                              |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| YAML manifest at `catalog/agent/harness-surfaces.yaml`        | Verified existing location and included in the package `files` surface; keeps the declaration beside other catalog-owned agent assets. |
| Zod schema + `yaml` parser in `src/audit/harness-surfaces.ts` | Already implemented; `yaml` is a direct dependency in `package.json`, so no new dependency is needed.                                  |
| `lifecycle: locked                                            | governed                                                                                                                               | experimental` | Matches current code and is expressive enough for "editable/locked" decisions: only `locked` is permanently off-limits; governed/experimental are auditable edit candidates. |
| Fail-closed required-id and locked-surface checks             | Prevents manifest omissions or lifecycle downgrades from silently opening security-sensitive surfaces.                                 |
| CLI + MCP parity for audit exposure                           | `wp audit` and `wp_audit` are both user-facing audit surfaces; CLI-only exposure is an incomplete implementation.                      |

## Fact-Check Findings

| ID  | Severity | Claim                                                                                                       | Verified Reality                                                                                                                                                                                                                 | Fix Applied                                                                                                                                                    |
| --- | -------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| F1  | HIGH     | This blueprint starts from no implementation.                                                               | The manifest, reader/audit module, unit test, integration test, and CLI registry entry already exist.                                                                                                                            | Tasks now harden/modify existing files instead of creating duplicate modules.                                                                                  |
| F2  | HIGH     | Adding the audit kind only requires `src/cli/commands/audit.ts` and `src/mcp/tools/_shared/audit-kinds.ts`. | CLI registration exists, but MCP dispatch also needs `src/mcp/tools/audit.ts` unless the audit-kind registry blueprint lands first.                                                                                              | Task 2.1 names both current dispatch surfaces and includes a registry-blueprint conditional.                                                                   |
| F3  | HIGH     | Existing audit detects declared/missing, undeclared/present, and locked-but-editable drift.                 | Current audit validates schema, duplicate ids, required ids, evidence existence, and repo-relative paths; it does not discover undeclared present surfaces or assert locked lifecycle for permanent ids.                         | Task 1.2 adds bounded drift discovery and locked-id invariants.                                                                                                |
| F4  | MEDIUM   | Manifest uses `editable                                                                                     | locked`and`owner: kit                                                                                                                                                                                                            | consumer`.                                                                                                                                                     | Current schema uses `lifecycle: locked | governed | experimental`and free-form owner strings such as`agent-kit`and`oh-my-codex`. | Plan preserves current schema and maps editable semantics to non-`locked` lifecycles. |
| F5  | MEDIUM   | `catalog/agent/hooks/codex` and `catalog/agent/hooks/claude` are known manifest paths.                      | Current `catalog/agent/` tree has `harness-gate`, rules, skills, commands, guides, agents, and workflows; no `hooks` directory exists. The current audit only requires evidence paths to exist, not every declared surface path. | Task 1.1 requires manifest path rows to distinguish concrete paths from projected/expected paths or remove stale non-existent entries.                         |
| F6  | MEDIUM   | Public package safety is irrelevant.                                                                        | `package.json#files` includes `catalog`, so manifest content ships publicly.                                                                                                                                                     | Verification includes `./bin/wp audit package-surface` and a tarball/public-surface review when manifest content changes.                                      |
| F7  | MEDIUM   | Downstream plans can consume the manifest immediately through `wp_audit`.                                   | `wp audit harness-surfaces` passes, but `wp_audit` cannot select `harness-surfaces` until the shared enum/dispatch is wired.                                                                                                     | Task 2.1 is a blocker for downstream MCP-based execution.                                                                                                      |
| F8  | LOW      | `wp audit docs-frontmatter` proves this plan.                                                               | Docs-frontmatter is not directly relevant to this manifest/audit change.                                                                                                                                                         | Verification narrowed to harness tests, harness audit, package-surface, typecheck, lint, and `wp sync --check` only if catalog projection changes are touched. |

## Quick Reference (Execution Waves)

| Wave              | Tasks           | Dependencies   | Parallelizable                 | Effort (T-shirt) |
| ----------------- | --------------- | -------------- | ------------------------------ | ---------------- |
| **Wave 0**        | 1.1             | None           | 1 agent                        | S                |
| **Wave 1**        | 1.2, 2.1        | Task 1.1       | 2 agents, no same-file overlap | S each           |
| **Wave 2**        | 3.1             | Tasks 1.2, 2.1 | 1 agent                        | XS               |
| **Critical path** | 1.1 → 1.2 → 3.1 | —              | 3 waves                        | M                |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning                  | Target               | Actual       |
| ------ | ---------------------------------- | -------------------- | ------------ |
| RW0    | Ready tasks in Wave 0              | ≥ planned agents / 2 | 1            |
| CPR    | total_tasks / critical_path_length | ≥ 2.5                | 4 / 3 = 1.33 |
| DD     | dependency_edges / total_tasks     | ≤ 2.0                | 4 / 4 = 1.0  |
| CP     | same-file overlaps per wave        | 0                    | 0            |

**Parallelization score:** C. This is intentionally narrow hardening work over a
small file cluster. Wave 1 can run two agents in parallel because audit logic
(`src/audit/harness-surfaces.ts`) and MCP exposure (`src/mcp/tools/*`) do not
touch the same files. Wider splitting would create artificial coordination
without useful speedup.

## Tasks

#### [manifest] Task 1.1: Normalize the existing manifest schema and canonical rows

**Status:** done

**Depends:** None

Harden the existing manifest declaration so it is truthful, public-safe, and
self-contained. Keep the current `version: 1` YAML shape and current
`lifecycle` vocabulary; do not rename the schema back to `editable|locked`.
For every row, decide whether each `paths` entry is an existing source/catalog
path or a projected/expected runtime path, and either make that explicit in the
schema or remove stale entries that the audit cannot validate honestly. Preserve
permanently locked rows for hook runtime, generated agent surfaces, permission
policy/deny behavior, and secret-gate behavior.

**Files:**

- Modify: `catalog/agent/harness-surfaces.yaml`
- Modify: `src/audit/harness-surfaces.ts`
- Modify: `src/audit/harness-surfaces.test.ts`

**Steps (TDD):**

1. Write failing tests in `src/audit/harness-surfaces.test.ts` for invalid
   lifecycle/owner/path-shape rows and for a manifest row that points at a
   stale concrete path.
2. Run: `./bin/wp test --file src/audit/harness-surfaces.test.ts` — verify FAIL
3. Update the schema and manifest rows minimally so concrete paths are
   validateable, projected paths are explicitly marked or excluded, and locked
   rows remain present.
4. Run: `./bin/wp test --file src/audit/harness-surfaces.test.ts` — verify PASS
5. Run: `./bin/wp audit harness-surfaces` — verify PASS
6. Run: `./bin/wp audit package-surface` — verify the public catalog surface has
   no private/runtime-only leaks.

**Acceptance:**

- [x] Manifest rows cover the current harness classes consumed by this roadmap.
- [x] Guard hooks, permission/deny policy, generated agent surfaces, and secret
      handling are represented as permanently locked or otherwise fail-closed.
- [x] Tests prove invalid manifest entries fail closed.
- [x] Public package surface checks pass after manifest content changes.

#### [audit] Task 1.2: Add drift discovery and locked-id invariants

**Status:** done

**Depends:** Task 1.1

Extend the existing audit beyond schema validation. It must catch declared but
missing concrete surfaces, present but undeclared harness roots, and lifecycle
downgrades for permanently locked ids. Keep discovery bounded and degradable:
use explicit small root lists rather than recursive whole-repo scans, and return
summary-first violations instead of retrying or raising broad timeouts.

**Files:**

- Modify: `src/audit/harness-surfaces.ts`
- Modify: `src/audit/harness-surfaces.test.ts`

**Steps (TDD):**

1. Write failing tests for: missing declared concrete path, undeclared present
   harness root, and `codex-hooks`/`claude-hooks`/generated surface rows marked
   non-locked.
2. Run: `./bin/wp test --file src/audit/harness-surfaces.test.ts` — verify FAIL
3. Implement minimal bounded checks with clear violation messages and no
   unbounded filesystem traversal.
4. Run: `./bin/wp test --file src/audit/harness-surfaces.test.ts` — verify PASS
5. Run: `./bin/wp audit harness-surfaces` — verify PASS on the real repo.
6. Run: `./bin/wp lint --file src/audit/harness-surfaces.ts --file src/audit/harness-surfaces.test.ts` and `./bin/wp typecheck`.

**Acceptance:**

- [x] Declared concrete paths that are missing produce actionable violations.
- [x] Known present harness roots omitted from the manifest produce violations.
- [x] Permanently locked ids cannot be marked governed/experimental without a
      failing audit.
- [x] Audit remains bounded; no global timeout/retry workaround is introduced.

#### [mcp] Task 2.1: Complete CLI/MCP exposure parity for `harness-surfaces`

**Status:** done

**Depends:** Task 1.1

Expose the audit through both first-class audit surfaces. The CLI registry entry
already exists in `src/cli/commands/audit.ts`; verify it rather than duplicating
it. MCP currently needs the shared enum plus dispatch coverage. If
`2026-06-14-audit-kind-registry-pattern` lands before this task starts, register
the harness audit through that new descriptor/registry instead of adding another
manual `switch` case.

**Files:**

- Modify: `src/mcp/tools/_shared/audit-kinds.ts`
- Modify: `src/mcp/tools/audit.ts` (only if the switch dispatcher still exists)
- Modify: `src/cli/commands/audit.ts` (only if CLI parity regressed)
- Modify: `src/audit/harness-surfaces.integration.test.ts`
- Modify: `src/mcp/tools/audit.test.ts` (or the nearest existing MCP audit-tool test)

**Steps (TDD):**

1. Write failing integration coverage proving `harness-surfaces` is accepted by
   the shared audit-kind enum and by `wp_audit` dispatch.
2. Run: `./bin/wp test --file src/audit/harness-surfaces.integration.test.ts` and
   the MCP audit-tool test file — verify FAIL for the missing MCP surface.
3. Add the narrow enum/dispatch registration, or the descriptor registration if
   the audit-kind registry blueprint has landed.
4. Run the same tests — verify PASS.
5. Run: `./bin/wp audit harness-surfaces` — verify CLI parity still PASS.
6. Run: `./bin/wp typecheck`.

**Acceptance:**

- [x] `wp audit harness-surfaces` remains registered and passes in the repo.
- [x] `wp_audit` accepts `kind: "harness-surfaces"` and returns the same
      RepoAuditResult-shaped details.
- [x] Shared audit-kind enum includes `harness-surfaces` or the replacement
      registry exposes equivalent validation.
- [x] Implementation path is compatible with the audit-kind registry blueprint
      if that refactor lands first.

#### [qa] Task 3.1: Final verification and downstream handoff note

**Status:** done

**Depends:** Task 1.2, Task 2.1

Run the narrow completion gates and record the downstream contract for
weakness-mining and overlay plans: manifest ids/lifecycle semantics are stable,
locked surfaces fail closed, and both CLI/MCP audit surfaces are available. This
is a verification/documentation task only; do not expand scope into generating
consumer manifests or overlay edits.

**Files:**

- Modify: `blueprints/planned/2026-06-10-harness-surface-manifest.md`

**Steps (TDD):**

1. Run: `./bin/wp test --file src/audit/harness-surfaces.test.ts` — verify PASS.
2. Run: `./bin/wp test --file src/audit/harness-surfaces.integration.test.ts` —
   verify PASS.
3. Run the MCP audit-tool test file touched in Task 2.1 — verify PASS.
4. Run: `./bin/wp audit harness-surfaces` and `./bin/wp audit package-surface` —
   verify PASS.
5. Run: `./bin/wp typecheck` and the narrow lint command for changed files.
6. Update this blueprint's progress/evidence note only after the gates pass.

**Acceptance:**

- [x] All harness-surface unit/integration/MCP tests pass.
- [x] `wp audit harness-surfaces` and package-surface checks pass.
- [x] Downstream plans can rely on the manifest vocabulary and CLI/MCP audit
      availability.
- [x] No source-generated agent surfaces are edited by hand.

## Edge Cases

| ID      | Severity | Edge case                                                                           | Required handling                                                                            |
| ------- | -------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| E1 (F3) | HIGH     | A permanently locked row is removed or marked non-locked.                           | Audit fails even if the rest of the manifest is valid.                                       |
| E2 (F3) | HIGH     | A harness root exists in the repo but no manifest row declares it.                  | Audit reports present-but-undeclared drift with bounded root checks.                         |
| E3 (F5) | MEDIUM   | Manifest lists projected/runtime paths that do not exist in the source tree.        | Schema/manifest distinguishes projected paths from concrete paths, or removes stale entries. |
| E4 (F6) | MEDIUM   | Public manifest accidentally includes private local paths or runtime state details. | `package-surface`/tarball review blocks the change.                                          |
| E5 (F7) | MEDIUM   | CLI audit works but MCP enum rejects the same kind.                                 | Task 2.1 requires parity tests for `wp_audit`.                                               |

## Risks

| Risk                                                                    | Severity | Mitigation                                                                                                                                |
| ----------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Manifest drift silently opens locked security-sensitive surfaces.       | HIGH     | Hard-code required locked ids in audit code and test lifecycle downgrades.                                                                |
| Manual MCP switch edits conflict with the audit-kind registry refactor. | HIGH     | Check whether `2026-06-14-audit-kind-registry-pattern` has landed before implementing Task 2.1; use descriptor registration if available. |
| Over-broad discovery scans slow or hang audit/MCP calls.                | HIGH     | Use a small explicit root list and summary-first violations; no timeout increase or retry loop.                                           |
| Public package leaks private/local paths through `catalog`.             | MEDIUM   | Run package-surface and review manifest content as publishable data.                                                                      |

## Key Decisions

| Decision                                        | Rationale                                                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Preserve current `lifecycle` schema vocabulary. | Avoids churn in already-landed code while still encoding locked versus editable/governed semantics. |
| Treat CLI-only registration as incomplete.      | Downstream agents commonly use `wp_audit`; parity is part of the user-visible audit surface.        |
| Keep drift discovery explicit and bounded.      | Aligns with repo policy that discovery paths degrade with warnings rather than hanging transports.  |
| Do not add an edit mechanism.                   | This blueprint declares and validates the boundary only.                                            |

## Verification Plan

- `./bin/wp test --file src/audit/harness-surfaces.test.ts`
- `./bin/wp test --file src/audit/harness-surfaces.integration.test.ts`
- MCP audit-tool test covering `wp_audit({ kind: "harness-surfaces" })`
- `./bin/wp audit harness-surfaces`
- `./bin/wp audit package-surface`
- `./bin/wp typecheck`
- Narrow lint for changed source/test files
- `./bin/wp sync --check` only if implementation touches catalog projection or generated-agent-surface inputs beyond the manifest file

## Non-goals

- No edit mechanism — this blueprint declares and validates the boundary only.
- No consumer-repo manifest generation yet.
- No relaxation of the permanently locked set.
- No broad audit-kind registry refactor; defer that to
  `2026-06-14-audit-kind-registry-pattern`.
- No source changes as part of this refinement pass.

## Cross-Plan References

| Reference                                                 | Relationship                                                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `2026-06-10-self-improving-harness-roadmap`               | Parent roadmap (Wave 1)                                                                                                  |
| `2026-06-10-weakness-mining-audit`                        | Downstream consumer; depends on stable manifest surface vocabulary and `wp_audit` exposure                               |
| `2026-06-10-per-model-harness-overlays`                   | Downstream consumer; overlay validation may reuse manifest ids/lifecycle semantics                                       |
| `2026-06-14-audit-kind-registry-pattern`                  | Potential conflict/dependency for Task 2.1; if landed first, use registry descriptor instead of manual MCP switch wiring |
| `docs/research/papers/2026-self-harness.md`               | Declared-editable-surfaces pattern source                                                                                |
| `docs/research/2026-06-10-harness-competitor-analysis.md` | Capability gap this blueprint closes                                                                                     |

## Refinement Summary

| Metric                     | Value                                             |
| -------------------------- | ------------------------------------------------- |
| Findings total             | 8                                                 |
| Critical                   | 0                                                 |
| High                       | 3                                                 |
| Medium                     | 4                                                 |
| Low                        | 1                                                 |
| Fixes applied to blueprint | 8/8                                               |
| Cross-plans updated        | 0 (assigned blueprint only; conflicts noted here) |
| Edge cases documented      | 5                                                 |
| Risks documented           | 4                                                 |
| **Parallelization score**  | C (small file cluster; 2-agent Wave 1)            |
| **Critical path**          | 3 waves                                           |
| **Max parallel agents**    | 2                                                 |
| **Total tasks**            | 4                                                 |
| **Blueprint compliant**    | 4/4                                               |
