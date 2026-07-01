---
type: blueprint
status: completed
complexity: XS
created: "2026-06-28"
last_updated: "2026-07-01"
progress: "100% (4 of 4 tasks completed)"
depends_on: []
cross_repo_depends_on: []
tags:
  - workflow-skills
  - reviewers
  - dx
approvals:
  - reviewer: eng-review
    verdict: approve
    commit: 32cd1968b861cd8d26558423740751728b738d25
    evidence: "plan-refine engineering review: repo paths and tests verified on 2026-07-01"
  - reviewer: codex
    verdict: approve
    commit: 32cd1968b861cd8d26558423740751728b738d25
    evidence: "independent Codex verification: focused test gate passed on 2026-07-01"
title: "Fix opencode-go reviewer reliability (drop redundant `--dir '$PWD'`)"
owner: ozby
---

# Fix opencode-go reviewer reliability (drop redundant `--dir "$PWD"`)

**Goal:** Make the opencode-go reviewer skills (`/deepseek`, `/glm`, `/mimo`,
`/kimi`, `/minimax`, `/qwen`, `/hy3`, `/opencode-go`) run reliably instead of
stalling/timing out.

## Product wedge anchor

- **Stage outcome:** Multi-model plan/code review is part of the review-gate
  workflow used to ship extraction work (the same gate that approved the
  Cloudflare-cost plan and the governance blueprint).
- **Consuming surface:** The `/deepseek` `/glm` `/mimo` … skills →
  `opencode run` under the hood.
- **New user-visible capability:** A contributor can invoke an opencode-go
  reviewer and get a verdict back instead of an empty/timed-out result.

## Problem Statement

All eight opencode-go reviewer skills invoke:

```bash
opencode run --model opencode-go/<id> --dir "$PWD" "$(cat "$PROMPT_FILE")"
```

`--dir "$PWD"` forces opencode to index the **entire repo** before reviewing.
Measured cold overhead: ~12s for a one-word prompt vs ~2s without it; under
machine load this compounds into multi-minute hangs (memory records repeated
420s timeouts on `--dir`). opencode already operates on the current working
directory and can read files without `--dir` (an independent review run without
it read source files and returned a verdict), so `--dir "$PWD"` is pure
redundant overhead — the root cause of "opencode-go reviews fail."

## Fact-Checked Findings

- Source of truth: `packages/workflow-skills/skills/<name>.md` →
  `stage:workflow-skills` → `catalog/agent/skills/<name>/SKILL.md` →
  `generate-skills` → `skills/<name>/SKILL.md`. Evidence: `package.json`
  scripts `stage:workflow-skills`, `generate-skills`;
  `repo:packages/workflow-skills/src/skill-text.test.ts:83-125` (byte-identity).
- All 8 source files carried `--dir "$PWD"` on the `opencode run` line.
- `--dir` idle overhead reproduced this session: `opencode run --dir "$PWD"
"<one word>"` = 12.2s wall vs ~2s without.

## Key Decisions

| Decision                | Choice                                                | Rationale                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove vs keep `--dir`  | Remove                                                | opencode runs in cwd already; `--dir "$PWD"` only adds redundant full-repo indexing.                                                                                        |
| Output-capture guidance | Add one prose line                                    | The empty-output failure mode also comes from piping through `head`/`tail` under a `timeout` (buffered output lost on kill); document the reliable pattern next to the fix. |
| Regression proof        | Assert the `opencode run` command line has no `--dir` | Prose still mentions `--dir` to warn against it, so the guard targets the command line specifically.                                                                        |

### Phase 1: Fix [Complexity: XS]

#### [docs] Task 1.1: Drop `--dir "$PWD"` from the 8 reviewer sources + restage

**Status:** done

Edit `packages/workflow-skills/skills/{deepseek,glm,hy3,kimi,mimo,minimax,opencode-go,qwen}.md`
to remove `--dir "$PWD"` from the `opencode run` line and add a one-line
rationale. Re-run `stage:workflow-skills` + `generate-skills` so catalog and
`skills/` stay byte-identical to source.

**Files:** `packages/workflow-skills/skills/*.md`, `catalog/agent/skills/*/SKILL.md`, `skills/*/SKILL.md`

**Acceptance:**

- [x] No `opencode run` command line in any tree contains `--dir`
- [x] Byte-identity test (source == catalog == skills/) green

#### [qa] Task 1.2: Regression guard in skill-text contract

**Status:** done

Add an assertion to `packages/workflow-skills/src/skill-text.test.ts` that each
opencode-go reviewer's `opencode run --model` command line does not contain
`--dir`.

**Files:** `packages/workflow-skills/src/skill-text.test.ts`

**Acceptance:**

- [x] New assertion fails against the old (`--dir`) command lines
- [x] skill-text + stage + generate tests green

## Verification Gates

