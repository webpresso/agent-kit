---
type: research
last_updated: '2026-05-28'
---

# Public npm cutover checklist for `@webpresso/agent-kit`

Date: 2026-05-28
Status: Do not make the repo/package public until all P0 items are complete.

## Decision

- Keep the package name as **`@webpresso/agent-kit`**.
- Do **not** switch to an unscoped `agent-kit`.
- If you want the GitHub repo public, `webpresso/agent-kit` is a separate GitHub naming decision and is compatible with the scoped npm package.

## Official guidance used

- npm scopes: https://docs.npmjs.com/about-scopes/
- Scoped public packages: https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/
- Scope/access matrix: https://docs.npmjs.com/package-scope-access-level-and-visibility/
- npm provenance: https://docs.npmjs.com/generating-provenance-statements/
- npm trusted publishing: https://docs.npmjs.com/trusted-publishers/

## P0 — hard blockers before public

### 1) Switch publishing from GitHub Packages to public npm

Files:
- `package.json`
- `.npmrc`
- `.github/workflows/release.yml`
- `package.contract.test.ts`
- any docs mentioning GitHub Packages auth or `npm.pkg.github.com`

Required edits:
- In `package.json`, replace the current publish target:
  - from `publishConfig.registry: "https://npm.pkg.github.com"`
  - and `publishConfig.access: "restricted"`
  - to either:
    - `publishConfig.registry: "https://registry.npmjs.org"` and `publishConfig.access: "public"`, or
    - remove registry from `publishConfig` and make the workflow publish explicitly with npmjs + `--access public`.
- In `.npmrc`, remove the checked-in GitHub Packages mapping:
  - `@webpresso:registry=https://npm.pkg.github.com`
  - `//npm.pkg.github.com/:_authToken=${GH_PACKAGES_TOKEN}`
- In `.github/workflows/release.yml`, stop using `registry-url: https://npm.pkg.github.com`.
- In `package.contract.test.ts`, update the contract so it no longer asserts GitHub Packages + restricted access.

Acceptance:
- `npm pack --dry-run --json` still works.
- Release workflow targets `https://registry.npmjs.org`.
- First publish path is explicitly public.

### 2) Fix release workflow so it is safe for public npm

Files:
- `.github/workflows/release.yml`

Required edits:
- Move publish auth out of job-wide env. Do **not** expose future npm credentials to install/build steps.
- Prefer npm trusted publishing instead of long-lived `NPM_TOKEN`.
- Change runner/provenance setup for npm guidance:
  - use a GitHub-hosted runner such as `ubuntu-latest`
  - add `permissions: { contents: read, id-token: write }` to the publish job
  - publish with provenance, e.g. `npm publish --provenance --access public`
- Make dry run non-mutating:
  - no version commit
  - no push to `main`
  - no release branch creation
- Rework sequencing so a failed publish does not leave `main` version-bumped but unpublished.

Acceptance:
- Dry run does not mutate git history.
- Publish credentials are scoped only to publish.
- Workflow is provenance/trusted-publishing ready.

### 3) Remove confirmed leak candidates from tracked public content

Files:
- `docs/hook-matrix.md`
- `scripts/bench/__fixtures__/claude-stream-say-hi.jsonl`
- `docs/research/2026-05-09-agent-kit-readme-rewrite.md`
- `docs/research/2026-05-13-hook-coordination-fact-check.md`
- `docs/research/2026-05-15-known-followups-and-fixes.md`
- any other tracked docs containing `/Users/ozby`, `~/.claude`, local forks, local session IDs, or local plugin inventories

Required edits:
- Replace absolute local paths with repo-relative references or placeholders like `<repo-root>` / `<home>`.
- Regenerate or heavily scrub `scripts/bench/__fixtures__/claude-stream-say-hi.jsonl`; do not ship a real local session dump.
- Remove references to local private forks and local cache locations from public docs.

Acceptance:
- `rg -n '/Users/ozby|~/.claude|ozby/context-mode|session_id|mcp__plugin_' docs scripts package.json .claude test-fixtures fixtures`
  returns only intentional test fixtures or none.

### 4) Remove tracked generated/local artifacts

Files:
- `.test-plan-service/test-1777624231849-w7nqqak06do/webpresso/blueprints/m-plan/_overview.md`
- `.test-plan-service/test-1777624231849-w7nqqak06do/webpresso/blueprints/xl-plan/_overview.md`
- `.test-plan-service/test-1777624231849-w7nqqak06do/webpresso/blueprints/xs-plan/_overview.md`
- `.test-plan-service/test-1777624231996-fkpv2dhj6j/webpresso/blueprints/old-complete-plan/_overview.md`
- `.gitignore`

Required edits:
- Remove the tracked `.test-plan-service/**` artifacts from git.
- Add `.test-plan-service/` to `.gitignore` unless there is a strong reason to keep deterministic fixtures there.

