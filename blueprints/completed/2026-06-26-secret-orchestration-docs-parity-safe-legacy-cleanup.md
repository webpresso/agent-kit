---
type: blueprint
title: "Secret orchestration docs parity + safe legacy cleanup"
owner: codex
status: completed
complexity: M
created: "2026-06-26"
last_updated: "2026-06-28"
progress: "100% (4/4 tasks done; closeout-only after f7a441b3 landed implementation)"
depends_on: []
cross_repo_depends_on: []
tags: [secrets, docs, packaging, public-surface]
completed_at: "2026-06-28"
---

# Secret orchestration docs parity + safe legacy cleanup

**Goal:** Ship accurate, packaged secret orchestration/operator docs and error
docs, add guardrails that fail when shipped doc references drift or stay
placeholder-only, and remove the remaining targeted user-facing `with-secrets`
wording from the stale Context7 init/setup path **without deleting any
compatibility code**.

**Final outcome:** Closeout-only lifecycle reconciliation on 2026-06-28 found
that PR #281 / commit `f7a441b3` already delivered this blueprint on `main`.
This completed record preserves the original scope while recording the shipped
evidence and removing the stale `planned/` lifecycle state.

## Planning Summary

- Goal input: `Secret orchestration docs parity and safe legacy cleanup`
- Complexity: `M`
- Default shape: flat file (`blueprints/<status>/<slug>.md`)
- Refined: fact-checked against the worktree on 2026-06-26 (see
  **Fact-check evidence**); `with-secrets` cleanup split out as an independent
  lane for parallelism.

## Problem

The repo ships secret orchestration commands and runtime `docsPath` references,
but the referenced docs are only partially discoverable, not fully packaged in
the npm tarball, and some public entry docs still underspecify the real v1
provider/profile contract. A stale Codex Context7 setup path still advertises
`with-secrets` wording even though the intended operator-facing flow is
provider-backed launch through the shared `wp` secret contract.

## Scope

- Rewrite secret/operator docs and secret error docs to match the current
  shipped contract.
- Link those docs from public entry surfaces and ensure tarball inclusion for
  README/runtime references.
- Extend readiness validation to fail when secret/error docs are missing or
  placeholder-only.
- Remove targeted stale `with-secrets` copy from init/setup output and mark
  contradictory blueprint history as superseded.
- Preserve compatibility code and legacy parser/surfaces in runtime/CLI.

## Non-goals

- Removing the legacy `{ manager, projectId }` parser.
- Removing `wp config secrets`, `SECRET_WRAPPER_BINS`, `wp migrate secrets`,
  `secret-provider-quarantine`, or internal `secretEnvProfile` wiring.
- Changing CLI/API shape beyond the documented copy/packaging updates.

## Fact-check evidence (Phase 1–2)

Verified against the worktree on 2026-06-26; all material claims hold.

| Claim                                      | Reality                                                                                           | Verdict  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- | -------- |
| `docs/secrets/*` exist                     | `providers.md`, `bootstrap-github.md`, `local-workplaces.md`, `pulumi.md` present                 | ✅ holds |
| Error doc exists                           | `docs/errors/wp-secret-orchestration.md` present                                                  | ✅ holds |
| Readiness command exists                   | `package.json` → `"public:readiness": "bun scripts/public-readiness.ts"`                          | ✅ holds |
| Tarball inclusion mechanism                | `package.json#files` is an explicit path list (no globs)                                          | ✅ holds |
| Readiness can detect placeholder-only docs | `scripts/public-readiness.ts` enforces a per-doc required-substring list, not just file existence | ✅ holds |
| Compatibility code stays                   | `with-secrets` still present in `wrapped-wp.ts`, `migrate.ts`, `secret-provider-quarantine.ts`    | ✅ holds |

## Edge cases & risks

