---
type: blueprint
title: Agent Kit public npm cutover implementation
status: planned
complexity: L
owner: ozby
created: 2026-05-28T00:00:00.000Z
last_updated: 2026-05-28T00:00:00.000Z
---

## Product wedge anchor

- **Stage outcome:** `@webpresso/agent-kit` can be published publicly on npm from a public GitHub repo without leaking local/private/internal material, and the release path is reproducible for future releases.
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
- **Safety rule:** do not make repo/package public until the packed tarball, release workflow, and public docs all pass the new public-readiness gate.

## Cross-plan references

- `blueprints/completed/agent-kit-public-release-scrub/_overview.md` — prior scrub plan and earlier public-history strategy lane.
- `docs/research/2026-05-28-public-npm-cutover-checklist.md` — current audit-driven ranked checklist.
- `blueprints/planned/mcp-first-secret-surface-hard-cut-roadmap/_overview.md` — related secret-surface hardening context.

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

### Wave 2 — narrow and verify the shipped surface

- Task 3.1 — trim the tarball to intended public surface only
- Task 3.2 — fix public install docs and package metadata
- Task 3.3 — fix plugin/package metadata drift and public support metadata
- Task 3.4 — remove or quarantine maintainer-specific public API naming

### Wave 3 — prove readiness

- Task 1.3 — define and document the history strategy decision gate
- Task 4.1 — add a repeatable public-readiness gate
- Task 4.2 — run a rehearsal release path and record evidence

## Tasks

#### Task 1.1: [release] Cut over package publishing to public npm

**Status:** todo
**Wave:** 0
**Depends:** None

Switch the package from GitHub Packages/restricted publishing to public npm while preserving the scoped package name.

**Files:**

- Modify: `package.json`
- Modify: `.npmrc`
- Modify: `package.contract.test.ts`
- Modify as needed: `README.md`, `docs/getting-started.md`, release docs

**Steps (TDD):**

1. Replace GitHub Packages registry assumptions in `package.json` and checked-in npm config.
2. Update tests/contracts that currently assert GitHub Packages + restricted access.
3. Decide whether `publishConfig` should encode npmjs/public directly or whether the workflow should own the final publish flags.
4. Record the exact first-public-publish command/path in docs.

**Acceptance:**

- [ ] No checked-in package metadata points to `https://npm.pkg.github.com`.
- [ ] Public scoped publish path is documented as `@webpresso/agent-kit`.
- [ ] Contract tests align with the new public npm target.

#### Task 1.2: [release] Rebuild the release workflow for safe public publishing

**Status:** todo
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

- [ ] Release workflow no longer targets GitHub Packages.
- [ ] Dry run does not version-bump, push, or create release branches.
- [ ] Publish credentials are scoped only to the publish step, or eliminated via trusted publishing.
- [ ] Provenance/trusted publishing requirements are either satisfied or explicitly documented as intentionally deferred.

#### Task 1.3: [history] Decide the public-history strategy without creating unnecessary pain

**Status:** todo
**Wave:** 3
**Depends:** Task 2.1, Task 2.2, Task 4.1

History rewriting can break PR diffs, signatures, branch protections, open PRs, and collaborator clones. Use it only when justified.

**Files:**

- Modify: this blueprint
- Modify or add: release notes / maintainer docs for the chosen strategy

**Steps (TDD):**

1. Inventory whether any **truly sensitive** historical content remains:
   - real secrets that were not rotated/revoked
   - PII or material that must be removed, not merely embarrassing/internal references
2. If the answer is no, choose a **forward-only** strategy:
   - scrub current tree
   - remove generated junk
   - optionally publish from a clean public snapshot/new public root if needed
3. If the answer is yes, prepare a coordinated history-rewrite plan with explicit blast-radius notes and cleanup steps.
4. Record the decision and rationale in this blueprint before promotion out of draft.

**Acceptance:**

- [ ] Blueprint explicitly says whether history rewrite is required.
- [ ] If rewrite is rejected, the alternative clean-public strategy is documented.
- [ ] If rewrite is required, blast radius and coordination steps are documented before execution.
- [ ] The decision cites current GitHub guidance and the specific evidence that made rewrite necessary or unnecessary.
- [ ] Final validation for the chosen strategy proves there are zero surviving mentions of any explicitly removed target in current docs, and—if history rewrite is chosen—in the surviving public git history as well; this includes removing temporary cleanup directives that mention the removed target.

#### Task 2.1: [scrub] Remove current leak candidates from tracked docs and fixtures

**Status:** todo
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

**Acceptance:**