Acceptance:
- `git ls-files '.test-plan-service/**'` returns nothing.

## P1 — should fix before first public release

### 5) Tighten the npm tarball surface

Files:
- `package.json`
- build config affecting `dist/`
- any packaging tests

Current observed tarball:
- about 2,224 files
- includes `dist/`, `catalog/`, `commands/`, `skills/`, `.claude-plugin/`, `just/`, `tsconfig/`
- includes many `.map` files and internal-ish test/eval artifacts

Required edits:
- Decide which of these are truly public API versus implementation baggage:
  - `catalog/**`
  - `commands/**`
  - `skills/**`
  - `.claude-plugin/**`
  - `just/**`
  - `dist/esm/**/*.map`
  - `dist/esm/__integration__/**`
  - `dist/esm/__mocks__/**`
  - `dist/esm/runners/evals/**`
  - non-exported internal runtime code such as `dist/esm/session-memory/**`
- Narrow `files` and/or build output so the package only ships the intended public surface.

Acceptance:
- `npm pack --dry-run --json` shows only intended public artifacts.
- Tarball size materially drops.

### 6) Fix the public install story

Files:
- `README.md`
- `docs/getting-started.md`

Required edits:
- Replace `vp install -g @webpresso/agent-kit` if `vp` is not guaranteed for first-time users.
- Document:
  - direct install path
  - Node requirement (`>=24`)
  - whether npm, pnpm, bun, or vp is the recommended global installer
  - any public registry assumptions
- Remove any now-obsolete GitHub Packages/private-auth guidance.

Acceptance:
- A new outside user can install from the docs with no implicit private tooling knowledge.

### 7) Fix plugin/package version drift

Files:
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `package.json`

Required edits:
- Sync `.claude-plugin/plugin.json` version with the package versioning strategy.

Acceptance:
- published metadata versions are internally consistent.

### 8) Resolve `.claude` policy ambiguity

Files:
- `.gitignore`
- tracked `.claude/**`

Observed tracked files:
- `.claude/agents/code-reviewer.md`
- `.claude/agents/doc-writer.md`
- `.claude/agents/explorer.md`
- `.claude/agents/security-auditor.md`
- `.claude/hooks/check-gstack-session.sh`
- `.claude/hooks/check-gstack.sh`
- `.claude/rules/*.md`
- `.claude/settings.json`

Required edits:
- Choose one policy and make it explicit:
  - selected `.claude/*` files are canonical and intentionally tracked, or
  - `.claude/*` is local/generated and should be untracked
- Remove contradictory ignore rules/comments.

Acceptance:
- A maintainer can explain in one sentence why each tracked `.claude/*` path is public.

## P2 — polish / trust-building improvements

### 9) Add missing public metadata/support files

Files:
- `package.json`
- `SECURITY.md` (new)
- possibly `README.md`

Required edits:
- Add `homepage`
- Add `bugs`
- Add `funding` if desired
- Add `SECURITY.md` with disclosure/contact policy

### 10) Remove maintainer-specific public naming

Files:
- `package.json` export map for `./ai-prompts`
- `src/ai-prompts/index.ts`
- `src/ai-prompts/types.ts`
- `src/ai-prompts/persona-tools.ts`
- `src/ai-prompts/task-analysis.ts`

Required edits:
- Rename or internalize `ozby`-specific public prompt/persona API.
- Prefer role-based names over maintainer identity names.

### 11) Clean public-facing docs/template placeholders

Files:
- `AGENTS.md`
- `catalog/AGENTS.md.tpl`
- docs that refer to `IngestLens` or private downstream consumers unless intentionally public

Required edits:
- fill or remove TODO placeholders
- replace private adopter references with generic wording unless they are intentionally part of the public story

## Verification gate before flipping public

Run at minimum:

```bash
cd /Users/ozby/repos/webpresso/agent-kit
npm pack --dry-run --json
npm run verify:secrets
npm run audit:secret-provider-quarantine
npm run lint:pkg
rg -n '/Users/ozby|~/.claude|npm\\.pkg\\.github\\.com|GH_PACKAGES_TOKEN|x-access-token:|ozby/context-mode' .
git ls-files '.test-plan-service/**'
```

Recommended final release checks:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm qa
```

## Suggested execution order

1. P0.1 switch npm target
2. P0.2 fix release workflow
3. P0.3 scrub leak files
4. P0.4 remove generated tracked artifacts
5. P1.5 trim tarball
6. P1.6 fix install docs
7. P1.7 fix version drift
8. P1.8 resolve `.claude` policy
9. P2 polish items

## Release readiness rule

Only make the repo/package public when:
- no tracked local-path or local-session leaks remain,
- public npm publish path is configured and tested,
- install docs work for a new outside user,
- and the packed tarball matches the intended public surface.
