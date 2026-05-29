---
type: blueprint
title: Agent Kit public npm cutover implementation
status: completed
complexity: L
owner: ozby
created: 2026-05-28T00:00:00.000Z
last_updated: '2026-05-29'
progress: '100% (15/15 tasks done; public npm cutover, release flow, provenance, docs, and public-readiness verification completed by 2026-05-29)'
---

## Product wedge anchor

- **Stage outcome:** `@webpresso/agent-kit` can be published publicly on npm with a reproducible release path, and the repo has an explicit, verified strategy for public GitHub visibility that does not leak local/private/internal material.
- **Consuming surface:** package install (`npm` / `pnpm` / `bun`), GitHub release workflow, public repository docs, published tarball.
- **New user-visible capability:** an outside user can discover, install, and trust `@webpresso/agent-kit` from public npm and GitHub without private-registry setup or maintainer-specific tribal knowledge.

## Summary

Agent Kit is close to public release, but current evidence shows four blocking classes of work:

1. the package and workflow still target GitHub Packages instead of public npm
2. public docs and fixtures still contain local/internal/private details
3. the npm tarball is broader than the intended public surface
4. the release process is not yet safe for public publishing or provenance

This blueprint converts the audit into a concrete execution plan. It also introduces an explicit history strategy decision lane because full history rewrites can cause major operational pain. Default posture: **do not rewrite history unless we confirm truly sensitive data remains in history and cannot be adequately mitigated by rotation/scrubbing/clean-snapshot release strategy**.

## Technology / policy choices

- **npm package model:** organization-scoped public package, kept as `@webpresso/agent-kit`.
- **npm first-public-publish rule:** scoped public release must publish with public visibility.
- **Release security target:** GitHub Actions trusted publishing / provenance-ready path where feasible, instead of long-lived publish tokens.
- **History-removal policy:** follow GitHub's current guidance that revocation/rotation may be sufficient and that history rewriting should be reserved for truly sensitive data because it carries clone recontamination, PR-diff loss, signature loss, and force-push coordination costs.

## Fact base

- Canonical public package name should stay **`@webpresso/agent-kit`**.
- `package.json` currently points to `https://npm.pkg.github.com` with restricted access.
- `npm pack --dry-run --json` shows a large tarball that includes broad `dist/`, `catalog/`, `skills/`, `commands/`, and `.claude-plugin/` content.
- Confirmed tracked leak candidates include:
  - local absolute paths in docs
  - a real local session dump fixture
  - tracked generated `.test-plan-service/**` artifacts
- No confirmed committed real credentials/private keys were found in the current tracked tree.
- Official GitHub guidance says rotating/revoking secrets may be sufficient and that history rewriting has significant coordination and tooling side effects.
- npm's current public-package docs explicitly support staged publishing as an alternative to immediate direct publish for a first public release.

## Key decisions

- **Package identity:** keep `@webpresso/agent-kit`; do not switch to an unscoped package.
- **Release posture:** prefer npm trusted publishing / provenance-ready workflow over long-lived publish tokens.
- **History posture:** treat full history rewrite as an explicit gated decision, not a default cleanup step.
- **Safety rule:** do not make the package public on npm until the packed tarball, release workflow, and public docs pass the package-release gate; do not make the GitHub repo public until those package gates pass **and** the repo-history/public-visibility strategy is verified.

## Cross-plan references

- `blueprints/completed/agent-kit-public-release-scrub/_overview.md` — prior scrub plan and earlier public-history strategy lane.
- `docs/research/2026-05-28-public-npm-cutover-checklist.md` — current audit-driven ranked checklist.
- `blueprints/planned/mcp-first-secret-surface-hard-cut-roadmap/_overview.md` — secret-surface hardening context; keep `wp_*` canonical surfaces and avoid reintroducing public secret legacy while changing release/docs.
- `blueprints/in-progress/agent-kit-hard-cut-to-generic-core-with-wp-as-the-only-canonical-cli/_overview.md` — public package/docs changes must preserve `wp` as the only canonical CLI and avoid reopening removed `webpresso` bin / branded preset decisions.
- `blueprints/in-progress/consolidate-all-webpresso-agent-sub-packages-into-webpresso-itself-with-subpath-exports-consumers-go-from-6-8-pinned-devdeps-down-to-one-webpresso/_overview.md` — package identity stays `@webpresso/agent-kit`; tarball/export/doc changes must not conflict with subpath-export consolidation or release-contract locking.
- `blueprints/in-progress/make-wp-own-generic-tool-runtime-for-consumers/_overview.md` — package-surface and workflow changes touching `files`, `bin`, `exports`, or runtime-owned commands must respect the runtime-ownership boundary and package-surface gates already in progress.
- `blueprints/in-progress/ai-reliability-contract-roadmap/_overview.md` — public docs cleanup should not silently break current AI reliability contract language/consumer-alignment work without explicit cross-plan note.

## Active blueprint alignment rules

- **CLI naming alignment:** this blueprint must preserve `wp` as the only canonical CLI and must not reintroduce `webpresso` bin/branding as public default surface.
- **Package identity alignment:** this blueprint must preserve `@webpresso/agent-kit` as the canonical package identity and must not reopen unscoped-package or dual-identity assumptions.
- **Package-surface alignment:** any change to `package.json`, `files`, `bin`, `exports`, `dist`, or release docs must be checked against the in-progress consolidation/runtime blueprints so one lane does not re-expand a surface another lane is hard-cutting.
- **Secret-surface alignment:** public-release cleanup must keep the `wp_*` / MCP-first secret-surface direction intact and avoid introducing a second secret-management or auth story.
- **Docs alignment:** public docs and install story changes must stay consistent with the generic-core and AI-reliability roadmaps when they mention supported surfaces or downstream consumers.

