---
type: blueprint
title: Agent Kit Changesets Action release migration
status: completed
complexity: L
owner: ozby
historical_verification_gap_waiver: true
historical_verification_gap_rationale: Historical completed/parked record predates the durable per-task verification convention; retain lifecycle truth without fabricating retroactive evidence.
created: 2026-05-28T00:00:00.000Z
last_updated: '2026-05-28'
progress: '100% (7/7 tasks done, 0 blocked, updated 2026-05-29)'
---

## Product wedge anchor

- **Stage outcome:** `@webpresso/agent-kit` releases through a standard Changesets Action flow on GitHub Actions, with explicit public npm access, provenance, and marketplace compatibility behavior.
- **Consuming surface:** `.github/workflows/release.yml`, `.changeset/config.json`, `package.json`, release docs/tests, and marketplace compatibility consumers of `release/v<version>`.
- **New user-visible capability:** maintainers can merge a version PR and let GitHub Actions publish the package safely without ad hoc local release commands.

## Summary

Migrate the repo from the current custom direct-publish release workflow to a Changesets Action-driven release model. Keep the important existing contracts explicit:

- `pnpm run version` remains the single versioning path and must preserve marketplace version sync
- `v<version>` tags the published version-bump commit on `main`
- `release/v<version>` remains a separate compatibility branch carrying the `dist/` commit for marketplace consumers
- GitHub Releases are **not** auto-created in the initial rollout
- production cutover is blocked until a sandbox trusted-publishing rehearsal proves the exact OIDC/tag/branch/no-release behavior

This blueprint explicitly accepts the loss of the current “publish succeeds before `main` is version-bumped” invariant as part of the migration, but only with guardrails and rollback handling documented up front.

## Evidence-grounded repo facts

- `.github/workflows/release.yml` is currently a custom worktree-based direct-publish flow.
- `.changeset/config.json` currently sets `"access": "restricted"`.
- `package.json` currently sets `publishConfig.access` to `public` and keeps `scripts.version = "changeset version && vp run sync-marketplace-version"`.
- `scripts/sync-marketplace-version.ts` is the marketplace manifest sync mechanism.
- `scripts/release.ts` and `scripts/release.test.ts` currently model `release/v<version>` dist-branch behavior.
- `src/build/auth-preflight-packages.test.ts`, `src/build/validate-marketplace.test.ts`, and `package.contract.test.ts` are concrete release-contract tests.
- `catalog/AGENTS.md.tpl` is the editable source of truth; `AGENTS.md` is generated/managed output.

## Key decisions

- **Release driver:** use `changesets/action` as the orchestrator.
- **Publish path:** use `pnpm run release:publish`, which must call `npm publish --provenance --access public`.
- **Access contract:** `.changeset/config.json` and `package.json#publishConfig.access` must both say `public`.
- **Tag semantics:** `v<version>` tags the published version-bump commit on `main`.
- **Compatibility branch:** `release/v<version>` is a separate branch for the dist-carrying marketplace commit.
- **GitHub Release object:** disabled initially.
- **Trusted-publishing gate:** sandbox proof first, production cutover second.

## Cross-plan references

- `blueprints/in-progress/agent-kit-public-npm-cutover-implementation/_overview.md` — public npm/package-surface hardening already done; this migration must preserve those contracts.
- `.omx/plans/ralplan-dr-agent-kit-changesets-action-release-flow-20260528.md` — consensus planning artifact for this migration.

## Technology choices

| Area | Choice | Why |
| --- | --- | --- |
| Release orchestrator | `changesets/action@v1` | Standardizes the PR + publish flow while keeping explicit repo-owned hooks for non-default behavior. |
| Version step | `pnpm run version` | Preserves the existing `changeset version && vp run sync-marketplace-version` contract so marketplace metadata stays aligned. |
| Publish step | `pnpm run release:publish` → `npm publish --provenance --access public` | Keeps the public-access contract explicit and provenance-ready. |
| Auth model | npm trusted publishing / OIDC first | Eliminates long-lived publish-token dependence after rehearsal proof. |
| Marketplace compatibility | retain `release/v<version>` branch initially | Preserves the dist-carrying consumer path during the migration. |
| GitHub Releases | disabled initially | Avoids adding another public contract surface until the new workflow is proven. |

