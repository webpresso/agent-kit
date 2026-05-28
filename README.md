# @webpresso/agent-kit

> Plug-and-play setup for AI coding agents. Run one command and every agent in
> the repo gets the same instructions, skills, hooks, planning files, and quality
> gates. MIT. Experimental v0.x.

## Install

```bash
vp install -g @webpresso/agent-kit
wp setup
```

That's the product.

`wp setup` is safe to run again. It refreshes the webpresso-owned pieces and
preserves consumer-owned files.

## What it gives you

- **One repo brain** — major coding agents read the same operating contract.
- **Skills that travel** — repo skills show up across supported agent surfaces.
- **Hooks that help** — generated hooks steer common work through repo quality gates.
- **Blueprints by default** — planning files and templates are ready when the task needs them, and Blueprint markdown stays the canonical plan while OMX handoff files remain derived metadata.
- **Agent-friendly checks** — tests, lint, typecheck, E2E, and audits are easy to run and cite.
- **Context-efficient evidence by default** — `wp_*` MCP wrappers return
  compact test/lint/typecheck/audit summaries, and `wp setup` includes `rtk`
  in its default workstation preset set.

## Why it exists

AI-agent repos usually grow six copies of the same thing:

- one instruction file for Claude,
- another for Codex,
- another for Cursor,
- separate hooks,
- separate skills,
- separate planning conventions.

Those copies drift. webpresso makes the repo feel like one product again:

```bash
wp setup
```

## Why agents keep more useful context

Coding agents waste context in two predictable ways: duplicated repo guidance and
verbose tool output. Agent Kit attacks both:

- **Default compact quality evidence:** `wp_test`, `wp_lint`, `wp_typecheck`, `wp_qa`,
  `wp_e2e`, and `wp_audit` are MCP-first wrappers that return summary-first
  JSON, clipped raw output, and budget metadata such as `bytes` and
  `tokensSaved`. See [`docs/qa-output.md`](docs/qa-output.md).
- **Default RTK shell filtering lane:** `wp setup` includes `rtk` in its
  default preset set. The setup command skips RTK in CI and when
  `WP_SKIP_RTK=1` is set. See [`docs/add-ons.md`](docs/add-ons.md).
- **Default context-mode lane:** `wp setup` includes `context-mode` in its
  default preset set. The setup command skips context-mode in CI and when
  `WP_SKIP_CONTEXT_MODE=1` is set, and the published package still does not
  bundle the external tool. See
  [`docs/migration/context-mode-default.md`](docs/migration/context-mode-default.md).

The result: agents spend more of the window on code, plans, decisions, and
errors that matter, and less on repeated instructions or thousand-line command
logs.

## Add-ons

Most repos should start with the default setup. Extra integrations and their
default/opt-in behavior are documented in [`docs/add-ons.md`](docs/add-ons.md).

## Package references

If you need config subpaths or dependency references, use the appendix:
[`docs/markdown-fact-check.md`](docs/markdown-fact-check.md).

## Docs

- [Getting started](docs/getting-started.md)
- [Is webpresso for me?](docs/is-agent-kit-for-me.md)
- [Add-ons](docs/add-ons.md)
- [Blueprint format](docs/blueprint-format.md)
- [Skills catalog](docs/skills-catalog.md)

## Status

Experimental v0.x. Public APIs may change before v1.

## License

MIT — see [LICENSE](./LICENSE). Vendored catalog skills and runtime integration
licenses are documented in [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
