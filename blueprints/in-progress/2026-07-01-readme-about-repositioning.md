---
type: blueprint
title: "README/About repositioning"
owner: ozby
status: in-progress
complexity: S
created: "2026-07-01"
last_updated: "2026-07-01"
progress: "10% (blueprint created before docs edits)"
tags:
  - docs
  - package-metadata
  - positioning
---

# README/About repositioning

## Goal

Make the public first screen explain Agent Kit in under ten seconds as a
TypeScript-first agent harness for guarded develop/deploy workflows, while
keeping package metadata and packaged docs aligned.

## Scope

### In scope

- Rewrite the README opening and capability map around outcomes: setup,
  guarded development, guarded preview/deploy workflows, continuity, secrets,
  audits, and evidence gates.
- Replace README `wp setup --project-init` mentions with
  `wp setup repair --project-init`.
- Align `package.json#description`, `docs/README.md`, and
  `docs/getting-started.md` wording with the new positioning.
- Use GitHub-absolute links for README proof links to `src/**`, tests, and
  scripts because those paths are not shipped in npm package files.
- Keep deployment language bounded to supported preview/deploy workflows with
  repo-specific setup and secrets.
- Provide a GitHub About suggestion no longer than 160 characters in the final
  report.

### Out of scope

- Public API, CLI behavior, package file list, or runtime code changes.
- Full documentation overhaul beyond the alignment pages above.
- Unsupported claims about universal automation, hosted agents, model routing,
  enterprise platforms, hands-free production deploys, or numeric performance.

## Tasks

#### Task 1.1: Reposition public entry points

**Status:** in-progress

**Files:**

- `README.md`
- `package.json`
- `docs/README.md`
- `docs/getting-started.md`

**Acceptance:**

- [ ] README first screen says TypeScript-first agent harness + guarded develop/deploy workflows.
- [ ] README capability map is organized by outcomes rather than inventory.
- [ ] Package/docs wording matches the new positioning.
- [ ] README has no `wp setup --project-init` hits.
- [ ] About suggestion is <=160 characters.

#### Task 1.2: Verify claims and docs checks

**Status:** todo

**Acceptance:**

- [ ] `./bin/docs-check-internal-links.js`
- [ ] `./bin/docs-check-refs.js`
- [ ] `./bin/docs-check-stale.js`
- [ ] `./bin/docs-lint.js`
- [ ] `./bin/wp audit docs-frontmatter --json`
- [ ] `./bin/wp format --check`
- [ ] `./bin/wp audit guardrails --json`
- [ ] `rg -n "wp setup --project-init" README.md` has zero hits.
- [ ] Overclaim scan has no unsupported hits in README/docs/package metadata.

## Verification commands

```bash
./bin/docs-check-internal-links.js
./bin/docs-check-refs.js
./bin/docs-check-stale.js
./bin/docs-lint.js
./bin/wp audit docs-frontmatter --json
./bin/wp format --check
./bin/wp audit guardrails --json
rg -n "wp setup --project-init" README.md
rg -n "hands-free|automatic deploy|auto.*deploy|any arbitrary|universal|enterprise platform|hosted agent|model router|context reduction|[0-9]+x|%" README.md docs/README.md docs/getting-started.md package.json
```

## Guardrails

- Prefer precise, checkable claims over marketing language.
- Keep source/test/script proof links GitHub-absolute when they point outside the
  npm package file list.
- Do not edit generated/runtime surfaces.
