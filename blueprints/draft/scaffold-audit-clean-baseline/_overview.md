---
type: blueprint
status: draft
complexity: M
created: '2026-04-25'
last_updated: '2026-04-25'
progress: '0% (draft — captured during agent-kit dogfood pass)'
depends_on: []
tags:
  - agent-kit
  - scaffolder
  - audit
  - dogfooding
  - dx
---

# Scaffold an Audit-Clean Baseline

**Goal:** Make `ak setup` produce a working tree that passes every `ak audit` from first run on any consumer (including agent-kit itself), and add an `ak doctor` that diagnoses and remediates audit failures with a single command.

## Why

Captured live during the dogfood pass on 2026-04-25 (`webpresso/agent-kit` commit `8eb6c8a`). agent-kit failed three of its own four audits before the pass:

- `audit catalog-drift`: failed because `pnpm-workspace.yaml` was missing
- `audit docs-frontmatter`: failed because **8 pre-existing docs** had no `type:` / `last_updated:` frontmatter
- `audit blueprint-lifecycle`: vacuously passed (no blueprints existed)

`ak setup --with base-kit` fixed two of these (scaffolded `pnpm-workspace.yaml`, scaffolded `blueprints/`). But the docs-frontmatter audit still required **manual** frontmatter additions to 8 files because `ak setup` doesn't touch existing un-framed docs. Per the user's saved feedback ("scaffolders over manual fixes"), this is the gap.

A separate gap surfaced: discovering which `--with` mode would fix a given audit failure required reading source. There's no `ak doctor`-style command that runs every audit and prints the remediation for each failure.

## Scope

### Auto-frontmatter pass for existing docs

`ak setup` (or a new `ak audit docs-frontmatter --fix`) should:

- Scan `docs/**/*.md` for files lacking required frontmatter.
- Auto-prepend a default block — `type: guide`, `last_updated: <today>` — with the type heuristically inferred (or `guide` as a fallback). Use a comment marker so the user can reclassify later (`# TODO: classify type — auto-set by ak`).
- Be idempotent: never overwrite existing frontmatter.
- Be bypassable: `--no-fix-docs` flag.

This closes the legacy-doc gap so the dogfood pass becomes one command, not eight Edits.

### `ak doctor`

New top-level command:

- Runs every audit (`catalog-drift`, `docs-frontmatter`, `blueprint-lifecycle`, `commit-message`, `bundle-budget`, `tph`, plus `symlink check`).
- For each failure, prints a remediation line: `→ run: ak setup --with base-kit` or `→ run: ak audit docs-frontmatter --fix`.
- Exit code: 0 = clean, 1 = fixable failures, 2 = unknown failures.
- `--fix` flag chains the remediations automatically (asks before destructive actions).

Distinct from existing `ak dev --doctor` (manifest validation) — that command is preserved; this is at the audit layer.

### Catalog-drift behavior on single-package repos

Today the audit demands `pnpm-workspace.yaml` even when a repo is a single package with no workspaces. agent-kit needed an empty workspace stub purely to satisfy the audit. Fix:

- If repo has no workspace dirs declared, audit returns "OK (single package — no catalog needed)" instead of failing.
- If a `pnpm-workspace.yaml` is present, audit runs as today.

### Fix `ak setup --dry-run`

Currently `--dry-run` writes files (observed during this pass — `blueprints/`, `AGENTS.md`, `.agent/`, etc. all created despite the flag). True dry-run must print intent only.

## Out of scope

- New audit categories (covered by `agent-kit-parity-pass`).
- Symlinker rewrite.
- Rewriting `ak blueprint new` to support `--type parent-roadmap` (covered by `promote-parent-roadmaps` once it moves into agent-kit).

## Verification Gates

- `ak setup --with base-kit` on a fresh repo → all four audits pass without manual edits.
- `ak setup --with base-kit` on agent-kit (re-run) → idempotent, no churn.
- `ak doctor` on a clean repo → exits 0.
- `ak doctor` on a seeded broken repo (delete a frontmatter field) → exits 1 with a remediation line.
- `ak doctor --fix` on the same → returns the repo to clean.
- `ak setup --dry-run` writes nothing to disk (verify by `git status` after).
- `ak audit catalog-drift` on a single-package repo with no `pnpm-workspace.yaml` → OK, not FAILED.

## Related

- Triggered by: dogfood pass on 2026-04-25 (`webpresso/agent-kit` commit `8eb6c8a`)
- User feedback memory: `feedback_scaffolders_over_manual_fixes.md`
- Sibling work: `agent-kit-parity-pass`, `promote-parent-roadmaps` (both being relocated into this same `blueprints/` tree from `webpresso/monorepo/webpresso/blueprints/`)