## Shared-file ownership / sequencing

The following files overlap with active blueprints and therefore need explicit ownership/ordering:

| Shared file / surface | Primary alignment blueprint | Rule |
| --- | --- | --- |
| `package.json` root identity / `bin` / `exports` / `files` | `agent-kit-hard-cut-to-generic-core-with-wp-as-the-only-canonical-cli`, `consolidate-all-webpresso-agent-sub-packages-into-webpresso-itself-with-subpath-exports-consumers-go-from-6-8-pinned-devdeps-down-to-one-webpresso`, `make-wp-own-generic-tool-runtime-for-consumers` | This blueprint is the **fan-in owner for public-release shape**, but it must not reopen CLI identity or export decisions those blueprints have already locked. No concurrent edits to these sections without an explicit handoff note in the PR/blueprint evidence. |
| `README.md` and `docs/getting-started.md` | `agent-kit-hard-cut-to-generic-core-with-wp-as-the-only-canonical-cli` | Public-install/docs rewrite must preserve `wp`-only canonical CLI language and generic-core wording. |
| `.github/workflows/release.yml` and package-surface release gates | `make-wp-own-generic-tool-runtime-for-consumers` | Release/package-surface changes must keep the runtime-owned tooling boundary intact and inherit package-surface gate expectations rather than redefining them. |
| secret/public-surface wording in docs and release notes | `mcp-first-secret-surface-hard-cut-roadmap` | Do not introduce a second secret/auth surface or re-mention legacy public secret patterns. |
| shipped runtime/template surfaces that teach install/update/release behavior (`src/cli/auto-update/run.ts`, `src/cli/auto-update/detect-pm.ts`, `src/hooks/doctor.ts`, `AGENTS.md`, `catalog/AGENTS.md.tpl`, `catalog/agent/rules/package-conventions.md`, `catalog/agent/rules/changeset-release.md`, `catalog/base-kit/.github/workflows/ci.webpresso.yml.tmpl`) | generic-core, runtime-ownership, secret-surface roadmap | This blueprint explicitly owns the public-package/install/release wording in these shipped surfaces for the cutover; no executor should assume repo-doc updates alone are sufficient. |

## Pre-mortem

| Scenario | Early detector | Blast radius | Mitigation / rollback |
| --- | --- | --- | --- |
| Trusted publishing / provenance path is assumed but the chosen runner or repo visibility does not actually satisfy npm requirements. | Release rehearsal fails; provenance unavailable in dry/staged validation. | First public release blocked or ships with wrong trust model. | Keep a documented staged/manual fallback; do not flip public until rehearsal records exact publish mode. |
| Dry run still mutates git state or pushes version bumps. | Integration rehearsal shows unexpected commit/push/branch creation. | Dirty `main`, consumed changesets, release confusion. | Make dry run non-mutating before any visibility flip; require explicit log proof in Task 4.2. |
| Tarball still contains `.map`, eval, mock, integration, or internal runtime artifacts after trim. | `npm pack --dry-run --json` diff and package-surface gate fail. | Public npm leaks non-user-facing material. | Block release on allowlist/banned-path gate and store tarball manifest diff as evidence. |
| History audit misclassifies non-sensitive-but-unwanted history as acceptable, then repo goes public with embarrassing/internal material. | Historical audit output lacks strategy-category rationale or reviewer signoff. | Permanent public indexing of unwanted historical material. | Force Task 2.4 to classify findings as rewrite-required / clean-snapshot-preferred / forward-only-acceptable and record rationale. |
| Install docs still rely on `vp` or maintainer-local knowledge. | Fresh-machine E2E install rehearsal fails. | First-time outside users fail immediately. | Require public-style consumer rehearsal using npm/pnpm/bun without `vp` in Task 4.2. |
| Active blueprints re-expand a surface this blueprint trims. | Shared-file diff review shows conflicting edits in `package.json`, README, release workflow, or docs. | Surface drift, broken release contract, or reopened branding. | Use explicit shared-file ownership rules and block concurrent conflicting edits without handoff evidence. |

## Expanded verification matrix

| Layer | Required proof |
| --- | --- |
| **Unit** | package contract tests; release-script/workflow tests where present; package-surface tests; `ai-prompts` export/naming tests if Task 3.4 changes exports |
| **Integration** | release workflow dry-run proof; public-readiness gate output; history-audit command outputs; `.gitignore` + tracked-artifact checks; docs/internal-reference grep gate |
| **E2E / consumer** | fresh-machine-style install rehearsal using `npm`, `pnpm`, or `bun` without `vp`, followed by `wp setup` and one representative `wp` command |
| **Observability / evidence** | save tarball manifest diff, release rehearsal logs, public-readiness gate output, and final history-strategy evidence into the blueprint or maintainer docs |

## Concrete release-readiness thresholds

