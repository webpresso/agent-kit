# Third-Party Notices

`@webpresso/agent-kit` is licensed under the [Elastic License 2.0](./LICENSE).

The catalog includes skills copied or adapted from upstream open-source projects.
Machine-readable provenance lives in
[`catalog/agent/skills/third-party-manifest.json`](./catalog/agent/skills/third-party-manifest.json).
CI validates that manifest with `wp audit open-source-licenses`.

## Vendored catalog skills

| Skill | Upstream | License | Notes |
| --- | --- | --- | --- |
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/frontend-design) | Apache-2.0 | `LICENSE.txt` vendored alongside the skill |
| `vercel-react-best-practices` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) | MIT | Substantial rule corpus vendored under `catalog/agent/skills/vercel-react-best-practices/` |
| `logging-best-practices` | [boristane/agent-skills](https://github.com/boristane/agent-skills/tree/main/skills/logging-best-practices) | MIT | Wide-events logging guidance |
| `web-design-guidelines` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines) | MIT | Skill wrapper; live guidelines fetched from upstream at runtime |

## Webpresso-authored catalog skills

Skills such as `tanstack-query`, `lore-protocol`, `pll`, `verify`, `fix`, and
`better-auth-best-practices` are maintained in this repository and are covered by
the project Elastic License 2.0 unless noted otherwise in their frontmatter.

## Integration-only skills (not vendored)

| Skill | Upstream tool | License |
| --- | --- | --- |
| `react-doctor` | [millionco/react-doctor](https://github.com/millionco/react-doctor) | MIT |

These skills document how to invoke external CLIs or packages. Their upstream
binaries are **not** bundled in `@webpresso/agent-kit`.

## Runtime integrations (not bundled)

These integrations invoke or install external tools separately; their upstream
binaries are **not** bundled in `@webpresso/agent-kit`. The table below records
whether each integration is part of the current default `wp setup` preset set or
requires explicit `wp setup --with <name>` opt-in. Consumers accept the upstream
license separately when an integration is installed.

| Integration | Default behavior | Upstream | License |
| --- | --- | --- | --- |
| `playwright-mcp` | Opt-in. | [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) | Apache-2.0 |
| `gstack-derived skills` | Curated Markdown skill assets staged from the private gstack workspace package; no upstream runtime checkout or binaries bundled. | [garrytan/gstack](https://github.com/garrytan/gstack) | MIT |
| `omx` / `oh-my-codex` | In the default preset set; skipped in CI. | [oh-my-codex](https://oh-my-codex.dev/) | MIT |
| `omc` / `oh-my-claudecode` | In the default preset set; skipped when `WP_SKIP_OMC=1` or the `claude` CLI is unavailable. | [Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) | MIT |
| `rtk` | In the default preset set; skipped in CI or when `WP_SKIP_RTK=1`. | [rtk-ai/rtk](https://github.com/rtk-ai/rtk) | Apache-2.0 |

## Runtime npm dependencies

Production dependencies ship under their own licenses (MIT, Apache-2.0, ISC, and
similar permissive terms). Run `pnpm licenses list --prod` in a fully installed
checkout for the current dependency license report.

This file is an engineering attribution inventory, not legal advice.

## gstack-derived workflow skills

This package includes Webpresso-owned, manually curated workflow skill assets derived from ideas in the MIT-licensed gstack project by Garry Tan and contributors: https://github.com/garrytan/gstack

The curated assets are small Markdown-only skill sources. Upstream binaries, generated host directories, dependency payloads, and heavyweight runtime surfaces are intentionally excluded. Public provenance is summarized in this notice and the machine-readable third-party manifest shipped with the package.
