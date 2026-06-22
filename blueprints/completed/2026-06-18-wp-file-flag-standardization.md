---
type: blueprint
title: "wp file-flag standardization"
owner: codex
status: completed
complexity: S
created: '2026-06-18'
last_updated: '2026-06-18'
progress: '100% (CLI surfaces, scaffolds, and active docs standardized and verified)'
depends_on: []
cross_repo_depends_on: []
tags:
  - cli
  - docs
  - lint
  - format
  - test
  - e2e
---

# wp file-flag standardization

## Summary

Removed legacy positional path usage from the `wp` CLI surfaces that should use
explicit `--file` flags, and updated active docs/scaffolds to match the
standardized contract.

## Tasks

#### [cli] Task 1.1: Standardize explicit `--file` command surfaces

**Status:** done

**Depends:** None

Standardized `wp lint`, `wp format`, `wp test`, and `wp e2e` on explicit
`--file` flags by removing legacy positional path arguments from the visible CLI
contract and updating regression coverage around command help.

**Acceptance:**
- [x] `lint`, `format`, `test`, and `e2e` help surfaces no longer advertise
      variadic positional path arguments.
- [x] `lint` and `format` expose repeated `--file <path>` options.
- [x] Focused command/help tests cover the standardized contract.

#### [docs] Task 1.2: Update active docs and scaffolds to executable `--file` syntax

**Status:** done

**Depends:** Task 1.1

Updated the scaffolded base-kit lint script plus active blueprint/doc guidance
so live examples and verification commands use explicit repeated `--file`
flags.

**Acceptance:**
- [x] Fresh scaffold output uses `wp lint --file ...` instead of positional
      path arguments.
- [x] Active blueprint/docs guidance no longer contains actionable positional
      `wp lint` or mixed `wp test --file a b` examples.

#### [verify] Task 1.3: Close the verification loop

**Status:** done

**Depends:** Task 1.1, Task 1.2

Re-ran focused tests, lint, typecheck, and blueprint lifecycle validation after
the contract/doc updates landed.

**Acceptance:**
- [x] Targeted command/help/scaffold tests pass.
- [x] Focused lint and repo typecheck pass.
- [x] `wp audit blueprint-lifecycle` passes.

## Verification

- `./bin/wp test --file src/cli/commands/lint.test.ts --file src/cli/commands/format.test.ts --file src/cli/commands/test.test.ts --file src/cli/commands/e2e.test.ts --file src/cli/cli.test.ts --file src/cli/commands/init/scaffold-base-kit.test.ts --file src/cli/commands/init/init.integration.test.ts --file src/cli/wrapped-wp.test.ts`
- `./bin/wp typecheck`
- `./bin/wp lint --file src/cli/commands/lint.ts --file src/cli/commands/lint.test.ts --file src/cli/commands/format.ts --file src/cli/commands/format.test.ts --file src/cli/commands/test.ts --file src/cli/commands/test.test.ts --file src/cli/commands/e2e.ts --file src/cli/commands/e2e.test.ts --file src/cli/cli.test.ts --file src/cli/commands/init/scaffold-base-kit.ts --file src/cli/commands/init/scaffold-base-kit.test.ts --file src/cli/commands/init/init.integration.test.ts --file src/cli/wrapped-wp.test.ts`
- `./bin/wp audit blueprint-lifecycle`

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
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-18-wp-file-flag-standardization.md |

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