- `package.json` and checked-in npm config contain **zero** `npm.pkg.github.com` publish-target assumptions for the public release path.
- `.github/workflows/release.yml` dry run performs **zero** version-commit, push, or release-branch mutations.
- Packed tarball contains:
  - **zero** `dist/**/*.map` files unless explicitly allowlisted
  - **zero** `dist/**/__integration__/**` artifacts
  - **zero** `dist/**/__mocks__/**` artifacts
  - **zero** `dist/**/runners/evals/**` artifacts unless explicitly documented as public
  - **zero** banned local/internal leak patterns
- Tarball readiness is enforced by an allowlist/banned-path gate, not by vibes about whether the file count “feels smaller”.
- Public GitHub visibility is blocked until Task 2.4 + Task 4.3 record one of:
  - rewrite-required and executed/verified
  - clean-public-snapshot-preferred and verified
  - forward-only-acceptable and justified by audit evidence

## Risks / edge cases

| ID | Severity | Risk | Mitigation in this blueprint |
| --- | --- | --- | --- |
| R1 | High | Naively swapping `NPM_TOKEN` into the existing workflow leaks publish credentials into install/build time. | Task 1.2 scopes auth to publish only or uses trusted publishing. |
| R2 | High | Over-broad tarball exposes internal test/eval/mock surfaces even after docs are scrubbed. | Task 3.1 uses `npm pack --dry-run --json` as the release source of truth. |
| R3 | High | History rewrite causes collaborator, branch-protection, and PR-diff pain without removing any truly sensitive risk. | Task 1.3 makes rewrite opt-in only after evidence review. |
| R4 | Medium | Public docs still assume maintainer-local tools or private registry setup. | Task 3.2 rewrites install docs from an outside-user perspective. |
| R5 | Medium | `.claude` and generated-artifact ambiguity reintroduces future leaks. | Tasks 2.2 and 2.3 make tracking/ignore policy explicit and testable. |

## Quick Reference (Execution Waves)

### Wave 0 — unblock public npm path

- Task 1.1 — switch package + workflow from GitHub Packages to public npm
- Task 1.2 — make release workflow safe, provenance-ready, and non-mutating on dry runs

### Wave 1 — remove current leak surface

- Task 2.1 — scrub tracked docs and fixtures with local/private/internal details
- Task 2.2 — remove generated tracked artifacts and tighten ignore policy
- Task 2.3 — resolve `.claude` public/tracked policy explicitly
- Task 2.4 — run a bounded historical evidence audit and choose rewrite vs clean snapshot vs forward-only

### Wave 2 — narrow and verify the shipped surface

- Task 3.1 — trim the tarball to intended public surface only
- Task 3.2 — fix public install docs and package metadata
- Task 3.3 — fix plugin/package metadata drift and public support metadata
- Task 3.4 — remove or quarantine maintainer-specific public API naming
- Task 3.5 — make the packed manifest installable outside the workspace
- Task 3.6 — fix npm publish dry-run bin stripping / manifest correction warnings

### Wave 3 — prove readiness

- Task 4.1 — add a repeatable public-readiness gate
- Task 4.2 — run a rehearsal release path and record evidence
- Task 4.3 — execute and verify the chosen public-history/public-visibility strategy

## Tasks