- [ ] Public-facing tracked files no longer contain maintainer-local absolute paths or local cache references.
- [ ] Session-dump fixtures no longer reveal real local runtime metadata.
- [ ] The scrub is enforced by a repeatable command or audit.
- [ ] The scrub does not rely on one-off manual inspection alone.

#### Task 2.2: [cleanup] Remove tracked generated artifacts and harden ignore rules

**Status:** todo
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

- [ ] `git ls-files '.test-plan-service/**'` returns nothing.
- [ ] Ignore rules cover the chosen generated/local artifact directories.
- [ ] No currently tracked generated local artifact remains unexplained.

#### Task 2.3: [policy] Make `.claude` tracking policy explicit and consistent

**Status:** todo
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

- [ ] The repo has one clear policy for `.claude/*`.
- [ ] Tracked `.claude/*` files are intentionally public and documented, or are removed.
- [ ] Ignore rules and docs no longer contradict each other.

#### Task 3.1: [package-surface] Trim the tarball to the intended public surface

**Status:** todo
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
4. Add or strengthen a package-surface verification check.

**Acceptance:**

- [ ] Tarball contains only intended public artifacts.
- [ ] Internal test/eval/mock artifacts are absent unless intentionally documented.
- [ ] Tarball size and file count drop to a justified level.
- [ ] A tarball/package-surface check is part of the release gate, satisfying the public-package-safety rule.

#### Task 3.2: [docs] Make the install story work for an outside user

**Status:** todo
**Wave:** 2
**Depends:** Task 1.1, Task 3.1

Current install docs assume private tooling knowledge and do not adequately explain prerequisites for a new public user.

**Files:**

- Modify: `README.md`
- Modify: `docs/getting-started.md`
- Modify as needed: `docs/README.md` and related install docs
- Modify: `package.json` metadata if needed

**Steps (TDD):**

1. Decide the canonical install command for public users.
2. Document Node requirement and any package-manager assumptions.
3. Remove obsolete private-registry/auth instructions.
4. Test the docs against a clean-user mental model.

**Acceptance:**

- [ ] A first-time outside user can install from docs without private-registry setup.
- [ ] Docs mention Node `>=24` or any final supported range.
- [ ] Install docs match the actual released package path.

#### Task 3.3: [metadata] Fix plugin/package version drift and public support metadata

**Status:** todo
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

- [ ] Version metadata is internally consistent.
- [ ] Public support/security metadata is present.

#### Task 3.4: [api-surface] Remove or quarantine maintainer-specific public API naming

**Status:** todo
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

- [ ] Maintainer-specific names are not newly exposed as stable public API without justification.
- [ ] Any retained identity-specific surface is explicitly intentional and documented.
- [ ] Public exports remain coherent after the rename/quarantine decision.

#### Task 4.1: [gate] Add a repeatable public-readiness verification command

**Status:** todo
**Wave:** 3
**Depends:** Task 3.1, Task 3.2, Task 3.3

Public-release decisions should not depend on ad-hoc memory.

**Files:**

- Add or modify: chosen script/checklist location
- Modify: `package.json` if adding a script
- Modify as needed: docs describing release verification

**Steps (TDD):**

1. Create a single entry point for the public-release gate.
2. Include tarball inspection, leak-pattern grep/audit, secrets verification, package metadata checks, and current publish-target checks.
3. Make failure output actionable enough for future maintainers.

**Acceptance:**

- [ ] One documented command/checklist covers the public-release gate.
- [ ] The gate checks the packed tarball, not just the working tree.
- [ ] The gate can fail on reintroduced local-path/internal-leak regressions.

#### Task 4.2: [rehearsal] Run the public release rehearsal and capture evidence

**Status:** todo
**Wave:** 3
**Depends:** Task 4.1

Before flipping visibility, run the final rehearsal and record exact evidence in the blueprint.

**Files:**

- Modify: this blueprint
- Modify as needed: release docs / maintainer docs

**Steps (TDD):**

1. Run the public-readiness gate.
2. Run the narrowed package checks (`npm pack --dry-run --json`, `lint:pkg`, relevant tests).
3. Rehearse the publish path (dry/staged as decided).
4. Record results, commands, and any residual caveats in this blueprint.

**Acceptance:**

- [ ] Blueprint contains the final rehearsal evidence.
- [ ] Remaining blockers are either zero or explicitly documented.
- [ ] Promotion from draft is justified by recorded verification, not memory.

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
rg -n '/Users/ozby|~/.claude|npm\\.pkg\\.github\\.com|GH_PACKAGES_TOKEN|x-access-token:|ozby/context-mode' .
git ls-files '.test-plan-service/**'
```
