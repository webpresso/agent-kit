---
type: blueprint
title: Codex global hook runtime hardening
status: completed
complexity: M
owner: agent-kit
historical_verification_gap_waiver: true
historical_verification_gap_rationale: Historical completed/parked record predates the durable per-task verification convention; retain lifecycle truth without fabricating retroactive evidence.
created: 2026-05-28
last_updated: 2026-05-29
progress: '100% (7/7 tasks done; global Codex hook normalization, ownership filtering, trust repair, doctor coverage, docs, and runtime smoke gates verified on 2026-05-29)'
depends_on: []
tags:
  - hooks
  - codex
  - runtime
  - deterministic
---

# Codex global hook runtime hardening

## Product wedge anchor

- **Stage outcome:** agent-kit setup produces deterministic hook/runtime surfaces instead of requiring operators to debug host-specific PATH behavior after install.
- **Consuming surface:** `wp setup` / `webpresso agent setup`, plus `wp hooks doctor` and Codex global hook execution.
- **New user-visible capability:** a fresh or repaired setup yields working global Codex hooks even under sanitized hook environments, with no `PostToolUse` `command not found` failures.

## Summary

Harden global Codex hook runtime behavior by normalizing bare executable
commands into setup-managed launcher scripts, removing duplicate legacy global
entries, adding sanitized-environment regression coverage, and codifying the
hard decisions into durable agent instructions and doctor/audit checks.

## Key decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Runtime binary strategy | Setup-managed shell launchers that invoke absolute Node + stable JS wrapper targets | Hook runners may sanitize PATH; the outermost launcher must stay dependency-light and path-stable. |
| Duplicate legacy hook handling | Deduplicate at the scaffolder/setup layer | Generated runtime drift must be fixed at the source, not by manual user edits. |
| Failure contract | Loud setup/test failures, no silent PATH fallback | Broken runtime surfaces should be repaired deterministically, not masked. |
| Verification | Sanitized-env runtime proof + targeted doctor/audit coverage | Reproduces the real failure mode and prevents regression. |
| Ownership boundary | Exact managed-launcher basename allowlist only | Preserves current safety boundaries by rejecting arbitrary shell commands while allowing only setup-owned launcher shapes. |

## Findings

- **F1 — CRITICAL:** Global Codex hooks currently allow bare `context-mode` /
  `node` invocations that fail in sanitized hook environments.
- **F2 — HIGH:** Duplicate legacy `context-mode hook codex ...` entries amplify
  failures and create runtime drift.
- **F3 — HIGH:** Current setup messaging tells operators to “ensure node is on
  the Codex PATH” instead of repairing the generated hook surface.
- **F4 — MEDIUM:** Doctor/audit coverage does not yet flag bare global runtime
  commands as a contract violation.

## Cross-plan references

| Blueprint | Relationship | Required alignment |
| --- | --- | --- |
| `blueprints/completed/agent-kit-mcp-test-architecture-hardening/_overview.md` | Sibling deterministic-boundary lane | Hook runtime and blueprint discovery must both enforce bounded, deterministic runtime contracts without timeout inflation. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| --- | --- | --- | --- | --- |
| **Wave 0** | 1.1, 1.2, 1.3 | None | 3 agents | XS-S |
| **Wave 1** | 2.1, 2.2, 2.3 | Wave 0 | 3 agents | S |
| **Wave 2** | 3.1 | Wave 1 | 1 agent | S |
| **Critical path** | 1.2 → 2.1 → 3.1 | — | 3 waves | M |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| --- | --- | --- | --- |
| RW0 | Ready tasks in Wave 0 | ≥ planned agents / 2 | 3 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 7 / 3 = 2.33 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 6 / 7 = 0.86 |
| CP | same-file overlaps per wave | 0 | 0 |

Refinement delta: CPR is slightly below the preferred 2.5 target because setup,
doctor, and instruction codification naturally fan in on the same runtime
contract. The work is still safe for `/pll` because Wave 0 and Wave 1 have no
same-file conflicts within each lane.

## Tasks

#### [hooks-test] Task 1.1: Add sanitized-env regression proof for global Codex hooks

**Status:** done

**Depends:** None

Create a deterministic test suite that reproduces the observed failure mode:
bare `context-mode` / `node` commands fail under a sanitized hook-like
environment, while equivalent absolute-path commands succeed. Keep the test
hermetic and scoped to runtime contract proof.

**Files:**

- Create: `src/cli/commands/init/scaffolders/agent-hooks/codex-global-runtime.test.ts`

