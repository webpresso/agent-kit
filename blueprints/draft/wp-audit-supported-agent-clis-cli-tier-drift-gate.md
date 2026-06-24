---
type: blueprint
status: draft
complexity: S
created: '2026-06-23'
last_updated: '2026-06-23'
progress: '0% (drafted)'
depends_on: []
cross_repo_depends_on: []
tags: [audit, agent-clis, governance]
---

# Wp audit supported-agent-clis CLI-tier drift gate

**Goal:** Implement the `wp audit supported-agent-clis` gate that both `CLAUDE.md`
files already claim exists, closing the drift between the prose rule doc and the
authoritative code lists of supported agent CLIs.

## Planning Summary

Both `CLAUDE.md` (workspace) and `agent-kit/CLAUDE.md` state: "Adding a new CLI
requires updating the rule file (gated by `wp audit supported-agent-clis`)." That
audit does **not** exist in `REPO_AUDIT_REGISTRY` (`src/cli/commands/audit.ts`). A
claimed-but-absent gate gives reviewers false confidence. Meanwhile three CLI lists
drift with no cross-check:

1. `catalog/agent/rules/supported-agent-clis.md` — Tier 1 `claude, codex`; Tier 2 `cursor, opencode` (doc-enforced only).
2. `src/symlinker/consumers.ts:136` → `AgentHostName = 'codex' | 'claude' | 'opencode'` (excludes `cursor`, a host-agnostic copy target).
3. `src/cli/commands/init/scaffolders/agent-hooks/capability-matrix.ts:32` → `CapabilityMatrixHost = 'claude' | 'codex' | 'cursor' | 'opencode'`.

This blueprint makes the gate real: a bidirectional set-equality audit, code-as-SSOT,
parsing the rule doc only for the format-stable column-1 `` (`id`) `` token.

## Architecture Overview

```text
                 ┌───────────────────────────────────────────┐
 code (SSOT) ──► │ EXPECTED_CLI_IDS = {claude,codex,cursor,   │
  AgentHostName  │   opencode}  (compile-time locked to the   │
  CapabilityMx   │   AgentHostName ∪ CapabilityMatrixHost     │
  Host (types)   │   unions via conditional-type asserts)     │
                 └──────────────────┬────────────────────────┘
                                    │  set compare (both directions)
 rule doc ──► parse column-1 ──────►│  code-has-not-in-doc / doc-has-not-in-code
 (tables)    `(`id`)` tokens        │       → RepoAuditViolation[]
                                    ▼
                          wp audit supported-agent-clis  (CLI + guardrails + MCP)
```

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Source of truth | Code (typed unions), not the prose doc | Doc is hand-edited and format-variable; code is compiler-guarded |
| Expected set | `AgentHostName ∪ CapabilityMatrixHost` = {claude,codex,cursor,opencode} | `cursor` is a copy-target/hook-vendor, in the matrix but not a skill-projection host; `AgentHostName` alone would false-flag it |
| Doc parse scope | Column-1 `` (`id`) `` token only, per table data row | Decoys (`/codex`, `-f json`, `opencode stats`) live in other columns; narrow parse avoids false positives |
| Direction | Bidirectional set-equality, two distinct violation messages | Catches host added to code-but-not-doc AND doc-but-not-code |
| No new data file | Reuse existing typed unions | A third YAML/JSON SSOT adds a new generator-drift surface (YAGNI) |
| Tier-level check | Deferred to a possible v2 | v1 identifier-set-equality catches the real drift at a fraction of parse fragility |

## Quick Reference (Execution Waves)

| Wave              | Tasks      | Dependencies | Parallelizable |
| ----------------- | ---------- | ------------ | -------------- |
| **Wave 0**        | 1.1, 1.2   | None         | 1 agent        |
| **Wave 1**        | 1.3        | 1.1          | 1 agent        |
| **Critical path** | 1.1 → 1.3  | --           | 2 waves        |

### Phase 1: Implement the audit [Complexity: S]

#### [backend] Task 1.1: Audit module + unit test

**Status:** todo

**Depends:** None

Create `auditSupportedAgentClis(root): RepoAuditResult` that (a) builds the expected
CLI id set from code, compile-time-locked to `AgentHostName` (`#symlinker/consumers`)
and `CapabilityMatrixHost` (`#cli/commands/init/scaffolders/agent-hooks/capability-matrix`)
via conditional-type asserts so a future addition to either union breaks typecheck
until `EXPECTED_CLI_IDS` is updated; (b) parses `catalog/agent/rules/supported-agent-clis.md`,
locating each table with header `| CLI | Provider model | … |`, and for each data row
extracts the single token matching `` /\(`([a-z][a-z0-9-]*)`\)/ `` from column 1 only;
(c) asserts bidirectional set-equality, emitting `code-has-not-in-doc: <id>` and
`doc-has-not-in-doc: <id>` as separate violations. Non-self-host repos (no rule file)
return `ok:true, checked:0` (not applicable); self-host with a missing rule file is a
violation. Mirror the plain `RepoAuditResult` shape of `auditAgents` (`src/audit/agents.ts`).

**Files:**

- Create: `src/audit/supported-agent-clis.ts`
- Create: `src/audit/supported-agent-clis.test.ts`

