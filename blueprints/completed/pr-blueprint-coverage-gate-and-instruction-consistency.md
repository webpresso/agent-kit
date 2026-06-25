---
type: blueprint
title: PR blueprint coverage gate and instruction consistency
status: completed
complexity: L
owner: agent-kit
created: "2026-06-14"
last_updated: "2026-06-14"
progress: "100% (6/6 tasks done, 0 blocked, updated 2026-06-14)"
tags:
  - governance
  - blueprints
  - ci
completed_at: "2026-06-14"
---

# PR blueprint coverage gate and instruction consistency

## Product wedge anchor

- **Stage outcome:** Non-documentation PRs have an auditable blueprint coverage gate before merge.
- **Consuming surface:** wp audit blueprint-pr-coverage, GitHub CI, and bootstrapped agent instruction rules.
- **New user-visible capability:** Maintainers can run a reusable audit that rejects non-.md PRs without a blueprint change unless a Blueprint-exempt trailer documents the exception.

## Summary

Add a reusable PR-scoped audit that checks changed files against a base ref, exempts docs-only Markdown PRs, accepts PRs that include blueprint changes, and supports an auditable Blueprint-exempt trailer for truly trivial non-doc work. Wire it into agent-kit pull-request CI, update canonical consumer-bootstrapped instructions to state the same rule, add a release changeset, and record the previously merged PR #136 command-detection work as a completed historical blueprint.

#### Task 1.1: Record historical command-detection blueprint and dogfood this work

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"actor":"codex","allow_manual":true,"description":"Dogfood and historical blueprint records were created through the blueprint MCP lifecycle surface.","kind":"manual","log_excerpt":"Created pr-blueprint-coverage-gate-and-instruction-consistency, transitioned it to in-progress, created cross-platform-command-detection-consolidation, attached canonical task evidence, and transitioned the historical record to completed.","result":"pass","ts":"2026-06-14T23:08:10.000Z"}]
```

**Wave:** 0
**Lane:** docs

Create a completed historical blueprint for PR #136 with truthful evidence, and keep this governance blueprint in-progress while implementation proceeds. The historical record must not fabricate per-task verification; it should cite PR #136, the squash commit on main, the branch commits, the command-exists tests, and green audit/CI evidence from the shipped PR.

**Acceptance:**

- [x] This work has a lifecycle-tracked blueprint transitioned to in-progress before code edits.
- [x] A completed historical blueprint exists for the cross-platform command detection consolidation shipped in PR #136.
- [x] Both blueprint records validate through the blueprint lifecycle audit.

#### Task 2.1: Implement reusable blueprint-pr-coverage audit

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"command":"bunx vitest run src/audit/blueprint-pr-coverage.test.ts src/cli/commands/audit-core.test.ts src/mcp/tools/audit.test.ts --reporter=dot","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-14T23:08:10.000Z"}]
```

**Wave:** 1
**Lane:** backend

Add src/audit/blueprint-pr-coverage.ts and tests. The audit resolves changed files from git diff --name-only <baseRef>...HEAD or an injected changedFiles list, passes docs-only Markdown changes, passes non-doc PRs with at least one changed blueprints/ path, passes with a warning/note when a commit in the range has a Blueprint-exempt: <reason> trailer, and degrades to pass-with-warning when no base ref or git history is available.

**Acceptance:**

- [x] Tests cover docs-only pass, src change without blueprint fail, src change with blueprint pass, Blueprint-exempt trailer pass, and missing base degradation.
- [x] The audit returns the shared RepoAuditResult shape with actionable violation messages.
- [x] No timeout/backoff policy is introduced; git discovery stays bounded and degradable.

#### Task 2.2: Register audit across CLI and MCP surfaces without polluting guardrails

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"command":"bunx vitest run src/audit/blueprint-pr-coverage.test.ts src/cli/commands/audit-core.test.ts src/mcp/tools/audit.test.ts --reporter=dot","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-14T23:08:10.000Z"},{"audit_kind":"guardrails","command":"bun src/cli/cli.ts audit guardrails","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-14T23:08:10.000Z"}]
```

**Wave:** 1
**Lane:** backend

Register the new audit kind so wp audit blueprint-pr-coverage works as a standalone reusable audit and MCP audit dispatch recognizes it. Keep it out of the HEAD-pure guardrails aggregate because it requires a PR base ref or changed-file context.

**Acceptance:**

- [x] CLI audit kind list includes blueprint-pr-coverage.
- [x] MCP/shared audit kind registry includes blueprint-pr-coverage.
- [x] wp audit guardrails remains unchanged in non-PR contexts and does not run the PR-scoped audit.

#### Task 3.1: Wire pull-request CI blueprint gate

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"actor":"codex","allow_manual":true,"description":"CI workflow contains a pull_request-only blueprint-gate job using fetch-depth 0 and passing github.event.pull_request.base.sha to the new audit.","kind":"manual","log_excerpt":".github/workflows/ci.yml adds job blueprint-gate with if: github.event_name == 'pull_request', actions/checkout fetch-depth: 0, and run: ./bin/wp audit blueprint-pr-coverage --base \"${{ github.event.pull_request.base.sha }}\".","result":"pass","ts":"2026-06-14T23:08:10.000Z"}]
```

**Wave:** 2
**Lane:** infra

Add a pull_request-only blueprint-gate job to .github/workflows/ci.yml using fetch-depth: 0 and running ./bin/wp audit blueprint-pr-coverage --base ${{ github.event.pull_request.base.sha }}. The current PR should satisfy the gate because it changes blueprints/.

**Acceptance:**

- [x] CI workflow contains a blueprint-gate job scoped to pull_request events.
- [x] The job uses the PR base SHA as the audit base.
- [x] Existing CI jobs are not disrupted.

#### Task 4.1: Sweep bootstrapped instruction surfaces for consistent blueprint gate language

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"audit_kind":"sync-check","command":"./bin/wp sync --check","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-14T23:08:10.000Z"}]
```

**Wave:** 2
**Lane:** docs

Update catalog/agent/rules/pre-implementation.md and any related bootstrapped rules or scaffolder templates so consumers receive a consistent rule: non-Markdown PRs need a blueprint change, docs-only \*.md PRs are exempt, and truly trivial non-doc PRs need a Blueprint-exempt: <reason> commit trailer.

**Acceptance:**

- [x] Canonical catalog rule text documents the PR-level gate and escape hatch.
- [x] Related bootstrapped surfaces no longer contain contradictory blueprint gate wording.
- [x] The generated/consumer-facing instruction path remains catalog-owned; no generated surfaces are hand-edited.

#### Task 5.1: Release note and verification

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"command":"bunx vitest run src/audit/blueprint-pr-coverage.test.ts src/audit/blueprint-pr-coverage.integration.test.ts src/cli/commands/audit-core.test.ts src/mcp/tools/audit.test.ts --reporter=dot","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-14T23:21:50.000Z"},{"audit_kind":"tph","command":"./bin/wp audit tph","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-14T23:21:58.000Z"}]
```

**Wave:** 3
**Lane:** qa

Add a patch changeset for the new audit and CI gate, then run targeted tests, typecheck, lint, source audit guardrails, and blueprint lifecycle validation. Record any verification gaps explicitly.

**Acceptance:**

- [x] Patch changeset added for @webpresso/agent-kit.
- [x] Targeted audit tests pass.
- [x] Typecheck, lint, source audit guardrails, and blueprint lifecycle audit pass or have an explicit blocker recorded.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                                            |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/pr-blueprint-coverage-gate-and-instruction-consistency.md |

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
