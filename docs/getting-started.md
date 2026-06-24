---
type: guide
last_updated: '2026-06-11'
---

# Getting started

webpresso makes a repo ready for AI coding agents in one pass.

## Requirements

- Node.js 24 or newer
- A git-tracked repo you want to wire up for coding agents

## Install

Install `@webpresso/agent-kit` from the public npm registry, then run setup in
your repo root:

```bash
cd your-repo
vp install -g @webpresso/agent-kit
wp setup --project-init
```

Done. The fresh-repo promise is zero hand-wiring: setup creates the starter
quality scaffold, scripts, and agent surfaces. It does not promise zero
authoring-time dependencies forever.

Your repo now has one shared agent contract across the supported coding-agent
surfaces.

The root launcher contract is a hard cut: the package `bin` entrypoint is
`bin/wp`, `wp` resolves through that real executable JavaScript selector with a
Node shebang, and there is no `bin/wp.js` compatibility shim to preserve or
repair. Migrated runtime-lane commands require the installed platform runtime
package; installing with optional dependencies omitted is an unsupported state
for those commands.

No private registry setup is required.

`wp` bundles the package/task facade it needs, so a separate global `vp` install is not required.

For committed/team repos, keep the global `wp` install and keep only
`@webpresso/agent-config` in local dependencies. If your repo carries an Agent
Kit version pin, that pin is for global `wp` version selection only; setup no
longer relies on a repo-local CLI path.

After setup, the first trust loop should be:

```bash
wp hooks doctor
wp secrets doctor
wp preview --json
```

For the full operator path from repo checkout to preview URL, see
[`docs/guides/repo-to-preview-url.md`](./guides/repo-to-preview-url.md).

Workflow and browser skills are bundled with `wp setup`; there is no external
workflow checkout to tune. For browser-backed skills, verify local Playwright
readiness with:

```bash
wp browser doctor
```

If the doctor reports a missing browser binary, install the managed browser with:

```bash
wp browser install chromium
```

The browser runtime is local and explicit: browser skills prefer repo-local
preview/dev-server URLs when available, and otherwise need a URL supplied by the
operator or calling workflow.

## What changed

`wp setup` adds the repo bootstrap webpresso owns:

- `AGENTS.md`
- `.agent/` canonical commands, workflows, guides, and generated support files
- repo-owned source skill surfaces (`agent-skills/`, `agent-rules/`) when the
  catalog or setup path uses them
- generated agent surfaces
- blueprint lifecycle folders and docs templates
- `base-kit` quality scaffold: `tsconfig.json`, `vitest.config.ts`,
  `stryker.config.ts`, `playwright.config.ts`, starter unit tests, and a
  file-based Playwright smoke page. Agent Kit provides the shared Oxlint config
  through `wp lint`; fresh setup does not scaffold an `oxlint.config.ts` file.
- package scripts for `lint`, `typecheck`, `test`, `mutation`, `e2e`, and `qa`
- safe hook wiring
- gitignore protection for regenerated agent files

You do not need to learn those pieces individually. Run setup again any time;
it is idempotent and preserves consumer-owned files.

If you replace the seeded `src/quality-sample.ts`, `src/quality-sample.test.ts`,
or `e2e/smoke.spec.ts` files with real app code, `wp setup` will not recreate or
overwrite them as long as those paths still exist. Delete the starter files only
after your real tests and e2e specs are in place.

Codex and Claude surfaces are conditional on the matching host being installed
and available. Missing CLIs, skipped presets, or unauthenticated hosts should
show as skipped or warning lines in setup output, not as silent success.

When `CONTEXT7_API_KEY` is provided by the configured Webpresso secret provider
(for example Doppler via `wp config secrets`), `wp setup` wires Context7 without
writing the raw key. Codex uses a static `Accept` header plus
`env_http_headers` in its global config, and Claude uses `${CONTEXT7_API_KEY}`
in project `.mcp.json`. Launch the host through the wrapper so the selected
provider injects the secret at runtime:
`wp secrets run --sink dev-server --profile preview -- codex` or
`wp secrets run --sink dev-server --profile preview -- claude`.

Consecutive setup runs keep heavyweight integrations cheap by default. Workflow
and browser QA skills are package-owned defaults, so setup projects them from the
local catalog instead of cloning or refreshing an external workflow checkout.
Use `wp browser doctor` when a browser-backed skill reports missing Chromium or
Playwright compatibility issues.

### Default shared skills vs opt-ins

The default cross-host Webpresso skill contract is intentionally curated.

Guaranteed by default across Codex and Claude host-visible surfaces:

- `fix`
- `verify`
- `testing-philosophy`
- `plan-refine`
- `pll`
- `best-practice-research`
- `claude`
- `review`
- `autoplan`
- `investigate`
- `health`
- plan-review skills
- browser QA skills (`browse`, `qa-only`, `qa`, `devex-review`, `design-review`)

Available as explicit opt-ins rather than default prompt baggage:

- `systematic-debugging`
- `test-driven-development`
- `deep-research`
- `monorepo-navigation`

That split keeps the “same useful core skills everywhere” contract while
avoiding broad projection of the long tail into every host by default.

### What gets committed vs ignored

- **Commit** canonical sources and any deliberate repo-owned instruction files.
- **Ignore** regenerated/runtime surfaces such as `.agent/`, `.agents/`,
  generated `.claude/rules/`, `.claude/skills/`, `.claude/worktrees/`, and
  similar projection outputs.
- Do **not** blanket-ignore `.claude/` unless the repo intentionally treats the
  entire directory as local-only; some repos may deliberately commit selected
  `.claude/*` files while still ignoring generated subpaths.

## Verify

```bash
wp hooks doctor
wp audit guardrails
```

If either command reports drift, run:

```bash
wp setup
```

Public npm rehearsals use the packed artifact, not the local checkout:

```bash
vp run public:consumer-smoke -- --setup-only
```

## First success in Claude or Codex

Target: under 2 minutes from install to one real read-only tool call.

The canonical operator path is:

1. `wp setup`
2. `wp hooks doctor`
3. In your host, run the same bounded read-only action: `wp_audit(kind="docs-frontmatter")`

### Codex

1. Run `codex mcp list` and confirm `webpresso` is visible.
2. Ask Codex to run `wp_audit(kind="docs-frontmatter")`.

### Claude

1. Restart/open Claude Code in the repo after `wp setup`.
2. Ask Claude to run `wp_audit(kind="docs-frontmatter")`.

If the tool is unavailable, fix host visibility with `wp hooks doctor` first.

## Add-ons

Start with the default setup. Reach for add-ons only when the repo genuinely
needs one: [Add-ons](./add-ons.md).

## Blueprint root

Fresh repos default to `blueprints/`, but the blueprint root is configurable.
Set `.webpressorc.json#blueprintsDir` when a repo needs a different layout,
such as `webpresso/blueprints` in a monorepo.

## Package note

As of 2026-05-28, the canonical package identity for this repo is
`@webpresso/agent-kit`. Package references and release-contract notes live in
[`markdown-fact-check.md`](./markdown-fact-check.md).