| Gate       | Command                                                                           | Success Criteria  |
| ---------- | --------------------------------------------------------------------------------- | ----------------- |
| Tests      | `wp test --file packages/workflow-skills/src/skill-text.test.ts`                  | All pass          |
| Functional | `opencode run --model opencode-go/deepseek-v4-pro "<review prompt>"` (no `--dir`) | Returns a verdict |

### Phase 2: Drift-proof model IDs via in-skill live discovery [Complexity: S]

Hardcoded version IDs (`glm-5.2`, `deepseek-v4-pro`, …) drift — they went stale
before and required manual cleanup. Root fix: stop hardcoding. Each reviewer
resolves its model from the live catalog (`opencode models opencode-go`, already
run in the availability check), preferring its capability tier and newest
version, so new releases are used automatically.

#### [docs] Task 2.1: Replace hardcoded IDs with live resolution in all 8 reviewers

**Status:** done

For the 6 family skills (deepseek/glm/kimi/minimax/mimo/qwen): routing names the
family + preferred tier; the review command resolves
`MODEL=$(opencode models opencode-go | grep '^opencode-go/<family>'[ | grep tier] | sort -V | tail -1)`
with a family-wide fallback, then `opencode run --model "$MODEL"`. The umbrella
`opencode-go` skill resolves a high-signal model across families (qwen-max →
minimax → deepseek-pro → any). The parked `hy3` skill resolves `hy3` live and
prints a parked message when absent. The "catalog covered" table (the stale-prone
artifact) is replaced by a live-catalog pointer.

**Files:** `packages/workflow-skills/skills/*.md` (+ staged/generated trees)

**Acceptance:**

- [x] No `opencode run` command hardcodes a versioned `opencode-go/<id>`
- [x] Each family resolves to the correct current model against the live catalog

#### [qa] Task 2.2: Regression guards for live discovery

**Status:** done

skill-text.test asserts each reviewer's run command uses `--model "$MODEL"`,
contains no `opencode run --model opencode-go/<id>`, and resolves via
`grep '^opencode-go/`. stage-workflow-skills.test asserts the live-discovery
marker instead of a pinned ID.

**Files:** `packages/workflow-skills/src/skill-text.test.ts`, `scripts/stage-workflow-skills.test.ts`

**Acceptance:**

- [x] Guards fail against hardcoded-ID skills; pass against live-resolution skills

## Non-goals

- Changing the editorial family→task routing (which family for which review).
- A scheduled CI cron / drift-audit (superseded by in-skill live discovery —
  there is no committed ID to drift).
- Altering the Codex/Claude reviewer skills.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-07-01T12:52:00Z
- verified-head: 32cd1968b861cd8d26558423740751728b738d25
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                                           | Evidence                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| C1  | The opencode-go review-dir overhead fix is implemented in the workflow skill text and locked by its skill-text regression test. | repo:packages/workflow-skills/skills/opencode-go.md; repo:packages/workflow-skills/src/skill-text.test.ts |
| C2  | Focused regression coverage for this blueprint is present and was run in the managed worktree.                                  | repo:packages/workflow-skills/src/skill-text.test.ts; derived:C1                                          |
| C3  | Two review approvals are recorded for the lifecycle disposition.                                                                | repo:blueprints/completed/fix-opencode-go-review-dir-overhead/reviews.md; derived:C1; derived:C2          |

### Material Decisions

| ID  | Decision              | Chosen option                                       | Rejected alternatives                           | Rationale                                                                                                                                                  |
| --- | --------------------- | --------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Lifecycle disposition | Mark completed from existing implemented repo state | Force a process-only planned/in-progress detour | Repo transition matrix permits draft-to-completed when tasks are terminal; focused tests and lifecycle audits prove the implementation is already present. |

### Promotion Gates

| Gate            | Command                                                        | Expected outcome            | Last result        |
| --------------- | -------------------------------------------------------------- | --------------------------- | ------------------ |
| focused-tests   | wp test --file packages/workflow-skills/src/skill-text.test.ts | All targeted tests pass     | PASS on 2026-07-01 |
| lifecycle-audit | wp audit blueprint-lifecycle                                   | Lifecycle metadata is valid | PASS on 2026-07-01 |
| trust-audit     | wp audit blueprint-trust                                       | Trust dossier validates     | PASS on 2026-07-01 |

### Residual Unknowns

None.

## Completion Summary

- Completed on: `2026-07-01`
- Implementation head: `32cd1968b861cd8d26558423740751728b738d25`
- Summary: 4 of 4 tasks completed.
- Verification: `wp test --file packages/workflow-skills/src/skill-text.test.ts` passed in the managed worktree after `vp install`.
- Review approvals: see `reviews.md` (eng-review + codex approvals).
- Remaining risks: None for the implemented scope; any explicitly scheduled/non-required follow-ups remain outside this blueprint completion gate.
