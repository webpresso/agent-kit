---
type: guide
last_updated: '2026-06-18'
---

# Add-ons

Think of this page as the integration shelf. It is separate from the repo
bootstrap.

- **Default repo bootstrap:** `base-kit` creates the starter quality scaffold
  and package scripts when files are absent.
- **Default shared Webpresso skills:** `fix`, `verify`, `testing-philosophy`,
  `plan-refine`, `pll`, and `best-practice-research` are projected into
  supported host-visible surfaces by default.
- **Default workstation presets:** `vision` and `rtk`.
- **External tools:** OMX, OMC, and gstack are intentionally self-managed.
  Install and update them with their native installers if you choose to use
  them.

Most repos should only run:

```bash
wp setup
```

If a repo needs an opt-in Webpresso preset, add it with:

```bash
wp setup --with <name>
```

That is the only setup option most users should ever need to learn.

Use the same `--with` flow for non-default Webpresso skills such as
`systematic-debugging`, `test-driven-development`, `deep-research`, and
`monorepo-navigation`.

## Available integrations

| Name | Default behavior | Adds | License |
| --- | --- | --- | --- |
| [`playwright-mcp`](https://github.com/microsoft/playwright-mcp) | Opt-in. | Browser automation for agent QA. | Apache-2.0 |
| `example-skill` | Opt-in. | A tiny hello-world skill for smoke tests. | MIT (this repo) |
| [`rtk`](https://github.com/rtk-ai/rtk) | Default preset. Skipped in CI or when `WP_SKIP_RTK=1`. | Shell-tool token filtering and routing/guard integration. | Apache-2.0 |
| `vision` | Default preset. | Starter `VISION.md` and vision audit support. | MIT (this repo) |

## External tools managed outside `wp setup`

These tools remain compatible with Webpresso, but `wp setup` no longer
remembers or replays their installation on reruns:

| Tool | Preferred install/update path | Source |
| --- | --- | --- |
| [`omx`](https://oh-my-codex.dev/docs.html) | `npm install -g oh-my-codex`, then `omx setup` / `omx update` | official OMX docs |
| `omc` | Claude Code `/plugin` or `claude plugin` marketplace commands | [Claude Code plugin docs](https://code.claude.com/docs/en/settings) |
| [`gstack`](https://github.com/garrytan/gstack) | Clone the repo and run `./setup` | upstream README |

See [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) for vendored catalog skills and
integration license notes.

## Default bootstrap

`wp setup` already handles the default repo contract, hooks, blueprints,
templates, local guardrails, and `base-kit` quality files. Those generated
quality files are absent-only: replace the starter sample with real code/tests,
and reruns preserve your files.

Fresh repos default to `blueprints/`. Repos that need a different layout can
override `.webpressorc.json#blueprintsDir` — for example
`webpresso/blueprints` in a monorepo.

Most users should never need to think about those pieces individually.