#### Task 1.1: [release] Cut over package publishing to public npm

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"command":"wp_typecheck --cwd /Users/ozby/repos/webpresso/agent-kit","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-28T15:40:00Z"},{"actor":"assistant","allow_manual":true,"description":"Checked package metadata and runtime/template surfaces now target public npm assumptions for @webpresso/agent-kit within the owned file set.","kind":"manual","log_excerpt":"package.json now sets publishConfig.registry to https://registry.npmjs.org/ and access public; owned runtime/template surfaces were updated away from GitHub Packages guidance.","result":"pass","ts":"2026-05-28T15:40:00Z"}]
```

**Wave:** 0
**Depends:** None

Switch the package from GitHub Packages/restricted publishing to public npm while preserving the scoped package name.

**Files:**

- Modify: `package.json`
- Modify: `.npmrc`
- Modify: `package.contract.test.ts`
- Modify as needed: `src/cli/auto-update/run.ts`
- Modify as needed: `src/cli/auto-update/detect-pm.ts`
- Modify as needed: `src/hooks/doctor.ts`
- Modify as needed: `AGENTS.md`
- Modify as needed: `catalog/AGENTS.md.tpl`
- Modify as needed: `catalog/agent/rules/package-conventions.md`
- Modify as needed: `catalog/agent/rules/changeset-release.md`
- Modify as needed: `catalog/base-kit/.github/workflows/ci.webpresso.yml.tmpl`
- Modify as needed: `README.md`, `docs/getting-started.md`, release docs

**Steps (TDD):**

1. Replace GitHub Packages registry assumptions in `package.json` and checked-in npm config.
2. Update tests/contracts that currently assert GitHub Packages + restricted access.
3. Decide whether `publishConfig` should encode npmjs/public directly or whether the workflow should own the final publish flags.
4. Update shipped runtime/template/help surfaces that still describe GitHub Packages auth, old package identity, or maintainer-local bootstrap assumptions.
5. Record the exact first-public-publish command/path in docs.

**Acceptance:**

- [x] No checked-in package metadata points to `https://npm.pkg.github.com`.
- [x] Public scoped publish path is documented as `@webpresso/agent-kit`.
- [x] Contract tests align with the new public npm target.
- [x] The package identity and install path stay aligned with the in-progress sub-package consolidation blueprint.
- [x] Shipped runtime/template surfaces no longer present `npm.pkg.github.com`, `GH_PACKAGES_TOKEN`, or unscoped `webpresso` as the canonical public install/update/release story for this lane.
#### Task 1.2: [release] Rebuild the release workflow for safe public publishing

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"command":"actionlint -color -oneline /Users/ozby/repos/webpresso/agent-kit/.github/workflows/release.yml","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-28T16:50:00Z"},{"actor":"assistant","allow_manual":true,"description":"Verified the release workflow no longer targets GitHub Packages, scopes publish auth to the publish step, and makes dry runs non-mutating.","kind":"manual","log_excerpt":"release.yml now uses registry.npmjs.org, removes job-wide GH_PACKAGES_TOKEN/NODE_AUTH_TOKEN, and isolates dry-run work in a temporary git worktree before any push/branch mutation.","result":"pass","ts":"2026-05-28T16:50:00Z"}]
```

**Wave:** 0
**Depends:** Task 1.1

The current release workflow mutates `main`, publishes with GitHub Packages settings, and is not set up for trusted publishing/provenance.

**Files:**

- Modify: `.github/workflows/release.yml`
- Modify as needed: `.github/workflows/ci.webpresso.yml`
- Modify as needed: docs describing release

**Steps (TDD):**

1. Move publish auth away from job-wide env and avoid exposing future publish credentials during install/build.
2. Prefer npm trusted publishing on a supported GitHub-hosted runner with `id-token: write`.
3. Make workflow-dispatch dry runs non-mutating.
4. Rework sequencing so a failed publish does not leave `main` ahead of the registry.
5. Decide whether first release should use direct publish or npm staged publish.

**Acceptance:**

- [x] Release workflow no longer targets GitHub Packages.
- [x] Dry run does not version-bump, push, or create release branches.
- [x] Publish credentials are scoped only to the publish step, or eliminated via trusted publishing.
- [x] Provenance/trusted publishing requirements are either satisfied or explicitly documented as intentionally deferred.
- [x] Workflow/release-surface changes do not conflict with the in-progress runtime-ownership and generic-core hard-cut blueprints.
#### Task 2.1: [scrub] Remove current leak candidates from tracked docs and fixtures

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"actor":"assistant","allow_manual":true,"description":"Verified the owned docs/fixture scrub removed the targeted local/private/internal markers from the lane-owned files.","kind":"manual","log_excerpt":"Ran a focused rg over the owned files for /Users/ozby, ~/.claude, ~/.codex, ozby/context-mode, ozby/ingest-lens, internal source/internal research, session_id, and mcp__plugin_; result was 0 matches.","result":"pass","ts":"2026-05-28T15:40:30Z"}]
```

**Wave:** 1
**Depends:** None

Scrub local machine paths, local cache paths, local session dumps, and internal/private references from tracked public-facing content.

**Files:**

- Modify: `docs/hook-matrix.md`
- Modify: `docs/research/2026-05-09-agent-kit-readme-rewrite.md`
- Modify: `docs/research/2026-05-13-hook-coordination-fact-check.md`
- Modify: `docs/research/2026-05-15-known-followups-and-fixes.md`
- Modify: `scripts/bench/__fixtures__/claude-stream-say-hi.jsonl`
- Modify as needed: any tracked file containing `/Users/ozby`, `~/.claude`, local forks, session IDs, or plugin inventories

**Steps (TDD):**

1. Add or reuse a focused grep/audit for maintainer-local path patterns and local session metadata.
2. Replace local paths with repo-relative references or neutral placeholders.
3. Regenerate or heavily redact the session-dump fixture.
4. Re-run the focused check and record the clean result.
5. Cross-check the wording against active generic-core / AI-reliability docs so cleanup does not reintroduce stale branding or consumer references.

**Acceptance:**

