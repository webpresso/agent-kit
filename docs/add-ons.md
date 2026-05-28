---
type: guide
last_updated: '2026-05-28'
---

# Add-ons

Think of this page as the integration shelf: some integrations are requested by
the default setup, and some are explicit opt-ins.

Most repos should only run:

```bash
wp setup
```

If a repo needs an opt-in integration, add it with:

```bash
wp setup --with <name>
```

That is the only setup option most users should ever need to learn.

## Available integrations

| Name | Default behavior | Adds | License |
| --- | --- | --- | --- |
| [`context-mode`](https://github.com/mksglu/context-mode) | In the default preset set; skipped in CI or when `WP_SKIP_CONTEXT_MODE=1`. | Context/window reduction tools and `ctx_*` recall lanes. | Elastic-2.0 (source-available) |
| [`playwright-mcp`](https://github.com/microsoft/playwright-mcp) | Opt-in. | Browser automation for agent QA. | Apache-2.0 |
| `lore-commits` | Opt-in. | Structured commit-message enforcement. | MIT (this repo) |
| `example-skill` | Opt-in. | A tiny hello-world skill for smoke tests. | MIT (this repo) |
| [`omx`](https://oh-my-codex.dev/docs.html) | In the default preset set; skipped in CI. | Codex-side orchestration helpers. | MIT |
| [`omc`](https://github.com/Yeachan-Heo/oh-my-claudecode) | In the default preset set; skipped when `WP_SKIP_OMC=1` or the `claude` CLI is unavailable. | Claude-side orchestration helpers. | MIT |
| [`gstack`](https://github.com/garrytan/gstack) | In the default preset set; skipped in CI or when `WP_SKIP_GSTACK=1`. | Extra workflow skills. | MIT |
| [`rtk`](https://github.com/rtk-ai/rtk) | In the default preset set; skipped in CI or when `WP_SKIP_RTK=1`. | Shell-tool token filtering and routing/guard integration. | Apache-2.0 |
| `vision` | In the default preset set. | Starter `VISION.md` and vision audit support. | MIT (this repo) |

See [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) for vendored catalog skills and
integration license notes. The published npm package does not bundle `context-mode`; setup wires it as an
external integration instead.

## Default bootstrap

`wp setup` already handles the default repo contract, hooks, blueprints,
templates, local guardrails, and the default workstation preset set.

Most users should never need to think about those pieces individually. When a
row says “in the default preset set,” it means `wp setup` includes that preset
without needing `--with <name>`.
