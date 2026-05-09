---
type: blueprint
status: in-progress
complexity: M
created: '2026-05-09'
last_updated: '2026-05-09'
progress: '0% (refined — eng + DX + plan-refine reviews complete; F1 fix applied)'
depends_on: []
tags: [extraction, hard-cut, decision-4, fold]
---

# Fold @webpresso/quality-engine into @webpresso/agent-kit (Decision 4)

**Goal:** Hard-cut fold of `@webpresso/quality-engine` into `@webpresso/agent-kit`. No shim, no transitional re-export, no backwards-compat layer. Single PR wave that moves modules, migrates consumers, deletes the standalone repo. Closes Decision 4 of the public-extraction roadmap.

## Product wedge anchor

- **Stage outcome:** Decision 4 of [`webpresso-public-extraction-roadmap`](../../../monorepo/webpresso/blueprints/completed/webpresso-public-extraction-roadmap/_overview.md) — "agent-kit + audit harness" brand wedge: one install, one CLI, one mental model. Also unblocks archiving `webpresso/quality-engine` on GitHub.
- **Consuming surface:** `ak audit mutation` / `ak audit quality` (already exposed by `agent-kit/src/cli/commands/audit.ts:89,91`) + new agent-kit subpath exports `@webpresso/agent-kit/quality-engine` and six leaf subpaths consumed by `monorepo/apps/{cli2,scripts,cli-wp}`.
- **New user-visible capability:** After this lands, `pnpm add -D @webpresso/agent-kit` is sufficient for the entire audit/mutation/quality story. No second sibling-package install. The agent-kit README's "what changes after `ak setup`" earns the credibility signal that every audit lives in the same package as `ak`.

## Architecture Overview

