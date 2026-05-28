---
type: guide
last_updated: '2026-05-28'
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

Done.

Your repo now has one shared agent contract across the supported coding-agent
surfaces.

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
- `WP_SKIP_GSTACK=1 wp setup` only when you intentionally want to skip gstack
  entirely

## What changed

`wp setup` adds the repo bootstrap webpresso owns:

- `AGENTS.md`
- `.agent/` canonical commands, skills, rules, guides, and workflows
- generated agent surfaces
- blueprint lifecycle folders and docs templates
- safe hook wiring
- gitignore protection for regenerated agent files

You do not need to learn those pieces individually. Run setup again any time;
it is idempotent and preserves consumer-owned files.

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

## Add-ons

Start with the default setup. Reach for add-ons only when the repo genuinely
needs one: [Add-ons](./add-ons.md).

## Package note

As of 2026-05-28, the canonical package identity for this repo is
`@webpresso/agent-kit`. Package references and release-contract notes live in
[`markdown-fact-check.md`](./markdown-fact-check.md).
