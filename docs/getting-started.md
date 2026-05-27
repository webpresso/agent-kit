---
type: guide
last_updated: '2026-05-27'
---

# Getting started

webpresso makes a repo ready for AI coding agents in one pass.

## Install

```bash
vp install -g @webpresso/agent-kit
wp setup
```

Done.

Your repo now has one shared agent contract across the supported coding-agent
surfaces.

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

As of 2026-05-27, the source/GitHub Packages package is
`@webpresso/agent-kit`; public npm `webpresso` is still a placeholder until the
cutover completes. Current package references live in
[`markdown-fact-check.md`](./markdown-fact-check.md).