## Risks

| ID | Severity | Risk | Mitigation |
| --- | --- | --- | --- |
| R1 | High | Version PR merges but publish fails, leaving `main` ahead of the registry | Explicitly accept the atomicity tradeoff, add rollback procedure, and gate completion on successful publish or clean revert. |
| R2 | High | Marketplace version drift breaks plugin consumers | Keep `pnpm run version` canonical and require `src/build/validate-marketplace.test.ts` in the release gate. |
| R3 | High | Trusted publishing works in sandbox but fails in prod | Require sandbox OIDC proof with exact evidence before production cutover. |
| R4 | Medium | Tag/branch semantics drift and downstream consumers pin the wrong artifact | Lock `v<version>` on the mainline version-bump commit and `release/v<version>` on the dist compatibility branch. |
| R5 | Medium | Generated release docs drift from source templates | Treat `catalog/AGENTS.md.tpl` as source of truth and require `wp sync --check`. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| --- | --- | --- | --- | --- |
| **Wave 0** | 1.1, 1.2 | None / 1.1 partial | 2 lanes | S-M |
| **Wave 1** | 2.1, 2.2, 2.3 | Wave 0 | 3 lanes | S-M |
| **Wave 2** | 3.1, 3.2 | Wave 1 / 3.1 | 1-2 lanes | M |
| **Critical path** | 1.1 → 1.2 → 2.2 → 2.3 → 3.1 → 3.2 | — | 6 steps | L |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| --- | --- | --- | --- |
| RW0 | Ready tasks in Wave 0 | ≥ 2 | 2 |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 6 / 6 = 1.0 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 5 / 6 = 0.83 |
| CP | same-file overlaps per wave | 0 | 0 |

Refinement delta:
- This plan is intentionally **not highly parallel** because the release contract surfaces (`release.yml`, `.changeset/config.json`, `package.json`) are tightly coupled and high-risk. We optimize for correctness over width.

## Pre-mortem + rollback matrix

| Scenario | Detector | Blast radius | Operator action | Stop/go rule |
| --- | --- | --- | --- | --- |
| Version PR merged but publish fails | `changesets/action` publish step fails; `npm view <pkg>@<version>` missing | `main` has bumped version/changelog/marketplace, registry does not | fix publish root cause and rerun safely, or revert merged version PR before tags/branches | **STOP** until published or cleanly reverted |
| Publish succeeds but tag fails | npm version exists; `git rev-parse v<version>^{commit}` fails | registry state ahead of source-of-truth tag | create/verify tag from published version-bump commit on `main` | **STOP** until tag proof passes |
| Tag succeeds but `release/v<version>` push fails | tag exists; remote branch missing | marketplace/dist-branch consumers break | recreate/push compatibility branch and rerun consumer smoke | **STOP** until branch and smoke pass |
| Rerun on already-published version | publish logs match already-published path | risk of duplicate artifact churn only | treat publish as idempotent success; verify tag + branch state only | **GO** only if artifact proofs pass |
| Sandbox OIDC works but prod OIDC fails | sandbox proof passes, prod auth fails | prod cutover blocked | verify trusted-publisher binding, repo/env mapping, fallback policy | **STOP** prod cutover |
| `wp sync --check` or generated docs drift after versioning | sync/doc checks fail after versioning | release guidance diverges from source of truth | regenerate from source, recommit, rerun checks | **STOP** until clean |

## Tasks

