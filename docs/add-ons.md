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

| Name | Adds |
| --- | --- |
| [`context-mode`](https://github.com/mksglu/context-mode) | Optional context/window reduction tools. |
| [`playwright-mcp`](https://github.com/microsoft/playwright-mcp) | Browser automation for agent QA. |
| `lore-commits` | Structured commit-message enforcement. |
| `example-skill` | A tiny hello-world skill for smoke tests. |
| [`omx`](https://oh-my-codex.dev/docs.html) | Codex-side orchestration helpers. |
| [`omc`](https://github.com/Yeachan-Heo/oh-my-claudecode) | Claude-side orchestration helpers. |
| [`gstack`](https://github.com/garrytan/gstack) | Extra workflow skills. |
| [`rtk`](https://github.com/rtk-ai/rtk) | Extra routing/guard integration where supported. |
| `vision` | Starter `VISION.md` and vision audit support. |

## Default bootstrap

`wp setup` already handles the default repo contract, hooks, blueprints,
templates, and local guardrails.

Most users should never need to think about those pieces individually.
