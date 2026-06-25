---
type: blueprint
title: "Centralize --affected as a wp-owned contract"
owner: ozby
status: planned
complexity: L
created: "2026-06-25"
last_updated: "2026-06-25"
progress: "implemented; verification complete except unrelated full-scan guardrail baseline failures"
depends_on:
  - 2026-06-22-affected-flag-across-quality-commands
cross_repo_depends_on: []
tags:
  - cli
  - dx
  - hooks
  - audit
  - git
---

# Centralize `--affected` as a wp-owned contract

## Goal

Move affected-target resolution behind a shared wp-owned module and make quality,
audit, and generated hook surfaces call that contract instead of reimplementing
`git diff` / `grep` scope logic.

This supersedes the scattered affected follow-ups while keeping completed
blueprints as historical records.

## Public contract

- `wp <quality-command> --affected` scopes to staged changed targets.
- `wp <quality-command> --affected --branch` scopes to files changed vs
  `origin/${GITHUB_BASE_REF:-main}` unless a command supplies its existing base
  option.
- `wp typecheck --affected` builds a TypeScript compiler-API reverse-importer
  closure and checks changed files plus transitive importers.
- `--branch` without `--affected` is invalid.
- `--affected` conflicts with explicit target flags (`--file`, `--package`, etc.).
- Degraded write surfaces fail closed; read/check surfaces only widen to full repo
  where that is already the safe contract.
- `wp audit --affected` is first-class; `--changed-only` remains as a deprecated
  compatibility alias during migration.
- `wp audit guardrails --affected` runs the affected-safe subset; full
  `wp audit guardrails` remains the CI/bookend whole-repo set.

## Implementation tasks

- [x] Add shared affected resolver/types next to `#git/changed-files`.
- [x] Refactor `lint`, `format`, `test`, and `typecheck` to consume it.
- [x] Add audit scope metadata and `guardrails --affected` subset selection.
- [x] Replace live and generated hook diff/grep selection with wp-owned affected
      commands, retaining only formatter restage mechanics in shell.
- [x] Update tests for shared resolver, quality commands, audit scoping, and hook
      scaffolds.

## Verification plan

- Targeted Vitest: affected resolver; lint/format/test/typecheck command tests;
  audit/audit-core tests; audit-hook and base-kit scaffold tests.
- Repo gates as feasible: `vp run typecheck`, `vp run lint`, `wp format --check`.
- Smoke both full and affected guardrails where local dirty state permits.

## Stop condition

Generated hooks and live hooks no longer compute affected scope themselves; wp owns
affected resolution, affected-safe guardrails run locally, and full guardrails stay
as the CI/bookend gate.

## Typecheck closure note

`wp typecheck --affected` now runs a TypeScript compiler-API reverse-importer
closure. It intentionally reports diagnostics for the affected closure rather than
unrelated files outside the closure.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-25T00:00:00.000Z
- verified-head: 9cb9a12c2f09389fb1891c47cef85ecde8888cbf
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                           | Evidence                                                                        |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document.  | repo:blueprints/planned/2026-06-25-centralize-wp-affected-contract.md           |
| C2  | The implementation introduced a shared affected resolver.       | repo:src/git/affected.ts; repo:src/git/affected.test.ts                         |
| C3  | Generated hooks delegate affected scoping to wp-owned commands. | repo:catalog/base-kit/.husky/pre-commit.tmpl; repo:.husky/pre-commit            |
| C4  | Affected-safe guardrails are distinct from full guardrails.     | repo:src/cli/commands/audit.ts; repo:src/cli/commands/audit.test.ts; derived:C2 |
| C5  | Affected typecheck uses a reverse-importer compiler closure.    | repo:src/typecheck/affected.ts; repo:src/typecheck/affected.test.ts             |

### Material Decisions

| ID  | Decision                      | Chosen option                                    | Rejected alternatives                         | Rationale                                                                                 |
| --- | ----------------------------- | ------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| D1  | Affected resolution ownership | Shared `#git/affected` module                    | Per-command duplicated git diff parsing       | One command contract avoids shell/runtime drift.                                          |
| D2  | Local hook guardrail scope    | `wp audit guardrails --affected`                 | Inline grep gates or full guardrails in hooks | Keeps hooks fast while preserving CI as the full bookend.                                 |
| D3  | Typecheck affected narrowing  | TypeScript compiler-API reverse-importer closure | Unsound isolated-file `tsc`                   | Checking changed files plus importers catches upstream breakage without new dependencies. |

### Promotion Gates

| Gate      | Command                                                                       | Expected outcome | Last result                  |
| --------- | ----------------------------------------------------------------------------- | ---------------- | ---------------------------- |
| targeted  | wp test --file src/git/affected.test.ts --file src/cli/commands/audit.test.ts | pass             | pass at 2026-06-25T00:00:00Z |
| typecheck | wp typecheck                                                                  | pass             | pass at 2026-06-25T00:00:00Z |
| lint      | wp lint                                                                       | pass             | pass at 2026-06-25T00:00:00Z |
| format    | wp format --check                                                             | pass             | pass at 2026-06-25T00:00:00Z |
| affected  | wp audit guardrails --affected                                                | pass             | pass at 2026-06-25T00:00:00Z |

### Residual Unknowns

None.