#### Task 1.1: [decision] Lock release semantics and public publish contract

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"command":"actionlint .github/workflows/release.yml","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-28T22:29:00Z"},{"actor":"assistant","allow_manual":true,"description":"Verified the release driver/public access contract now uses Changesets Action with explicit public publish settings.","kind":"manual","log_excerpt":"release.yml now uses changesets/action@v1 with version=pnpm run version and publish=pnpm run release:publish; .changeset/config.json access is public; package.json publishConfig.access is public; release:publish is defined.","result":"pass","ts":"2026-05-28T22:29:00Z"}]
```

**Wave:** 0
**Depends:** None

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `.changeset/config.json`
- Modify: `package.json`

**Steps (TDD):**
1. Replace the current bespoke workflow driver with `changesets/action`.
2. Keep `pnpm run version` as the canonical version path.
3. Add `release:publish` and make it call `npm publish --provenance --access public`.
4. Set `.changeset/config.json#access` to `public`.
5. Document the accepted atomicity tradeoff explicitly in the blueprint and release docs/tests.

**Acceptance:**
- [x] Workflow uses `changesets/action`.
- [x] `version: pnpm run version`
- [x] `publish: pnpm run release:publish`
- [x] `.changeset/config.json` and `package.json` both encode public access.
- [x] `release:publish` is the only publish command path used by CI.
#### Task 1.2: [contract] Lock tag / compatibility-branch / no-release-object behavior

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"command":"pnpm exec vitest run src/build/auth-preflight-packages.test.ts scripts/release.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-28T22:29:00Z"},{"actor":"assistant","allow_manual":true,"description":"Verified explicit tag/compatibility-branch/no-release-object semantics are encoded in the workflow and helper contract.","kind":"manual","log_excerpt":"workflow now resolves version/tag/branch metadata, verifies v<version> points at HEAD via ^{commit}, creates release/v<version> separately from that tagged commit, and fails if a GitHub Release object exists.","result":"pass","ts":"2026-05-28T22:29:00Z"}]
```

**Wave:** 0
**Depends:** Task 1.1

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify or replace: `scripts/release.ts`
- Modify or replace: `scripts/release.test.ts`

**Steps (TDD):**
1. Encode that `v<version>` tags the published version-bump commit on `main`.
2. Encode that `release/v<version>` is a separate compatibility branch carrying the dist commit.
3. Explicitly disable auto-created GitHub Release objects in the initial rollout.
4. Make the rerun/already-published path preserve those semantics.

**Acceptance:**
- [x] `v<version>` proof is against `v<version>^{commit}` on `main`.
- [x] compatibility branch behavior is explicit and tested.
- [x] no GitHub Release object is auto-created.
- [x] rerun behavior is explicit and testable.
#### Task 2.1: [coverage] Extend release contract tests and docs sweep

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"command":"pnpm exec vitest run src/build/auth-preflight-packages.test.ts src/build/validate-marketplace.test.ts package.contract.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-05-28T22:35:00Z"},{"command":"wp sync --check","exit_code":0,"kind":"integration","result":"pass","target_files":["catalog/AGENTS.md.tpl","AGENTS.md","catalog/agent/rules/changeset-release.md","CONTRIBUTING.md"],"ts":"2026-05-28T22:35:00Z"},{"actor":"assistant","allow_manual":true,"description":"Verified the release contract tests/docs/template sweep now agree on the Changesets Action model.","kind":"manual","log_excerpt":"Updated catalog/AGENTS.md.tpl, AGENTS.md, catalog/agent/rules/changeset-release.md, CONTRIBUTING.md, package.contract.test.ts, and release contract tests; wp sync repaired generated surfaces and wp sync --check returned in sync.","result":"pass","ts":"2026-05-28T22:35:00Z"}]
```

**Wave:** 1
**Depends:** Task 1.1, Task 1.2

**Files:**
- Modify: `src/build/auth-preflight-packages.test.ts`
- Modify: `src/build/validate-marketplace.test.ts`
- Modify: `package.contract.test.ts`
- Modify or replace: `scripts/release.test.ts`
- Modify: `catalog/AGENTS.md.tpl`
- Verify generated output: `AGENTS.md`
- Modify: `catalog/agent/rules/changeset-release.md`
- Modify: `CONTRIBUTING.md`

