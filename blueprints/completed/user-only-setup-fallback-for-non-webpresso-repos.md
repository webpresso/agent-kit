---
type: blueprint
title: User-only setup fallback for non-Webpresso repos
status: completed
complexity: M
owner: agent-kit
created: "2026-06-19"
last_updated: "2026-06-19"
progress: "100% (3/3 tasks done, 0 blocked, updated 2026-06-19)"
tags:
  - cli
  - setup
  - safety
  - ux
completed_at: "2026-06-19"
---

# User-only setup fallback for non-Webpresso repos

## Product wedge anchor

- **Stage outcome:** `wp setup` is safe to run from repo collection roots and non-Webpresso repos.
- **Consuming surface:** `wp setup` / `wp init`, bootstrap CLI e2e coverage, and repo-local setup governance.
- **New user-visible capability:** `wp setup` automatically falls back to user-only setup outside initialized Webpresso repos, and `--project-init` explicitly opts into repo bootstrapping.

## Summary

Prevent accidental scaffolding into umbrella directories such as `~/repos` or plain git repos that are not yet initialized as Webpresso projects. Keep the user/global setup path available in those locations, add explicit `--user-only` and `--project-init` controls, and prove the behavior at the CLI boundary with subprocess e2e tests.

#### Task 1.1: Detect repo-collection roots and initialized Webpresso repos

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"command":"bun src/cli/cli.ts audit tph","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-19T00:00:00.000Z"},{"command":"vp test src/cli/commands/init/repo-collection-guard.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-19T00:00:00.000Z"}]
```

Add repo-shape detection that recognizes collection roots (including org-folder layouts) and initialized Webpresso repos via managed markers or local package pins.

**Acceptance:**

- [x] Repo collection roots are detected before repo-local setup writes happen.
- [x] Initialized Webpresso repos are not forced into user-only mode.
- [x] Detection logic has direct regression coverage.

#### Task 2.1: Split user-only setup from repo-local setup

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"actor":"codex","allow_manual":true,"description":"Real smoke run from /Users/ozby/repos entered user-only mode and created no repo-local files.","kind":"manual","log_excerpt":"wp init: /Users/ozby/repos is a repo collection root; running user-only setup. Verified absent: package.json, .webpressorc.json, .agent, .codex, agent-rules, agent-skills.","result":"pass","ts":"2026-06-19T00:00:00.000Z"}]
```

Keep global/user setup available outside project repos while skipping repo hooks, scaffold files, and project `.mcp.json` writes. Add `--user-only` and `--project-init` to make the intent explicit.

**Acceptance:**

- [x] `wp setup` auto-falls back to user-only mode for repo collections and non-Webpresso repos.
- [x] `--user-only` forces the safe global-only path.
- [x] `--project-init` preserves explicit bootstrap of plain repos.

#### Task 3.1: Prove the behavior at the CLI boundary

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"command":"vp test src/cli/commands/init/init.e2e.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-19T00:00:00.000Z"},{"command":"vp lint src/cli/commands/init/index.ts src/cli/commands/init/repo-collection-guard.ts src/cli/commands/init/repo-collection-guard.test.ts src/cli/commands/init/init.e2e.test.ts","exit_code":0,"kind":"lint","result":"pass","ts":"2026-06-19T00:00:00.000Z"},{"command":"vp typecheck @webpresso/agent-kit","exit_code":0,"kind":"typecheck","result":"pass","ts":"2026-06-19T00:00:00.000Z"},{"command":"bun src/cli/cli.ts audit agents","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-19T00:00:00.000Z"}]
```

Update the existing setup e2e suite so normal repo scaffolding is explicit with `--project-init`, and add subprocess coverage for automatic user-only fallback and explicit `--user-only` behavior.

**Acceptance:**

- [x] Existing setup e2e coverage still validates normal repo bootstrap via `--project-init`.
- [x] New e2e cases cover automatic user-only fallback and explicit `--user-only` mode.
- [x] Lint, typecheck, TPH audit, and agents audit pass for the touched surface.

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
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/user-only-setup-fallback-for-non-webpresso-repos.md |

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