```text
BEFORE (current state)
  webpresso/quality-engine/        @webpresso/quality-engine@0.2.0   ──┐
    src/{6 .ts modules}                                                ├─ catalog: dep
    package.json#exports = 7 subpaths                                  │
                                                                       ▼
  webpresso/agent-kit/             @webpresso/agent-kit@0.8.x         monorepo/apps/{cli2,scripts,cli-wp}
    src/cli/commands/audit.ts (already has 'mutation','quality' kinds)
    NO dep on @webpresso/quality-engine

AFTER (hard cut, internal-only re-frame)
  webpresso/agent-kit/             @webpresso/agent-kit@<minor-bump>  ──┐
    src/quality-engine/{6 .ts modules + barrel index.ts}                ├─ catalog: dep
    package.json#exports adds ONE subpath: ./quality-engine             │
      (the barrel re-exports every named symbol from the 6 modules)     ▼
                                                                        monorepo/apps/{cli2,scripts,cli-wp}
  webpresso/quality-engine/        DELETED                                imports: '@webpresso/agent-kit/quality-engine'
  GH repo webpresso/quality-engine ARCHIVED                                (single import path, all named symbols)
```

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Migration shape | **Hard cut, no shim** | Decision 3 (process-utils/cli-utils) used a transitional re-export — this fold deliberately does not, per the workspace's no-backwards-compat preference. agent-kit + monorepo are the only two consumers and they ship in the same wave. |
| New module location | `agent-kit/src/quality-engine/` (mirroring quality-engine's `src/`) | Matches the existing per-domain layout (`src/audit/`, `src/blueprint/`, `src/symlinker/`). Self-contained subdirectory, easy to grep for. |
| New export shape | **One** root subpath: `@webpresso/agent-kit/quality-engine`. The barrel `src/quality-engine/index.ts` re-exports every named symbol from the 6 modules. **No leaf subpaths.** | Codex outside-voice push: trading two public packages for one + seven subpaths doesn't shrink surface area. One root subpath keeps the public API minimal while still letting consumers import the named symbols they need. Consumer migration: `@webpresso/quality-engine/<sub>` → `@webpresso/agent-kit/quality-engine` (one path, named symbols at the call site). |
| Stryker integration | Move `@stryker-mutator/*` devDeps from quality-engine to agent-kit (only if not already present) | Mutation runner has to live wherever the modules live. |
| `monorepo` migration | Single PR touching all three apps (`cli2`, `scripts`, `cli-wp`) + drop the `catalog:` entry in the same change | Atomic. No interim state where some apps point at one source and others at another. |
| GH archive trigger | Archive `webpresso/quality-engine` immediately after the monorepo PR merges and the `@webpresso/quality-engine` package is marked `deprecated` on the GitHub Packages registry | One door, no soak. The package was Wave-1 and only has the three consumers; soak adds risk without value. |
| Release sequencing | **Three PRs, strict order** (see "Release sequencing" subsection below) | The plan touches three separate git repos; calling it "two PRs" undercounts the coordination needed. |
| Mutation parity | Capture quality-engine's per-module Stryker scores **before** PR1 ships; assert agent-kit's scores on the relocated modules are **≥ baseline** after PR1. | Strongest evidence for "pure relocation" claim. Cheap (one Stryker run); blocks silent quality regressions. |
| CHANGELOG ownership | Each agent-kit ship is driven by Changesets — `.changeset/<slug>.md` written in PR1, CHANGELOG.md updated by the Version-Packages CI workflow. **No hand-written CHANGELOG.md edits.** | Matches `catalog/agent/rules/changeset-release.md`. Hand-writing CHANGELOG conflicts with the Version-Packages PR. |

## Release sequencing

This plan ships **three coordinated PRs across three repositories**. Each PR is mergeable on its own; the order matters for `pnpm install` correctness and for the deprecation flow.

```text
PR1  webpresso/agent-kit          minor bump (publishes new exports)
       └─ Changesets opens "Version Packages" PR → merge → publish to GH Packages
PR2  webpresso/monorepo           rename imports + drop `catalog:` dep
       └─ depends on PR1's published version being on the registry
       └─ `pnpm install` from monorepo root must resolve clean
       └─ `just qa` green
PR3  webpresso/quality-engine     final Changesets PR
       └─ depends on PR2 having merged (zero remaining consumers in workspace)
       └─ description: "Removed. Use @webpresso/agent-kit/quality-engine subpaths."
       └─ after publish: `npm deprecate @webpresso/quality-engine "..."`
       └─ then: `gh repo archive webpresso/quality-engine --yes`
       └─ then: delete local working tree
```

No PR ships without the prior PR fully merged + (for PR1) released. This is an enforced sequence, not a guideline.

## Quick Reference (Execution Waves)

| Wave              | Tasks                | Dependencies         | Parallelizable |
| ----------------- | -------------------- | -------------------- | -------------- |
| **Wave 0**        | 0.1                  | None                 | 1 agent (pre-flight gate) |
| **Wave 1**        | 1.1, 1.4             | Wave 0               | 2 agents (1.4 writes only `.parity-baseline.json`; no `package.json` overlap with 1.1) |
| **Wave 2**        | 1.3                  | Wave 1 (F1: `package.json` write conflict — serialize after 1.1) | 1 agent |
| **Wave 3**        | 1.2                  | Wave 2 (needs modules + Stryker config + parity baseline) | 1 agent |
| **Wave 4**        | 1.5                  | Wave 3 (needs published-shape package) | 1 agent (gates PR1 publish) |
| **Wave 5**        | 2.1                  | Wave 4 + PR1 published | 1 agent      |
| **Wave 6**        | 3.0, 3.1             | Wave 5 (PR2 merged)    | 1 agent (3.0 → 3.1, both inside PR3) |
| **Wave 7**        | 4.1, 4.2, 4.3        | Wave 6                 | 3 agents     |
| **Critical path** | 0.1 → 1.1 → 1.3 → 1.2 → 1.5 → 2.1 → 3.0 → 3.1 → 4.1 | -- | 9 nodes / 8 waves |

### Parallel Metrics Snapshot (post-F1)

| Metric | Formula | Target | Actual | Notes |
| ------ | ------- | ------ | ------ | ----- |
| **RW0** | tasks runnable in Wave 0 | ≥ planned agents/2 | 1 (Task 0.1) | **Inherent** — pre-flight verification gate, intentionally narrow. |
| **CPR** | total_tasks / critical_path_length | ≥ 2.5 | 11 / 9 = 1.22 | **Inherent** — `PR1 publish → PR2 merge → PR3 archive` is genuinely sequential cross-repo coordination, not artificial granularity. |
| **DD** | dependency_edges / total_tasks | ≤ 2.0 | 13 / 11 = 1.18 | ✓ |
| **CP** | same-file overlaps in any parallel wave | = 0 | 0 | ✓ Resolved via F1 — Task 1.3 now depends on Task 1.1; both `package.json` writers are serialized. |

**Parallelization score: B.** RW0 and CPR miss targets but both are structural, not refinement defects (you cannot parallelize across PR-publish boundaries between three repos). CP is clean. The plan is ready for `/pll` execution; the executor will see narrow waves and that is correct.

### Phase 0: Pre-flight verification [Complexity: XS]

#### [audit] Task 0.1: Workspace consumer audit

**Status:** todo

**Depends:** None

Re-grep the workspace right before PR1 ships to confirm the documented consumer set still matches reality. Catches new consumers added between plan-write and execution.

```bash
cd ~/repos && grep -rn '@webpresso/quality-engine' \
  --include='*.ts' --include='*.tsx' --include='*.json' --include='*.yaml' \
  . 2>/dev/null \
  | grep -v node_modules \
  | grep -v '\.git/' \
  | grep -v '_sandbox/' \
  | grep -v 'blueprints/completed/' \
  | grep -v 'blueprints/archived/' \
  | grep -v '/docs/research/' \
  | grep -v 'CHANGELOG' \
  | grep -v 'dist/' \
  | grep -v '\.omx/' \
  | grep -v 'webpresso/quality-engine/'
```

**Expected hits (at the time of plan write):**
- `webpresso/monorepo/apps/cli2/**` — 7 source-file imports + 1 `package.json#dependencies` entry
- `webpresso/monorepo/apps/scripts/**` — 1 source-file import + 1 `package.json#dependencies` entry
- `webpresso/monorepo/apps/cli-wp/**` — 1 `package.json#dependencies` entry (audit src tree to confirm imports too)
- `webpresso/monorepo/pnpm-workspace.yaml` — 1 catalog entry
- `webpresso/monorepo/.changeset/**` — historical changeset entries (ignore — they're history)

**Acceptance:**
- [ ] grep output exactly matches the expected hit set, OR any extras have been added to the plan's consumer list before PR1 starts.
- [ ] `webpresso/quality-engine/.git` shows the working tree is clean (no uncommitted changes). If dirty, surface to the user before continuing — do not silently overwrite.
- [ ] No `_sandbox/` hits (rule: `_sandbox/` is excluded from workspace audits).

### Phase 1: Lift quality-engine into agent-kit [Complexity: S]

#### [agent-kit] Task 1.1: Copy six source modules + tests into `agent-kit/src/quality-engine/`

**Status:** todo

**Depends:** None

Copy the entire `webpresso/quality-engine/src/` tree into `webpresso/agent-kit/src/quality-engine/`. The current set is:

| Source module | Destination |
| ------------- | ----------- |
| `quality-engine/src/index.ts` | `agent-kit/src/quality-engine/index.ts` |
| `quality-engine/src/target-resolver.ts` | `agent-kit/src/quality-engine/target-resolver.ts` |
| `quality-engine/src/command-builder.ts` | `agent-kit/src/quality-engine/command-builder.ts` |
| `quality-engine/src/log-paths.ts` | `agent-kit/src/quality-engine/log-paths.ts` |
| `quality-engine/src/workspace-config.ts` | `agent-kit/src/quality-engine/workspace-config.ts` |
| `quality-engine/src/test-classification.ts` | `agent-kit/src/quality-engine/test-classification.ts` |
| `quality-engine/src/package-import-rules.ts` | `agent-kit/src/quality-engine/package-import-rules.ts` |
| (each `*.test.ts` sibling) | matching test path |

Adjust internal imports inside the copied modules so they keep resolving (no `../` parent imports — use relative within the new directory or workspace aliases). Confirm `zod` and `yaml` runtime deps are already present in agent-kit's `package.json` (they should be — check before adding).

**Files:**
- Create: `agent-kit/src/quality-engine/{index,target-resolver,command-builder,log-paths,workspace-config,test-classification,package-import-rules}.ts`
- Create: matching `*.test.ts` for each
- Modify: `agent-kit/package.json` — add `zod` / `yaml` to `dependencies` only if missing

**Steps (relocation, not new feature — TDD framing adjusted):**

This is a pure relocation. The "RED then GREEN" loop is misleading here — the tests already pass in quality-engine and should pass immediately in agent-kit if the copy is honest. Verify accordingly:

1. Copy each module + its test sibling **together** (matched pair) into `agent-kit/src/quality-engine/`.
2. Inspect copied test imports: every `import` in a copied test file must reference **local relative paths** (`./target-resolver`, `../quality-engine/foo`, etc.) — NOT `'@webpresso/quality-engine'`. If any test still imports the old package name, the test would pass for the wrong reason (resolving against the still-present sibling package). Fix imports as part of the copy.
3. `ak_test --file 'agent-kit/src/quality-engine/**/*.test.ts'` — expect **GREEN immediately**. Relocations don't have a RED phase.
4. If RED: the copy is wrong (typo, missing module, broken import path). Surface and re-copy.
5. `ak_lint --package agent-kit` — confirm zero violations under the agent-kit linter (oxlint config may differ from quality-engine).

**Acceptance:**
- [ ] All 6 modules + their tests exist under `agent-kit/src/quality-engine/`.
- [ ] `ak_test --package agent-kit` passes.
- [ ] `ak_lint --package agent-kit` passes.
- [ ] No `../../` parent imports introduced.
- [ ] No new top-level deps unless they were already in `agent-kit/package.json` (audit before adding).

#### [agent-kit] Task 1.2: Add ONE root subpath export `./quality-engine` + write changeset

**Status:** todo

**Depends:** Task 1.1 (modules must exist before exports resolve)

Add **one** root subpath export to `webpresso/agent-kit/package.json`. The barrel `src/quality-engine/index.ts` (already copied as part of Task 1.1) re-exports every named symbol from the 6 modules, so consumers import named symbols from a single path.

```jsonc
{
  "exports": {
    // ...existing entries
    "./quality-engine": {
      "import": {
        "types": "./dist/esm/quality-engine/index.d.ts",
        "default": "./dist/esm/quality-engine/index.js"
      }
    }
  }
}
```

Mirror the entry in `agent-kit/package.json#imports` (the `#alias` map) so internal agent-kit code can use `#quality-engine` paths.

**Verify the barrel actually re-exports everything quality-engine's index.ts re-exported.** The barrel is the entire public API now; missing a re-export silently breaks consumers. Compare:
```bash
diff <(grep -E '^export' webpresso/quality-engine/src/index.ts) \
     <(grep -E '^export' webpresso/agent-kit/src/quality-engine/index.ts)
```
Difference must be empty (modulo blank lines).

**Files:**
- Modify: `agent-kit/package.json` (`exports` map + `imports` map — single `./quality-engine` entry each)
- Modify: `agent-kit/src/build/validate-marketplace.test.ts` if it asserts on the export shape (unknown, audit during task)
- Create: `.changeset/fold-quality-engine-into-agent-kit.md` with bump type `minor` and a one-paragraph description naming the new `./quality-engine` subpath.

**Steps (TDD):**
1. Add an isolation test: `agent-kit/src/quality-engine/export-isolation.test.ts` that asserts every public subpath imports clean.
2. `ak_test --file agent-kit/src/quality-engine/export-isolation.test.ts` — verify RED (exports not declared yet).
3. Patch `package.json#exports` + `imports`.
4. Re-run — verify GREEN.
5. Run `pnpm lint:pkg` (publint / attw) — must pass on the export map.
6. Write `.changeset/fold-quality-engine-into-agent-kit.md`:
   ```markdown
   ---
   "@webpresso/agent-kit": minor
   ---

   Adds `@webpresso/agent-kit/quality-engine` subpath. The barrel re-exports every named symbol previously published from `@webpresso/quality-engine` (target-resolver, command-builder, log-paths, workspace-config, test-classification, package-import-rules). Folds the standalone `@webpresso/quality-engine` package per Decision 4 of the public-extraction roadmap. Hard cut — the standalone package is being deprecated and archived in coordination with this release. See `blueprints/draft/fold-webpresso-quality-engine-into-webpresso-agent-kit-decision-4/_overview.md`.
   ```

**Acceptance:**
- [ ] `pnpm lint:pkg` passes.
- [ ] The single `./quality-engine` subpath import-resolves at runtime + at type-check time.
- [ ] Every named symbol from quality-engine's old `index.ts` is re-exported from agent-kit's barrel (`diff` step above passes).
- [ ] `export-isolation.test.ts` exists alongside the others (e.g. `tooling/`'s pattern).
- [ ] `.changeset/fold-quality-engine-into-agent-kit.md` is committed; `pnpm changeset:status` shows it pending.
- [ ] **Do not** hand-write CHANGELOG.md — Changesets owns it via the Version-Packages CI workflow.

#### [agent-kit] Task 1.4: Source + mutation parity baseline

**Status:** todo

**Depends:** Task 1.1 (modules must exist in agent-kit)

**(F1):** Task 1.4 writes only `agent-kit/src/quality-engine/.parity-baseline.json`. No `package.json` write — safe to run **in parallel with Task 1.1** in Wave 1.

Two cheap regression-class checks that prove the relocation is byte-clean and quality-equivalent.

**Part A — Byte-identity check.**

For each of the 6 modules + 6 test files, assert the agent-kit copy is character-for-character identical to the quality-engine source modulo a documented import-path delta. The only allowed divergence is internal import paths that referenced sibling modules (e.g. `from './target-resolver'` is identical; any `from '../...'` would have been wrong on either side). Practical implementation: `diff -ru webpresso/quality-engine/src webpresso/agent-kit/src/quality-engine` should return either empty or a delta limited to the import-path lines.

If any non-import-path diff appears, the copy is **wrong** — surface and re-copy.

**Part B — Mutation parity baseline.**

Before PR1 ships, run Stryker against `webpresso/quality-engine/` and capture per-module mutation scores. After Task 1.1 + 1.2 + 1.3 land in agent-kit, re-run Stryker against `webpresso/agent-kit/src/quality-engine/**` only and compare:

```bash
# BEFORE PR1 (run from webpresso/quality-engine/):
pnpm exec stryker run --reporters json
jq '.files | to_entries | map({key: .key, mutationScore: .value.mutationScore}) | from_entries' \
  reports/mutation/mutation.json > .parity-baseline.json
# Commit .parity-baseline.json into agent-kit/src/quality-engine/.parity-baseline.json (move it once Task 1.1 lands).

# AFTER PR1 (run from webpresso/agent-kit/):
pnpm exec stryker run --mutate 'src/quality-engine/**/*.ts' --reporters json
jq '.files | to_entries[] | "\(.key): \(.value.mutationScore)"' \
  reports/mutation/mutation.json
```

Compare side-by-side. Any module showing **lower** mutation score post-move means coverage was lost in the relocation — surface and investigate.

**Files:**
- Create: `agent-kit/src/quality-engine/.parity-baseline.json` (committed; recorded once Task 1.1 lands)

**Steps:**
1. (BEFORE PR1) Run quality-engine's Stryker, save baseline JSON.
2. After Task 1.1 module copy: `diff -ru webpresso/quality-engine/src webpresso/agent-kit/src/quality-engine` — expect empty or import-path-only.
3. After Task 1.3 Stryker config: re-run mutation tests on the agent-kit copy.
4. Compare against `.parity-baseline.json` per module.
5. If parity holds, commit baseline file; if not, investigate before PR1 merges.

**Acceptance:**
- [ ] `diff -ru` returns empty or import-path-only delta.
- [ ] Each module's mutation score in agent-kit ≥ baseline score from quality-engine.
- [ ] `.parity-baseline.json` is committed and referenced by Task 1.3's acceptance.

#### [agent-kit] Task 1.3: Stryker config + devDeps audit

**Status:** todo

**Depends:** Task 1.1

**(F1):** Serialized after Task 1.1 — both tasks write to `agent-kit/package.json` (1.1 owns runtime deps, 1.3 owns devDeps + `stryker.config.*`). Running them in parallel would produce a JSON-merge conflict. Sequencing keeps the conflict pressure (CP) at 0 across every parallel wave.

Inventory which of these already live in `agent-kit/package.json#devDependencies`:
- `@stryker-mutator/core`
- `@stryker-mutator/typescript-checker`
- `@stryker-mutator/vitest-runner`

Add only what's missing. Verify `agent-kit/stryker.config.mjs` (or `.config.ts`) targets the new `src/quality-engine/**` files. agent-kit already runs mutation testing via `ak audit mutation` so this is mostly a sanity check, not new wiring.

**Files:**
- Modify: `agent-kit/package.json` (devDeps as needed)
- Modify: `agent-kit/stryker.config.*` (mutate scope, if needed)

**Acceptance:**
- [ ] `ak_audit kind:mutation` runs end-to-end on the new modules and reports a baseline mutation score.
- [ ] No `@stryker-mutator/*` left as a transitive-only dep when it's used directly.

#### [agent-kit] Task 1.5: `pnpm pack` + extract + import smoke test (gates PR1 publish)

**Status:** todo

**Depends:** Task 1.2 (export map must be in place), Task 1.3 (Stryker green), Task 1.4 (parity green)

The `export-isolation.test.ts` from Task 1.2 verifies imports against agent-kit's source/tsconfig path resolution. That can pass while the **published tarball** is broken (e.g. `dist/esm/quality-engine/**` not in `files` allowlist, missing `.d.ts` files, broken type re-exports). This task verifies the actual shipped artifact before PR1's Version-Packages PR is merged.

```bash
cd webpresso/agent-kit
pnpm build
pnpm pack
# produces webpresso-agent-kit-<version>.tgz

# Extract into a temp dir
TMP=$(mktemp -d)
tar -xzf webpresso-agent-kit-*.tgz -C "$TMP"
cd "$TMP/package"

# Smoke test the extracted tarball, not the source
node --input-type=module -e "
  import('./dist/esm/quality-engine/index.js').then(m => {
    const required = ['resolveTargets', 'buildLintCommand', 'generateLogPath', 'parseWorkspaceConfig', 'classifyTestFile', 'PACKAGE_IMPORT_RULES'];
    const missing = required.filter(name => !(name in m));
    if (missing.length) throw new Error('Missing exports in tarball: ' + missing.join(','));
    console.log('OK — all required exports present');
  });
"
```

(Adjust the `required` list to the actual named symbols quality-engine's `index.ts` re-exports — confirm during execution.)

**Files:**
- (no files modified; this is a verification gate)

**Acceptance:**
- [ ] `pnpm pack` completes without errors.
- [ ] Extracted tarball includes `dist/esm/quality-engine/**/*.js` and `dist/esm/quality-engine/**/*.d.ts`.
- [ ] Smoke-test script imports the barrel from the extracted tarball without errors and finds every expected named symbol.
- [ ] If any fails → fix `package.json#files` allowlist or the build, before PR1's Version-Packages PR merges.

### Phase 2: Migrate monorepo consumers [Complexity: S]

#### [backend] Task 2.1: Switch `monorepo/apps/{cli2,scripts,cli-wp}` to import from agent-kit

**Status:** todo

**Depends:** Task 1.1, 1.2 (modules + exports must exist before consumers switch)

Mechanical rename across the three apps. **All imports collapse to one path** — `@webpresso/agent-kit/quality-engine` (the barrel re-exports every named symbol).

| File | Rename pattern |
| --- | --- |
| `monorepo/apps/cli2/src/lib/quality-engine-targets.ts` | `'@webpresso/quality-engine'` → `'@webpresso/agent-kit/quality-engine'` |
| `monorepo/apps/cli2/src/lib/package-scripts-validator.ts` | same |
| `monorepo/apps/cli2/src/lib/package-scripts-validator.test.ts` | same |
| `monorepo/apps/cli2/src/lib/log-paths.test.ts` | same |
| `monorepo/apps/cli2/src/lib/workspace-config.test.ts` | same |
| `monorepo/apps/cli2/src/commands/test-utils/helpers.ts` | `'@webpresso/quality-engine/test-classification'` → `'@webpresso/agent-kit/quality-engine'` (named symbols at call site, no subpath) |
| `monorepo/apps/cli2/src/commands/target.test.ts` | same |
| `monorepo/apps/scripts/src/audit/package-imports-gate.ts` | `'@webpresso/quality-engine/package-import-rules'` → `'@webpresso/agent-kit/quality-engine'` (named symbols at call site) |
| `monorepo/apps/cli-wp/src/**` | (verify with `grep -rn '@webpresso/quality-engine' monorepo/apps/cli-wp/src` and rename matches to the single path) |

The collapse from leaf-subpaths to one root path is intentional (see Key Decisions row "New export shape"). Keeps the public API surface minimal.

Also:
- Drop the `"@webpresso/quality-engine": "catalog:"` entry from each `apps/*/package.json`.
- Drop the catalog entry from `monorepo/pnpm-workspace.yaml` (`catalog:` block).
- Run `pnpm install` to refresh the lockfile.

**Files:**
- Modify: ~9 source files across three apps (codemod-friendly).
- Modify: `monorepo/apps/{cli2,scripts,cli-wp}/package.json` (drop dep).
- Modify: `monorepo/pnpm-workspace.yaml` (drop catalog entry).

**Steps (strict order — pnpm requires it):**
1. `grep -rn '@webpresso/quality-engine' monorepo/apps` — confirm the exhaustive set of import sites matches the table above.
2. Codemod each import site: rename `'@webpresso/quality-engine'` → `'@webpresso/agent-kit/quality-engine'` (root) and `'@webpresso/quality-engine/<sub>'` → `'@webpresso/agent-kit/quality-engine/<sub>'` (subpaths).
3. Re-run the same grep — must return **zero** hits in `monorepo/apps/`.
4. Drop the `"@webpresso/quality-engine": "catalog:"` entry from each of `monorepo/apps/{cli2,scripts,cli-wp}/package.json`.
5. **Then** drop the `@webpresso/quality-engine` line from `monorepo/pnpm-workspace.yaml` under the `catalog:` block. (Order matters: pnpm fails install if a `package.json` still references a name whose `catalog:` mapping is gone.)
6. `pnpm install` from monorepo root — must resolve clean.
7. `just qa` on monorepo — full pass.

**Forbidden interim states:** never delete the `catalog:` entry while a `package.json` still imports `@webpresso/quality-engine`. The error is non-obvious and burns time.

**Acceptance:**
- [ ] `grep -rn '@webpresso/quality-engine' monorepo/` returns zero (excluding lockfiles, completed/archived blueprints, CHANGELOG).
- [ ] `monorepo/just qa` is green.
- [ ] No `@webpresso/quality-engine` left in any `apps/*/package.json` or in `pnpm-workspace.yaml`.

### Phase 3: Cut the standalone package [Complexity: XS]

#### [docs] Task 3.0: Replace quality-engine's README with a redirect before archive

**Status:** todo

**Depends:** Task 2.1 (monorepo migration merged)

Once GitHub archives a repo, its README becomes the public-facing dead-end. Replace `webpresso/quality-engine/README.md` with a one-page redirect **as part of PR3** (the same Changesets PR that bumps the final version) so the archived repo points readers to the new home.

**File:** `webpresso/quality-engine/README.md` — full rewrite, one-pager.

**Required content:**

```markdown
# @webpresso/quality-engine — DEPRECATED

This package has been folded into [`@webpresso/agent-kit`](https://github.com/webpresso/agent-kit) as the `@webpresso/agent-kit/quality-engine` subpath.

## Migrate

```ts
// before
import { resolveTargets } from '@webpresso/quality-engine'

// after
import { resolveTargets } from '@webpresso/agent-kit/quality-engine'
```

All named symbols previously exported from this package (`target-resolver`, `command-builder`, `log-paths`, `workspace-config`, `test-classification`, `package-import-rules`) are re-exported from agent-kit's `quality-engine` barrel. No behavior change.

## Why

Decision 4 of the [public-extraction roadmap](https://github.com/webpresso/monorepo) — single CLI, single mental model. See `webpresso/agent-kit/blueprints/completed/fold-webpresso-quality-engine-into-webpresso-agent-kit-decision-4/_overview.md`.

## Final version

`@webpresso/quality-engine@<final-version>` remains available on the GitHub Packages registry with an `npm deprecate` banner. New work goes into agent-kit.
```

**Acceptance:**
- [ ] `webpresso/quality-engine/README.md` is the redirect content above (modulo trailing version stamp).
- [ ] Commit lands as part of PR3 (the final Changesets release PR), BEFORE `gh repo archive`.
- [ ] After archive, viewing `https://github.com/webpresso/quality-engine` shows the redirect at the top.

#### [infra] Task 3.1: Mark `@webpresso/quality-engine` deprecated on the registry, then archive the GH repo

**Status:** todo

**Depends:** Task 2.1

Once monorepo no longer consumes the standalone package and CI is green:

1. From `webpresso/quality-engine/` working tree, run:
   ```bash
   pnpm changeset
   # major bump; description: "Removed. Use @webpresso/agent-kit/quality-engine subpaths instead."
   ```
   Land the version bump as a normal Changesets PR.
2. After publish, mark deprecated on GitHub Packages:
   ```bash
   npm deprecate @webpresso/quality-engine "Folded into @webpresso/agent-kit. See https://github.com/webpresso/agent-kit#quality-engine."
   ```
3. Archive the GitHub repo:
   ```bash
   gh repo archive webpresso/quality-engine --yes
   ```
4. Delete the local `webpresso/quality-engine/` working tree.

**Files:**
- Create: `webpresso/quality-engine/.changeset/<slug>.md`
- Modify: `webpresso/quality-engine/package.json` (Changesets-driven version bump)

**Acceptance:**
- [ ] Final published version of `@webpresso/quality-engine` carries the deprecation banner on the registry.
- [ ] `gh repo view webpresso/quality-engine --json isArchived` returns `true`.
- [ ] `webpresso/quality-engine/` removed from local disk.

### Phase 4: Cross-repo doc + roadmap close-out [Complexity: XS]

#### [docs] Task 4.1: Update CLAUDE.md, repo map, extraction roadmap

**Status:** todo

**Depends:** Task 3.1

- `~/repos/CLAUDE.md` — remove `quality-engine/` row from the repo map; remove the "Slated to fold..." sentence.
- `webpresso/agent-kit/README.md` — add a one-line mention under "What changes after `ak setup`" that the audit/mutation harness lives in agent-kit (no separate package needed).
- `webpresso/monorepo/webpresso/blueprints/completed/webpresso-public-extraction-roadmap/_overview.md` — change Decision 4 status from "Reverted (planned)" to "Reverted (executed YYYY-MM-DD via blueprints/completed/fold-webpresso-quality-engine-into-webpresso-agent-kit-decision-4)".

> **Do not** hand-edit `webpresso/agent-kit/CHANGELOG.md`. The Changesets Version-Packages PR (driven by the `.changeset/fold-quality-engine-into-agent-kit.md` from Task 1.2) owns CHANGELOG generation. Hand-editing creates a merge conflict with the Version-Packages PR.

**Acceptance:**
- [ ] `grep -n 'quality-engine' ~/repos/CLAUDE.md` returns no rows describing it as a standalone package.
- [ ] Roadmap entry references this blueprint by slug.

#### [docs] Task 4.2: Move blueprint draft → completed

**Status:** todo

**Depends:** Task 4.1

```bash
ak blueprint move fold-webpresso-quality-engine-into-webpresso-agent-kit-decision-4 completed
ak audit blueprint-lifecycle --strict
```

**Acceptance:**
- [ ] Blueprint sits under `blueprints/completed/`.
- [ ] `ak audit blueprint-lifecycle --strict` is green.

#### [docs] Task 4.3: agent-kit metadata sweep

**Status:** todo

**Depends:** Task 4.1

After the fold lands and quality-engine is archived, sweep agent-kit's package metadata so the new capability is discoverable.

**Files:**
- Modify: `webpresso/agent-kit/package.json` — add `"mutation"`, `"audits"`, `"quality-engine"` to `keywords`.
- Modify: `webpresso/agent-kit/README.md` — one-line mention under "What changes after `ak setup`" or the Skills/CLI section, e.g. *"Audit + mutation harness ships in-package: `@webpresso/agent-kit/quality-engine` for programmatic access; `ak audit mutation` / `ak audit quality` for the CLI."*
- Verify: `webpresso/agent-kit/package.json#files` allowlist still includes the dist directory that ships `dist/esm/quality-engine/**`. The Task 1.5 smoke test caught any dist gaps; this is a final sanity pass.

**Acceptance:**
- [ ] `pnpm lint:pkg` (publint + attw) still clean after metadata edits.
- [ ] `npm view @webpresso/agent-kit keywords` (after the next Changesets release) lists the new keywords.
- [ ] README's quality-engine mention links to or names the new subpath.

---

## Verification Gates

| Gate                  | Command                                                         | Success Criteria |
| --------------------- | --------------------------------------------------------------- | ---------------- |
| Type safety           | `ak typecheck --package agent-kit`                              | Zero errors |
| Lint                  | `ak lint --package agent-kit`                                   | Zero violations |
| Tests (agent-kit)     | `ak test --package agent-kit`                                   | All pass; new `quality-engine/*.test.ts` included |
| Export integrity      | `pnpm lint:pkg` (publint + attw) in agent-kit                   | Clean export map |
| Mutation              | `ak audit mutation`                                             | New modules covered; baseline score recorded |
| Composite             | `ak audit guardrails`                                           | All 8 audits pass (including catalog-drift) |
| Monorepo full QA      | `just qa` from monorepo root after Task 2.1                     | All pass |
| Consumer-grep clean   | `grep -rn '@webpresso/quality-engine' monorepo/`                | Zero non-historical hits |
| GH archive verified   | `gh repo view webpresso/quality-engine --json isArchived`       | `{"isArchived": true}` |

## Cross-Plan References

| Type       | Blueprint | Relationship |
| ---------- | --------- | ------------ |
| Upstream (decision) | [`webpresso-public-extraction-roadmap`](../../../monorepo/webpresso/blueprints/completed/webpresso-public-extraction-roadmap/_overview.md) Decision 4 | This blueprint executes Decision 4; the parent was prematurely closed without filing this child. |
| Pattern reference   | [`agent-kit-hard-cut-extraction`](../../../monorepo/webpresso/blueprints/completed/agent-kit-hard-cut-extraction/_overview.md) | Same hard-cut philosophy; reference for ordering and risk shape. |

## Edge Cases and Error Handling

| Edge Case | Risk | Solution | Task |
| --------- | ---- | -------- | ---- |
| `ingest-lens` later wants the same modules | It currently doesn't import from `@webpresso/quality-engine` (verified). After fold, it would import from `@webpresso/agent-kit/quality-engine/*` directly. | No action needed in this blueprint. ingest-lens is a downstream observer. | n/a |
| External users have `@webpresso/quality-engine` pinned in their lockfile | The package was published to the **GitHub Packages private registry** with `access: "restricted"` (see `quality-engine/package.json#publishConfig`). The only known consumer is monorepo. No external public users. | Risk effectively zero; deprecation banner covers any private consumers we missed. | 3.1 |
| `agent-kit` already has internal mutation/quality wiring that overlaps quality-engine modules | Verified: `agent-kit/src/cli/commands/audit.ts` exposes `mutation`/`quality` kinds but does not import `@webpresso/quality-engine`. The fold *adds* the modules; existing wiring stays intact. | Audit during Task 1.1 to confirm no namespace collisions. | 1.1 |
| Stryker config needs to mutate the new `src/quality-engine/**` path | `agent-kit/stryker.config.*` may not include the new directory in mutate globs | Update mutate globs in Task 1.3 | 1.3 |
| catalog: dep removal breaks other monorepo packages | Only the three named apps have the dep | Confirm with `grep -rn '@webpresso/quality-engine' monorepo/{apps,packages}/*/package.json` | 2.1 |
| Local working-tree of `webpresso/quality-engine/` has uncommitted changes | Working-tree audit at Task 3.1 time | Run `git -C webpresso/quality-engine status --porcelain` and either commit-then-archive or stash-and-discard with explicit user confirm. Do NOT silently delete uncommitted work. | 3.1 |

## Non-goals

- **Re-architecting the audit composite.** `ak audit guardrails` keeps its current 8-audit registry. This blueprint moves modules; it doesn't change what they do.
- **Changing mutation thresholds.** Same Stryker config surface; same numeric gates.
- **Adding new quality-engine capabilities.** This is a relocation, not a feature extension.
- **A transitional re-export shim in `@webpresso/quality-engine@0.3.0`.** Hard cut. Decision 3 used a shim for process-utils/cli-utils; this blueprint deliberately does not.
- **Touching `ingest-lens`.** It does not consume `@webpresso/quality-engine` today and is downstream.

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Three repos and three PRs land out of order, leaving a window where monorepo can't `pnpm install` cleanly | High (CI red) | See "Release sequencing" subsection. Strict order: PR1 agent-kit minor (Tasks 1.1, 1.2, 1.3, 1.4) → published to GH Packages → PR2 monorepo (Task 2.1, in step order) → merged → PR3 quality-engine deprecation (Task 3.1). No concurrent merges across the chain. |
| Hidden internal import cycles inside the 6 quality-engine modules that resolve fine standalone but break in agent-kit's resolution graph | Medium | `pnpm lint:pkg` (publint + attw) catches export-shape regressions; `ak audit no-relative-parent-imports` catches `../../` paths. Both run in Task 1.1's acceptance. |
| `@stryker-mutator/*` version drift between agent-kit and quality-engine | Low | Pin to whatever agent-kit already uses; quality-engine's deps are devDeps only. |
| Loss of the per-package mutation history tracked under `webpresso/quality-engine/reports/mutation/` | Low (reports are reproducible) | Reports regenerate on next `ak audit mutation`. |
| `npm deprecate` + `gh repo archive` happen before the `pnpm install` lockfile refresh propagates everywhere | Medium | Verify `grep -rn '@webpresso/quality-engine' monorepo/pnpm-lock.yaml` returns no resolution entries (only historical lock blocks if any) before Task 3.1. |

## Technology Choices

| Component | Technology | Version | Why |
| --------- | ---------- | ------- | --- |
| Module location | `agent-kit/src/quality-engine/` | n/a | Mirrors existing per-domain layout (`src/audit/`, `src/blueprint/`, `src/symlinker/`). |
| Subpath exports | `package.json#exports` | n/a | Same shape as today's `@webpresso/quality-engine` exports — minimises consumer churn. |
| Mutation runner | `@stryker-mutator/{core,typescript-checker,vitest-runner}` | match agent-kit current pin | Already in agent-kit's stack. |
| Versioning | Changesets | as configured | Same release flow as every other webpresso package. |
| Deprecation signal | `npm deprecate` on GitHub Packages | n/a | Matches Decision 3 deprecation pattern (the part of it we keep — minus the shim). |
| Archive | `gh repo archive` | n/a | Standard GH archive flow, locks the repo read-only. |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | clean | 6 findings → 4 incorporated (re-frame to internal-only, metadata sweep, pnpm pack smoke test, honest TDD steps); 1 declined (explicit rollback section); 1 trivially folded into release-sequencing block (publish-vs-merge nuance) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 7 issues found → 7 resolved (3-PR sequencing, Phase 2.1 ordered steps, pre-flight Task 0.1, changeset workflow, 7-wave grid, parity baseline Task 1.4, release-verification Task 1.5); 0 unresolved; 0 critical gaps silenced |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | n/a (no UI scope) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 1 | clean | TRIAGE: score 5/10 → 8/10 — 1 critical gap (archive-redirect dead-end) resolved via new Task 3.0 (rewrite quality-engine README before `gh repo archive`). Skipped 6 ceremonial passes (no new DX, internal extraction). |

- **CODEX:** 6 findings, 4 incorporated, 1 declined-with-reason, 1 trivially folded.
- **CROSS-MODEL:** No tensions — codex extended the review with findings my pass missed; user accepted 4 of 6 explicitly.
- **UNRESOLVED:** 0 decisions across both reviews.
- **VERDICT:** ENG + DX CLEARED — ready to implement. Blueprint moves to `blueprints/in-progress/` immediately after this review.
