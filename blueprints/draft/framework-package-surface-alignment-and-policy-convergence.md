---
type: blueprint
status: draft
complexity: L
created: "2026-06-17"
last_updated: "2026-06-17"
progress: "0% (drafted for separate PR lane)"
depends_on: []
cross_repo_depends_on: []
tags:
  - package-surface
  - audit
  - framework
  - policy
---

# Framework package surface alignment and policy convergence

**Goal:** make `agent-kit` consistently teach and validate `@webpresso/framework` as the canonical framework package, with no remaining `@webpresso/webpresso` package-surface guidance.

## Current facts

- `agent-kit` quality-engine and package-surface code already reference `@webpresso/framework` in several places.
- The broader workspace still contains older monorepo/framework decisions that preserve `@webpresso/webpresso`.
- This repo is the policy/audit source of truth that should prevent stale guidance from surviving the cut.

## Key decisions

| Decision                    | Choice                                        | Rationale                                                             |
| --------------------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| Canonical framework package | `@webpresso/framework`                        | Matches the intended new public identity.                             |
| Compatibility               | none                                          | Policy should not preserve the deprecated package name after the cut. |
| Scope                       | audits, package-surface rules, docs, examples | All must agree or downstream repos will keep drifting.                |

## Quick Reference (Execution Waves)

| Wave              | Tasks     | Dependencies | Parallelizable | Effort |
| ----------------- | --------- | ------------ | -------------- | ------ |
| **Wave 0**        | 1.1, 1.2  | None         | 2 agents       | XS-S   |
| **Wave 1**        | 2.1       | Wave 0       | 1 agent        | S      |
| **Critical path** | 1.1 → 2.1 | —            | 2 waves        | L      |

### Phase 1: Policy and audit convergence [Complexity: S]

#### [audit] Task 1.1: Lock package-surface defaults to `@webpresso/framework`

**Status:** todo

**Depends:** None

Update package-surface defaults, allowed package sets, and baseline logic so the framework package name is consistently `@webpresso/framework`.

**Files:**

- Modify: `src/audit/package-surface.ts`
- Modify: `src/audit/package-surface.test.ts`

**Acceptance:**

- [ ] Package-surface defaults no longer treat `@webpresso/webpresso` as canonical

#### [quality] Task 1.2: Converge package import guidance and suggestions

**Status:** todo

**Depends:** None

Update quality-engine import suggestions, validator messages, and related tests so generated guidance points only at `@webpresso/framework`.

**Files:**

- Modify: `src/quality-engine/package-import-rules.ts`
- Modify: related tests/docs/examples

**Acceptance:**

- [ ] Quality-engine guidance never recommends `@webpresso/webpresso`

### Phase 2: Repo-facing docs and negative checks [Complexity: S]

#### [docs] Task 2.1: Remove stale old-name guidance from docs and examples

**Status:** todo

**Depends:** Task 1.1, Task 1.2

Clean up remaining docs/examples/fixtures that would reintroduce the deprecated package identity in consumers.

**Files:**

- Modify: touched docs/examples/fixtures

**Acceptance:**

- [ ] No repo-facing docs/examples present `@webpresso/webpresso` as the supported framework name

## Verification Gates

| Gate                  | Command                                                                                                             | Success Criteria |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Package-surface tests | focused `package-surface` tests                                                                                     | pass             |
| Quality-engine tests  | focused `package-import-rules` tests                                                                                | pass             |
| Lint/typecheck        | repo lint + typecheck                                                                                               | pass             |
| Blueprint audit       | `./bin/wp audit blueprint-lifecycle blueprints/draft/framework-package-surface-alignment-and-policy-convergence.md` | passes           |

## Cross-Plan References

| Type       | Blueprint                                                  | Relationship                                                        |
| ---------- | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| Upstream   | framework package identity cutover and surface reduction   | policy targets the new framework identity                           |
| Upstream   | monorepo framework package cutover and surface enforcement | downstream monorepo gates depend on these policy updates            |
| Downstream | framework package consumer cutover                         | consumer audits should consume the updated package-surface doctrine |

## Non-goals

- Publishing a compatibility alias
- Preserving stale `@webpresso/webpresso` recommendations for migration comfort
