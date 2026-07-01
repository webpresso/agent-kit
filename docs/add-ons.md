---
type: guide
last_updated: "2026-07-01"
---

# Add-ons

Think of this page as the integration shelf. It is separate from the repo
bootstrap.

- **Default repo bootstrap:** `base-kit` creates the starter quality scaffold
  and package scripts when files are absent.
- **Default shared Webpresso skills:** `fix`, `verify`, `testing-philosophy`,
  `plan-refine`, `pll`, `best-practice-research`, plus workflow/browser QA
  skills such as `autoplan`, `investigate`, `browse`, `qa-only`, and `qa`, are
  projected into supported host-visible surfaces by default.
- **Default workstation presets:** `vision` and `rtk`.
- **Optional agent tools:** `wp install` can mark Codex, Claude Code, OpenCode,
  and Oh My integrations as WP-owned. WP-owned scopes are refreshed by
  `wp update`; `wp remove ...` clears ownership only and does not attempt a
  native uninstall.

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

| Name                                                            | Default behavior                                       | Adds                                                      | License         |
| --------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------- | --------------- |
| [`playwright-mcp`](https://github.com/microsoft/playwright-mcp) | Opt-in.                                                | Browser automation for agent QA.                          | Apache-2.0      |
| `example-skill`                                                 | Opt-in.                                                | A tiny hello-world skill for smoke tests.                 | MIT (this repo) |
| [`rtk`](https://github.com/rtk-ai/rtk)                          | Default preset. Skipped in CI or when `WP_SKIP_RTK=1`. | Shell-tool token filtering and routing/guard integration. | Apache-2.0      |
| `vision`                                                        | Default preset.                                        | Starter `VISION.md` and vision audit support.             | MIT (this repo) |

## Optional WP-managed agent tools

`wp setup` stays focused on repo scaffolding. Install optional agent CLIs and Oh
My layers explicitly when a workstation or project needs them:

```bash
wp install codex
wp install claude-code
wp install opencode
wp install oh-my codex
wp install oh-my claude-code --scope user
wp install oh-my opencode
```

`openagent` and `omo` are accepted only as compatibility aliases for the canonical OpenCode
command. The OpenCode Oh My layer is [Oh My OpenAgent](https://github.com/code-yeongyu/oh-my-openagent); WP keeps the documented path on the `wp`/`vp` facade:

```bash
wp install oh-my openagent   # same target as: wp install oh-my opencode
wp install oh-my omo         # same target as: wp install oh-my opencode
```

When WP owns a user or project scope, future `wp update` runs refresh that scope
before refreshing `@webpresso/agent-kit`. `wp remove ...` only clears the WP
ownership record; it does not run a native uninstall. Use `--scope project` only
for Oh My tools that support project-scoped setup.

| Target           | Canonical command              | Notes                                         |
| ---------------- | ------------------------------ | --------------------------------------------- |
| Codex CLI        | `wp install codex`             | User-scoped global CLI.                       |
| Claude Code CLI  | `wp install claude-code`       | User-scoped global CLI.                       |
| OpenCode CLI     | `wp install opencode`          | User-scoped global CLI.                       |
| Oh My Codex      | `wp install oh-my codex`       | Supports `--scope user` or `--scope project`. |
| Oh My ClaudeCode | `wp install oh-my claude-code` | Supports `--scope user` or `--scope project`. |
| Oh My OpenAgent  | `wp install oh-my opencode`    | `openagent`/`omo` are aliases, not canonical. |

## Default bootstrap

`wp setup` already handles the default repo contract, hooks, blueprints,
templates, local guardrails, and `base-kit` quality files. Those generated
quality files are absent-only: replace the starter sample with real code/tests,
and reruns preserve your files.

Fresh repos default to `blueprints/`. Repos that need a different layout can
override `.webpressorc.json#blueprintsDir` — for example
`webpresso/blueprints` in a monorepo.

Most users should never need to think about those pieces individually.
