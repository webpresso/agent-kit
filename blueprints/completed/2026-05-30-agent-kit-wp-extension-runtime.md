---
type: blueprint
title: "Agent Kit: `wp` extension runtime"
owner: ozby
historical_verification_gap_waiver: true
historical_verification_gap_rationale: Historical completed/parked record predates the durable per-task verification convention; retain lifecycle truth without fabricating retroactive evidence.
status: completed
complexity: L
created: "2026-05-30"
last_updated: "2026-05-31"
progress: "100% (completed)"
depends_on:
  - 2026-05-30-cross-project-wp-execution-map
tags:
  - wp
  - agent-kit
  - extension
  - runtime
---

# Agent Kit: `wp` extension runtime

**Goal:** Add a stable extension runtime to `@webpresso/agent-kit` so framework
and future packages can extend base `wp` without turning `agent-kit` into a
framework-specific command host.

## Planning Summary

- Goal input: `Agent-kit wp extension runtime`
- Complexity: `L`
- Draft slug: `2026-05-30-agent-kit-wp-extension-runtime`
- Output path: `blueprints/planned/2026-05-30-agent-kit-wp-extension-runtime.md`
- Validation scope: parser compliance + contract safety

## Architecture Overview

```text
base wp host
  -> discover installed extensions
  -> load extension manifest/module
  -> hostRange compatibility check
  -> repo detect(context)
  -> register commands
  -> register guarded aliases if safe
```

## Key Decisions

| Decision         | Choice                                  | Rationale                                                     |
| ---------------- | --------------------------------------- | ------------------------------------------------------------- |
| Discovery field  | `package.json -> webpresso.wpExtension` | Explicit opt-in is easier to validate than heuristic scanning |
| Extension export | default `WpExtensionV1`                 | Keep loading simple and contract-focused                      |
| Collision policy | base commands always win                | Prevent extension surprise/shadowing                          |
| Alias gating     | repo-aware and conflict-aware           | Framework aliases should not bleed into non-framework repos   |

## Quick Reference (Execution Waves)

| Wave              | Tasks           | Dependencies | Parallelizable | Effort (T-shirt) |
| ----------------- | --------------- | ------------ | -------------- | ---------------- |
| **Wave 0**        | 1.1, 1.2        | None         | 2 agents       | S                |
| **Wave 1**        | 1.3, 1.4        | Wave 0       | 2 agents       | S-M              |
| **Wave 2**        | 2.1             | Wave 1       | 1 agent        | S                |
| **Critical path** | 1.1 → 1.3 → 2.1 | --           | 3 waves        | M                |

### Phase 1: contract and loader [Complexity: M]

#### [runtime] Task 1.1: Define `WpExtensionV1` and manifest rules

**Status:** done

**Depends:** None

Define the extension surface that downstream packages will implement. Keep it
small, explicit, and version-checked so `agent-kit` can evolve without silent
extension breakage.

**Files:**

- Modify: `src/**`
- Modify: `package.json`
- Modify: `src/**/test*.ts`

**Steps (TDD):**

1. Add failing contract tests for required manifest fields and extension shape.
2. Run scoped tests — verify FAIL.
3. Implement the minimal public types and validation helpers.
4. Run scoped tests — verify PASS.

**Acceptance:**

- [x] Extension discovery field and module shape are explicitly defined.
- [x] Host-range compatibility is part of the contract.
- [x] Tests pin the public contract.

#### [runtime] Task 1.2: Implement extension discovery and load diagnostics

**Status:** done

**Depends:** None

Teach the base `wp` host to discover installed extension packages, load them,
and surface actionable diagnostics for broken or missing extensions without
taking down the entire CLI where avoidable.

**Files:**

- Modify: `src/**`
- Modify: `src/**/test*.ts`

**Steps (TDD):**

1. Add failing tests for discovery, load failure, and incompatible host range.
2. Run scoped tests — verify FAIL.
3. Implement the smallest runtime loader that satisfies the tests.
4. Run scoped tests — verify PASS.

**Acceptance:**

- [x] Base `wp` starts without any extension installed.
- [x] Missing or broken extensions yield warnings, not silent failure.
- [x] Host-range mismatches are diagnosed clearly.

### Phase 2: command and alias safety [Complexity: M]

#### [cli] Task 1.3: Add repo-aware alias gating

**Status:** done

**Depends:** Task 1.1, Task 1.2

Allow extensions to register top-level aliases only when the current repo
positively matches the extension’s detection rules and no base/accepted alias
collision exists.

**Files:**

- Modify: `src/**`
- Modify: `src/**/test*.ts`

**Steps (TDD):**

1. Add failing tests for repo mismatch, base collision, and extension-extension collision.
2. Run scoped tests — verify FAIL.
3. Implement guarded alias registration.
4. Run scoped tests — verify PASS.

