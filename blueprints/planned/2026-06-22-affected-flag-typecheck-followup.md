---
type: blueprint
title: "typecheck --affected via reverse-dependency import-graph closure"
owner: ozby
status: planned
complexity: L
created: '2026-06-22'
last_updated: '2026-06-22'
progress: '0% (planned; split out of the file-based --affected blueprint during /codex review)'
depends_on:
  - 2026-06-22-affected-flag-across-quality-commands
cross_repo_depends_on: []
tags:
  - cli
  - dx
  - typecheck
  - git
---

# `typecheck --affected` via reverse-dependency closure

## Goal

Extend `wp typecheck` with the same `--affected` / `--affected --branch` flags
the file-based commands get in
[`2026-06-22-affected-flag-across-quality-commands`](./2026-06-22-affected-flag-across-quality-commands.md),
but **soundly** — typecheck the changed files **plus every file that transitively
imports them**, not just the changed files.

## Why this is a separate blueprint

Split out during the `/codex` outside-voice review of the parent blueprint. It is
a different class of work from the file-based commands:

- **A naive `tsc <changed files>` is unsound.** `tsc` loads the changed files and
  *their imports* (downstream) but **not their importers** (upstream). A
  shared-type change in `a.ts` that breaks an *unchanged* `b.ts` (which imports
  `a`) reports a **false green** — the one failure mode a typechecker must never
  have. (Parent finding F4/F5.)
- **Package-scoping doesn't narrow anything here.** `pnpm-workspace.yaml` is
  `[., apps/*, packages/*]` and the root `.` package holds essentially all of
  `src/`, so "affected package = root" ≈ whole-repo typecheck for the common case
  (edits under `src/`). (Parent finding F4.)
- **No import-graph tooling is installed.** `package.json` has `typescript` only —
  no `ts-morph` / `madge` / `dependency-cruiser`. The sound closure must be built
  on the TypeScript compiler API from scratch. (Parent finding F5.)
- **typecheck has no `--file` flag today** (`--pretty`, `--full` only;
  `buildTypecheckCommand` runs whole-program `tsc --noEmit` because root has no
  `check-types` script), so file-target handling is itself net-new.

This is `L`/compiler-analysis work; the parent blueprint stays shippable and
green without it.

## Dependency

Consumes the shared `#git/changed-files` resolver (`{ files, degraded, reason }`)
delivered by **Task 1** of the parent blueprint. Do not duplicate the git-diff
logic — import it. Same semantics: `--affected` = staged `ACMR` set;
`--affected --branch` = `origin/${GITHUB_BASE_REF ?? 'main'}...HEAD`;
`--branch` alone errors; `--affected` ⟂ `--file` (once typecheck gains `--file`).

## Approach (to be hardened in refinement)

1. Resolve the changed set via the shared resolver.
2. Build a TypeScript `Program` for the project and compute the
   **reverse-dependency closure**: starting from the changed set, add every
   source file that transitively imports a changed file (respecting `#`-subpath
   and tsconfig path mapping — regex import scanning is **not** acceptable, it
   misses aliased and re-exported edges).
3. Run `tsc --noEmit` over `changed ∪ importers`.
4. **Degrade safely:** if the resolver is degraded, the closure can't be computed,
   or the set can't narrow (single-package / resolver unavailable / missing base
   ref), fall back to whole-repo `tsc --noEmit` + a notice. Never skip.

## Open design questions (resolve in `/plan-refine`)

- Compiler-API `Program` build cost vs. whole-repo `tsc` — does the closure
  actually save wall-clock once program construction is paid for? Measure before
  committing; if it doesn't beat whole-repo `tsc` for typical change sets, this
  feature isn't worth shipping (YAGNI gate).
- Incremental/`--build` + project references as an alternative narrowing
  mechanism (the repo currently uses a single tsconfig, no project refs).
- Where the closure module lives (`src/git/affected-typecheck.ts`) and whether it
  can reuse any existing import-scanning surface
  (`src/config/internal-subpath-imports.ts`, `src/config/docs-lint/cli/validators/imports.ts`).

## Acceptance criteria (high level — refine before execution)

- [ ] `wp typecheck --affected [--branch]` wired; `--branch` alone errors.
- [ ] **Soundness guard test:** a shared-type change in `a.ts` that breaks an
      *unchanged* `b.ts` importing it IS caught by `--affected` (no false green).
- [ ] Closure respects `#` subpath + tsconfig path mapping (aliased importers
      included), proven by test.
- [ ] Degraded / can't-narrow → whole-repo `tsc --noEmit` + notice, never skip.
- [ ] Measured: closure run is not slower than whole-repo `tsc` for a typical
      change set (else descope per YAGNI).
- [ ] `wp audit tph` and `wp typecheck` green.

## Out of scope

- The file-based commands (`lint`, `format`, `test`) — parent blueprint.
- Converging the existing changed-files implementations onto the shared resolver.

## Policy gates

- **Engineering principles:** the measured-speedup acceptance criterion is the
  YAGNI gate — if the closure doesn't beat whole-repo `tsc`, do not ship it.
- **Public package safety:** N/A — CLI flag + internal module only; no
  `package.json`/`files`/`bin`/`exports`/release-surface change.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID | Claim | Evidence |
| -- | ----- | -------- |
| C1 | This executable blueprint has a canonical repository document. | repo:blueprints/planned/2026-06-22-affected-flag-typecheck-followup.md |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| -- | -------- | ------------- | --------------------- | --------- |
| D1 | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| ---- | ------- | ---------------- | ----------- |
| lifecycle | wp audit blueprint-lifecycle | pass | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

None.
