# @webpresso/agent-kit

[![License: Elastic--2.0](https://img.shields.io/badge/License-Elastic--2.0-0f766e.svg)](./LICENSE)
[![CI](https://github.com/webpresso/agent-kit/actions/workflows/ci.agent-kit.yml/badge.svg)](https://github.com/webpresso/agent-kit/actions/workflows/ci.agent-kit.yml)

> A public, source-available harness for agent-ready repos: one `wp` runtime
> for setup, hooks, MCP tools, memory, worktrees, browser QA, secrets, audits,
> blueprints, and evidence gates.

## Why this exists

Coding agents are useful until every host gets a different prompt, hook, test
command, memory store, and safety rule. Agent Kit turns that pile of local
conventions into one repo contract that agents can run and humans can audit.

It is not another agent. It is the harness around agents: the CLI, MCP server,
hooks, generated host surfaces, docs checks, and release gates that keep work
repeatable.

## What you get

- **One setup path:** `wp setup --project-init` creates the agent surface,
  quality scripts, safe ignores, docs templates, and blueprint folders.
- **One command facade:** `wp test`, `wp lint`, `wp typecheck`, `wp format`,
  `wp e2e`, `wp qa`, `wp audit`, `wp worktree`, and `wp secrets` give agents a
  stable interface instead of repo-specific tribal knowledge.
- **Agent-safe MCP tools:** `wp_*` tools return bounded JSON summaries with
  failure evidence, output sizes, and token-saved metadata instead of raw logs.
- **Shared host surfaces:** one catalog projects rules, skills, hooks, Claude
  plugin metadata, Codex plugin metadata, and generated instruction files.
- **Continuity without magic:** session memory is local storage with explicit
  search, restore, capture, retrieve, reset, and doctor tools; methodology and
  proof live in [`docs/bench/session-memory-methodology.md`](./docs/bench/session-memory-methodology.md).
- **Safety by default:** secret, path, package, docs, blueprint, catalog, and
  reference-parity audits fail before drift becomes release material; see
  [`docs/bench/reference-parity-matrix.md`](./docs/bench/reference-parity-matrix.md),
  [`src/__integration__/reference-parity-host-smoke.integration.test.ts`](./src/__integration__/reference-parity-host-smoke.integration.test.ts),
  and [`src/__integration__/reference-parity-tool-surface.integration.test.ts`](./src/__integration__/reference-parity-tool-surface.integration.test.ts).
- **Evidence over claims:** public numeric benchmark claims require result-card evidence. Claim gate: checked-in first-party result card. See `docs/bench/result-cards/` and [`docs/bench/result-card-contract.md`](./docs/bench/result-card-contract.md).

## Quick start

Requires Node.js 24 or newer.

```bash
vp install -g @webpresso/agent-kit
cd your-repo
wp setup --project-init
wp hooks doctor
```

Then ask Claude, Codex, or another MCP-capable host for one bounded read-only
check:

```text
wp_audit(kind="docs-frontmatter")
```

If the tool is missing, run `wp hooks doctor` and fix the host visibility issue
it reports. For a checkout-to-preview walkthrough, see
[`docs/guides/repo-to-preview-url.md`](./docs/guides/repo-to-preview-url.md).
For generated-file ownership, see
[`docs/getting-started.md`](./docs/getting-started.md). For the secret
orchestration contract, see
[`docs/secrets/providers.md`](./docs/secrets/providers.md) and
[`docs/errors/wp-secret-orchestration.md`](./docs/errors/wp-secret-orchestration.md).

## Capability map

| Area                  | What `wp` provides                                                                                                         | Proof                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Setup and onboarding  | Idempotent setup, AGENTS/CLAUDE wiring, generated host surfaces, base scripts, templates, and gitignore protection         | [`src/cli/commands/init/`](./src/cli/commands/init/)                                                 |
| CLI quality gates     | Test, lint, typecheck, format, E2E, QA, CI, logs, package-manager facade, and release/readiness commands                   | [`src/cli/cli.ts`](./src/cli/cli.ts)                                                                 |
| MCP tools             | Agent-safe tools for quality gates, audits, worktrees, PR status, release readiness, gain, bench, and session memory       | [`src/mcp/tools/_registry.ts`](./src/mcp/tools/_registry.ts)                                         |
| Session memory        | Local continuity tools with bounded output, reset safety, and explicit non-goals                                           | [`docs/guides/session-memory.md`](./docs/guides/session-memory.md)                                   |
| Worktrees             | Managed worktrees under `~/.agent/worktrees`, blueprint owner binding, scratch lanes, list/prune/refresh/migrate           | [`docs/worktrees.md`](./docs/worktrees.md)                                                           |
| Browser and QA        | Browser doctor/ensure helpers plus bundled browse, QA, design-review, and devex-review skills                              | [`src/browser/`](./src/browser/), [`docs/qa-output.md`](./docs/qa-output.md)                         |
| Secrets and preview   | Provider-neutral secret execution, secret doctor, preview/cleanup/deploy paths, and CI act secret redaction                | [`docs/secrets/providers.md`](./docs/secrets/providers.md), [`docs/ci-act.md`](./docs/ci-act.md)     |
| Audits                | Guardrails for docs, blueprints, catalog drift, reference parity, paths, licenses, secrets, tech debt, and package surface | [`src/audit/`](./src/audit/)                                                                         |
| Blueprints            | Lifecycle folders, task metadata, dependency graph tools, MCP authoring, and drift checks                                  | [`docs/blueprint-format.md`](./docs/blueprint-format.md), [`docs/lifecycle.md`](./docs/lifecycle.md) |
| Plugin artifacts      | Package-owned Claude/Codex plugin metadata; setup writes active host config instead of relying on marketplace side effects | [`.claude-plugin/`](./.claude-plugin/), [`.codex-plugin/`](./.codex-plugin/)                         |
| Runtime/package gates | Packed-artifact smoke tests, public readiness, package lint, path checks, and secret checks                                | [`scripts/public-readiness.ts`](./scripts/public-readiness.ts), [`package.json`](./package.json)     |

## Session-memory contract

Session memory is local storage for continuity, not a hosted brain. Its public
MCP tools are `wp_session_batch_execute`, `wp_session_capture`,
`wp_session_doctor`, `wp_session_execute`, `wp_session_execute_file`,
`wp_session_fetch_and_index`, `wp_session_index`, `wp_session_purge`,
`wp_session_restore`, `wp_session_retrieve`, `wp_session_search`,
`wp_session_snapshot`, and `wp_session_stats`.

The contract is bounded outputs, reset safety, and clear non-goals. See
[`docs/guides/session-memory.md`](./docs/guides/session-memory.md).

## Daily commands

```bash
wp setup                 # refresh managed agent surfaces
wp hooks doctor          # verify hook/plugin/MCP visibility
wp test --suite unit     # targeted test lane
wp typecheck             # workspace typecheck through the repo facade
wp lint                  # oxlint through wp
wp format --check        # formatting gate
wp audit guardrails      # repo policy bundle
wp worktree new --name "fix login" --base main
```

Use `vp run <script>` for package scripts in this source repo. Do not bypass the
repo facade with raw formatter or linter binaries.

## Safety model

Agent Kit is designed for local, auditable automation:

- Generated/runtime host surfaces are recreated by `wp setup` / `wp sync`; edit
  canonical sources instead of generated caches.
- Secrets move through configured runtime/profile channels, not committed files
  or raw command arguments.
- Public claims must be backed by tests, docs gates, audits, or result cards.
- Obsolete docs should be deleted, not kept as confusing archaeology.
- Canonical `blueprints/**` are planning records; broad docs refreshes should
  not rewrite them unless the task explicitly changes a blueprint.

## Security gates

Agent Kit ships these secret-governance audits:

| Command                               | Purpose                                                                |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `wp audit secrets-policy`             | Find forbidden secret carriers in the working tree and tracked history |
| `wp audit no-dev-vars`                | Block `.env` / `.dev.vars` files                                       |
| `wp audit secret-provider-quarantine` | Block direct provider CLI usage in source                              |
| `wp audit secrets-config`             | Validate `.webpresso/secrets.config.json` without embedded secrets     |

See [`docs/security-audits.md`](./docs/security-audits.md),
[`docs/secrets/providers.md`](./docs/secrets/providers.md), and
[`docs/errors/wp-secret-orchestration.md`](./docs/errors/wp-secret-orchestration.md).

## Fit and non-goals

Use Agent Kit when you want a repo-level agent harness: setup, host surfaces,
quality gates, MCP tools, session memory, worktrees, blueprints, and audit
policy in one repeatable package.

Skip it when you only want a prompt library, cannot run Node-based developer
tooling, or do not want repo-local agent files. See
[`docs/is-agent-kit-for-me.md`](./docs/is-agent-kit-for-me.md).

## Maintainer verification

For docs-only work, run:

```bash
./bin/docs-check-internal-links.js
./bin/docs-check-refs.js
./bin/docs-check-stale.js
./bin/docs-lint.js
./bin/wp audit docs-frontmatter --json
```

For code or shipped behavior changes, add the narrow relevant tests plus:

```bash
vp run typecheck
vp run lint
vp run format --check
```

Release and public-claim gates are stricter; see
[`CONTRIBUTING.md`](./CONTRIBUTING.md) and
[`docs/markdown-fact-check.md`](./docs/markdown-fact-check.md).

## License

This repository is public and source-available under the
[Elastic License 2.0](./LICENSE). Review the license before offering hosted or
managed access to the software.

## Project docs

- [`docs/README.md`](./docs/README.md) — documentation index
- [`docs/getting-started.md`](./docs/getting-started.md) — install and first run
- [`docs/secrets/providers.md`](./docs/secrets/providers.md) — provider/profile/sink contract
- [`docs/errors/wp-secret-orchestration.md`](./docs/errors/wp-secret-orchestration.md) — secret/orchestration error reference
- [`VISION.md`](./VISION.md) — product direction
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — contributor workflow
- [`SECURITY.md`](./SECURITY.md) — vulnerability reporting
- [`CHANGELOG.md`](./CHANGELOG.md) — Changesets-managed release history