**Acceptance:**

- [x] Base command precedence is absolute.
- [x] Conflicting aliases warn and skip.
- [x] Aliases only appear in matching repos.

#### [qa] Task 1.4: Cover degradation paths and package-surface behavior

**Status:** done

**Depends:** Task 1.1, Task 1.2

Extension support changes public runtime behavior and package exports, so
degradation-path tests and public-package-safety coverage must be explicit.

**Files:**

- Modify: `package.json`
- Modify: `src/**/test*.ts`

**Steps (TDD):**

1. Add failing tests for extension load warnings and package export presence.
2. Run scoped tests — verify FAIL.
3. Implement the smallest safe package/runtime changes.
4. Run scoped tests — verify PASS.

**Acceptance:**

- [x] Extension runtime exports are covered by package-surface tests.
- [x] Failure modes are visible and test-pinned.
- [x] No private/internal content leaks into public package surfaces.

### Phase 3: downstream handoff [Complexity: S]

#### [docs] Task 2.1: Document extension consumption for framework and future packages

**Status:** done

**Depends:** Task 1.3, Task 1.4

Write the durable guidance that framework and later packages will follow when
adding an extension. Keep the docs focused on contract shape and safety, not on
framework-specific implementation details.

**Files:**

- Modify: `docs/**`
- Modify: `catalog/**`

**Steps (TDD):**

1. Add or update tests/fixtures that pin the documented extension contract wording if such checks exist.
2. Update the docs with extension authoring and runtime expectations.
3. Run scoped checks — verify PASS.

**Acceptance:**

- [x] Downstream packages have a clear extension contract to follow.
- [x] The docs keep framework-specific behavior out of the base runtime guide.

## Verification Gates

| Gate            | Command                    | Success Criteria          |
| --------------- | -------------------------- | ------------------------- |
| Type safety     | `wp typecheck`             | Zero errors               |
| Lint            | `wp lint`                  | Zero violations           |
| Tests           | `wp test`                  | All targeted tests pass   |
| Package surface | repo tarball/export checks | Public surface is correct |

## Cross-Plan References

| Type       | Blueprint                                         | Relationship                      |
| ---------- | ------------------------------------------------- | --------------------------------- |
| Upstream   | `2026-05-30-cross-project-wp-execution-map`       | umbrella execution order          |
| Downstream | `2026-05-30-framework-wp-extension`               | first extension consumer/provider |
| Downstream | `2026-05-30-monorepo-wp-first-framework-consumer` | first framework-consumer adoption |

## Edge Cases and Error Handling

| Edge Case                                            | Risk               | Solution                                    | Task |
| ---------------------------------------------------- | ------------------ | ------------------------------------------- | ---- |
| Extension present but incompatible with host version | broken CLI startup | explicit host-range validation and warnings | 1.2  |
| Two extensions want the same alias                   | user confusion     | collision warn-and-skip policy              | 1.3  |

## Non-goals

- Defining framework-specific command behavior in `agent-kit`
- Allowing extensions to silently override base commands

## Risks

| Risk                                                            | Impact | Mitigation                                       |
| --------------------------------------------------------------- | ------ | ------------------------------------------------ |
| Extension contract is too loose and grows accidental complexity | High   | keep the contract minimal and versioned          |
| Base runtime crashes when optional extension misbehaves         | High   | degrade with warnings and pin failure-path tests |

## Technology Choices

| Component            | Technology                          | Version   | Why                                 |
| -------------------- | ----------------------------------- | --------- | ----------------------------------- |
| Extension host       | `@webpresso/agent-kit`              | workspace | Base `wp` runtime                   |
| First extension path | `@webpresso/webpresso/wp-extension` | workspace | Locked downstream consumer/provider |

## Completion Evidence

- Implemented extension contract and loader in `src/wp-extension/index.ts`.
- Wired extension command and alias registration through `src/cli/wp-extensions.ts`
  and `src/cli/cli.ts`.
- Added regression coverage for no-extension startup, unresolved extension
  diagnostics, host-range mismatch, repo-detection alias gating, export
  isolation, and package-surface subpath exposure.
- Added downstream contract documentation in `docs/wp-extension-runtime.md` and
  linked it from `docs/README.md`.
- Verification on 2026-05-31:
  - `wp test --file src/wp-extension/index.test.ts --file src/wp-extension/export-isolation.test.ts --file src/cli/wp-extensions.test.ts --file src/audit/package-surface.test.ts --file src/config/export-resolution.test.ts` — pass.
  - `wp lint --file src/wp-extension/index.test.ts --file src/wp-extension/export-isolation.test.ts --file src/audit/package-surface.test.ts --file docs/README.md --file docs/wp-extension-runtime.md` — pass.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                               |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/2026-05-30-agent-kit-wp-extension-runtime.md |

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
