---
type: guide
last_updated: '2026-05-27'
---

# Add-ons

Think of this page as the add-ons shelf.

Most repos should only run:

```bash
wp setup
```

If a repo needs something extra, add it with:

```bash
wp setup --with <name>
```

That is the only setup option most users should ever need to learn.

## Available integrations

| Name | Adds | License |
| --- | --- | --- |
| [`context-mode`](https://github.com/mksglu/context-mode) | Optional context/window reduction tools. | Elastic-2.0 (source-available; opt-in only) |
| [`playwright-mcp`](https://github.com/microsoft/playwright-mcp) | Browser automation for agent QA. | Apache-2.0 |
| `lore-commits` | Structured commit-message enforcement. | MIT (this repo) |
| `example-skill` | A tiny hello-world skill for smoke tests. | MIT (this repo) |
| [`omx`](https://oh-my-codex.dev/docs.html) | Codex-side orchestration helpers. | MIT |
| [`omc`](https://github.com/Yeachan-Heo/oh-my-claudecode) | Claude-side orchestration helpers. | MIT |
| [`gstack`](https://github.com/garrytan/gstack) | Extra workflow skills. | MIT |
| [`rtk`](https://github.com/rtk-ai/rtk) | Extra routing/guard integration where supported. | MIT |
| `vision` | Starter `VISION.md` and vision audit support. | MIT (this repo) |

See [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) for vendored catalog skills and
integration license notes. Default `wp setup` stays MIT-only; `context-mode` is never
bundled in the published npm package.

## Default bootstrap

`wp setup` already handles the default repo contract, hooks, blueprints,
templates, and local guardrails.

Most users should never need to think about those pieces individually.
