# @webpresso/agent-kit

[![License: Elastic--2.0](https://img.shields.io/badge/License-Elastic--2.0-0f766e.svg)](./LICENSE)
[![CI](https://github.com/webpresso/agent-kit/actions/workflows/ci.agent-kit.yml/badge.svg)](https://github.com/webpresso/agent-kit/actions/workflows/ci.agent-kit.yml)

> TypeScript-first agent harness for guarded develop/deploy workflows: one `wp`
> runtime for setup, MCP tools, hooks, memory, worktrees, QA, secrets, audits,
> blueprints, and evidence gates.

Agent Kit is the repo-level harness around coding agents. It gives TypeScript
projects a repeatable `wp` command surface, generated host instructions, MCP
quality tools, local continuity, and policy checks so agent work can be run,
reviewed, and repaired with evidence.

It is not another agent or remote orchestration service. It is the
source-available scaffolding and guardrail layer that helps Claude, Codex, and
other MCP-capable hosts operate inside a repo contract.

## Quick start

Requires Node.js 24 or newer.

```bash
vp install -g @webpresso/agent-kit
cd your-repo
wp setup repair --project-init
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

## What `wp` guards

| Outcome                                | What Agent Kit provides                                                                                                                                                              | Proof                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start from a known repo contract       | `wp setup repair --project-init` creates or repairs agent instructions, host config, docs templates, blueprint folders, quality scripts, and safe ignores.                           | [setup command source](https://github.com/webpresso/agent-kit/tree/main/src/cli/commands/init)                                                                                                                                                                                                                                                                                                                                                       |
| Give agents stable commands            | `wp test`, `wp lint`, `wp typecheck`, `wp format`, `wp e2e`, `wp qa`, `wp audit`, `wp worktree`, and `wp secrets` wrap repo-specific tooling behind one facade.                      | [CLI entrypoint](https://github.com/webpresso/agent-kit/blob/main/src/cli/cli.ts)                                                                                                                                                                                                                                                                                                                                                                    |
| Expose bounded MCP tools               | `wp_*` MCP tools return JSON summaries with failure evidence, output limits, and token-saved metadata instead of raw terminal dumps.                                                 | [MCP registry](https://github.com/webpresso/agent-kit/blob/main/src/mcp/tools/_registry.ts)                                                                                                                                                                                                                                                                                                                                                          |
| Keep host surfaces consistent          | One catalog projects rules, skills, hooks, Claude plugin metadata, Codex plugin metadata, and generated instruction files.                                                           | [Claude plugin](./.claude-plugin/), [Codex plugin](./.codex-plugin/)                                                                                                                                                                                                                                                                                                                                                                                 |
| Preserve local continuity              | Session memory is local storage with explicit search, restore, capture, retrieve, reset, and doctor tools.                                                                           | [`docs/guides/session-memory.md`](./docs/guides/session-memory.md), [`docs/bench/session-memory-methodology.md`](./docs/bench/session-memory-methodology.md)                                                                                                                                                                                                                                                                                         |
| Isolate risky work                     | Managed worktrees and blueprint owner binding keep implementation lanes separate from the main checkout.                                                                             | [worktrees guide](https://github.com/webpresso/agent-kit/blob/main/docs/worktrees.md)                                                                                                                                                                                                                                                                                                                                                                |
| Run browser QA with evidence           | Browser doctor/ensure helpers and bundled browse, QA, design-review, and devex-review skills support local or explicit preview URLs.                                                 | [browser source](https://github.com/webpresso/agent-kit/tree/main/src/browser), [QA output guide](https://github.com/webpresso/agent-kit/blob/main/docs/qa-output.md)                                                                                                                                                                                                                                                                                |
| Handle secrets without committing them | Provider/profile/sink contracts route secrets through configured runtime channels for local commands, CI rehearsal, and supported preview/deploy workflows with repo-specific setup. | [`docs/secrets/providers.md`](./docs/secrets/providers.md), [`docs/ci-act.md`](./docs/ci-act.md)                                                                                                                                                                                                                                                                                                                                                     |
| Block drift before release             | Guardrails cover docs, blueprints, catalog drift, reference parity, paths, licenses, secrets, tech debt, and package surface.                                                        | [audit source](https://github.com/webpresso/agent-kit/tree/main/src/audit), [`docs/bench/reference-parity-matrix.md`](./docs/bench/reference-parity-matrix.md), [host smoke test](https://github.com/webpresso/agent-kit/blob/main/src/__integration__/reference-parity-host-smoke.integration.test.ts), [tool surface test](https://github.com/webpresso/agent-kit/blob/main/src/__integration__/reference-parity-tool-surface.integration.test.ts) |
| Tie claims to evidence                 | Public benchmark and release claims require checked-in result cards, docs gates, audits, or tests before publication.                                                                | [`docs/bench/result-card-contract.md`](./docs/bench/result-card-contract.md), [public readiness script](https://github.com/webpresso/agent-kit/blob/main/scripts/public-readiness.ts)                                                                                                                                                                                                                                                                |

## Develop/deploy workflow shape

Agent Kit keeps agent work inside a verifiable loop:

1. **Repair the surface:** `wp setup repair --project-init` and
   `wp hooks doctor` make host instructions, hooks, MCP tools, and ignored
   generated files visible.
2. **Plan the change:** blueprints record scope, dependencies, acceptance
   criteria, and verification commands before non-trivial edits.
3. **Work in a lane:** `wp worktree` creates isolated checkouts for feature,
   repair, or QA work.
4. **Run guarded commands:** agents use `wp_*` MCP tools or the `wp` CLI facade
   for tests, lint, typecheck, format, browser QA, audits, and secret-scoped
   commands.
5. **Preview/deploy with repo setup:** supported preview/deploy paths rely on
   repo-specific scripts, configured secret profiles, and explicit evidence;
   Agent Kit supplies guardrails rather than a hands-off production deployer.
6. **Publish evidence:** docs checks, audits, result cards, PR notes, and
   release gates make public claims reviewable.

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

Use Agent Kit when you want a TypeScript-first repo harness for setup, host
surfaces, quality gates, MCP tools, session memory, worktrees, blueprints,
preview/deploy guardrails, and audit policy in one repeatable package.

Skip it when you only want a prompt library, cannot run Node-based developer
tooling, or do not want repo-local agent files. See
[`docs/is-agent-kit-for-me.md`](https://github.com/webpresso/agent-kit/blob/main/docs/is-agent-kit-for-me.md).

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
[`CONTRIBUTING.md`](https://github.com/webpresso/agent-kit/blob/main/CONTRIBUTING.md) and
[`docs/markdown-fact-check.md`](https://github.com/webpresso/agent-kit/blob/main/docs/markdown-fact-check.md).

## License

This repository is public and source-available under the
[Elastic License 2.0](./LICENSE). Review the license before offering hosted or
managed access to the software.

## Project docs

- [`docs/README.md`](./docs/README.md) — documentation index
- [`docs/getting-started.md`](./docs/getting-started.md) — install and first run
- [`docs/secrets/providers.md`](./docs/secrets/providers.md) — provider/profile/sink contract
- [`docs/errors/wp-secret-orchestration.md`](./docs/errors/wp-secret-orchestration.md) — secret/orchestration error reference
- [`VISION.md`](https://github.com/webpresso/agent-kit/blob/main/VISION.md) — product direction
- [`CONTRIBUTING.md`](https://github.com/webpresso/agent-kit/blob/main/CONTRIBUTING.md) — contributor workflow
- [`SECURITY.md`](https://github.com/webpresso/agent-kit/blob/main/SECURITY.md) — vulnerability reporting
- [`CHANGELOG.md`](https://github.com/webpresso/agent-kit/blob/main/CHANGELOG.md) — Changesets-managed release history
