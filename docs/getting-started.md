---
type: guide
last_updated: '2026-06-08'
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
npm install -g @webpresso/agent-kit
wp setup
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

If you prefer not to keep a global install around, use the one-shot form:

```bash
cd your-repo
npm exec --yes --package @webpresso/agent-kit@latest -- wp setup
```

If `wp setup` needs gstack tuning on a workstation with multiple agent CLIs
installed, use:

- `WP_GSTACK_MODE=full wp setup` to refresh every detected gstack host
- `WP_GSTACK_HOSTS=codex wp setup` or `WP_GSTACK_HOSTS=claude,codex wp setup`
  to pin the host set explicitly
- `WP_VERBOSE_GSTACK=1 wp setup` to show raw upstream gstack output alongside
  the bounded phase progress
- `WP_GSTACK_INACTIVITY_MS=900000 wp setup` to raise the inactivity guard on
  slow or proxied networks; if you still need more detail, pair it with
  `WP_VERBOSE_GSTACK=1`
- `WP_SKIP_GSTACK=1 wp setup` only when you intentionally want to skip gstack
  entirely

`wp setup` writes one gstack session log per run under webpresso's state-root
storage and prints the log path on failures. In quiet mode, the wrapper stays
concise but now emits periodic "still running" heartbeat lines when an external
gstack step is alive without fresh output; that keeps long phases like browser
install/extraction from looking dead without dumping raw child logs by default.
On Windows, timeout/interrupt cleanup is best-effort direct-child termination
only; the wrapper does not guarantee grandchild teardown there.

## What changed

`wp setup` adds the repo bootstrap webpresso owns:

- `AGENTS.md`
- `.agent/` canonical commands, workflows, guides, and generated support files
- repo-owned source skill surfaces (`agent-skills/`, `agent-rules/`) when the
  catalog or setup path uses them
- generated agent surfaces
- blueprint lifecycle folders and docs templates
- `base-kit` quality scaffold: `tsconfig.json`, `vitest.config.ts`,
  `oxlint.config.ts`, `stryker.config.ts`, `playwright.config.ts`, starter unit
  tests, and a file-based Playwright smoke page
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

### Default shared skills vs opt-ins

The default cross-host Webpresso skill contract is intentionally curated.

Guaranteed by default across Codex and Claude host-visible surfaces:

- `fix`
- `verify`
- `testing-philosophy`
- `plan-refine`
- `pll`
- `best-practice-research`

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
