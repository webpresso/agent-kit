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

1. **Create the worktree via `wp blueprint start <slug>` (uniform naming).** Never
   implement on `main` or on an unrelated in-flight branch, and never in the
   primary checkout. `wp blueprint start` creates/binds the managed worktree and
   records `worktree_owner_branch`. It resolves deterministically to branch
   **`bp/<slug>`** at `~/.agent/worktrees/repos/<repo-id>/blueprints/<slug>/owner`
   (do NOT hardcode the path; do NOT use the deprecated in-repo `_worktrees/`
   layout, raw `git worktree add`, or ad-hoc `fix/`/`feat/` branch names — they
   break the slug↔branch↔worktree mapping). One blueprint = one `bp/<slug>`
   branch = one worktree.
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

## Promotion gate: `draft` → `planned` needs ≥2 reviewer approvals

A blueprint is a **folder** (`blueprints/<status>/<slug>/_overview.md`) and may
not be promoted from `draft/` to `planned/` until it has **≥2 approvals from
distinct reviewers** on the current content.

- **Gate input = `_overview.md` frontmatter `approvals:`** (`reviewer` enum,
  `verdict`, `commit`/hash, `evidence`). The markdown `## Approvals` checklist is
  a human-readable mirror, never the gate.
- **Durable record = committed in-folder review history** (`<slug>/reviews.md` +
  per-review entries) — version-controlled second brain that keeps approvals AND
  rejection reasoning. An approval counts only if a matching committed review
  record exists for that reviewer at that commit/hash; editing frontmatter alone
  fails the gate.
- **`.webpresso` is a gitignored derived cache only** (fast lookup / scoreboard
  aggregation), rebuildable from the committed records. The durable record is the
  committed in-folder review history; the cache is the only non-committed copy and
  is never the source of truth.
- "Distinct" = distinct `reviewer` enum values (e.g. `eng-review` + one model, or
  two different models — not the same reviewer twice). Enforced by
  `wp audit blueprint-lifecycle` and the promotion command.

## Primary-on-main discipline

Primary checkouts under `~/repos/*` stay on `main` and are never worked on
directly — all work happens in a `bp/<slug>` worktree (above). This is enforced
as **strong agent-level prevention**: the pretool-guard hook blocks mutating Git
operations (`commit`, branch-switching `checkout`/`switch`, and branch
creation/copy/move/reset) when the effective cwd resolves to a primary checkout.
Effective cwd means the tool cwd after simple success-gated `cd`/`pushd` chains
and cumulative `git -C`; explicit file restores such as `git checkout -- path`
remain allowed. The CI/`wp doctor` backstop checks the same discipline. It is
**not** a 100% guarantee — direct shell/git outside the agent can bypass it;
that is documented, not promised.

## On merge: clean up + resync

When a blueprint's PR merges: delete the remote branch (CI-feasible), and
**locally** remove the worktree (`wp worktree remove`, the safe path that refuses
dirty/force/current) and fast-forward the primary to `origin/main`. Local cleanup

- primary resync cannot run from GitHub Actions — use a local `wp` command / post-
  merge hook. Leave no stale worktrees or branches.

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
