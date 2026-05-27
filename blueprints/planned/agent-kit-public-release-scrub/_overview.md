---
type: blueprint
title: Agent-Kit Public Release Scrub
status: planned
owner: agent-kit
complexity: M
created: '2026-05-27'
last_updated: '2026-05-27'
progress: '0/6 tasks done (0%) - covers public-readiness gaps found in the 2026-05-27 exposure audit'
depends_on: []
cross_repo_depends_on: []
tags:
  - public-release
  - security
  - repository-scrub
  - docs
  - release
---

# Agent-Kit Public Release Scrub

## Planning Summary

Prepare this repository for public visibility by removing or explicitly
accepting the disclosure risks found in the 2026-05-27 public exposure audit.
This blueprint is a release blocker for any action that makes the repository
public, mirrors repository history into a public remote, or announces the source
repository as open source. It is not a blanket blocker for a package-tarball
publish that is separately proven safe by package-surface and staging checks.

## Problem Statement

The package metadata is already shaped like a public package, and package-surface
audits pass, but the repository is not publication-safe as-is. Current tracked
content and Git history still contain token-shaped test fixtures, local path
evidence, cross-repo implementation notes, and Webpresso monorepo extraction
context. Some items are harmless in isolation, but public repositories are
scanned by automated secret detectors and read as product commitments.

## Fact-Checked Findings

Verified on 2026-05-27:

- `wp_audit({"kind":"package-surface"})`, `wp_audit({"kind":"catalog-drift"})`,
  and `wp_audit({"kind":"hook-surface"})` pass.
- `.npmrc` uses the `${GH_PACKAGES_TOKEN}` environment placeholder, not a
  literal token.
- Gitleaks on a tracked `git archive HEAD` reports token-shaped fixtures in:
  - `src/audit/package-surface.test.ts`
  - `src/mcp/tools/ci-act.test.ts`
- Gitleaks on full history reports an additional deleted-file finding from the
  former `packages/agent-workers-test/README.md`.
- Blueprints and docs include local-path and cross-repo disclosure markers such
  as `/Users/ozby`, `ingest-lens`, monorepo extraction wording, and package
  boundary notes for other Webpresso repositories.
- `vp run verify:secrets` is not currently available in this repo, and
  `scripts/check-no-dev-vars.ts` is absent despite the operating contract
  mentioning it.

## Non-Goals

- Do not rewrite product/package ownership decisions from the CLI cutover work.
- Do not publish, unarchive, or mirror the repo from this blueprint.
- Do not block the `webpresso` npm package objective when the operation only
  publishes a vetted tarball and does not expose repository history.
- Do not remove useful historical design context unless it creates a public
  disclosure or scanner problem.

## Key Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Publication gate | Treat public visibility as blocked until this blueprint is complete | Prevents accidental public release with known scanner and disclosure findings. |
| Package tarball boundary | Keep public npm tarball release separate from repository-publication readiness | The in-progress `webpresso` package consolidation has its own package-surface/staging gates and does not expose Git history. |
| Secret fixtures | Use scanner-safe sentinel strings instead of realistic token prefixes | Tests should prove redaction behavior without tripping public secret scanners. |
| History strategy | Prefer a clean public snapshot unless full-history scrub is explicitly verified | Avoids carrying deleted-file scanner hits into the first public release. |
| Internal context | Keep only intentional, public-facing Webpresso references | Monorepo extraction details and local paths are not needed by public consumers. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| --- | --- | --- | --- | --- |
| **Wave 0** | 1.1, 1.2 | None | 2 agents | S |
| **Wave 1** | 1.3, 1.4 | 1.1, 1.2 | 2 agents | S-M |
| **Wave 2** | 1.5, 1.6 | 1.3, 1.4 | 1 agent | S |
| **Critical path** | 1.1 → 1.3 → 1.5 → 1.6 | — | 3 waves | M |

#### Task 1.1: [security] Replace token-shaped fixtures with scanner-safe sentinels

**Status:** todo

**Depends:** None

Remove realistic token prefixes from tests and fixtures while preserving the
behavior under test: redaction, omission from payloads, and package-surface
secret detection.

**Files:**

- Modify: `src/audit/package-surface.test.ts`
- Modify: `src/mcp/tools/ci-act.test.ts`
- Modify as needed: fixtures or snapshots that assert the old token-shaped text

**Steps (TDD):**

1. Add or update tests so they use scanner-safe sentinel values such as
   `__TEST_GITHUB_PAT_REDACT_ME__` instead of realistic token prefixes.
2. Run: `wp_test({"files":["src/audit/package-surface.test.ts","src/mcp/tools/ci-act.test.ts"]})`.
3. Run Gitleaks on a tracked `git archive HEAD` copy and confirm zero current
   tree findings.