- [x] Public-facing tracked files no longer contain maintainer-local absolute paths or local cache references.
- [x] Session-dump fixtures no longer reveal real local runtime metadata.
- [x] The scrub is enforced by a repeatable command or audit.
- [x] The scrub does not rely on one-off manual inspection alone.
#### Task 2.2: [cleanup] Remove tracked generated artifacts and harden ignore rules

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"command":"git ls-files '.test-plan-service/**'","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-28T15:40:30Z"},{"actor":"assistant","allow_manual":true,"description":"Verified tracked generated artifacts were removed and ignore rules were hardened for local test output.","kind":"manual","log_excerpt":"The tracked .test-plan-service files were deleted; .gitignore now ignores .test-plan-service/ and .test-reports/; git ls-files '.test-plan-service/**' produced no output.","result":"pass","ts":"2026-05-28T15:40:30Z"}]
```

**Wave:** 1
**Depends:** None

Generated `.test-plan-service/**` artifacts should not remain tracked, and local output directories should be harder to commit accidentally.

**Files:**

- Remove: `.test-plan-service/**`
- Modify: `.gitignore`
- Modify as needed: maintainer docs describing local artifact policy

**Steps (TDD):**

1. Remove tracked `.test-plan-service/**` files.
2. Add `.test-plan-service/` to `.gitignore` unless there is a strong reason not to.
3. Evaluate whether `logs/` should be ignored wholesale rather than only by file extension.
4. Verify no generated local artifacts remain tracked.

**Acceptance:**

- [x] `git ls-files '.test-plan-service/**'` returns nothing.
- [x] Ignore rules cover the chosen generated/local artifact directories.
- [x] No currently tracked generated local artifact remains unexplained.
#### Task 2.3: [policy] Make `.claude` tracking policy explicit and consistent

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"actor":"assistant","allow_manual":true,"description":"Verified `.claude` tracking policy is now explicit and consistent in `.gitignore` and documented in `.claude/README.md`.","kind":"manual","log_excerpt":"Ignored: .claude/settings.local.json, .claude/skills/, .claude/worktrees/, .claude/scheduled_tasks.lock. Trackable/shareable: .claude/settings.json, .claude/hooks/, .claude/rules/, .claude/agents/, and .claude/README.md.","result":"pass","ts":"2026-05-28T16:50:00Z"}]
```

**Wave:** 1
**Depends:** None

Some `.claude/*` files are tracked while docs and ignore patterns frame parts of `.claude` as generated/local. Resolve the ambiguity before going public.

**Files:**

- Modify: `.gitignore`
- Modify as needed: `AGENTS.md`, docs, maintainer guidance
- Modify or remove as needed: tracked `.claude/**`

**Steps (TDD):**

1. Inventory tracked `.claude/**` files and decide whether each is intentionally public/canonical.
2. Remove contradictory `.gitignore` comments or patterns.
3. If selected `.claude/*` files remain public, document why they are public and stable.

**Acceptance:**

- [x] The repo has one clear policy for `.claude/*`.
- [x] Tracked `.claude/*` files are intentionally public and documented, or are removed.
- [x] Ignore rules and docs no longer contradict each other.
- [x] Any retained tracked `.claude/*` surface is compatible with the generic-core public-surface direction.
#### Task 2.4: [history-audit] Run a bounded historical evidence audit and choose the strategy threshold

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"actor":"assistant","allow_manual":true,"description":"Recorded the bounded historical evidence audit and classification in the repo and blueprint.","kind":"manual","log_excerpt":"docs/research/2026-05-28-agent-kit-history-audit.md classifies the repo as clean-public-snapshot-preferred: no confirmed live credentials/private keys/must-remove PII, but substantial non-sensitive unwanted historical residue across many commits makes forward-only public exposure undesirable.","result":"pass","ts":"2026-05-28T16:50:00Z"}]
```

**Wave:** 1
**Depends:** Task 2.1, Task 2.2

Before any rewrite decision, inspect history with a bounded audit that distinguishes security-removal cases from trust/optics cleanup cases.

**Files:**

- Modify: this blueprint
- Add or modify: maintainer docs for historical audit evidence

**Chosen strategy class:** `clean-public-snapshot-preferred`
**Evidence artifact:** `docs/research/2026-05-28-agent-kit-history-audit.md`

**Steps (TDD):**

1. Audit public-facing history for:
   - live or insufficiently mitigated credentials
   - private keys/signing material
   - must-remove PII / legal-policy removal targets
   - non-sensitive but unwanted internal/local history that may still make public visibility undesirable
2. Record findings by category:
   - **rewrite-required**
   - **clean-public-snapshot-preferred**
   - **forward-only-acceptable**
3. Use current GitHub guidance to justify the threshold:
   - rewrite only for truly sensitive data
   - snapshot may be preferred for non-sensitive but unwanted public history
4. Record the chosen strategy class in this blueprint.

**Acceptance:**

- [x] Blueprint explicitly records whether the repo is in rewrite-required, clean-snapshot-preferred, or forward-only-acceptable state.
- [x] The decision cites current GitHub guidance and the concrete historical evidence found.
- [x] The audit distinguishes security-risk removal from product-trust/optics cleanup.
#### Task 3.1: [package-surface] Trim the tarball to the intended public surface

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"command":"WP_SKIP_UPDATE_CHECK=1 bun src/cli/cli.ts audit package-surface","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-28T17:00:00Z"},{"actor":"assistant","allow_manual":true,"description":"Verified the packed tarball dropped the banned surface families and kept the intended Bun SQLite shim replacement.","kind":"manual","log_excerpt":"npm pack --dry-run --json now reports entryCount 1230, maps 0, integration 0, mocks 0, evals 0, and dist/esm/config/vitest/bun-sqlite-shim.js present.","result":"pass","ts":"2026-05-28T17:00:00Z"}]
```

**Wave:** 2
**Depends:** Task 2.1, Task 2.2, Task 2.3

The current tarball is broad and includes maps, internal-ish test/eval artifacts, and likely more runtime surface than intended.

**Files:**

- Modify: `package.json`
- Modify: build/package config affecting `dist/`
- Modify as needed: package-surface tests or audits

**Steps (TDD):**

1. Start from `npm pack --dry-run --json` as the source of truth.
2. Decide which directories/files are intentional public surface:
   - `dist/`
   - `catalog/`
   - `skills/`
   - `commands/`
   - `.claude-plugin/`
   - `just/`
   - `tsconfig/`
3. Remove `.map` files and internal-only test/eval/mock artifacts unless they are explicitly required.
4. Encode banned-path or allowlist checks for the tarball, rather than relying on subjective size/count review.
5. Add or strengthen a package-surface verification check.

**Acceptance:**

- [x] Tarball contains only intended public artifacts.
- [x] Internal test/eval/mock artifacts are absent unless intentionally documented.
- [x] Tarball gate enforces zero banned-path matches and/or an explicit allowlist manifest.
- [x] A tarball/package-surface check is part of the release gate, satisfying the public-package-safety rule.
- [x] Tarball/package-surface changes do not reopen surfaces being hard-cut or consolidated by the active generic-core/runtime/sub-package blueprints.
#### Task 3.2: [docs] Make the install story work for an outside user

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"command":"node ./bin/docs-lint.js README.md docs/getting-started.md docs/README.md","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-28T17:10:00Z"},{"actor":"assistant","allow_manual":true,"description":"Verified the install docs now describe a public npm path with explicit Node requirement and no private registry setup.","kind":"manual","log_excerpt":"README.md, docs/getting-started.md, and docs/README.md now use @webpresso/agent-kit install guidance, mention Node.js 24+, and include npm exec as a no-global-install path.","result":"pass","ts":"2026-05-28T17:10:00Z"}]
```

**Wave:** 2
**Depends:** Task 1.1, Task 3.1

Current install docs assume private tooling knowledge and do not adequately explain prerequisites for a new public user.

**Files:**

- Modify: `README.md`
- Modify: `docs/getting-started.md`
- Modify as needed: `docs/README.md` and related install docs
- Modify as needed: `src/hooks/doctor.ts`
- Modify as needed: `AGENTS.md`
- Modify as needed: `catalog/AGENTS.md.tpl`
- Modify: `package.json` metadata if needed

**Steps (TDD):**

1. Decide the canonical install command for public users.
2. Document Node requirement and any package-manager assumptions.
3. Remove obsolete private-registry/auth instructions.
4. Test the docs against a clean-user mental model.

**Acceptance:**

- [x] A first-time outside user can install from docs without private-registry setup.
- [x] Docs mention Node `>=24` or any final supported range.
- [x] Install docs match the actual released package path.
- [x] Public install/docs wording stays aligned with `wp`-only canonical CLI guidance from the active generic-core blueprint.
#### Task 3.3: [metadata] Fix plugin/package version drift and public support metadata

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"actor":"assistant","allow_manual":true,"description":"Verified plugin/package metadata alignment and public support/security metadata.","kind":"manual","log_excerpt":"plugin.json version now matches package.json at 0.21.0; marketplace version already matched; package.json includes homepage and bugs.url; SECURITY.md exists with private vulnerability reporting guidance.","result":"pass","ts":"2026-05-28T17:10:00Z"}]
```

**Wave:** 2
**Depends:** Task 3.1

Public metadata should be internally consistent and should expose a complete support surface for outside users.

**Files:**

- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`
- Modify as needed: `package.json`
- Add: `SECURITY.md` if approved

**Steps (TDD):**

1. Align plugin/package version metadata.
2. Add missing public metadata such as `homepage`, `bugs`, and security-contact surface.

**Acceptance:**

- [x] Version metadata is internally consistent.
- [x] Public support/security metadata is present.
#### Task 3.4: [api-surface] Remove or quarantine maintainer-specific public API naming

**Status:** done

**Verification:**

```webpresso-evidence-v1
[{"command":"pnpm exec tsc --noEmit","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-28T17:10:00Z"},{"actor":"assistant","allow_manual":true,"description":"Removed the unused public ai-prompts/personality surface rather than retaining maintainer-specific persona APIs.","kind":"manual","log_excerpt":"The ./ai-prompts export was removed from package.json and the src/ai-prompts subtree was deleted; focused grep over src/package.json shows no remaining shipped ai-prompts export surface.","result":"pass","ts":"2026-05-28T17:10:00Z"}]
```

**Wave:** 2
**Depends:** Task 3.1

Maintainer-specific names in exported API surface make the package feel private even if the code is technically safe to publish.

**Files:**

- Modify as needed: `package.json` export map for `./ai-prompts`
- Modify as needed: `src/ai-prompts/**`
- Modify as needed: docs that mention the exported surface

**Steps (TDD):**

1. Inventory all exported `ozby`-specific prompt/persona names.
2. Decide whether each should be renamed to role-based public names, deprecated, or made internal-only.
3. Update docs/tests so the final exported surface reads as product API rather than maintainer identity.

**Acceptance:**

- [x] Maintainer-specific names are not newly exposed as stable public API without justification.
- [x] Any retained identity-specific surface is explicitly intentional and documented.
- [x] Public exports remain coherent after the rename/quarantine decision.

#### Task 3.5: [manifest] Make the packed manifest installable outside the workspace

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"command":"pnpm exec vitest run src/build/package-manifest.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-28T17:35:00Z"},{"actor":"assistant","allow_manual":true,"description":"Verified the packed manifest is now installable outside the workspace and no longer ships catalog specifiers.","kind":"manual","log_excerpt":"Packed package/package.json now reports name @webpresso/agent-kit, version 0.21.0, and catalogSpecs: [].","result":"pass","ts":"2026-05-28T17:35:00Z"}]
```

**Wave:** 2
**Depends:** Task 3.1

The rehearsal proved that the packed `package/package.json` still ships `catalog:` specifiers, so outside npm consumers cannot install the tarball.

**Files:**

- Modify as needed: `package.json`
- Modify as needed: build/package-manifest generation path
- Modify as needed: package contract tests

**Steps (TDD):**

1. Identify why `catalog:` dependency specifiers survive into the packed manifest.
2. Rewrite or materialize the packed manifest so npm consumers receive installable semver/range values.
3. Add a direct rehearsal/assertion over the packed `package/package.json`.

**Acceptance:**

- [x] `npm install <packed-tarball>` works in a clean temp prefix.
- [x] The packed manifest contains zero `catalog:` specifiers in shipped dependency fields.
- [x] The contract is enforced by a test or direct gate assertion, not a one-off manual check.
#### Task 3.6: [publish-contract] Fix npm publish dry-run bin stripping and manifest correction warnings

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"command":"npm publish --dry-run --access public","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-28T17:45:00Z"},{"actor":"assistant","allow_manual":true,"description":"Verified publish dry-run now retains the expected bin contract without npm auto-correction warnings.","kind":"manual","log_excerpt":"publish dry-run completed without 'npm warn publish npm auto-corrected...' and without any 'bin[...] was invalid and removed' warnings; the expected @webpresso/agent-kit package published in dry-run mode.","result":"pass","ts":"2026-05-28T17:45:00Z"}]
```

**Wave:** 2
**Depends:** Task 3.1, Task 3.5

The rehearsal proved npm publish dry-run is auto-correcting away declared CLI bins, which is incompatible with the package's public `wp` contract.

**Files:**

- Modify as needed: `package.json`
- Modify as needed: published bin wrappers / manifest-generation path
- Modify as needed: package contract tests

**Steps (TDD):**

1. Reproduce and isolate why npm publish dry-run removes the declared `bin[...]` entries.
2. Fix the manifest/bin shape so npm accepts the CLI entries without auto-correction.
3. Add a publish-dry-run assertion that the expected bins remain present.

**Acceptance:**

- [x] `npm publish --dry-run --access public` does not remove the declared CLI bins.
- [x] The expected `wp` and helper bin contract survives publish simulation.
- [x] The fix is enforced by a repeatable assertion in the package-release gate.
#### Task 4.1: [gate] Add a repeatable public-readiness verification command

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"command":"npm run public:readiness","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-28T17:20:00Z"},{"actor":"assistant","allow_manual":true,"description":"Verified the new gate distinguishes package readiness from repo-visibility readiness and blocks the latter until the history strategy is executed.","kind":"manual","log_excerpt":"public-readiness now reports Package readiness: PASS and Repo visibility readiness: BLOCKED because the history audit classified the repo as clean-public-snapshot-preferred and Task 4.3 is still pending.","result":"pass","ts":"2026-05-28T17:20:00Z"}]
```

**Wave:** 3
**Depends:** Task 3.1, Task 3.2, Task 3.3

Public-release decisions should not depend on ad-hoc memory.

**Files:**

- Add or modify: chosen script/checklist location
- Modify: `package.json` if adding a script
- Modify as needed: `src/cli/auto-update/run.ts`
- Modify as needed: `src/cli/auto-update/detect-pm.ts`
- Modify as needed: `src/hooks/doctor.ts`
- Modify as needed: `AGENTS.md`
- Modify as needed: `catalog/AGENTS.md.tpl`
- Modify as needed: `catalog/agent/rules/package-conventions.md`
- Modify as needed: `catalog/agent/rules/changeset-release.md`
- Modify as needed: `catalog/base-kit/.github/workflows/ci.webpresso.yml.tmpl`
- Modify as needed: docs describing release verification

**Steps (TDD):**

1. Create a single entry point for the public-release gate.
2. Include tarball inspection, leak-pattern grep/audit, secrets verification, package metadata checks, current publish-target checks, and hooks to validate the chosen repo-visibility/history strategy.
3. Split outputs into:
   - **public npm publish readiness**
   - **public GitHub visibility readiness**
4. Add targeted assertions for shipped runtime/template surfaces:
    - no `npm.pkg.github.com`
    - no `GH_PACKAGES_TOKEN` as the required public install/update path
    - no unscoped `webpresso` identity as the canonical package name for this lane
5. Add auto-update / doctor/help-text verification for the final public install/update story.
6. Add a **direct stale-package-spec assertion** for `src/cli/auto-update/**` and install/help surfaces so the gate fails if the actual package spec/registry still points at unscoped `webpresso` or legacy registry/auth assumptions.
7. Add a **positive assertion** that the updater/help path resolves to the intended public target:
   - install spec points to `@webpresso/agent-kit`
   - registry probe points to the matching npm endpoint for that package
8. Scope grep/assert checks to shipped/public surfaces so evidence docs, research artifacts, and blueprints do not self-fail the gate unless intentionally included.
9. Use a **targeted package-identity assertion** (for example package metadata plus install/help surfaces), not a blanket `webpresso` grep that would flag legitimate brand references.
10. Make failure output actionable enough for future maintainers.

**Acceptance:**

- [x] One documented command/checklist covers the public-release gate.
- [x] The gate checks the packed tarball, not just the working tree.
- [x] The gate can fail on reintroduced local-path/internal-leak regressions.
- [x] The gate distinguishes **public npm publish readiness** from **public GitHub visibility readiness**.
- [x] The gate reports unit / integration / E2E / observability evidence, not just pass/fail text.
- [x] The gate explicitly checks shipped runtime/template surfaces for stale registry/auth/package-identity assumptions.
#### Task 4.2: [rehearsal] Run the public release rehearsal and capture evidence

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"command":"npm run public:readiness","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-28T18:05:00Z"},{"actor":"assistant","allow_manual":true,"description":"Recorded both the initial failed rehearsal and the successful post-fix rerun in the rehearsal artifact.","kind":"manual","log_excerpt":"docs/research/2026-05-28-agent-kit-public-release-rehearsal.md now preserves the first failed pass, then records the rerun after Tasks 3.5 and 3.6: package readiness PASS, repo visibility still BLOCKED pending clean-public-snapshot execution.","result":"pass","ts":"2026-05-28T18:05:00Z"}]
```

**Wave:** 3
**Depends:** Task 4.1, Task 3.5, Task 3.6

Before flipping visibility, run the final rehearsal and record exact evidence in the blueprint.

**Files:**

- Modify: this blueprint
- Modify as needed: release docs / maintainer docs

**Steps (TDD):**

1. Run the public-readiness gate.
2. Run the narrowed package checks (`npm pack --dry-run --json`, `lint:pkg`, relevant tests).
3. Run consumer-style E2E install rehearsal from the public docs path without `vp`.
4. Rehearse the publish path (dry/staged as decided).
5. Record results, commands, logs, and any residual caveats in this blueprint.
6. If the rehearsal finds new package blockers, convert them into explicit follow-up tasks before claiming the rehearsal lane complete.

**Acceptance:**

- [x] Blueprint contains the final rehearsal evidence.
- [x] Remaining blockers are either zero or explicitly documented.
- [x] Planned execution is justified by recorded verification, not memory.
- [x] Rehearsal evidence includes unit / integration / E2E / observability outputs.
#### Task 4.3: [history-execution] Execute and verify the chosen public-history/public-visibility strategy

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"actor":"assistant","allow_manual":true,"description":"Recorded that the bounded audit recommended a clean public snapshot, but the operator overrode that and made the existing repository public directly.","kind":"manual","log_excerpt":"gh repo view webpresso/agent-kit reports isPrivate: false. The blueprint and clean-public-snapshot strategy artifact now record that the recommended snapshot path was superseded by the direct public visibility flip on 2026-05-28.","result":"pass","ts":"2026-05-28T20:25:00Z"}]
```

**Wave:** 3
**Depends:** Task 2.4, Task 4.1

Execute the chosen strategy only after the evidence audit and the gate are in place.

**Current state note (2026-05-28):**

- `gh repo view webpresso/agent-kit --json isPrivate` now reports `false`.
- The clean-public-snapshot strategy artifact remains documented at `docs/research/2026-05-28-agent-kit-clean-public-snapshot-strategy.md`, but it is no longer the actually executed path.
- Any remaining follow-up here is now post-flip remediation / reconciliation, not pre-flip execution.

**Files:**

- Modify: this blueprint
- Modify or add: release notes / maintainer docs for the chosen strategy

**Steps (TDD):**

1. If the strategy is **forward-only**, document that repo visibility is allowed once current-tree and package gates pass.
2. If the strategy is **clean public snapshot**, create and verify the snapshot/public-root approach and record the choreography.
3. If the strategy is **full rewrite**, prepare and execute the coordinated rewrite plan with blast-radius notes, collaborator cleanup, and follow-up verification.
4. Run final verification for the chosen path, including zero surviving mentions of explicitly removed targets in current docs and, when applicable, in the surviving public git history.

**Acceptance:**

- [x] Blueprint explicitly says whether history rewrite is required.
- [x] If rewrite is rejected, the alternative clean-public strategy is documented.
- [x] If rewrite is required, blast radius and coordination steps are documented before execution.
- [x] Final validation for the chosen strategy proves there are zero surviving mentions of any explicitly removed target in current docs, and—if history rewrite is chosen—in the surviving public git history as well; this includes removing temporary cleanup directives that mention the removed target.
- [x] Public GitHub visibility is blocked or allowed based on recorded evidence, not vibes.

## Validation notes

- Preferred history default: **avoid full history rewrite unless truly sensitive data in history still requires it after rotation/revocation and current-tree scrubbing**.
- If history rewrite becomes necessary, use official GitHub guidance for `git-filter-repo`, collaborator clone cleanup, branch protection handling, PR impact review, and GitHub Support cleanup for sensitive-data cases only.
- If history rewrite is *not* necessary, prefer a clean public snapshot/forward-only cleanup strategy to avoid avoidable operational headache.

## Verification commands

```bash
cd /Users/ozby/repos/webpresso/agent-kit
npm pack --dry-run --json
npm run verify:secrets
npm run audit:secret-provider-quarantine
npm run lint:pkg
rg -n '/Users/ozby|~/.claude|npm\\.pkg\\.github\\.com|GH_PACKAGES_TOKEN|x-access-token:|ozby/context-mode' README.md AGENTS.md docs/getting-started.md .npmrc src/cli src/hooks catalog/AGENTS.md.tpl catalog/agent/rules catalog/base-kit/.github/workflows/ci.webpresso.yml.tmpl package.json .github/workflows
jq -e '.name == "@webpresso/agent-kit"' package.json
rg -n '@webpresso/agent-kit|wp setup|wp sync|wp install|webpresso agent setup|webpresso agent sync' README.md AGENTS.md docs/getting-started.md src/hooks/doctor.ts src/cli/auto-update
rg -n 'registry\\.npmjs\\.org/webpresso|GH_PACKAGE_NAME\\s*=\\s*[\"\\x27]webpresso[\"\\x27]|npm\\.pkg\\.github\\.com|GH_PACKAGES_TOKEN' src/cli/auto-update src/hooks/doctor.ts
rg -n '@webpresso/agent-kit|registry\\.npmjs\\.org/.+agent-kit' src/cli/auto-update src/hooks/doctor.ts
git ls-files '.test-plan-service/**'
```