| ID  | Severity | Item                                                                                                    | Mitigation                                                                                                                          |
| --- | -------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| E1  | MEDIUM   | `package.json#files` lists explicit paths — a future secret doc will silently not ship until added      | Task 1.3 readiness check fails on a missing required doc, surfacing the omission at CI time rather than at publish time             |
| E2  | MEDIUM   | Readiness uses content-substring matching — rewording a doc heading can false-fail the gate             | Keep the required-substring list (Task 1.3) aligned with doc headings; treat substring drift as an intentional, reviewed update     |
| E3  | LOW      | Removing `with-secrets` copy could be over-applied and break the legacy parser/audit                    | Cleanup is scoped to init/setup user-facing output only (Task 1.4); a negative-assertion test guards copy, non-goals guard the code |
| E4  | LOW      | Folder/status audit (`blueprint folder/status mismatch`) rejects a `planned/` file with `status: draft` | Frontmatter set to `status: planned` as part of the move into `planned/`                                                            |

## Tasks

### Phase 1: Docs, packaging, and guardrails [Complexity: M]

#### [docs] Task 1.1: Rewrite public secret/operator docs

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"actor":"codex","agent":"codex","allow_manual":true,"description":"Verified closeout-only: f7a441b3 rewrote the secret/operator docs and secret orchestration error doc according to this task scope.","kind":"manual","log_excerpt":"git show --stat f7a441b3 includes docs/secrets/providers.md, docs/secrets/bootstrap-github.md, docs/secrets/local-workplaces.md, docs/secrets/pulumi.md, and docs/errors/wp-secret-orchestration.md.","result":"pass","ts":"2026-06-28T00:00:00.000Z"}]
```

**Depends:** None

Rewrite the secret/operator docs and the secret error doc so they document the
shipped schema-v1 provider/profile contract: local-vs-committed config split,
runtime fetch model, provider-backed launch expectations,
doctor/status/run/bootstrap/migrate flows, sink/profile mapping, and actionable
`WP_*` failures. Replace any placeholder/stub prose with the real contract.

**Files:**

- Modify: `docs/secrets/providers.md`
- Modify: `docs/secrets/bootstrap-github.md`
- Modify: `docs/secrets/local-workplaces.md`
- Modify: `docs/secrets/pulumi.md`
- Modify: `docs/errors/wp-secret-orchestration.md`

**Acceptance:**

- [x] Secret/operator docs describe the current contract instead of placeholders/stubs.
- [x] Error doc enumerates the relevant `WP_*` secret/orchestration failures and fixes.

#### [public-surface] Task 1.2: Link and package referenced docs

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","audit_kind":"package-surface","command":"vp run public:readiness","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-28T00:00:00.000Z"},{"actor":"codex","agent":"codex","allow_manual":true,"description":"Verified closeout-only: f7a441b3 linked and packaged the referenced secret/error docs.","kind":"manual","log_excerpt":"Refinement evidence recorded vp run public:readiness PASS after runtime binary staging, proving shipped docs and public readiness references are valid on the current tree.","result":"pass","ts":"2026-06-28T00:00:00.000Z"}]
```

**Depends:** Task 1.1

Add explicit links from public entry docs and include the referenced docs in
`package.json#files` so README links and runtime `docsPath` targets ship in the
public tarball. Because `files` is an explicit path list, every newly referenced
secret/error doc must be appended here (see edge case E1).

**Files:**

- Modify: `package.json` (`files`)
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/getting-started.md`
- Modify: `docs/guides/repo-to-preview-url.md`

**Acceptance:**

- [x] Public entry docs link to the secret/error docs.
- [x] `npm pack --dry-run --json` includes the referenced secret/error docs.

#### [guardrails] Task 1.3: Readiness/test coverage for shipped docs

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file scripts/public-readiness.test.ts src/cli/commands/init/init.integration.test.ts src/blueprint/lifecycle/audit.approval-gate.test.ts src/hooks/pretool-guard/validators/worktree-discipline.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-28T00:00:00.000Z"},{"agent":"codex","audit_kind":"public-readiness","command":"vp run public:readiness","exit_code":0,"kind":"audit","passed":true,"result":"pass","ts":"2026-06-28T00:00:00.000Z"}]
```

**Depends:** Task 1.2

