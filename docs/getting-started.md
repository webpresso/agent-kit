---
type: guide
last_updated: "2026-06-25"
---

# Getting started

Agent Kit makes a repo usable by coding agents in one setup pass. It installs a
shared harness: CLI commands, MCP tools, host instructions, hooks, skills,
quality gates, docs templates, and safe ignores.

## Requirements

- Node.js 24 or newer
- A git-tracked repo
- A global `wp` install from `@webpresso/agent-kit`

## Install and setup

```bash
vp install -g @webpresso/agent-kit
cd your-repo
wp setup --project-init
wp hooks doctor
```

No private registry is required. `wp` bundles the package/task facade it needs;
a separate global `vp` install is not required.

For team repos, keep `wp` global and keep only `@webpresso/agent-config` as the
local preset dependency. Do not add a consumer-local `@webpresso/agent-kit`
dependency just to run setup.

## What setup owns

`wp setup` is idempotent. Re-run it when agent surfaces drift.

It can create or refresh:

- `AGENTS.md` and `CLAUDE.md`
- canonical `.agent/` content and projected host surfaces
- generated Claude/Codex hook and MCP config
- repo-owned `agent-rules/` and `agent-skills/` sources when selected
- docs templates and blueprint lifecycle folders
- base quality files: TypeScript, Vitest, Stryker, Playwright, starter tests,
  and a Playwright smoke template
- package scripts for `lint`, `typecheck`, `test`, `mutation`, `e2e`, and `qa`
- gitignore entries for regenerated/runtime files

Generated/runtime surfaces are ignored by default. Commit canonical sources and
intentional repo-owned instruction files, not regenerated caches.

## First trust loop

Run the local health checks first:

```bash
wp hooks doctor
wp secrets doctor
```

Then ask Claude, Codex, or another MCP-capable host for one bounded read-only
action:

```text
wp_audit(kind="docs-frontmatter")
```

If the MCP tool is missing, run `wp hooks doctor` and fix the reported host
visibility issue before debugging the agent.

## Common next steps

```bash
wp audit guardrails
wp worktree new --name "try agent-kit" --base main
wp browser doctor
wp browser ensure chromium
```

Browser skills prefer repo-local preview/dev-server URLs. Otherwise provide a
URL explicitly.

## Secrets

Secrets must come from configured runtime/profile channels, not committed files
or raw argv. Launch hosts through the wrapper when they need provider-injected
secrets:

```bash
wp secrets run --sink dev-server --profile preview -- codex
wp secrets run --sink dev-server --profile preview -- claude
```

See [secret providers](./secrets/providers.md) and
[security audits](./security-audits.md).

## Default skills

The default shared surface includes common repair, verification, planning,
review, health, and browser-QA skills. Heavier methodology skills stay opt-in so
the default prompt surface remains small. See [add-ons](./add-ons.md).

## Verify a setup change

```bash
wp hooks doctor
wp audit guardrails
wp sync --check
```

If setup-owned files drift, run:

```bash
wp setup
```

Packed-artifact rehearsals use the published package shape:

```bash
vp run public:consumer-smoke -- --setup-only
```

## Blueprint root

Fresh repos default to `blueprints/`. Set `.webpressorc.json#blueprintsDir` only
when a repo needs a different plan-store layout. Broad docs cleanups should not
rewrite canonical `blueprints/**` unless the task explicitly changes a blueprint.

## License note

Agent Kit is public and source-available under Elastic License 2.0. Review the
license before offering hosted or managed access to the software.