**Acceptance:**

- [ ] Current tracked tree has zero Gitleaks findings.
- [ ] Redaction and package-surface tests still prove realistic behavior.
- [ ] No test fixture contains realistic public-token prefixes.

#### Task 1.2: [docs] Sanitize local paths and unrelated repository references

**Status:** todo

**Depends:** None

Replace local machine paths and unrelated private/project references with
relative paths, public URLs, or neutral examples. This includes blueprint POC
artifacts that captured absolute stack traces.

**Files:**

- Modify: `blueprints/**/*.md`
- Modify: `blueprints/**/*.json`
- Modify as needed: docs or generated evidence files containing local paths

**Steps (TDD):**

1. Add a grep/audit fixture that fails on `/Users/ozby` and unrelated local repo
   names in public-facing tracked files.
2. Replace sensitive examples with relative paths or neutral placeholders.
3. Run the new focused check and the blueprint lifecycle audit.

**Acceptance:**

- [ ] Public-facing tracked files no longer contain local absolute paths.
- [ ] Unrelated project names are removed or intentionally documented as public
      external references.
- [ ] `wp_audit({"kind":"blueprint-lifecycle"})` passes.

#### Task 1.3: [docs] Rewrite monorepo extraction and internal implementation history

**Status:** todo

**Depends:** Task 1.2

Turn monorepo extraction notes, internal cross-repo assumptions, and roadmap
breadcrumbs into public-facing product history. Keep only references that a
public contributor needs to understand or operate the package.

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `.claude/rules/*.md`
- Modify: `blueprints/**/*.md`
- Modify as needed: `README.md` and release docs

**Steps (TDD):**

1. Inventory active docs and planned/in-progress blueprints for monorepo
   extraction language and internal-only roadmap names.
2. Replace internal history with neutral public package wording.
3. Add allowlisted exceptions only when the reference is intentionally public.

**Acceptance:**

- [ ] Active docs do not expose private roadmap names or local monorepo paths.
- [ ] Planned blueprints describe current public package boundaries, not
      extraction mechanics.
- [ ] Historical notes that remain are intentionally public and allowlisted.

#### Task 1.4: [release] Decide and document package visibility boundaries

**Status:** todo

**Depends:** None

Record which Webpresso packages, registries, and command brands are safe to
mention publicly. Align this with the CLI bundle cutover plan so `agent-kit`
does not accidentally claim ownership of public command brands that belong to a
different package.

**Files:**

- Modify: `blueprints/planned/agent-kit-cli-bundle-cutover/_overview.md`
- Modify: `README.md`
- Modify as needed: `package.json`, `.npmrc`, and release docs

**Steps (TDD):**

1. Document the accepted public references to GitHub Packages and Webpresso
   package names.
2. Document which helper bins are internal implementation details.
3. Gate public help/docs so internal helper names do not appear as user-facing
   command brands.

**Acceptance:**

- [ ] Public docs state the intended package/registry boundary.
- [ ] Internal helper bins are not presented as public commands.
- [ ] CLI cutover remains aligned with this public-release scrub.

#### Task 1.5: [history] Choose and execute the public-history strategy

**Status:** todo

**Depends:** Task 1.1, Task 1.2, Task 1.3

Eliminate full-history scanner findings before public release. Either scrub the
existing history and verify all refs, or create a clean public repository from a
verified snapshot.

**Files:**

- Modify as needed: release notes and repository setup docs
- Do not modify: package versions by hand

**Steps (TDD):**

1. Decide between full-history rewrite and clean public snapshot.
2. Verify the chosen strategy with Gitleaks over all public refs.
3. Record the decision, commands used, and the final clean report in this
   blueprint before marking complete.

**Acceptance:**

- [ ] Full public history has zero unresolved scanner findings, or the public
      repo starts from a clean verified snapshot.
- [ ] Deleted-file findings from old package locations are not present in the
      public repository history.
- [ ] The release decision is documented with reproducible verification steps.

#### Task 1.6: [qa] Add a repeatable public-readiness gate

**Status:** todo

**Depends:** Task 1.5

Add a concise checklist or automated script so future public-release decisions
do not depend on ad-hoc manual scanning.

**Files:**

- Add or modify: public-readiness checklist/script location selected during
  implementation
- Modify: `package.json` if adding a repo script
- Modify: docs that mention secret verification commands

**Steps (TDD):**

1. Add a repeatable gate that runs the scanner and repo audits.
2. If the operating contract still references `verify:secrets`, either provide
   the script or update the repo-local docs to the real command.
3. Run the full public-readiness gate.

**Acceptance:**

- [ ] A future maintainer can run one documented public-readiness command or
      checklist.
