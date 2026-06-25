---
type: blueprint
title: Blueprint inline task metadata parser fix
status: completed
complexity: S
owner: agent-kit
created: "2026-06-19"
last_updated: "2026-06-19"
progress: "100% (1/1 tasks done, 0 blocked)"
tags:
  - blueprint
  - parser
  - audit
---

# Blueprint inline task metadata parser fix

## Summary

Blueprint task metadata appeared in compact form such as `**Status:** todo **Depends:** None`. The core parser and lifecycle audit treated the rest of the line as part of the status, and task mutation lookup did not recognize bracketed task headings.

## Tasks

#### [blueprint] Task 1.1: Normalize compact task metadata across parser, audit, and mutation paths

**Status:** done

**Depends:** None

**Acceptance:**

- [x] Core blueprint parsing accepts compact inline `Status` + `Depends` metadata.
- [x] Lifecycle audit validates the normalized status token instead of the full metadata line.
- [x] Blueprint task mutation finds bracketed task headings and preserves inline dependency metadata.

## Verification

- RED: `./node_modules/.bin/vitest run src/blueprint/core/parser.test.ts src/cli/commands/blueprint/mutations.test.ts src/blueprint/lifecycle/audit.test.ts -t 'compact inline task metadata|compact bracketed task status|compact inline status metadata'` failed 3 focused tests against the old parser/mutation behavior.
- GREEN: the same focused Vitest command passed 3 tests.
- `./bin/wp test --file src/blueprint/core/parser.test.ts` passed.
- `./bin/wp test --file src/cli/commands/blueprint/mutations.test.ts` passed.
- `./bin/wp test --file src/blueprint/lifecycle/audit.test.ts` passed.
- `vp run typecheck` passed.
- `vp run lint` passed.
- `vp run blueprints:check` passed.
- `./bin/wp audit blueprint-readme-drift` passed.
- `./bin/wp blueprint show 2026-06-19-blueprint-inline-task-metadata-parser` passed.
- `./bin/wp blueprint audit --all --strict` no longer reports invalid inline-status parser errors; it still fails on pre-existing historical completed-blueprint acceptance/zero-task waiver issues.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                                      |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-19-blueprint-inline-task-metadata-parser.md |

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
