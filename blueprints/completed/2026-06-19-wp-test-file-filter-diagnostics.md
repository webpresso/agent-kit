---
type: blueprint
title: "WP test file-filter diagnostics and formatter script cleanup"
status: completed
historical_zero_task_waiver: true
historical_zero_task_rationale: "Historical completed record created before strict task-block requirements; preserved as an audited zero-task completion note."
complexity: S
owner: agent-kit
created: 2026-06-19
last_updated: 2026-06-19
progress: "100% (wp_test zero-test diagnostics, package script cleanup, changesets, and verification complete)"
tags:
  - mcp
  - testing
  - release
---

## Product wedge anchor

- **Stage outcome:** `wp_test` returns actionable diagnostics when a file filter
  makes Vitest exit unsuccessfully with zero matched tests, and the package
  script surface no longer advertises the repo-wide `format:check` path.
- **Consuming surface:** MCP callers of `wp_test`, package script users, and
  release notes generated from pending Changesets.
- **New user-visible capability:** Agents see a concrete file-filter diagnostic
  instead of an empty `rawOutput`/`failures[]` payload when a requested file does
  not match Vitest's included test files.

## Summary

The `wp_test` MCP path already scoped file-filter failures as
`file-filter command`, but the Vitest JSON output transform collapsed
unsuccessful zero-test JSON to an empty compact output because no failed test
nodes existed to parse. The fix detects `success: false` plus zero tests/suites
and emits an actionable diagnostic telling callers to check the requested file
filter.

The same PR removes the `format:check` package script. `format` remains the
canonical write/fix formatter entrypoint.

## Acceptance criteria

- [x] `wp_test` file-filter failures with zero matched Vitest tests include a
      non-empty diagnostic in `rawOutput` and `failures[]`.
- [x] All-pass Vitest JSON still compacts to empty output.
- [x] `package.json` keeps `format` as `./bin/wp format` and removes
      `format:check`.
- [x] Pending changesets cite AI-contract evidence paths as inline code.

## Verification evidence

```webpresso-evidence-v1
[{"command":"vp exec vitest run src/output-transforms/vitest.test.ts src/mcp/tools/test.test.ts src/mcp/runners/test.test.ts src/cli/package-scripts.test.ts package.contract.test.ts --reporter=verbose","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-19T00:10:32+02:00"},{"command":"node -e \"const p=require('./package.json'); if ('format:check' in p.scripts) throw new Error('format:check still exists'); if (p.scripts.format !== './bin/wp format') throw new Error('format script changed unexpectedly'); console.log('package format scripts ok')\"","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-19T00:10:32+02:00"},{"command":"vp run typecheck","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-19T00:10:55+02:00"},{"command":"vp run lint","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-19T00:10:55+02:00"},{"command":"./bin/wp audit ai-contracts && ./bin/wp audit guardrails","exit_code":0,"kind":"audit","result":"pass","ts":"2026-06-19T00:15:00+02:00"}]
```

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                                |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-06-19-wp-test-file-filter-diagnostics.md |

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
