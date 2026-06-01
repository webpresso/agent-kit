# Changelog

## 0.25.0

### Minor Changes

- a04c270: When both an `agent-kit.config.ts` and a legacy `webpresso.config.ts` are present, the e2e host-adapter config loader now resolves the canonical `agent-kit.config.ts` (the first configured candidate) instead of erroring on the ambiguity. This lets repos keep a thin legacy `webpresso.config.ts` bridge while migrating to the `agent-kit.config.ts` name. Export-name errors continue to name the specific export expected for the resolved file.

## 0.24.0

### Minor Changes

- 4368b6b: `cloudflare-deploy-contract` audit now validates the production release metadata file: it must be valid JSON, and a release that declares `durableObjectMigration: "required"` must use `rolloutMode: "direct"`. Invalid JSON or a non-direct rollout for a Durable Object migration is reported as a loud audit violation rather than passing silently.
- d98ed6e: The e2e host-adapter config loader now accepts an `agent-kit.config.ts` file (exporting `agentKitConfig`) in addition to the existing `webpresso.config.ts` (`webpressoConfig`). When both files are present it fails loudly with a `WebpressoConfigAmbiguousError` rather than silently picking one, and export-name errors now name the specific export expected for the resolved file.

## 0.23.0

### Minor Changes

- d2ade47: `wp setup` now self-updates the globally-distributed `@webpresso/agent-kit` binary via `vp install -g`, mirroring how omx/omc/codex/claude keep their global installs fresh. The PATH `wp`, the Claude plugin MCP, and the agent hooks all resolve to this single global binary, so each setup keeps the next invocation everywhere on the latest published release. The refresh is non-fatal (a failed install never fails consumer setup) and skips cleanly on `--dry-run`, `WP_SKIP_AUTO_INSTALL=1`, a webpresso source/git clone (so a dev checkout is never clobbered), missing `vp`, and CI.
- f662b9f: Add a shared Cloudflare deploy-contract config surface with dash-safe lane validation, CI template guidance, and a `cloudflare-deploy-contract` audit for repos that provide production release metadata.
- becf228: Add the `wp` extension runtime contract, including explicit root opt-in discovery, public runtime documentation, and package-surface tests for the `./wp-extension` subpath.

### Patch Changes

- 909381c: Clarify that PRDs, test specs, and other blueprint-owned planning artifacts belong under the configured blueprint root instead of `.agent/planning/plans/`.
- 8b7cfb9: Harden GitHub Actions workflows by pinning action references to immutable SHAs and adding an audit for mutable workflow action refs.

## 0.22.0

### Minor Changes

- 83f7160: Support both canonical blueprint shapes:

  - `blueprints/<status>/<slug>.md`
  - `blueprints/<status>/<slug>/_overview.md`

  `wp blueprint new` now creates flat-file drafts by default, while lifecycle and
  audit surfaces preserve the existing shape of each blueprint. Duplicate flat +
  folder variants for the same lifecycle slug are now rejected as hard errors.

