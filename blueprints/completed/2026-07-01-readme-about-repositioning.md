---
type: blueprint
title: "README/About repositioning"
owner: ozby
status: completed
completed_at: "2026-07-01"
complexity: S
created: "2026-07-01"
last_updated: "2026-07-01"
progress: "100% (implemented; verification passed)"
worktree_owner_id: owner-4a574209dae9
worktree_owner_branch: bp/2026-07-01-readme-about-repositioning
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

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"gpt-5.5","command":"bash -lc '! rg -n \"wp setup --project-init\" README.md && ! rg -n \"hands-free|automatic deploy|auto.*deploy|any arbitrary|universal|enterprise platform|hosted agent|model router|context reduction|[0-9]+x|%\" README.md docs/README.md docs/getting-started.md package.json'","exit_code":0,"kind":"integration","result":"pass","target_files":["README.md","docs/README.md","docs/getting-started.md","package.json"],"ts":"2026-07-01T19:35:00Z"}]
```

**Files:**

- `README.md`
- `package.json`
- `docs/README.md`
- `docs/getting-started.md`

**Acceptance:**

- [x] README first screen says TypeScript-first agent harness + guarded develop/deploy workflows.
- [x] README capability map is organized by outcomes rather than inventory.
- [x] Package/docs wording matches the new positioning.
- [x] README has no `wp setup --project-init` hits.
- [x] About suggestion is <=160 characters.

#### Task 1.2: Verify claims and docs checks

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"agent":"gpt-5.5","command":"./bin/docs-check-internal-links.js && ./bin/docs-check-refs.js && ./bin/docs-check-stale.js && ./bin/docs-lint.js && ./bin/wp audit docs-frontmatter --json && ./bin/wp format --check && ./bin/wp audit guardrails --json","exit_code":0,"kind":"integration","result":"pass","target_files":["README.md","docs/README.md","docs/getting-started.md","package.json","blueprints/completed/2026-07-01-readme-about-repositioning.md"],"ts":"2026-07-01T19:35:00Z"}]
```

**Acceptance:**

- [x] `./bin/docs-check-internal-links.js`
- [x] `./bin/docs-check-refs.js`
- [x] `./bin/docs-check-stale.js`
- [x] `./bin/docs-lint.js`
- [x] `./bin/wp audit docs-frontmatter --json`
- [x] `./bin/wp format --check`
- [x] `./bin/wp audit guardrails --json`
- [x] `rg -n "wp setup --project-init" README.md` has zero hits.
- [x] Overclaim scan has no unsupported hits in README/docs/package metadata.

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

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-07-01T19:35:00Z
- verified-head: 1c0dadb95fdaf4d92d4f82cd629468e2de679cdc
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                           | Evidence                                                                             |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| C1  | Public positioning changes are limited to README, packaged docs, and metadata.  | repo:README.md; repo:docs/README.md; repo:docs/getting-started.md; repo:package.json |
| C2  | The implementation plan records no runtime or public API behavior changes.      | repo:blueprints/completed/2026-07-01-readme-about-repositioning.md                   |
| C3  | Claim wording is guarded by docs checks, guardrail audits, and overclaim scans. | derived:C1,C2                                                                        |

### Material Decisions

| ID  | Decision              | Chosen option                                                 | Rejected alternatives                                 | Rationale                                                                     |
| --- | --------------------- | ------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| D1  | Repositioning scope   | Focused README/package/docs wording update.                   | README-only change or full documentation overhaul.    | Keeps first-screen clarity aligned without expanding the docs-only task.      |
| D2  | Proof-link ownership  | GitHub-absolute links for source, tests, scripts.             | npm-relative links to paths omitted from the package. | README remains useful from both GitHub and the published package page.        |
| D3  | Preview/deploy claims | Bounded supported workflows with repo-specific setup/secrets. | Hands-off or generic production deployment claims.    | Matches the actual guardrail role and avoids unsupported automation promises. |

### Promotion Gates

| Gate             | Command                         | Expected outcome | Last result |
| ---------------- | ------------------------------- | ---------------- | ----------- |
| Docs frontmatter | ./bin/wp audit docs-frontmatter | pass             | pass        |
| Format           | ./bin/wp format --check         | pass             | pass        |
| Guardrails       | ./bin/wp audit guardrails       | pass             | pass        |

### Residual Unknowns

None.
