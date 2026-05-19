---
"@webpresso/agent-kit": patch
---

Modernize `catalog/base-kit/.github/workflows/ci.webpresso.yml.tmpl` —
the workflow scaffolded by `ak setup --with base-kit`. The previous
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
- Adds `oven-sh/setup-bun@v2` in every job so `ak`-driven steps that
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
locally are unaffected — `ak setup --overwrite` continues to write the
template, but downstream repos that want to preserve a customized
workflow should add the path to their postinstall preservation list (see
monorepo's `apps/scripts/src/maintenance/agent-setup-postinstall.ts`).