- 347a922: Add `typescriptBaseConfig` and `typescriptWorkersBaseConfig` to `@webpresso/agent-kit/stryker`, and export `runAffectedMutation` via `@webpresso/agent-kit/mutation`.

  - `typescriptBaseConfig` extends `baseConfig` with `checkers: ["typescript"]` and `tsconfigFile: "tsconfig.json"` — eliminating boilerplate repeated in every consumer `stryker.config.ts`
  - `typescriptWorkersBaseConfig` further extends it with `vitest: { configFile: "vitest.stryker.config.ts" }` for Cloudflare Workers packages whose `vitest.config.ts` uses `@cloudflare/vitest-pool-workers` (incompatible with Stryker's pool injection)
  - `runAffectedMutation()` contains the affected-package detection logic (git diff → pnpm filter), replacing duplicated `scripts/affected-mutation.ts` files in consumer repos

## Unreleased

### Patch Changes

- Export a local `@webpresso/agent-kit/bundle` prep surface that packages the future
  `webpresso agent ...` command inventory for the external CLI host mount.
- Add exact replacement-command diagnostics for stale `wp ...` agent commands so
  migration guidance points to the future `webpresso agent ...` family.
- Document the truthful repo-local completion boundary: this repo now prepares the
  bundle/fixture/docs surface, while the actual public host-mounted cutover remains
  an external monorepo/framework lane.

## 0.21.5

### Patch Changes

- 52bbede: Make `wp setup` bootstrap a fresh public consumer repo with a zero-hand-wiring quality scaffold.

  - Generate absent-only TypeScript, Vitest, Oxlint, Stryker, and Playwright config plus starter source/unit/e2e smoke files through the default `base-kit` path.
  - Add default package scripts and authoring-time dev dependencies while preserving existing consumer-owned config and scripts on rerun.
  - Add a packed-artifact consumer smoke rehearsal that verifies `npm exec --package <tarball> -- wp setup --yes --host none` and the generated lint/typecheck/test/e2e/qa commands.

- b549865: Fix packaged-asset resolution that worked in a source checkout but broke in the published package.

  - `wp audit tph` / `tph-e2e` (and the `wp_audit` MCP tool) resolved the Bun audit script to a `src/audit/*.ts` path the npm tarball never ships (`files` lists `dist`, not `src`), so the audit failed with `bun: Module not found`. A shared, tested resolver now anchors on the caller's module URL and prefers the dev `.ts`, falling back to the compiled `dist/esm/audit/*.js` the build emits.
  - `wp blueprint new` and template listing resolved `docs/templates/blueprint.md`, which is also not shipped (only `catalog/docs/templates/` is). A new `resolvePackageAssetPreferred` prefers the source `docs/templates/` and falls back to the shipped `catalog/docs/templates/` — the fallback `router.ts` already documented but never implemented.
  - `docs/templates/` (canonical) and `catalog/docs/templates/` (the shipped + `wp init`-scaffolded mirror) had silently diverged across 9 files. The mirror is now regenerated from the canonical at `postbuild` and guarded by a drift test.

## 0.21.4

### Patch Changes

- 576c51a: Migrate agent-kit releases to Changesets Action with trusted-publishing support, and make `wp ci act` able to run no-secret local CI rehearsals without requiring an external `with-secrets` wrapper.

## 0.21.0

### Minor Changes

- 6034aa8: Hard-cut `@webpresso/agent-kit` to its generic reusable core:

  - keep `wp` as the only canonical CLI surface
  - remove the `webpresso` bin from the package contract
  - remove branded preset exports (`vitest/webpresso/*`, `tsconfig/webpresso*`, `stryker/webpresso`)
  - preserve the generic canonical presets (`vitest/node`, `vitest/react`, `vitest/react-router`, `vitest/workers`, `stryker`, `workers-test`, generic `tsconfig/*`)
  - make package-import rules generic by default while keeping a Webpresso-specific profile as explicit opt-in behavior
  - update docs and package-surface checks to match the hard-cut contract

  This is a breaking contract change for consumers that still relied on the removed branded preset exports or the removed `webpresso` bin.

## 0.20.1

### Patch Changes

- 9c646ac: Use direct pnpm package publishing in the release workflow after Changesets versioning, so GitHub Packages publishing no longer crashes inside the Changesets CLI publish path.

## 0.20.0

### Minor Changes

- 31484d9: Add public secret-manager parity commands and enforce local-only parent-roadmap rules with cross-repo blueprint linking via `cross_repo_depends_on` plus GitHub links.
- 78ab6cb: Stabilize secret-gated CI and Worker MCP tools, decouple `wp config secrets`
  from the framework runtime package, harden pretool routing so env-prefixed
  context-mode test commands are forced through `wp_test`, and refresh public
  command-boundary docs.

### Patch Changes

- e038e3a: Add the AI reliability contract audit/documentation surface, harden roadmap and package-surface audits, and speed up/fix QA guardrail coverage for init, hooks doctor, and publish/test workflows.
- d9b5532: Add a shared `architecture-drift` audit for architecture contracts, blueprint linkage, and before/after architecture enforcement, and expose it through the CLI + MCP audit surfaces.
- 0c63768: Avoid unnecessary blueprint projection re-ingest during tool registration, allow shared project resolver injection for blueprint server registration, and split heavy blueprint server tests so the MCP suite stays within verification budgets.
- 0955be3: Fix GitHub Actions auth-preflight package probes so CI and release jobs verify package registry access without requiring an existing latest package version, and grant the preflight job explicit package-read permissions.
- 52c31ec: Commit the remaining follow-up batch across workflow auth preflight, base-kit scaffolding, package import rules, session-memory surfaces, and blueprint parking updates.

## 0.19.0

### Minor Changes

- 19bd7b5: Hardcut the package, plugin, MCP, workflow, and documentation identity to the canonical `webpresso` package with subpath exports and no legacy helper-package compatibility layer.

### Patch Changes

- 8496020: Fix `wp_test` timeout handling by cleaning up cancelled Vitest process trees, preserving file-scoped Vitest filters, and suppressing real Codex app-server trust sync during Vitest scaffolding tests unless a fake app-server is injected.

## 0.18.19

### Patch Changes

- 0d327bd: Fix `wp setup --dry-run` flag handling, avoid repeated Codex hook trust sync during setup, and collapse gstack Codex/team setup into one upstream setup invocation when Codex is available.

## 0.18.18

### Patch Changes

- 99a97f9: Make the `wp ci act` and `wp_ci_act` surfaces secret-safe by construction: route execution through the provider-neutral secret gate, remove public unsafe act inputs, redact internal secret-file metadata, and bound captured secret-gate output.

## 0.18.17

### Patch Changes

- fc90f88: Prevent AGENTS.md template documentation placeholders from expanding into malformed setup comments.

## 0.18.16

### Patch Changes

- 75169dd: Remove the unused runtime-storage package dependency from the agent-kit CLI package.

## 0.18.15

### Patch Changes

- 7e06dba: Make `wp_blueprint_*` the canonical documented blueprint MCP surface, add
  retry-safe `request_id` replay for mutating blueprint tools, and add optional
  `head_at_ingest` stale-write protection plus doc/registry drift coverage.

## 0.18.14

### Patch Changes

- 74cca76: Remove legacy test-runner backends, route quality tooling through VP/MCP command surfaces, and auto-install OMC through Claude Code's plugin marketplace during setup.

## 0.18.13

### Patch Changes

- 4206236: Harden blueprint audit contracts by rendering configured blueprint roots in generated AGENTS.md, distinguishing generated-on-demand planning surfaces, flagging completed zero-task blueprints without historical waivers, and adding blueprint inventory/anomaly summary output.

## 0.18.12

### Patch Changes

- a7e0d5f: Inline `@webpresso/agent-kit` in Node Vitest config so the `bun:sqlite` alias is applied when agent-kit is imported from `node_modules`.

## 0.18.11

### Patch Changes

- ee74d36: Fix blueprint docs lint parity for parked lifecycle plans and keep Node Vitest `bun:sqlite` alias behavior aligned between folded and legacy config exports.

## 0.18.10

### Patch Changes

- d99b157: Modernize `catalog/base-kit/.github/workflows/ci.webpresso.yml.tmpl` —
  the workflow scaffolded by `wp setup --with base-kit`. The previous
  template carried pre-modernization defaults (`ubuntu-latest` runner,
  `actions/checkout@v4`, `actions/setup-node@v4`, `pnpm/action-setup@v4`
  with explicit `version: '11.1.1'`) and had no `oven-sh/setup-bun@v2`
  step, no `GH_PACKAGES_TOKEN` env wiring, and no
  `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` opt-in.

  That stale shape caused every fresh consumer install (including
  re-installs in monorepo CI before the postinstall preservation fix) to
  silently rewrite a customized workflow back to the stale defaults — see
  the 2026-05-19 webpresso/monorepo regression where the consumer's
  hermetic-baseline `ci.webpresso.yml` was clobbered by this template on
  every PR, breaking the validation tests that asserted the new shape.

  The modernized template:

  - Pins `actions/checkout@v5`, `actions/setup-node@v5`,
    `pnpm/action-setup@v6` (drops the now-redundant explicit pnpm version;
    v6 reads `packageManager` from package.json).
  - Adds `oven-sh/setup-bun@v2` in every job so `wk`-driven steps that
    invoke `bun` have it on PATH.
  - Adds workflow-level `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'` —
    silences the JS-action Node 20 deprecation warning ahead of GitHub's
    2026-06-02 default switch.
  - Adds workflow-level `GH_PACKAGES_TOKEN: ${{ secrets.GH_PACKAGES_TOKEN }}`
    so `pnpm install --frozen-lockfile` can resolve `@webpresso/*` scoped
    deps from GitHub Packages without 401 Unauthorized.
  - Keeps `ubuntu-latest` (free-tier compatible) so generic consumers can
    adopt the template without an extra paid-runner setup; webpresso's
    own repos override to `ubicloud-standard-2`.

  Existing consumers who customized their `.github/workflows/ci.webpresso.yml`
  locally are unaffected — `wp setup --overwrite` continues to write the
  template, but downstream repos that want to preserve a customized
  workflow should add the path to their postinstall preservation list (see
  monorepo's `apps/scripts/src/maintenance/agent-setup-postinstall.ts`).

## 0.18.9

### Patch Changes

- 8e8ac24: Regenerate pnpm-lock.yaml to resolve catalog: specifier drift on
  `@vitejs/plugin-react` and `vite-plus`. The lockfile carried direct
  `^6.0.1` / `^0.1.19` specifiers from before the catalog: migration in
  `packages/agent-vitest/package.json`; the post-migration manifests now
  use `catalog:`. CI's frozen-lockfile rejects this drift, blocking
  Release.yml from publishing any new version. After regen, the lockfile
  specifiers match the manifest's `catalog:` references and
  frozen-lockfile passes.

## 0.18.8

### Patch Changes

- c206493: fix(release): include workspace root in pnpm -r build step

  `pnpm -r run build` excluded the workspace root (agent-kit itself), so
  `dist/` was never built before `changeset publish` ran. The published
  tarball contained zero dist files, breaking all compiled subpath exports
  (e.g. `@webpresso/agent-kit/vitest/node`).

  Fix: add `--include-workspace-root` to the Build step in release.yml so
  the root package's tshy-driven `dist/esm/` output is present when the
  tarball is packed.

## 0.18.7

### Patch Changes

- bf1bd31: fix: republish with dist/ included in tarball

  0.18.6 was published before the build step ran (build pipeline ordering bug
  now fixed in release.yml). The tarball contained zero dist files, causing
  `Cannot find module '@webpresso/agent-kit/vitest/node'` and similar errors
  for any consumer using the compiled subpath exports. This patch forces a
  fresh publish with the corrected pipeline so dist/ is included.

## 0.18.6

### Patch Changes

- 612116c: Resume the host-visibility-gate-fix patch that was version-bumped to
  0.18.5 but failed to publish on tshy double-build. This changeset
  triggers a new patch (0.18.6) that publishes cleanly.

## 0.18.5

### Patch Changes

- 1655c5d: fix(setup): skip host visibility hard gate in CI environments

  `wp setup` was exiting 1 in CI (GitHub Actions, etc.) because the host skill
  visibility check unconditionally failed when `verify` and `plan-refine` skills
  were not visible — which happens on clean CI runners where `claude` is absent
  and `.claude/skills/` symlinks point to sibling repos that aren't checked out.

  The visibility check is a developer-workstation concern. The hard gate now
  only fires outside CI environments (`CI != true`). In CI, a warning is logged
  and setup continues to exit 0.

## 0.18.4

### Patch Changes

- ed91f97: Republish with built dist/ included. The previous publishes (agent-kit@0.18.2,
  agent-vitest@0.2.0, agent-stryker@0.2.0, agent-tsconfig@0.2.0) shipped without
  their dist/ because changeset publish does not invoke prepublishOnly and the
  release.yml workflow had no explicit Build step before Publish. Pipeline fix:
  release.yml now runs `pnpm -r --workspace-concurrency=1 run build` between
  `Version packages` and `Publish`.

## 0.18.3

### Patch Changes

- 345ab4b: Ship top-level tsconfig JSON files so consumers can extend `@webpresso/agent-kit/tsconfig/*` after the config subpackages consolidate into agent-kit.

## 0.18.2

### Patch Changes

- 1bc0ec8: Expose tsconfig exports as direct JSON file targets so TypeScript `extends` can resolve `@webpresso/agent-kit/tsconfig/*` in consumers.

## 0.18.1

### Patch Changes

- 977b1b4: Ship top-level tsconfig JSON files so consumers can extend `@webpresso/agent-kit/tsconfig/*` after the config subpackages consolidate into agent-kit.

## 0.18.0

### Minor Changes

- 1be5f27: Consolidate the former `@webpresso/agent-*` helper packages into the staged
  public `webpresso` package through `webpresso/*` subpath exports.

  Consumers can replace pinned helper devDependencies for tsconfig, Vitest,
  Stryker, Oxlint, Workers test helpers, docs-lint, launch, test-preset, and
  e2e-preset with one `webpresso` dependency. No publish happens in this changeset;
  the release workflow stages and publishes the public npm package later.

## 0.17.3

### Patch Changes

- 53cb43d: Fix auto-update: switch from public npm (only had 0.0.0-placeholder) to GitHub Releases API for version checks. Add git/source install detection so symlink dev installs self-update via git pull. Switch package-manager install commands to @webpresso/agent-kit on GitHub Packages. Remove update-notifier dependency.

## 0.17.2

### Patch Changes

- 477730c: Fix four post-ship findings from codex review: add scripts/migration-notice.ts to package files so postinstall doesn't fail on install; strip postinstall from webpresso staging package; add set -o pipefail to public npm publish CI step; fix getRepoKey() to resolve relative .git paths against the correct cwd; pass process.argv[1] (installed CLI script) to detect() instead of process.argv[0] (Bun runtime).

## 0.17.1

### Patch Changes

- bbfedf3: Restore wp/webpresso/ak CLI bins. Global install via GH Packages now provides
  all three names. Removed premature deprecated field — that belongs only when
  webpresso ships on public npm.

## 0.17.0

### Minor Changes

- 4ef715d: webpresso launch: rename to `webpresso` on public npm + state-out-of-repo + auto-update on start.

  This is the final intentional publish of `@webpresso/agent-kit` to GitHub
  Packages (deprecated, `wk` bin removed, postinstall migration notice).
  The same version ships to public npmjs.org as `webpresso` with full bin
  map (`wp`, `webpresso`, `wk`, all 8 hook bins), auto-update enabled, and
  state moved to `~/Library/Application Support/webpresso-agent-kit/`
  (macOS) / `$XDG_STATE_HOME/webpresso-agent-kit/` (Linux). See MIGRATION.md.

## 0.16.1

### Patch Changes

- 9b53651: Project `.agents/skills` as symlinked skill folders so Codex can discover repo-scoped skills such as `verify` and `plan-refine`.

## 0.16.0

### Minor Changes

- e36cf9e: Add `wp worktree` command (`new` / `list` / `remove`) for git worktree lifecycle with automatic `.agent/` seeding.

  `wp worktree new <branch>` creates a worktree as a sibling directory, runs `scaffoldAgent` to seed `.agent/commands`, `guides`, `workflows`, and `runUnifiedSync` to project `agent-rules/` and `agent-skills/` into the new worktree — so an AI agent dropped into the fresh worktree has rules, skills, and commands available immediately.

  `wp worktree list` shows a table of worktrees with branch and short HEAD, marking the current one. `wp worktree remove <branch-or-path>` resolves the target by branch name, directory basename, or full path before invoking `git worktree remove`.

## 0.15.2

### Patch Changes

- 4874e24: Fix setup host visibility for Codex, Claude Code, and OpenCode, remove unsupported `.codex/agents` projections, and persist required core skill checks for `verify` and `plan-refine`.

## 0.15.1

### Patch Changes

- 1cb288e: fix: resolve rulesync from agent-kit's own node_modules when not hoisted to consumer

  `wp compile` now finds `rulesync` via `createRequire(import.meta.url)` when not
  present in the consumer's own `node_modules/.bin/`. Previously failed with
  "rulesync is not installed" in any consumer where rulesync wasn't independently
  installed.

## 0.15.0

### Minor Changes

- 64a35fb: # v0.15.0 — Agent-asset compiler, audit slice, blueprint structured store

  ## New features

  ### Agent-asset compiler (multi-runtime)

  - `wp_compile` — thin wrapper over `rulesync generate --targets <list>` with O_EXCL lock, content-hash idempotency, and SHA-256 source hash manifest (`.agent/.compile-manifest.json`)
  - Four plugin manifest emitters: Claude Code (`.claude-plugin/plugin.json`), Codex (`.codex-plugin/`), Cursor (`.cursor-plugin/`), Gemini (`gemini-extension.json`)
  - AGENTS.md section-keyed merger with `memory.merge.yaml` directives (replace/append/prepend/delete/rotate); provenance JSON; rotation safeguards (opt-in, shallow-clone detection, dry-run)
  - `wp setup --with example-skill` — scaffolds `hello-webpresso/SKILL.md` and runs `wp compile` as final step
  - `wp skills orphans --fix` — removes generated skills with no canonical source in `.agent/skills/`
  - Three new audits: `wp audit gitignore-agent-surfaces`, `wp audit memory-unified`, `wp audit compile-drift`
  - `wp_qa` advisory tail-hint when passing QA with UI file changes
  - Anonymous opt-in TTHW telemetry (`WP_TELEMETRY=1 wp setup`; off by default)
  - OSS positioning docs: `docs/positioning-vs-rulesync.md`, `docs/wedge-experience/demo.sh`

  ### Minimal audit slice

  - `wp audit skill-sizes` — checks skills against configurable budgets in `.agent/.audit-budgets.yaml`
  - `wp audit broken-refs` — walks `.agent/**/*.md` for unresolved relative links and `@AGENTS.md` imports; supports `--staged` mode for pre-commit
  - `wp audit memory-rotation` — surfaces AGENTS.md rotation events from `.agent/.rotation-log.jsonl`
  - `wp tech-debt new --from-audit <nwp_>` — auto-files audit findings as `h-NNN-*.md` with content-hash idempotency
  - `wp setup --with husky` extended with pre-commit hooks for staged-mode audits

  ### Blueprint structured store (SQLite)

  - `better-sqlite3` SQLite projection of all blueprint markdown; cold-start rebuild from canonical markdown
  - Custom MCP server with 8 tools: `wp_blueprint_query`, `_new`, `_validate`, `_task_next`, `_task_advance`, `_promote`, `_finalize`, `_depgraph`
  - 9 pre-registered SQL query templates; `docs/blueprint-db-cookbook.md`
  - `wp blueprint db build|query|verify|browse` CLI verbs; Datasette integration for human browsing
  - `wp blueprint export --format spec-kit` — exports blueprints to spec-kit 4-file format (DRY KISS SOLID)
  - `wp blueprint task advance`, `promote`, `finalize` mutation verbs (atomic write + re-ingest)
  - Three SQL-backed audits (alpha-gated via `WP_USE_SQL_AUDITS=1`): `blueprint-db-consistency`, `blueprint-lifecycle-sql`, `tech-debt-cadence`

  ## Breaking changes

  - `wp cursor-windsurf-sync` is removed. Use `wp compile` instead.
  - `.agent/` symlink-era outputs replaced by rulesync-emitted files. Run `wp setup --with base-kit --with example-skill && wp compile` on fresh install.
  - Internal consumers (monorepo, ingest-lens) require a one-time cleanup: delete legacy `.windsurfrules`, `.cursorrules`, and old symlinks before bumping to v0.15.0. See `docs/positioning-vs-rulesync.md` for the rollout guide.

  ## Dependencies added

  - `rulesync@8.15.1` (exact pin)
  - `remark@15.0.1`, `remark-validate-links@13.1.0`, `remark-frontmatter@5.0.0`
  - `better-sqlite3@^12.9.0` + `@types/better-sqlite3`

## 0.14.0

### Minor Changes

- 3b5d862: Two stale-`@webpresso/utils` surfaces fixed in agent-kit:

  1. **`src/ai-tools/`** (5 files): the AI-tool implementations imported
     `getErrorMessage` / `formatBytes` / `StorageAdapter` / `SearchMatch`
     from `@webpresso/utils/{errors,format,storage-adapter}`. Now route
     through:

     - `@webpresso/runtime-format/errors` (getErrorMessage)
     - `@webpresso/runtime-format/format` (formatBytes)
     - `@webpresso/runtime-storage/storage-adapter` (StorageAdapter, SearchMatch)

  2. **`src/hooks/pretool-guard/validators/package-imports.ts`**: the
     duplicate `SHARED_FUNCTIONS` registry (separate from the one in
     `src/quality-engine/package-import-rules.ts` already migrated in
     commit `afb9a73`) still mapped 37 symbols to `@webpresso/utils`.
     Now mirrors the quality-engine registry: string/format/date/
     duration → `@webpresso/runtime-format`, errors →
     `@webpresso/runtime-format` (source `errors`), id → `@webpresso/runtime`
     (source `utils/id`).

  Catalog gained `@webpresso/runtime-format ^0.1.2` and
  `@webpresso/runtime-storage ^0.1.2` + both added to
  `minimumReleaseAgeExclude` (our own pre-release pubs).

  Root `package.json`: dropped `@webpresso/utils`, added the two
  thematic deps it actually needs at runtime.

  Surfaced by `/verify` fact-check after the parent
  consolidate-11-public cycle: previously typecheck passed only because
  `@webpresso/utils` was still in local node_modules cache; a fresh
  consumer install would 404 because the GH Package was deleted.

## 0.13.2

### Patch Changes

- ad99730: `catalog/agent/rules/changeset-release.md` updated to reflect the
  post-consolidation 3-repo public topology. The "active sibling repos"
  list now names `webpresso/framework/`, `webpresso/ui-kit/`,
  `webpresso/agent-kit/` (not the seven pre-consolidation siblings).
  The historical absorption is captured as a parenthetical so existing
  references in older docs still resolve to context.

## 0.13.1

### Patch Changes

- 3b32d9a: `blueprint-root`: make blueprint directory configurable and consistent across all commands.

  `BlueprintCreationService` hardcoded `webpresso/blueprints` while `resolveBlueprintRoot`
  (used by list, lifecycle moves, audit, execution) was context-aware, causing creation and
  reads to point at different directories in non-webpresso consumer repos.

  - Add `blueprintsDir?: string` to `.agent-kitrc.json` / `AgentkitConfig` as the
    highest-priority override — bypasses all directory detection.
  - `resolveBlueprintRoot` now reads `.agent-kitrc.json#blueprintsDir` first.
  - All blueprint commands (`new`, `list`, `audit`, `start`, `finalize`, `move`,
    execution progress sync) now route through `resolveBlueprintRoot`.
  - `wp setup` blueprint scaffolding respects the same resolution.
  - Pretool hook validators (`isBlueprintPath`, `isCanonicalBlueprintOverviewPath`,
    `getBlueprintPathViolation`, `getNonCanonicalPlanningPathViolation`) accept both
    `blueprints/` and `webpresso/blueprints/` as canonical by default; accept an explicit
    `blueprintsRoot` parameter for strict per-repo enforcement.

- 3b32d9a: `wp lint` and `wp format` now anchor to `process.cwd()` when invoked from the terminal.

  `resolveProjectRoot` in the shared MCP module checks `CLAUDE_PROJECT_DIR` first.
  When these CLI commands were run from a terminal inside Claude Code, that env var
  pointed at the session's project root (the workspace parent) rather than the terminal's
  CWD, causing `wp format --check` to fail with a missing `.gitignore` error and
  `wp lint` to scan unrelated sibling repos.

  Both CLI command handlers now pass `cwd: process.cwd()` explicitly, which bypasses the
  `CLAUDE_PROJECT_DIR` path. The env-var behaviour in `resolveProjectRoot` is intentional
  for MCP tool invocations where no reliable CWD is set; it must not leak into direct
  CLI invocations.

## 0.13.0

### Minor Changes

- afb9a73: **`@webpresso/agent-kit/quality-engine`**: update `SHARED_FUNCTIONS`
  registry to point at the new thematic `@webpresso/runtime-*` packages
  that replaced the deleted `@webpresso/utils` god-package.

  | Category                               | Old `package` value                  | New `package` value                                       |
  | -------------------------------------- | ------------------------------------ | --------------------------------------------------------- |
  | `string`, `date`, `duration`, `format` | `@webpresso/utils`                   | `@webpresso/runtime-format`                               |
  | `error`                                | `@webpresso/utils` (source `errors`) | `@webpresso/runtime-format` (source `errors`)             |
  | `id`                                   | `@webpresso/utils` (source `id`)     | `@webpresso/runtime` (source `utils/id` — legacy subpath) |
  | `validation`                           | `@webpresso/utils`                   | `@webpresso/runtime-validation`                           |
  | `@webpresso/hono-utils` entries        | unchanged                            | unchanged                                                 |

  `createBlockedResult(sharedFunc)` now emits suggestions like
  `import { capitalize } from '@webpresso/runtime-format/string'`. Downstream
  consumers of `wp audit package-imports-gate` and the pretool-guard
  package-imports validator pick this up automatically — no consumer
  config change needed beyond bumping agent-kit.

## 0.12.2

### Patch Changes

- a266ffc: `wp audit no-relative-parent-imports` now also skips `template/`
  directories. Files under `<pkg>/.../template/<v>/...` become a downstream
  customer's source tree when scaffolded — any `../` parent paths in their
  tsconfigs reference the scaffolded layout, not the repo layout — so they
  should never be reported on the source repo. This unblocks bundle-style
  packages (e.g. `packages/cli/bundles/workspace/template/v1/`) where
  scaffolded tsconfigs legitimately use relative paths into the customer's
  project root.

## 0.12.1

### Patch Changes

- 5fdd688: `wp audit no-relative-parent-imports` now also skips `.stryker-tmp/`
  directories (mutation-testing sandboxes — gitignored, generated per
  package). Without this skip, the audit reports parent-path violations
  on tsconfigs Stryker materialises inside `<pkg>/.stryker-tmp/sandbox-*/`,
  which are throwaway copies that legitimately point back at sibling
  packages and would otherwise force every Stryker-using consumer to
  exclude paths manually.

## 0.12.0

### Minor Changes

- c193429: Extend `wp audit no-relative-parent-imports` to also scan every
  `tsconfig*.json` for parent-relative paths (`../`) in any string value:
  `extends`, `paths`, `references`, `include`, `exclude`, `rootDir`,
  `outDir`, `baseUrl`, etc. Use a package alias
  (`@scope/preset/tsconfig.json`) or a workspace path mapping instead.

  The walker skips `node_modules`, `dist`, `build`, `.git`, `.cache`,
  `.next`, `.turbo`, `.omx`, and `.claude` (per-worktree clones live there).

  Also fixes four stale `extends` paths inside agent-kit's own packages
  (`agent-e2e-preset`, `agent-launch`, `agent-test-preset`, `agent-vitest`):
  the T1.1 absorption renamed `packages/typescript-config/` →
  `packages/agent-tsconfig/`, but the `extends` strings still pointed at
  the pre-rename directory via `../typescript-config/`. They now resolve
  via the published alias `@webpresso/agent-tsconfig/<preset>.json`, which
  is both correct and survives future renames.

  Picked up automatically by `wp audit guardrails` and `wp audit quality`.

## 0.11.0

### Minor Changes

- 8e60dcf: Add `wp audit no-link-protocol` repo guardrail. Fails when any
  `package.json` (root or workspace member) declares a `link:<filesystem-path>`
  value in `dependencies`, `devDependencies`, `optionalDependencies`, or
  `pnpm.overrides`. `link:` filesystem-couples consumer clones to a
  maintainer's directory layout and hides version-pin drift — use `catalog:`
  (cross-repo) or `workspace:*` (intra-repo) instead.

  Automatically picked up by `wp audit guardrails` (pre-commit composite) and
  `wp audit quality` (full ship gate).

## 0.10.0

### Minor Changes

- 85b63d5: Add ./ai-memory and ./ai-prompts subpaths — memory primitives (checkpoint, facts, hierarchy) and prompt/debate primitives extracted from the Webpresso monorepo.
- 85b63d5: Add ./ai-tools subpath — file operation tools (read, write, search, list) for AI agents using a StorageAdapter interface, extracted from the Webpresso monorepo.
- ba84d37: Cross-runtime dev-link auto-restore + warning. Three new pieces:

  - **`ak-restore-dev-links` bin** — consumer postinstall helper. Reads
    `<consumer>/.webpresso/agent-kit-dev-link.json` (written by
    `pnpm dev:link --consumer …`) and re-creates the
    `node_modules/@webpresso/agent-kit` symlink that `pnpm install`
    silently overwrites with the pnpm-store snapshot. Exits 0 silently
    when the state file is absent (CI / never linked); exits 1 loudly
    when the state file points at a missing source (no silent
    fallback to stale code).

  - **`ak-check-dev-link` bin** — SessionStart hook. Emits the
    `{"hookSpecificOutput":{"hookEventName":"SessionStart",
"additionalContext":"…"}}` envelope shared by Claude Code
    (docs.claude.com/en/docs/claude-code/hooks) and Codex CLI
    (developers.openai.com/codex/hooks) when the symlink doesn't match
    the state file. Catches the rare `pnpm install --ignore-scripts`
    path where postinstall didn't fire. Always exits 0; never blocks.

  - **opencode plugin scaffolder** — `wp setup` now writes
    `.opencode/plugins/agent-kit-dev-link.js`, which shells out to
    `ak-check-dev-link` on `session.created` and pushes the same
    message into `output.context` during `experimental.session.compacting`.
    Single source of truth across all three runtimes.

  `wp setup` wires `ak-check-dev-link` into the SessionStart array of both
  `.claude/settings.json` and `.codex/hooks.json` automatically; existing
  hook entries are preserved (additive merge, dedup by bin name).

  Consumer migration: add `bun ./node_modules/.bin/ak-restore-dev-links`
  to your repo's `postinstall` script. Then run `wp setup` to wire the
  SessionStart hook + opencode plugin. State file is opt-in: `pnpm
dev:link --consumer <your-repo-root>` from this repo creates it.

## 0.9.0

### Minor Changes

- 562c419: Adds `@webpresso/agent-kit/quality-engine` subpath. The barrel re-exports every named symbol previously published from `@webpresso/quality-engine` (target-resolver, command-builder, log-paths, workspace-config, test-classification, package-import-rules). Folds the standalone `@webpresso/quality-engine` package per Decision 4 of the public-extraction roadmap. Hard cut — the standalone package is being deprecated and archived in coordination with this release. See `webpresso/blueprints/in-progress/fold-webpresso-quality-engine-into-webpresso-agent-kit-decision-4/_overview.md`.

## 0.8.6

### Patch Changes

- 0b29818: fix: doctor.test hardcoded local path and node_modules bin resolution

## 0.8.5

### Patch Changes

- da9ffeb: fix(mcp/run-command): prepend `{cwd}/node_modules/.bin` to PATH before spawning

  `runCommand` now mirrors npm/pnpm script execution: when a `cwd` is provided, it
  injects `{cwd}/node_modules/.bin` at the front of the child process PATH. This
  ensures project-local binaries (oxlint, tsc, etc.) resolve without a global
  install, matching the behaviour of `npm run` / `pnpm run`.

  Previously the MCP server inherited Claude Code's PATH, which does not include
  `node_modules/.bin`. Any tool missing from the global PATH (e.g. oxlint installed
  only locally) would ENOENT and fall through to the pnpm fallback, which in turn
  fails on repos using `just` rather than a root-level `pnpm lint` script.

## 0.8.4

### Patch Changes

- b504a77: Fix OpenCode agent-kit MCP wiring to launch the MCP entry directly, and make host verification fail when OpenCode lists an MCP server but cannot connect to it.
- 0f8620b: Keep the Claude marketplace manifest version in sync during Changesets versioning so published release metadata does not drift from `package.json`.

## 0.8.3

### Patch Changes

- 35f243d: Teach `wp hooks doctor` to verify installed Codex/OpenCode/Claude host surfaces, add a gated real-host smoke suite for Codex/OpenCode, and include `agent-kit` alongside `context-mode` in generated `opencode.json` MCP config.

## 0.8.2

### Patch Changes

- dfae682: Add a `context-mode` setup preset that patches Codex's `config.toml` and `hooks.json` plus project-local `opencode.json`, so `wp setup --with context-mode` wires context-mode for both Codex CLI and OpenCode.

## 0.8.1

### Patch Changes

- d230932: Keep consumer Claude scaffolds stable across reinstalls by linking rule/subagent files through `node_modules/@webpresso/agent-kit` aliases instead of resolved pnpm store paths, and materialize allowlisted `.claude/rules/*` overrides as real consumer-owned files instead of symlinks.

## 0.8.0

### Minor Changes

- ba66596: Eliminate the dangling-symlink class in `.agents/skills/` and harden `wp setup`
  against partial / non-local installs.

  **Fix:** `wp setup` no longer emits broken symlinks under
  `.agents/skills/<slug>/<file>` when the skill's source path is missing.
  The legacy `syncPerSkillConsumer` writer had an asymmetric fallback (listing
  fell back to `.agent/skills/`, but symlink targets pointed at the missing
  `node_modules/.../skills/`), so it would print `✅` while leaving every
  symlink dangling. The replacement `syncSkillFanout` resolves source from
  `.agent/skills/<slug>/` only, walks recursively to support nested asset
  files (e.g. `tanstack-query/references/`, `systematic-debugging/CREATION-LOG.md`),
  and reuses `isSymlinkPointingTo` for idempotency.

  **Fix:** `wp setup` and `wp sync` now exit 1 with an actionable message
  when `@webpresso/agent-kit` is missing from the consumer's `node_modules/`
  (e.g. after a failed `pnpm install` or a yanked dependency).

  ```
  ak init: @webpresso/agent-kit not installed in node_modules.
  Run `pnpm install` first.
  ```

  Previously, `loadContent`'s technical "catalogDir does not exist" error
  surfaced through to the user without rewrite.

  **Breaking:** `.agents/skills/` is now exclusively managed by agent-kit.
  Top-level directories that don't correspond to a skill in `.agent/skills/`
  are removed recursively on next `wp setup`. Each removal logs to stderr
  (`Removed unexpected directory: .agents/skills/<slug>`) so the action is
  never silent. The legacy writer was conservative — it only removed empty
  stale directories — but the contract was always "agent-kit owns this
  path" (see the `# managed by @webpresso/agent-kit (skill-sync)` block in
  your `.gitignore`). If you have hand-curated content under
  `.agents/skills/<slug>/`, move it to a slug name not in `.agent/skills/`
  or relocate it outside the directory.

  **Breaking:** `wp setup` now expects `@webpresso/agent-kit` to be
  installed in the consumer's `node_modules/`. Running via a global
  install (e.g. a manual symlink in `/opt/homebrew/bin/ak` or
  `pnpm install -g @webpresso/agent-kit`) is no longer supported in
  silence: setup prints a stderr warning when the running CLI does not
  live under `<repoRoot>/node_modules/`. The warning is non-blocking, but
  the global-install path produced non-reproducible setups (symlinks
  resolving to whatever version was globally installed; lockfile irrelevant)
  and is being deprecated. Pin `@webpresso/agent-kit` as a local dep and
  run via `pnpm exec wp setup`.

  **Internal:** Dropped `sourceRootDir` and `sourcePrefix` from
  `PerSkillConsumerConfig`. The legacy `syncPerSkillConsumer` /
  `syncPerSkillConsumers` exports are renamed to `syncSkillFanout` /
  `syncSkillFanouts` and now return `{ wrote: number }` instead of a bare
  number. `isSymlinkPointingTo` is now exported from
  `@webpresso/agent-kit/symlinker/unified-sync` for reuse across writers.

### Patch Changes

- 6fbe0dd: Migrate deprecated Codex `[features].codex_hooks` config entries to `[features].hooks` after `wp setup` runs the OMX preset, so older oh-my-codex releases do not keep triggering Codex deprecation warnings.

## 0.7.3

### Patch Changes

- f043257: Stop `wp setup --overwrite` from clobbering consumer-owned `.gitignore`
  and `pnpm-workspace.yaml`.

  Both files are now treated as **bootstrap-only** by the base-kit
  scaffolder: written from the catalog template only when absent, never
  overwritten once they exist (not even under `--overwrite`).

  These are consumer-owned config that grow with project-specific content
  the generic template can't reproduce — catalog entries referenced by
  `pnpm.overrides`, monorepo-specific ignore patterns for generated
  artifacts, etc. Re-templating them on every postinstall silently
  deletes that content.

  Verified failure mode (webpresso/monorepo, 2026-05-07):
  `wp setup --overwrite` running as 0.7.x postinstall reduced
  `pnpm-workspace.yaml` from 221 lines (full catalog) to 34 lines
  (generic template), removing every catalog entry referenced by
  `pnpm.overrides` and making the next `pnpm install` fail with
  `ERR_PNPM_CATALOG_IN_OVERRIDES`. The same overwrite stripped
  monorepo-specific `.gitignore` rules and unmasked 23k+ generated
  artifacts to git status.

  The other base-kit templates (`.husky/*`, `.editorconfig`,
  `.secretlintrc.json`, `commitlint.config.ts`,
  `.github/workflows/ci.webpresso.yml`) keep their existing
  `writeFileMerged` behavior — they're agent-kit-versioned configs where
  overwrite-on-update is the right semantic.

## 0.7.2

### Patch Changes

- 4e33177: Register `wk` as a published bin so consumers can run `wp setup`,
  `wp audit`, etc. directly from `node_modules/.bin/ak` (and
  `pnpm exec ak ...`) without the `bun ./node_modules/@webpresso/agent-kit/src/cli/cli.ts`
  workaround.

  The package shipped 6 hook bins (`ak-pretool-guard`, `ak-post-tool`,
  etc.) but never registered the main `wk` CLI entrypoint. Consumers
  hit this when `wp audit agents` demands `scripts.setup:agent === "wp setup"`
  literally, but `wk` itself wasn't on PATH — forcing every consumer to
  either fail the audit or carry a duplicate bun-driven `setup:agent-kit`
  script alongside the canonical `setup:agent`.

  `src/cli/cli.ts` already has the `#!/usr/bin/env bun` shebang, so the
  fix is one entry: `"ak": "./src/cli/cli.ts"` in the bin map.

## 0.7.1

### Patch Changes

- 04111a1: Fix `wp audit agents` reading `.codex/hooks.json` as flat-form when the
  canonical Codex schema is wrapped under `"hooks"`.

  `parseHooks` returned `parsed.hooks` for `claude` but raw `parsed` for
  `codex`. The agent-hooks scaffolder writes wrapped form via
  `hoistTopLevelEvents` (matching `https://developers.openai.com/codex/hooks`),
  so every consumer with a freshly-scaffolded `.codex/hooks.json` saw the
  audit report all 5 ak-\* hooks as missing — even though they were present.
  This false-positive blocked commits via the `audit agents` pre-commit
  gate on consumers like `webpresso/monorepo`.

  Now Codex audit reads `parsed.hooks` first (wrapped) and falls back to
  `parsed` only when no `hooks` wrapper is present, preserving backwards-compat
  with legacy pre-migration flat-form files.

  Existing `seedConsumerRepo` test fixture updated to write the wrapped form
  (matching what the scaffolder actually emits today). The self-hosting test
  keeps the flat-form fixture to lock the backwards-compat path.wp*wp*
  wp*wp_wp_wp*

## 0.7.0

### Minor Changeswp\_

- 2db1b01: Add optional `cwd` param to all MCP dev-workflow tools: `wp_test`, `wp_lint`,
  `wp_typecheck`, `wp_qa`, `wp_e2e`, `wp_audit`.

  The MCP server inherits the cwd of the Claude Code session that spawned it.
  When a session was opened in one repo and called an `wp_*` tool against a
  sibling repo, the backend ran against the session's cwd and failedwp\_.g.
  `pnpm test` in a yarn-configured tree returned "This project is configured
  to use yarn"; `tsc --noEmit` witwp_o tsconfig at cwd dumped `--help`).

  `cwd` is a walk-start: the resolver still walks up to find the workspace
  root (pnpm-workspace.yaml / package.json / Justfile), so callers can pass
  any subdir of the target repo and get correct backend selection. `wp_qa`
  forwards `cwd` to all three sub-tools so a composite QA run from the wrong
  session cwd works in one call. `wp_audit` accepts `cwd` as an alias for the
  existing `directory` param.

  Backwards-compatible: omitting `cwd` preserves prior behavior
  (`process.cwd()`).

### Patch Changes

- 2db1b01: Fix the rtk scaffolder so `wp setup` actually installs rtk.

  The previous scaffolder shipped two unverified guesses:

  1. `brew install rtk-ai/rtk/rtk` via `tap "rtk-ai/rtk"` — that tap does not
     exist (`https://github.com/rtk-ai/homebrew-rtk` returns 404), so every
     `wp setup` on macOS hit `rtk-not-found` and silently degraded. The real
     formula is in homebrew-core: `brew install rtk` (verified against
     `Formula/r/rtk.rb` v0.39.0). Brewfile entries in consumer repos that
     followed the same wrong path also failed `brew bundle install`.
  2. `RTK_HOOK_EXCLUDE_COMMANDS` env var passed to `rtk init` — rtk does not
     read this env var (verified against the rtk binary's strings table). The
     env var was a no-op. Real exclusion needs the proper rtk mechanism (TOML
     filters or hook matcher) and is left as a follow-up.

  Also fixes an integration-test PATH leak that masked the bug on machines
  where rtk was not installed locally.

## 0.6.0

### Minor Changes

- 1e7ec89: Plugin manifest: PreToolUse now matches Bash + MultiEdit

  The Claude Code plugin install path wp*viously left Bash unguarded —
  the SessionStart routing block was advisory but not enforced. Adding
  `Bash|MultiEdit` to the PreToolUse matcher (full matcher now
  `Bash|Edit|Write|MultiEdit|WebFetch|Read|Grep`) lets the
  `forbidden-commands` validator actually intercept `pnpm vitest`,
  `just test`, `oxlint`, `tsc`, and other dev-workflow shell commands and
  redirect them to the corresponding `wp*\*` MCP tools.

  Matches context-mode's own plugin precedent (their `hooks/hooks.json`
  registers PreToolUse for Bash, WebFetch, Read, Grep, Agent, and
  `mcp__*` matchers).

  The npm + `wp setup` install path and the Codex hook scaffolder were
  already correct; this change closes the gap on the plugin install path.

### Patch Changes

- c47b64a: Fix `base-kit` templates: invoke `wk` via `pnpm exec` instead of `npx`.

  `wp setup --with base-kit` installs `.husky/pre-commit`, `.husky/commit-msg`,
  and `.github/workflows/ci.webpresso.yml` from `catalog/base-kit/`. Previously
  all three shelled out via `npx ak ...`, which routes through npm. In any
  pnpm-only repo (i.e. all webpresso consumers), npm's arborist parses the
  workspace and rejects pnpm-specific protocols like `catalog:` with
  `EOVERRIDE`. The hook then exits 1 and every `git commit` that touches
  `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` fails — even
  though `pnpm install --frozen-lockfile` itself accepts the same workspace
  cleanly.

  Switching to `pnpm exec` keeps everything in pnpm's resolution path. The
  binary still resolves through `node_modules/.bin/ak`, but no npm process
  is spawned and no workspace re-parse happens.

  Files updated:

  - `catalog/base-kit/.husky/pre-commit.tmpl`
  - `catalog/base-kit/.husky/commit-msg.tmpl`
  - `catalog/base-kit/.github/workflows/ci.webpresso.yml.tmpl`

  Consumers that already installed prior templates: re-run `wp setup
--overwrite --with base-kit`, or hand-edit the three files; the diff is
  literally `s/nwp_pnpm exec/`.

## 0.5.1wp\_

### Patch Changes

- b7fa591: Fix `wp_blueprint` MCP tool: flatten `inputSchema` so it serializes with root-level `type: "object"`.

  The MCP spec (`ToolSchema` in `@modelcontextprotocol/sdk`) requires evewp_tool's `inputSchema.type` to be exactly `"object"`. `wp_blueprint` previously declared its input schema as a Zod `discriminatedUnion`, which serializes to JSON Schema as `{ oneOf: [...] }` with no top-level `type`. Strict MCP clients (e.g. Codex) rejected the entire `tools/list` response with:

  ````
  "path": ["tools", N, "inputSchema", "type"], "message": "expected 'object'"
  ```wp_wp_wp_wp_wp_wp_wp_wp_

  That broke ALL agent-kit MCP tools for the offending client, not just `wp_blueprint`.

  The fix flattens the schema to a single `z.object({ action, ...optional fields })` and enforces the per-action invariants (`goal` required when `action === 'new'`) via `superRefine`. JSON-schema clients now see one valid object shape; runtime dispatch is unchanged.

  All 8 MCP tools (`wp_lint`, `wp_qa`, `wp_e2e`, `wp_test`, `wp_format`, `wp_blueprint`, `wp_typecheck`, `wp_audit`) now serialize with spec-compliant root shape.
  ````

## 0.5.0

### Minor Changes

- 25c065c: Codex hooks scaffolder + gstack opt-out

  **Codex hooks schema fix.** `wp setup` now writes `.codex/hooks.json` under the
  canonical wrapped `hooks` key (`{ "hooks": { "SessionStart": [...] } }`) per
  Codex's official schema at `developers.openai.com/codex/hooks`. Previous
  versions wrote event keys at the top level, which Codex silently ignored —
  agent-kit hooks were never actually firing in any Codex session. Stale
  flat-form entries are migrated automatically: the next `wp setup` hoists any
  top-level `SessionStart`/`PreToolUse`/`PostToolUse`/`UserPromptSubmit`/`Stop`
  keys into the wrapped `hooks` block, deduping with `ensureGroup`.

  **DRY refactor.** The 5-event ak-_ hook list now lives in a single
  `buildAgentKitHookGroups({ resolveBin, matchers })` helper consumed by both
  `patchClaudeSettings` and `patchCodexHooks`. Adding a new ak-_ hook is a
  one-line append and propagates to both surfaces.

  **Gstack opt-out.** `WP_SKIP_GSTACK=1 wp setup` now skips the gstack
  scaffolder with a stderr warning. `gstack` remains in `DEFAULT_PRESETS` so
  `wp setup` (no flags) still installs and refreshes gstack on every run; the
  new env-var is for CI / sandboxed environments without network. Most
  consumer repos treat gstack as a hard prerequisite — opt out only when you
  must.

  **MCP readiness sentinel — decoupled scan-based reader.** The pretool-guard
  hook routes dev-workflow commands (`pnpm test`, `just lint`, `wp ...`) to
  the agent-kit MCP tool surface when MCP is alive, falling back to a
  `just <task>` recipe otherwise. Earlier the readiness sentinel filename was
  derived from a value (`process.ppid`, then briefly a project-anchor hash)
  that BOTH writer and reader had to agree on. Both approaches break under
  real IDE topologies: PPID assumes the IDE host is the direct parent of
  both processes (Codex CLI routes hooks through workers), and cwd-derived
  keys assume the IDE spawns the MCP server with the project root as cwd
  (Codex spawns it with the script's directory).

  The fix decouples the two halves. The writer claims a unique filename
  (`ak-mcp-ready-${process.pid}` by default, overridable via
  `WP_MCP_SENTINEL_KEY` for tests). The reader scans `tmpdir` for ALL
  `ak-mcp-ready-*` files and returns true if any contains a live PID
  (verified via `process.kill(pid, 0)`). Reader and writer no longer need
  to agree on a key — only on a stable filename pattern. The agent-kit MCP
  tool surface is functionally global, so "any agent-kit MCP is alive" is
  sufficient signal to enable MCP-tool routing on the hook side.

### Patch Changes

- 25c065c: `wp setup` now upserts `[mcp_servers.agent-kit]` into Codex's `config.toml`.

  The codex-mcp scaffolder previously only managed the Playwright MCP block; users who wanted agent-kit's MCP server reachable from Codex had to hand-edit `~/.codex/config.toml`. The Claude Code side was always self-registered via the plugin manifest, so this gap was Codex-only.

  The new `ensureCodexAgentKitMcp` helper probes for an agent-kit install at scaffold time:

  1. Claude plugin install (`~/.claude/plugins/cache/agent-kit/agent-kit/`)
  2. bun global (`~/.bun/install/global/node_modules/@webpresso/agent-kit/`)
  3. pnpm global (`$(pnpm root -g)/@webpresso/agent-kit/`)
  4. npm global (`$(npm root -g)/@webpresso/agent-kit/`)

  Whichever exists first becomes the absolute path written into the codex config block. If none are found, the scaffolder logs a clear warning telling the user to install agent-kit globally — no broken config is written.

  Migration note: when the unified-cli sibling cutover lands and `webpresso mcp serve` becomes the canonical entrypoint, this scaffolder collapses to writing a fixed `command = "webpresso", args = ["mcp", "serve"]` block — the install-detection probe goes away.

  New exports from `@webpresso/agent-kit`'s codex-mcp scaffolder for downstream consumers:

  - `ensureCodexAgentKitMcp({ options, configPath?, entryPath?, probe? })`
  - `findAgentKitMcpEntry({ candidates?, pnpmGlobalRoot?, npmGlobalRoot? })`
  - `agentKitMcpBlock(entryPath)`, `upsertAgentKitMcpServer(raw, entryPath)`
  - `AGENT_KIT_MCP_SERVER_NAME`, `AGENT_KIT_MCP_HEADER`

## 0.4.0

### Minor Changeswp\_

- 12fwp_2: Consumer-rule + consumer-skill wp_mitives, unified `wp sync` command, and removal of legacy sync commands.

  **New primitives**

  - `wp lint [--fix] [--no-pnpm-fallback]` — wraps `oxlint` (with `pnpm lint` fallback) and prints structured issues. Mirrors the `wp_lint` MCP tool. Exit code matches lint result.
  - `wp format [--check]` — wraps `oxfmt` to format the workspace in place; `--check` exits 1 on any unformatted file (CI / pre-commit friendly). No fallback — `oxfmt` must be installed.
  - `wp_format` MCP tool — same shape as `wp_lint`, returns the standard summary-first payload, sets `isError: true` when `oxfmt` is missing on PATH.
  - `@webpresso/agent-kit/format` subpath export — `runFormat({ cwd, files?, check?, signal? })` for programmatic use by scaffolders / CI orchestrators.
  - agent-kit dogfoods both: `pnpm qa` now runs `pnpm lint` + `pnpm format:check` between typecheck and test; `.husky/pre-commit` calls `wp format --check` then `wp lint`; CI's `check` job runs `pnpm run format:check` + `pnpm run lint` (replacing the silent `pnpm -r run lint 2>/dev/null || true`).
  - `wp rule new|list|show|deprecate <slug>` — consumer-owned rules at `<repo>/agent-rules/<slug>.md`. Slug-only filenames; frontmatter validated by Zod (`type`, `slug`, `title`, `status`, `scope`, `applies_to`, `related`, `created`, `last_reviewed`, optional `deprecation_date`).
  - `wp skill new|list|show|deprecate <slug>` — consumer-owned skills at `<repo>/agent-skills/<slug>/SKILL.md` (dirs bundle SKILL.md + arbitrary assets).
  - `wp audit rules` and `wp audit skills` — schema validation, slug-collision detection (consumer + catalog hard-fail), broken-`related` ref detection, stale-review warnings (>180 days). Wired into `REPO_AUDIT_REGISTRY`.
  - Shared `src/content/{schema,loader,audit,dispatch}.ts` module — single source of truth for both kinds; per-kind difference is parameterized (file vs dir).

  **Unified sync replaces copy-on-install**

  - New `wp sync [--kind rules|skills] [--check]` command. `--check` exits 1 on drift (CI-friendly); regular run prints "restart your IDE" when files were written.
  - Per-IDE distribution: symlink for `.agent/{rules,skills}/`, `.codex/agents/`, `.claude/skills/`; copy for `.cursor/rules/`, `.windsurf/skills/`; TOML transform for `.gemini/commands/`.
  - `wp setup` no longer copies catalog rules/skills into `.agent/` — instead invokes `wp sync` post-scaffold. Result: zero `.new` sidecars on `pnpm install`, fully idempotent re-runs, no drift surface.
  - pnpm `.pnpm/<version>/` instability absorbed via `realpathSync` on catalog dir.

  **Breaking changes (pre-1.0 minor)**

  - `wp symlink sync` removed. Use `wp sync`.
  - `wp cursor-windsurf-sync` removed. Use `wp sync`.
  - `wp skills` (plural) renamed to `wp skill` (singular) — matches `wp blueprint` / `wp tech-debt` convention. The `install`/`uninstall` actions survive but with new semantics: registry-only edit to `.agent-kitrc.json#installed.tier3Skills` (no copy). Running `wp skills` now errors with a redirect message.
  - `wp setup --overwrite` no longer touches `.agent/rules/` or `.agent/skills/` — they are derived from sync. Existing `--overwrite` semantics for `AGENTS.md`, `.claude/settings.json`, `.codex/hooks.json`, `docs/templates/` are unchanged.

  **Catalog promotions**

  - Three universal rules promoted into `catalog/agent/rules/`: `no-timeout-as-fix.md`, `pre-implementation.md`, `ts-coding-conventions.md`.

  **Migration notes for consumers**

  - After upgrading, run `pnpm install` once. `agent-rules/` and `agent-skills/` are scaffolded with `.gitkeep` + README. Add repo-specific rules via `wp rule new <slug>` rather than editing canonical files.
  - Slug collisions between consumer rules/skills and catalog content are hard audit failures — pick a different slug or upstream the change.
  - Add `wp audit rules` and `wp audit skills` to your CI checklist.

## 0.3.0

### Minor Changes

- Finish the elegance-pass bootstrap work so fresh repos get the right agent
  surfaces and routing by default. This release adds hard-fail agent audits,
  scoped skill hooks, canonical subagent distribution, and MCP-shaped forbidden
  command redirects with cleaner routing ownership.

All notable changes to `@webpresso/agent-kit` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

## [Unreleased]

## [0.2.0] — 2026-05-02

### Added

- `@webpresso/agent-kit/lint` subpath export: `runLint(options): Promise<LintResult>` plus `parseOxlintIssues` helper for framework-level lint orchestration without the MCP transport.
- `@webpresso/agent-kit/typecheck` subpath export: `runTypecheck(options): Promise<TypecheckResult>` plus `parseTscOutput` helper for framework-level typecheck orchestration without the MCP transport.

## [0.1.0] — 2026-04-25

### Added

- Blueprint runtime: `wp blueprint new/list/show/audit/exec/move/finalize/start/task`
- Agent-surface symlinker: `wp symlink sync/check/import`
- Skills catalog with 13 bundled skills
- `wp setup` scaffolder: Tier-1/2/3 skill tiers, presets (omx, gstack, lore-commits)
- Claude Code plugin (`.claude-plugin/`) with PreToolUse, PostToolUse, Stop, SessionStart hooks
- Coordinated PreToolUse hook: dev-command routing + sandbox routing + validators in one process
- SessionStart routing blocwp_WP_ROUwp_G_BLOCwp_ML) injectewp_t sewp_on starwp_nd after compaction
- `wp audit` suite: tph, bundle-budget, catalog-drift, docs-frontmatter, blueprint-lifecycle,
  no-relative-parent-imports, mutation, quality composite gate
- `wp hooks doctor` for post-install plugin health verification
- `wp tech-debt` lifecycle management (new, list, review)
- `wp symlink import --from <file>` for onboarding existing IDE rule files
- MCP server with 6 tools: wp_test, wp_lint, wp_typecheck, wp_qa, wp_audit, wp_blueprint
- `resolvePackageAsset()` utility replacing fixed-depth relative path traversals
- `auditNoRelativeParentImports` guardrail for 3+ level runtime path traversals