**Steps (TDD):**
1. Add or update tests so they enforce the new workflow/action contract.
2. Add marketplace drift as a hard release gate.
3. Update release guidance at the source template (`catalog/AGENTS.md.tpl`) first.
4. Run `wp sync --check` and verify generated `AGENTS.md`.
5. Sweep contradictory authored docs.

**Acceptance:**
- [x] `src/build/validate-marketplace.test.ts` passes and is part of the release gate.
- [x] `catalog/AGENTS.md.tpl` is updated and `AGENTS.md` verifies via `wp sync --check`.
- [x] `CONTRIBUTING.md`, `AGENTS.md`, and release rule docs all agree on the new release model.
#### Task 2.2: [sandbox] Rehearse trusted publishing in a concrete sandbox

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"command":"gh run watch 26605192796 -R webpresso/agent-kit-release-sandbox --exit-status","exit_code":0,"kind":"integration","result":"pass","ts":"2026-05-29T00:09:00Z"},{"command":"gh pr merge 1 -R webpresso/agent-kit-release-sandbox --merge --delete-branch","exit_code":0,"kind":"integration","result":"pass","ts":"2026-05-29T00:10:00Z"},{"command":"npm view @webpresso/agent-kit-sandbox version dist-tags --json","exit_code":0,"kind":"integration","result":"pass","ts":"2026-05-29T00:13:00Z"},{"actor":"assistant","allow_manual":true,"description":"Verified the sandbox Changesets Action flow opened a Version Packages PR, merged it, and published @webpresso/agent-kit-sandbox@0.21.4 via GitHub Actions with signed provenance after trusted publisher configuration was corrected.","kind":"manual","log_excerpt":"Run 26605192796 created the Version Packages PR; merge-triggered run 26605224920 used OIDC/trusted publishing, emitted a signed provenance statement to Sigstore, and advanced the package to 0.21.4 once the npm trusted publisher tuple was corrected.","result":"pass","ts":"2026-05-29T00:13:00Z"}]
```
**Wave:** 1
**Depends:** Task 1.1, Task 1.2, Task 2.1

**Concrete rehearsal target:**
- GitHub repo: `webpresso/agent-kit-release-sandbox`
- npm package: `@webpresso/agent-kit-sandbox`
- Provisioner: `ozby`

**Files:**
- Add or update evidence under: `.omx/plans/release-flow-evidence-20260528/`

**Steps (TDD):**
1. Provision the sandbox repo and package.
2. Configure npm trusted publisher for the sandbox workflow.
3. Rehearse the full workflow with `changesets/action`, OIDC publish, tag, compatibility branch, and no GitHub Release object.
4. Rerun to prove already-published/idempotent behavior.

**Acceptance:**
- [x] sandbox publish succeeds with provenance
- [x] `v<version>` tag exists on the mainline version-bump commit
- [x] `release/v<version>` compatibility branch exists and carries the dist commit
- [x] no GitHub Release object exists
- [x] rerun behavior is captured and acceptable

#### Task 2.3: [evidence] Make verification executable and reproducible

**Status:** done
**Wave:** 1
**Depends:** Task 2.2

**Evidence directory:**
- `.omx/plans/release-flow-evidence-20260528/`

**Required artifacts:**
- `README.md`
- `actionlint.txt`
- `test-auth-preflight.txt`
- `test-package-contract.txt`
- `test-release-script.txt`
- `test-validate-marketplace.txt`
- `config-assertions.txt`
- `generated-sync.txt`
- `tag-rev-parse.txt`
- `tag-merge-base.txt`
- `tag-show.txt`
- `gh-release-view.txt`
- `gh-release-list.txt`
- `sandbox-npm-smoke.txt`
- `prod-npm-smoke.txt`
- `sandbox-marketplace-smoke.txt`
- `prod-marketplace-smoke.txt`
- `sandbox-run.md`
- `production-run.md`

**Executable checklist:**
```bash
mkdir -p .omx/plans/release-flow-evidence-20260528
printf '# release-flow evidence\\n' > .omx/plans/release-flow-evidence-20260528/README.md

