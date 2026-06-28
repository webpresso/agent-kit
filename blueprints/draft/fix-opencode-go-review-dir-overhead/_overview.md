---
type: blueprint
status: draft
complexity: XS
created: "2026-06-28"
last_updated: "2026-06-28"
progress: "0% (0 of 2 tasks completed)"
depends_on: []
cross_repo_depends_on: []
tags:
  - workflow-skills
  - reviewers
  - dx
approvals: [] # ≥2 distinct reviewer approvals required before draft→planned
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

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Remove vs keep `--dir` | Remove | opencode runs in cwd already; `--dir "$PWD"` only adds redundant full-repo indexing. |
| Output-capture guidance | Add one prose line | The empty-output failure mode also comes from piping through `head`/`tail` under a `timeout` (buffered output lost on kill); document the reliable pattern next to the fix. |
| Regression proof | Assert the `opencode run` command line has no `--dir` | Prose still mentions `--dir` to warn against it, so the guard targets the command line specifically. |

### Phase 1: Fix [Complexity: XS]

#### [docs] Task 1.1: Drop `--dir "$PWD"` from the 8 reviewer sources + restage

**Status:** todo

Edit `packages/workflow-skills/skills/{deepseek,glm,hy3,kimi,mimo,minimax,opencode-go,qwen}.md`
to remove `--dir "$PWD"` from the `opencode run` line and add a one-line
rationale. Re-run `stage:workflow-skills` + `generate-skills` so catalog and
`skills/` stay byte-identical to source.

**Files:** `packages/workflow-skills/skills/*.md`, `catalog/agent/skills/*/SKILL.md`, `skills/*/SKILL.md`

**Acceptance:**

- [ ] No `opencode run` command line in any tree contains `--dir`
- [ ] Byte-identity test (source == catalog == skills/) green

#### [qa] Task 1.2: Regression guard in skill-text contract

**Status:** todo

Add an assertion to `packages/workflow-skills/src/skill-text.test.ts` that each
opencode-go reviewer's `opencode run --model` command line does not contain
`--dir`.

**Files:** `packages/workflow-skills/src/skill-text.test.ts`

**Acceptance:**

- [ ] New assertion fails against the old (`--dir`) command lines
- [ ] skill-text + stage + generate tests green

## Verification Gates

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Tests | `wp test --file packages/workflow-skills/src/skill-text.test.ts` | All pass |
| Functional | `opencode run --model opencode-go/deepseek-v4-pro "<review prompt>"` (no `--dir`) | Returns a verdict |

## Non-goals

- Changing opencode-go model routing / IDs (separate, already current).
- Altering the Codex/Claude reviewer skills.