**Acceptance:**

- [ ] Bare-command failure is reproduced deterministically
- [ ] Absolute-path success is proven under the same sanitized env

#### [hooks-core] Task 1.2: Add global Codex hook normalization helper

**Status:** done

**Depends:** None

Implement a normalization helper that rewrites generated global Codex hook
commands to setup-managed launcher scripts and removes duplicate legacy entries
by stable event/matcher/command identity. Keep the helper idempotent so
repeated setup runs converge on the same output.

**Files:**

- Create: `src/cli/commands/init/scaffolders/agent-hooks/codex-global-normalize.ts`
- Create: `src/cli/commands/init/scaffolders/agent-hooks/codex-global-normalize.test.ts`

**Acceptance:**

- [ ] Bare runtime commands normalize to setup-managed launcher paths
- [ ] Duplicate legacy entries collapse deterministically
- [ ] Re-running normalization is a no-op on already-normalized state

#### [ops-test] Task 1.3: Extend ownership/selection tests for global hook cleanup

**Status:** done

**Depends:** None

Tighten the tests around preset-owned global Codex hook selection so cleanup
logic can safely distinguish OMX-managed entries, legacy context-mode entries,
and unrelated user-owned commands.

**Files:**

- Modify: `src/cli/commands/init/scaffolders/agent-hooks/codex-global-ownership.ts`
- Modify: `src/cli/commands/init/scaffolders/agent-hooks/codex-global-ownership.test.ts`

**Acceptance:**

- [ ] Cleanup candidates are classified explicitly in tests
- [ ] Unrelated user-owned global hook commands are preserved

#### [hooks-integration] Task 2.1: Wire normalization into setup and preset repair flow

**Status:** done

**Depends:** Task 1.1, Task 1.2, Task 1.3

Integrate normalization into the setup flow so context-mode/OMX-related Codex
hook state is repaired at generation time. Replace “ensure node is on PATH” as
the primary remediation with actual launcher-generation/runtime repair logic.

**Files:**

- Modify: `src/cli/commands/init/index.ts`
- Modify: `src/cli/commands/init/scaffolders/context-mode/index.ts`
- Modify: `src/cli/commands/init/scaffolders/omx/index.ts`

**Acceptance:**

- [ ] Setup repairs generated global Codex hook runtime state automatically
- [ ] Setup output documents the repair instead of delegating to operator PATH debugging

#### [ops-guard] Task 2.2: Add doctor/audit coverage for broken global Codex runtime state

**Status:** done

**Depends:** Task 1.2, Task 1.3

Extend doctor/audit surfaces so future regressions fail loudly when a generated
global Codex hook uses bare runtime commands or contains duplicate legacy
entries.

**Files:**

- Modify: `src/hooks/doctor.ts`
- Modify: `src/audit/agents.ts`

**Acceptance:**

- [ ] Doctor flags bare runtime commands in generated global Codex hooks
- [ ] Audit surfaces catch duplicate/broken generated runtime state

#### [docs/contract] Task 2.3: Codify hard decisions into durable agent instructions

**Status:** done

**Depends:** Task 1.2

Update durable repo instructions so future work treats global hook runtime
repair, bounded degradation, and no-timeout-as-fix as explicit policy rather
than oral history.

**Files:**

- Modify: `AGENTS.md`
- Modify: `.agent/rules/no-timeout-as-fix.md`
- Modify: `.agent/rules/agent-guide.md`

**Acceptance:**

- [ ] Repo instructions forbid PATH-dependent generated global hook commands
- [ ] Repo instructions point runtime regressions back to setup/scaffolder fixes
- [ ] Repo instructions forbid masking these failures with timeout inflation

#### [qa] Task 3.1: Run targeted runtime smoke gates

**Status:** done

**Depends:** Task 2.1, Task 2.2, Task 2.3

Run the narrowest test/lint/typecheck coverage needed to prove the old sanitized
runtime failure path is fixed and the new repair/doctor contracts are stable.

**Files:**

- Modify: verification evidence only

**Acceptance:**

- [ ] Targeted runtime tests pass
- [ ] Touched-file lint/typecheck passes
- [ ] Evidence is recorded in the blueprint before promotion
## Historical verification note

This blueprint contains done tasks recorded before the current per-task `**Verification:**` convention was consistently enforced. It remains a truthful historical record, but should not be treated as having retroactively reconstructed evidence beyond the repository and audit state captured elsewhere.