- [ ] The gate covers current tree, public history/snapshot, package surface,
      catalog drift, hook surface, and blueprint lifecycle.
- [ ] The operating contract and package scripts do not reference missing secret
      verification commands.

## Verification Gates

| Gate | Command | Success Criteria |
| --- | --- | --- |
| Focused tests | `wp_test({"files":["src/audit/package-surface.test.ts","src/mcp/tools/ci-act.test.ts"]})` | All pass |
| Current tree scanner | `gitleaks dir <tracked-HEAD-archive> --redact` | Zero findings |
| Public history scanner | `gitleaks detect --redact --source <public-history-source>` | Zero unresolved findings |
| Package surface | `wp_audit({"kind":"package-surface"})` | Pass |
| Catalog drift | `wp_audit({"kind":"catalog-drift"})` | Pass |
| Hook surface | `wp_audit({"kind":"hook-surface"})` | Pass |
| Blueprint lifecycle | `wp_audit({"kind":"blueprint-lifecycle"})` | Pass |

## Cross-Plan References

| Blueprint | Relationship | Required alignment |
| --- | --- | --- |
| `planned/agent-kit-cli-bundle-cutover` | Local sibling dependency | Public command/package boundary decisions must align with this scrub before public release. |
| `in-progress/consolidate-all-webpresso-agent-sub-packages-into-webpresso-itself-with-subpath-exports-consumers-go-from-6-8-pinned-devdeps-down-to-one-webpresso` | Local sibling release gate | The `webpresso` npm objective may proceed with tarball/package-surface evidence; repository-public visibility still waits for this scrub. |
| `planned/mcp-first-secret-surface-hard-cut-roadmap` | Related secret-surface roadmap | Secret-surface naming remains separate from repository-publication scanning. |
| `planned/secret-aware-worker-tail-mcp` | Related MCP/secret implementation lane | Test fixtures touched here must keep that lane's CI/tool behavior intact. |

## Cross-Repo Parallel Map

| Lane | Repo / blueprint | Can proceed in parallel? | Boundary |
| --- | --- | --- | --- |
| Repository public-readiness scrub | `webpresso/agent-kit: planned/agent-kit-public-release-scrub` | Yes, owns source/history disclosure cleanup. | Blocks only public source repository/history exposure. |
| Public `webpresso` package consolidation | `webpresso/agent-kit: in-progress/consolidate-all-webpresso-agent-sub-packages-into-webpresso-itself-with-subpath-exports-consumers-go-from-6-8-pinned-devdeps-down-to-one-webpresso` | Yes, may finish tarball release gates independently. | Must not make source history public until this scrub completes. |
| Agent command bundle cutover | `webpresso/agent-kit: planned/agent-kit-cli-bundle-cutover` | Partially; evidence/contract tasks can proceed, public-source claims wait. | Consumes this scrub for public repo safety and the CLI owner plans for command branding. |
| Framework command/package boundary | `webpresso/framework: framework-cli-package-boundary` | Already completed on the framework side. | `@webpresso/webpresso` stays framework/runtime identity and does not absorb agent setup. |
| Framework hook projector alignment | `webpresso/framework: wp-setup-hook-surface-projector` | Yes, implementation alignment can proceed. | User-facing setup converges toward `webpresso agent setup`; source-publication cleanup remains local to agent-kit. |
| Unified public CLI cutover | `webpresso/monorepo: unified-cli-public-cutover` | Yes, if it treats agent-kit as a bundle/provider. | Public `webpresso` command brand belongs to the unified CLI host, not agent-kit. |

This map keeps the `webpresso` npm objective unblocked while preventing a
package release from being confused with a public Git-history release.

## Risks and edge cases

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Scanner-safe fixtures weaken redaction tests. | HIGH | Use explicit sentinel strings and assertions that still prove omission/redaction semantics. |
| History rewrite disrupts existing branches or tags. | HIGH | Prefer a clean public snapshot unless maintainers explicitly approve a coordinated rewrite. |
| Sanitizing blueprints removes useful planning context. | MEDIUM | Replace sensitive details with neutral public equivalents instead of deleting whole decisions. |
| Public package names change during CLI cutover. | MEDIUM | Keep the CLI cutover blueprint linked and re-run package-surface and hook-surface audits. |

## Alternatives Considered

| Alternative | Why not |
| --- | --- |
| Make the repository public immediately and rely on scanner false-positive triage. | Public hosts may still flag the repo, and the known monorepo/local-path disclosure remains unresolved. |
| Delete all blueprints before publishing. | Blueprints are the durable planning surface; targeted sanitization preserves useful public history. |
| Treat GitHub Packages references as secret. | Registry and environment-variable placeholders are not secrets; the task is to document intentional visibility. |
