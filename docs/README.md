---
type: docs-index
last_updated: "2026-06-25"
---

# Agent Kit docs

Agent Kit is a public, source-available harness for coding-agent repos. Start
with the shortest safe path:

```bash
vp install -g @webpresso/agent-kit
wp setup --project-init
wp hooks doctor
```

## Read first

- [Getting started](./getting-started.md) — install, setup ownership, first tool call
- [Is Agent Kit for me?](./is-agent-kit-for-me.md) — fit, tradeoffs, and non-goals
- [Add-ons](./add-ons.md) — optional skills and integrations
- [Markdown fact check](./markdown-fact-check.md) — how public docs stay falsifiable

## Core references

- [Blueprint format](./blueprint-format.md)
- [Lifecycle](./lifecycle.md)
- [Worktrees](./worktrees.md)
- [Session memory](./guides/session-memory.md)
- [Security audits](./security-audits.md)
- [Hook doctor](./hooks-doctor.md)
- [QA output](./qa-output.md)
- [`wp` extension runtime](./wp-extension-runtime.md)

## Evidence and release checks

- [Reference parity matrix](./bench/reference-parity-matrix.md)
- [Result-card contract](./bench/result-card-contract.md)
- [Package/readiness notes](./github-action.md)

## Documentation rules

- Keep pages short enough to read during a real debugging session.
- Prefer exact commands, source links, and checkable claims.
- Delete obsolete pages instead of preserving misleading history.
- Do not make public numeric benchmark claims without a checked-in result card.
- Treat canonical `blueprints/**` as planning records, not docs-refresh material,
  unless the work explicitly updates a blueprint.