**Steps (TDD):**

1. Write failing tests: clean fixture (current doc) → `ok:true`, zero violations; doctored doc missing `cursor` + extra `aider` → exactly two directional violations; decoy fixture whose caveat cell holds `` `opencode stats` `` / `` `-f json` `` → decoys NOT harvested.
2. Run `wp test --file src/audit/supported-agent-clis.test.ts` — verify FAIL.
3. Implement the module.
4. Run scoped test — verify PASS (kill mutants on both directional branches independently).
5. Refactor (cognitive complexity ≤ 8).

**Acceptance:**

- [ ] Test file created with failing tests first
- [ ] Implementation passes all three cases
- [ ] `wp lint --file src/audit/supported-agent-clis.ts` clean
- [ ] `wp typecheck` passes (the type-assert guards compile)

#### [backend] Task 1.2: Register in the three surfaces

**Status:** todo

**Depends:** None (can run alongside 1.1; wiring referenced by tests in 1.3)

Register the new kind so it flows into CLI, the `wp audit guardrails`/quality composite
(automatic from the registry), and the MCP `wp_audit` tool.

**Files:**

- Modify: `src/cli/commands/audit.ts` — add `'supported-agent-clis'` to `REPO_AUDIT_REGISTRY`.
- Modify: `src/mcp/tools/_shared/audit-kinds.ts` — add `'supported-agent-clis'` to `MCP_AUDIT_KINDS` (do NOT touch the pre-existing duplicate `github-actions-secrets`; out of scope).
- Modify: `src/mcp/tools/audit.ts` — add the dispatch `case 'supported-agent-clis'` mirroring the `tech-debt` case.

**Acceptance:**

- [ ] `wp audit supported-agent-clis` runs and passes on this repo
- [ ] `wp audit guardrails` includes the new kind
- [ ] MCP `wp_audit kind=supported-agent-clis` returns a real result (not "unknown kind")

#### [qa] Task 1.3: Verify drift detection end to end

**Status:** todo

**Depends:** Task 1.1

Prove the gate fails on real drift in both directions, then revert.

**Steps:**

1. Temporarily remove the `cursor` row from the rule doc → `wp audit supported-agent-clis` fails with `code-has-not-in-doc: cursor`; revert.
2. Temporarily add a fake `**Foo** (`foo`)` Tier-2 row → fails with `doc-has-not-in-code: foo`; revert.
3. Confirm clean repo passes again.

**Acceptance:**

- [ ] Both drift directions fail as expected; clean state passes

---

## Verification Gates

| Gate        | Command                                                   | Success Criteria |
| ----------- | -------------------------------------------------------- | ---------------- |
| Type safety | `wp typecheck`                                           | Zero errors (type-assert guards compile) |
| Lint        | `wp lint --file src/audit/supported-agent-clis.ts ...`   | Zero violations  |
| Tests       | `wp test --file src/audit/supported-agent-clis.test.ts`  | All pass         |
| Audit self  | `wp audit supported-agent-clis`                          | Passes on this repo |
| Full QA     | `wp qa` (bookend)                                        | All pass         |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --------- | ---- | -------- | ---- |
| Backtick decoys in non-CLI columns (`/codex`, `-f json`, `opencode stats`) | False `doc-has-not-in-code` | Parse column 1 only, `` (`id`) `` token shape | 1.1 |
| `cursor` in matrix but not `AgentHostName` | False `doc-has-not-in-code: cursor` | Expected set = union of both unions | 1.1 |
| New host added to a union type later | Silent drift | Conditional-type asserts break typecheck until `EXPECTED_CLI_IDS` updated | 1.1 |
| Rule file absent in a consumer repo | False failure | Self-host check; non-self-host returns `ok:true, checked:0` | 1.1 |

## Non-goals

- Tier-level (Tier 1 vs Tier 2) assertion — deferred to a possible v2.
- A new structured CLI manifest file — typed unions already are the SSOT.
- Editing `generate-capability-matrix.ts` — it cites the doc in a footer, does not parse it.

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Doc table format changes (column-1 token shape) | Parser under-counts | v1 assumes `` (`id`) `` in column 1; v2 may fail on unparseable rows |
| `MCP_AUDIT_KINDS` hand-maintained, drift-prone | Partial wiring | Task 1.2 enumerates all three sites + an MCP smoke check |

## Technology Choices

| Component | Technology | Version | Why |
| --------- | ---------- | ------- | --- |
| Audit shape | `RepoAuditResult` (`#audit/repo-guardrails`) | n/a | Repo's standard audit contract |
| SSOT lock | TS conditional-type asserts | n/a | Binds runtime const to union types at compile time |

## Cross-Plan References

| Type       | Blueprint | Relationship |
| ---------- | --------- | ------------ |
| Upstream   | None      |              |
| Downstream | None      |              |

## Follow-ups (deferred, tracked separately)

- `getProjectDir()` hook dedup (5 call sites) — fold in opportunistically; do NOT build a host-output shim (Claude/Codex emit identical envelopes).
- Comment-harvest tech-debt audit — defer; seam is existing `weakness-mining --draft-tech-debt`.