Extend `scripts/public-readiness.ts` (and its test) so readiness fails when
shipped README/runtime secret docs are missing from the tarball or are
placeholder-only (per-doc required-substring list). Keep the required-substring
list aligned with the doc headings authored in Task 1.1 (edge case E2).

**Files:**

- Modify: `scripts/public-readiness.ts`
- Modify: `scripts/public-readiness.test.ts`

**Steps:**

1. Add the secret/error docs to the readiness REQUIRED set with their
   required-substring assertions.
2. Add/extend tests asserting readiness fails on a missing or placeholder-only
   secret doc.
3. Run `vp run public:readiness` — verify green on the real tree.

**Acceptance:**

- [x] Targeted tests cover shipped doc references and placeholder detection.
- [x] `vp run public:readiness` fails on missing/placeholder secret docs.

#### [cleanup] Task 1.4: Remove stale `with-secrets` Context7 init/setup copy

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"agent":"codex","command":"./bin/wp test --file src/cli/commands/init/init.integration.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-28T00:00:00.000Z"},{"actor":"codex","agent":"codex","allow_manual":true,"description":"Verified closeout-only: the stale init/setup with-secrets copy was removed while compatibility code remains out of scope.","kind":"manual","log_excerpt":"Refinement evidence confirms init integration tests passed and with-secrets compatibility remains in wrapped-wp.ts, migrate.ts, and secret-provider-quarantine.ts.","result":"pass","ts":"2026-06-28T00:00:00.000Z"}]
```

**Depends:** None

Remove the targeted user-facing `with-secrets` wording from the stale Context7
init/setup output, replacing it with the provider-backed `wp secrets run` flow.
This is a copy-only change to init/setup output — it must not touch the legacy
parser, audit patterns, or `SECRET_WRAPPER_BINS` (non-goals; edge case E3).

**Files:**

- Modify: `src/cli/commands/init/index.ts`
- Modify: `src/cli/commands/init/init.integration.test.ts`

**Steps:**

1. Add a failing negative-assertion test: init/setup output does not contain
   `with-secrets`.
2. Remove the stale copy from init/setup output.
3. Run the init integration suite — verify PASS; confirm `with-secrets` still
   present in `wrapped-wp.ts`/`migrate.ts`/`secret-provider-quarantine.ts`.

**Acceptance:**

- [x] Init/setup output no longer mentions `with-secrets`.
- [x] Legacy compatibility code (parser, audit, wrapper bins) is unchanged.

## Quick Reference (Execution Waves)

| Wave              | Tasks           | Dependencies | Parallelizable | Effort (T-shirt) |
| ----------------- | --------------- | ------------ | -------------- | ---------------- |
| **Wave 0**        | 1.1, 1.4        | None         | 2 agents       | S–M              |
| **Wave 1**        | 1.2             | Wave 0 (1.1) | 1 agent        | S                |
| **Wave 2**        | 1.3             | Wave 1 (1.2) | 1 agent        | S                |
| **Critical path** | 1.1 → 1.2 → 1.3 | —            | 3 waves        | M                |

### Parallel Metrics Snapshot

| Metric | Meaning                            | Target | Actual |
| ------ | ---------------------------------- | ------ | ------ |
| RW0    | Ready tasks in Wave 0              | ≥ 2    | 2      |
| CPR    | total_tasks / critical_path_length | ≥ 2.5  | 1.33   |
| DD     | dependency_edges / total_tasks     | ≤ 2.0  | 0.5    |
| CP     | same-file overlaps per wave        | 0      | 0      |

**Refinement delta:** CPR is below target because docs → link/package → readiness
is an inherent sequential chain (each gate verifies the prior step's output).
Splitting the `with-secrets` cleanup (Task 1.4) out of the original Task 1.3 is
the only honest parallelism available — it touches `src/cli/**`, disjoint from
the docs/packaging path, giving a 2-wide Wave 0. Faking further splits would
introduce artificial dependencies.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-26T11:45:00.000Z
- verified-head: 9551de27cc62a9ba7880aa51957995e0e748d52a
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                                                | Evidence                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| C1  | Secret orchestration docs and error docs already exist and are the public surfaces this slice rewrites and packages.                 | repo:docs/secrets/providers.md; repo:docs/errors/wp-secret-orchestration.md                                   |
| C2  | Public readiness and npm package surface are the owning guardrails for shipped README/runtime doc references.                        | repo:scripts/public-readiness.ts; repo:package.json                                                           |
| C3  | Stale Context7 copy lives in init/setup output while legacy wrapper compatibility remains owned by runtime migration and audit code. | repo:src/cli/commands/init/index.ts; repo:src/cli/wrapped-wp.ts; repo:src/audit/secret-provider-quarantine.ts |

### Material Decisions

| ID  | Decision              | Chosen option                                                                                       | Rejected alternatives                                                                               | Rationale                                                                                                         |
| --- | --------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| D1  | Documentation surface | Rewrite and package the existing `docs/secrets/*` and `docs/errors/wp-secret-orchestration.md` docs | Creating new root docs or replacing runtime `docsPath` references with external URLs                | Existing repo-local docs are already referenced by runtime errors and are reviewable in the npm tarball.          |
| D2  | Compatibility cleanup | Remove only stale user-facing `with-secrets` init/setup copy                                        | Removing legacy parser, wrapper-bin recognition, migration, or quarantine enforcement in this slice | The user-visible copy can be corrected without changing compatibility behavior or broadening the migration scope. |
| D3  | Guardrail owner       | Extend public readiness and package-surface tests for shipped secret/error docs                     | Relying on prose-only review or docs-governance changes                                             | CI should fail when referenced public docs are missing from the tarball or remain placeholder-only.               |

### Promotion Gates

| Gate            | Command                                                             | Expected outcome | Last result                             |
| --------------- | ------------------------------------------------------------------- | ---------------- | --------------------------------------- |
| blueprint-trust | ./bin/wp audit blueprint-trust                                      | pass             | pass after adding this dossier          |
| docs-tests      | ./bin/wp test --file scripts/public-readiness.test.ts               | pass             | pass during implementation verification |
| init-copy-tests | ./bin/wp test --file src/cli/commands/init/init.integration.test.ts | pass             | pass during implementation verification |
| package-surface | ./bin/wp audit package-surface                                      | pass             | pass during implementation verification |

### Residual Unknowns

None.

## Plan-refine closeout (2026-06-28)

This blueprint was already implemented on `main` by PR #281 / commit
`f7a441b3` ("Secret orchestration docs parity + safe cleanup"). The
2026-06-28 ultragoal refinement therefore changed the execution verdict from a
fresh implementation lane to `closeout-only`.

Closeout evidence:

- `f7a441b3` touched the documented docs, packaging, readiness, and init/setup
  surfaces listed in this blueprint.
- Targeted tests passed during refinement: `./bin/wp test --file
scripts/public-readiness.test.ts src/cli/commands/init/init.integration.test.ts
src/blueprint/lifecycle/audit.approval-gate.test.ts
src/hooks/pretool-guard/validators/worktree-discipline.test.ts`.
- `vp run public:readiness` passed after staging runtime binaries in the
  refinement worktree.
- Non-goals were preserved: compatibility code for legacy secret wrapper/migrate
  paths remains outside this cleanup.

## Verification Gates

| Gate            | Command                     | Success Criteria         |
| --------------- | --------------------------- | ------------------------ |
| Tests           | targeted vitest suites      | Updated tests pass       |
| Readiness       | `vp run public:readiness`   | Green                    |
| Package surface | `npm pack --dry-run --json` | Referenced docs included |
| Lint/format     | scoped repo wrappers        | Green                    |

## Promotion gate

- [x] Material claims fact-checked against the worktree (see Fact-check evidence).
- [x] Edge cases and risks enumerated with mitigations (E1–E4).
- [x] Tasks self-contained with explicit `Files:` and `Depends:`.
- [x] No "decide during implementation" placeholders.

**Verdict:** `completed` (closeout-only; implementation already landed).