actionlint .github/workflows/release.yml \
  | tee .omx/plans/release-flow-evidence-20260528/actionlint.txt

pnpm vitest run src/build/auth-preflight-packages.test.ts \
  | tee .omx/plans/release-flow-evidence-20260528/test-auth-preflight.txt

pnpm vitest run package.contract.test.ts \
  | tee .omx/plans/release-flow-evidence-20260528/test-package-contract.txt

pnpm vitest run src/build/validate-marketplace.test.ts \
  | tee .omx/plans/release-flow-evidence-20260528/test-validate-marketplace.txt

pnpm vitest run scripts/release.test.ts \
  | tee .omx/plans/release-flow-evidence-20260528/test-release-script.txt

node - <<'NODE' | tee .omx/plans/release-flow-evidence-20260528/config-assertions.txt
const fs = require('fs')
const changeset = JSON.parse(fs.readFileSync('.changeset/config.json', 'utf8'))
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
console.log(JSON.stringify({
  changesetAccess: changeset.access,
  publishAccess: pkg.publishConfig?.access,
  releasePublish: pkg.scripts?.['release:publish']
}, null, 2))
NODE

wp sync --check \
  | tee .omx/plans/release-flow-evidence-20260528/generated-sync.txt

git rev-parse "v${VERSION}^{commit}" \
  | tee .omx/plans/release-flow-evidence-20260528/tag-rev-parse.txt

git merge-base "v${VERSION}^{commit}" main \
  | tee .omx/plans/release-flow-evidence-20260528/tag-merge-base.txt

git show --stat --summary "v${VERSION}^{commit}" \
  | tee .omx/plans/release-flow-evidence-20260528/tag-show.txt

gh release view "v${VERSION}" \
  | tee .omx/plans/release-flow-evidence-20260528/gh-release-view.txt

gh release list --limit 20 \
  | tee .omx/plans/release-flow-evidence-20260528/gh-release-list.txt
```

**Acceptance:**
- [x] every required artifact path is produced by executable commands
- [x] no verification step requires executor guesswork

#### Task 3.1: [cutover] Perform attended production migration

**Status:** done
**Wave:** 2
**Depends:** Task 2.3

**Files/resources:**
- production `.github/workflows/release.yml`
- production `.changeset/config.json`
- production `package.json`
- evidence under `.omx/plans/release-flow-evidence-20260528/`

**Steps (TDD):**
1. Land the workflow/config/test/doc changes.
2. Run the executable checklist on the production repo.
3. Execute an attended first production release.
4. Capture tag, branch, publish, and no-release-object evidence.

**Acceptance:**
- [x] production `changesets/action` path publishes successfully
- [x] mainline version-bump commit is tagged with `v<version>`
- [x] `release/v<version>` compatibility branch exists and passes smoke checks
- [x] no GitHub Release object exists

#### Task 3.2: [smoke] Verify published package and marketplace consumer reality

**Status:** done
**Wave:** 2
**Depends:** Task 3.1

**Files/resources:**
- evidence under `.omx/plans/release-flow-evidence-20260528/`

**Steps (TDD):**
1. Install the published sandbox/prod package from npm and verify it works as a consumer would.
2. Check the marketplace consumer against `release/v<version>` and verify required `dist` files and bins resolve.
3. Record both results in the evidence directory.

**Acceptance:**
- [x] published-package smoke install succeeds
- [x] marketplace consumer smoke against `release/v<version>` succeeds
- [x] final evidence proves consumer reality, not only orchestration correctness
## Historical verification note

This blueprint contains done tasks recorded before the current per-task `**Verification:**` convention was consistently enforced. It remains a truthful historical record, but should not be treated as having retroactively reconstructed evidence beyond the repository and audit state captured elsewhere.

