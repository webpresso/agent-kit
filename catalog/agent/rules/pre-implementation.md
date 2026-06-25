---
type: rule
slug: pre-implementation
title: Pre-implementation rules
status: active
scope: repo
applies_to: [agents, humans]
related: []
created: "2026-05-06"
last_reviewed: "2026-05-06"
---

# Pre-Implementation Rules

Applies before non-trivial implementation (new features, bug fixes with
unclear repro, refactors). Skip for typos, renames, and one-line fixes.

## Surface Multiple Interpretations

When a request admits more than one plausible reading, list them with rough
effort/tradeoffs and ask — do not pick silently.

- "Make X faster" → latency, throughput, or perceived speed?
- "Fix auth" → which symptom? which user flow?
- "Export data" → which records, which fields, which delivery?

If only one reading is plausible, proceed and state the reading in one
sentence before editing.

## Define Verifiable Success Criteria

Before editing, state the signal that proves the change is done. Vague plans
("review and improve", "clean up") are not acceptable.

Acceptable signals:

- A failing test that must pass (preferred for bug fixes)
- A specific QA command from the consumer repo's command surface that must
  exit green (e.g. the repo's full QA recipe, or a targeted e2e suite)
- A reproducible repro step whose observed output changes

For UI changes, the signal is an end-to-end test (Playwright spec or
equivalent) under the consumer repo's e2e directory, not manual
click-through.

## Blueprint gate

A blueprint must exist in `blueprints/draft/` or a more advanced lifecycle
directory before implementation begins on any non-trivial change. Create one
if none exists:

```bash
wp blueprint new "<concise goal>" --complexity <XS|S|M|L|XL>
# refine in blueprints/draft/{slug}/ then promote when ready:
wp blueprint promote {slug}
```

**When to create** (same threshold as this rule — "non-trivial"):

- **Claude Code (plan mode):** the moment the plan is approved and _before_
  calling `ExitPlanMode` or making the first `Edit`/`Write` call, run the full
  gate below (worktree → blueprint → draft PR). The blueprint is the handoff
  record; the plan is ephemeral.
- **All other CLIs (Codex, Cursor, OpenCode, etc.):** run the full gate before
  the first `Edit`/`Write` tool call for the task.

### The gate is: worktree → blueprint → draft PR

A non-trivial change is isolated from the first keystroke. Do all three before
the first implementation edit, in this order:

1. **Create a git worktree on a new branch and switch into it.** Never
   implement on `main` or on an unrelated in-flight branch. Branch fresh from
   the default branch so the PR diff is clean.
2. **Create the blueprint on that branch.** The MCP `wp_blueprint_*` tools
   write blueprint files to the _primary_ checkout, not a linked worktree —
   after authoring, make sure the blueprint file actually lands on the worktree
   branch (e.g. copy it in) before committing, or the PR-coverage gate fails.
3. **Open a draft PR early** (`gh pr create --draft`) with the blueprint in the
   first commit, then push implementation commits to it. The PR exists for the
   whole task, not just at the end.

Never push directly to `main`; every change lands via a PR with green CI. Skip
the worktree/PR steps only for the same trivial cases this rule already skips
(typos, renames, one-line or doc-only fixes).

**When to skip:**

- Typos, renames, or one-line fixes (same skip condition as the rest of this
  rule).
- Doc-only changes with no source edits.
- An in-progress or planned blueprint already tracks this exact change — update
  it instead of creating a duplicate.

## PR-level blueprint coverage gate

Pull requests are checked by `wp audit blueprint-pr-coverage` in CI. The PR
gate is deliberately stricter and easier to inspect than the local
pre-implementation judgment:

- PRs whose changed files are **all `*.md`** are exempt.
- Any PR with at least one non-`*.md` changed file must include a changed file
  under `blueprints/`.
- Truly trivial non-`*.md` PRs may use an explicit commit-message trailer:
  `Blueprint-exempt: <reason>`.

The exemption trailer is intentionally git-inspectable and must include a real
reason. Do not use it for features, behavioral fixes, refactors, security
changes, CI changes, dependency changes, generated-code churn, or anything that
would benefit from durable task/evidence tracking. If a branch starts with a
trivial exempt commit and grows, add or update a blueprint before opening the
PR.

**Why:** Plans disappear when context resets or is compacted. Blueprints
persist across sessions, accumulate verification evidence, and are auditable
via `wp blueprint audit`. A plan without a blueprint is institutional knowledge
that evaporates at the next `/clear`.
