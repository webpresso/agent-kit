# @webpresso/agent-kit

[![License: Elastic--2.0](https://img.shields.io/badge/License-Elastic--2.0-0f766e.svg)](./LICENSE)
[![CI](https://github.com/webpresso/agent-kit/actions/workflows/ci.agent-kit.yml/badge.svg)](https://github.com/webpresso/agent-kit/actions/workflows/ci.agent-kit.yml)

> TypeScript infrastructure for AI-agent-driven development. One `wp` runtime
> gives agents planning, tests, mutation, e2e, CI, docs, and debt tracking —
> all summary-first so they keep context, and enforced as contracts so docs,
> intent, and code can't drift. Elastic License 2.0. Active development.

## What it is

`@webpresso/agent-kit` is a TypeScript toolkit — the `wp` CLI plus an MCP
server — that gives AI coding agents a summary-first, contract-enforced way to
plan, test, and keep a repo correct.

## Why use it

- **Agents keep context.** The `wp_*` MCP tools return summary-first JSON
  (failures + `bytes` + `tokensSaved`), not thousand-line logs.
- **Docs, plans, and code can't silently diverge.** Every audit runs as both an
  MCP tool and a pre-commit/CI gate.
- **Secrets stay out of the repo.** Four dedicated security audits catch secret
  carriers, dev-var files, provider-credential leakage, and config drift at
  pre-commit and in CI — before anything reaches a remote.
- **Zero hand-wiring onboarding.** `wp setup` scaffolds the quality config and
  keeps `AGENTS.md` / `CLAUDE.md` plus per-agent surfaces in sync.

## Quick start

Requires Node.js 24 or newer. No private registry setup is required.

Install the Webpresso CLI globally, then run setup from your repo root. `wp` bundles the package/task facade it needs, so a separate global `vp` install is not required.

```bash
npm install -g @webpresso/agent-kit && wp setup
```

For repeatable consumer-repo setup, keep `wp` global and keep only
`@webpresso/agent-config` as the local preset dependency. The repo-level Agent
Kit pin is a version-selection contract for the global binary, not a signal to
add a consumer-local `@webpresso/agent-kit` dependency. If setup is launched
from a global CLI that does not satisfy the repo pin, setup warns and tells you
to align the global `wp` install.

Then run the canonical success check:

```bash
wp hooks doctor
```

Then prove the secret and preview surfaces:

```bash
wp secrets doctor
wp preview --json
```

**Success signal:** `wp setup` completes and is idempotent. On a fresh repo it
scaffolds the `base-kit` quality assets (`tsconfig`, Vitest, Oxlint, Stryker,
Playwright, unit-test and file-based e2e smoke assets), wires `AGENTS.md` /
`CLAUDE.md` plus per-agent command/skill/hook surfaces, and prints
execution-owned vs authoring-owned dependency migration guidance. Re-running
refreshes the webpresso-owned pieces and preserves consumer-owned files.

The default cross-host Webpresso skill contract is intentionally curated:
`fix`, `verify`, `testing-philosophy`, `plan-refine`, `pll`, and
`best-practice-research` are the shared favorites projected by default, while
broader methodology/library skills stay opt-in via `wp setup --with ...`.

> **`wp setup` is required for hooks.** Setup-managed host configs own active
> hooks: Claude uses `.claude/settings.json`, Codex uses `.codex/hooks.json`,
> and plugin artifacts remain package metadata until setup writes the active
> host surface. Enabling a packaged plugin alone does **not** activate managed
> hooks; run `wp setup`. Run `wp hooks doctor` to check — it warns when the
> managed host hook surface is missing or stale.

`wp` owns **execution** for the generic tool lanes it manages (test / mutation /
e2e / lint / format / typecheck). That does **not** mean every local
devDependency disappears — keep dependencies your repo imports directly (e.g.
`vitest`, `@playwright/test`, `typescript`); review execution-only binaries
(e.g. `oxlint`, `oxfmt`) for removal only when nothing imports them. See
[`docs/getting-started.md`](docs/getting-started.md).

For the end-to-end operator path from repo checkout to preview URL, see
[`docs/guides/repo-to-preview-url.md`](docs/guides/repo-to-preview-url.md).

For a first real read-only host action in either Claude or Codex, ask the host
to run `wp_audit(kind="docs-frontmatter")`.

Verify install claims against the packed artifact:

```bash
vp run public:consumer-smoke -- --setup-only
```

## Features

| Capability | What it does | Proof |
| --- | --- | --- |
| **`wp setup` onboarding** | Idempotent scaffolder for the base-kit quality config + `AGENTS.md` / `CLAUDE.md` wiring, with a curated shared-favorites default for host-visible Webpresso skills | [`src/cli/commands/init/`](src/cli/commands/init/), verified by [`scripts/public-consumer-smoke.ts`](scripts/public-consumer-smoke.ts) |
| **Shared secret-aware command execution** | `with-secrets` injects shared runtime secrets/profile env for command execution, and shared deploy/e2e paths reuse that same runtime selector path | [`src/runtime/`](src/runtime/), [`src/deploy/`](src/deploy/), [`src/e2e/`](src/e2e/) |
| **Summary-first `wp_*` MCP tools** | `wp_test` / `wp_typecheck` / `wp_lint` / `wp_qa` / `wp_e2e` / `wp_format` / `wp_ci_act` / `wp_audit` return JSON with `bytes` / `tokensSaved` budget metadata. Session-memory tools are registered and tested as `wp_session_batch_execute` / `wp_session_capture` / `wp_session_doctor` / `wp_session_execute` / `wp_session_execute_file` / `wp_session_fetch_and_index` / `wp_session_index` / `wp_session_purge` / `wp_session_retrieve` / `wp_session_restore` / `wp_session_search` / `wp_session_snapshot` / `wp_session_stats`; see [`docs/guides/session-memory.md`](docs/guides/session-memory.md) for local storage, native optional-package fallback, bounded outputs, reset safety, enforcement hooks, platform support, and non-goals. | [`src/mcp/tools/`](src/mcp/tools/) (each with co-located `.test.ts`), [`src/mcp/server.integration.test.ts`](src/mcp/server.integration.test.ts) |
| **MCP server + CLI surface** | Registers the tool set and exposes it to agents | [`src/mcp/server.ts`](src/mcp/server.ts), [`src/mcp/cli.ts`](src/mcp/cli.ts), [`src/mcp/cli.integration.test.ts`](src/mcp/cli.integration.test.ts) |
| **Blueprint runtime** | Lifecycle states, dependency-aware task graph, structured authoring control plane (`wp_blueprint_depgraph` / `put` / `transition`) | [`src/mcp/blueprint-server.ts`](src/mcp/blueprint-server.ts), [`docs/lifecycle.md`](docs/lifecycle.md), [`docs/blueprint-format.md`](docs/blueprint-format.md) |
| **Audit contract family** | `blueprint-lifecycle`, `blueprint-readme-drift`, `reference-parity-matrix`, `docs-frontmatter`, `catalog-drift`, `vision`, `architecture-drift`, `cloudflare-deploy-contract`, `harness-surfaces`, `weakness-mining`, `harness-overlay-evidence`, `bundle-budget`, `commit-message` (Lore), `tech-debt`, `absolute-path-policy`, `open-source-licenses`, **`secrets-policy`**, **`no-dev-vars`**, **`secret-provider-quarantine`**, **`secrets-config`** — each runs through the `wp audit` CLI surface; the `wp_audit` MCP tool exposes the common agent-safe subset and guardrails runs the repo-shaped gate | [`src/audit/`](src/audit/), [`src/mcp/tools/audit.ts`](src/mcp/tools/audit.ts), [`.github/workflows/ci.agent-kit.yml`](.github/workflows/ci.agent-kit.yml) |
| **Symlinker** | Syncs canonical `.agent/` to supported agent surfaces (Claude/Codex plugins, Cursor rules, OpenCode skills) via rulesync | [`src/symlinker/index.ts`](src/symlinker/index.ts), [`src/symlinker/symlinker.integration.test.ts`](src/symlinker/symlinker.integration.test.ts), [`docs/symlinker.md`](docs/symlinker.md) |
| **Mutation testing** | `wp audit mutation` (Stryker) catches tests that pass without asserting | [`src/config/stryker/`](src/config/stryker/), `./stryker` + `./mutation` exports |
| **Tech-debt lifecycle** | `accepted → needs-remediation → monitoring → resolved`, auto-filed from failing audits | [`src/blueprint/tech-debt/`](src/blueprint/tech-debt/), [`src/cli/commands/tech-debt/`](src/cli/commands/tech-debt/) |
| **Shared config subpaths** | `tsconfig/*`, `vitest/*`, `oxlint/*`, `workers-test`, `test-preset`, `e2e-preset`, `docs-lint`, `launch` | [`package.json` exports](package.json), [`src/config/`](src/config/) |
| **Host plugin artifacts** | Ships Claude and Codex plugin metadata; `wp setup` owns active hook installation, reports Cursor/OpenCode degraded host surfaces, and `vp run lint:pkg` validates the public package surface. | `.claude-plugin/`, `.codex-plugin/` (in `package.json#files`), `.codex/hooks.json`, `.claude/settings.json` |

## Security audits

Four governance audits ship as first-class `wp audit` subcommands and run at
pre-commit and in CI. Each gates on `.webpresso/secrets.config.json` presence
— repos that haven't opted in get `ok: true, checked: 0` (no blast radius).

| Command | What it catches |
| --- | --- |
| `wp audit secrets-policy` | Forbidden secret carriers (`.env`, `.dev.vars`, credential files) in the working tree **and** git-tracked history |
| `wp audit no-dev-vars` | `.dev.vars` or `.env` files anywhere in the repo tree |
| `wp audit secret-provider-quarantine` | Direct secret-provider CLI invocations and provider-specific flags in source — requires the `with-secrets -- <cmd>` abstraction instead |
| `wp audit secrets-config` | Validates `.webpresso/secrets.config.json` exists, parses as valid JSON, and contains no embedded secret values |

**Wire them in `.husky/pre-commit`:**

```sh
wp audit secrets-policy
wp audit no-dev-vars
wp audit secret-provider-quarantine
wp audit secrets-config
```

See [`docs/security-audits.md`](docs/security-audits.md) for full reference,
gate behaviour, and CI wiring.

## Architecture

```
                 ┌──────────────────────────────────────────┐
   AI agent  ───▶ │  MCP server  (summary-first wp_* tools)   │
   (Claude /      │  test · typecheck · lint · qa · e2e ·     │
    Codex)        │  format · ci-act · audit · blueprint_*    │
                 └───────────────┬──────────────────────────┘
   human     ───▶  wp CLI  ──────┤  (same logic, shell surface)
                                 ▼
        ┌────────────┬───────────────┬───────────────┬─────────────┐
        │ Blueprints │ Audit family  │ Symlinker      │ base-kit     │
        │ lifecycle  │ MCP + CI gate │ .agent/ → IDEs │ scaffold     │
        └────────────┴───────────────┴───────────────┴─────────────┘
```

Two properties make it *agent-grade*: output is **summary-first** (agents keep
context) and tooling is **enforced** (pre-commit + CI gates, not just
available). See [`docs/qa-output.md`](docs/qa-output.md) and
[`VISION.md`](./VISION.md).

## Verify

**Fast contributor check** — narrowest scope that proves a change:

```bash
vp run typecheck   # wp typecheck — no TS errors
vp run lint        # wp lint (oxlint) — no violations
vp run test        # unit then integration vitest suites — all green
```

When you need a single lane, use `wp test --suite unit` or
`wp test --suite integration`.

**Full maintainer check** (bookend — run once at start, once at end):

```bash
vp run qa          # build + typecheck + lint + format + test + lint:pkg + audits:check
```

`vp run qa` exits 0 when every stage passes. The package-surface gate runs
separately as `vp run lint:pkg` (publint + attw `--pack`, plus `claude plugin
validate` when `claude` is present).

**Release gate for hook-bin, session-continuity, or public docs changes** — run
these as prerequisites before making shipped behavior or reference parity claims:

```bash
./bin/wp hooks doctor --skip-mcp
./bin/wp audit blueprint-lifecycle
./bin/wp audit reference-parity-matrix --json
./bin/wp audit package-surface
npm pack --dry-run --json
vp run lint:pkg
vp run verify:secrets
./bin/wp audit secrets-policy
./bin/wp audit no-dev-vars
./bin/wp audit secret-provider-quarantine
./bin/wp audit secrets-config
vp run verify:paths
```

The `reference-parity-matrix --json` gate validates the matrix and exposes `releaseClaimGateReady`; run `./bin/wp audit reference-parity-matrix --strict` only when promoting public replacement-parity claims, because it intentionally fails while release-required rows remain open or degraded.

These checks prove hook health, lifecycle state, reference parity gating, real
pack tarball contents, package lint, the dev-var carrier check, secret-policy
audits, and path safety for the public package. Session-continuity claims must
stay scoped to typed continuity events, the tested capture/restore flow, and
Cursor/OpenCode degraded host coverage documented in the hook matrix. Public numeric benchmark claims must also cite a checked-in first-party result card under `docs/bench/result-cards/`; see [the benchmark result-card contract](./docs/bench/result-card-contract.md). The native session-memory backend is optional for users: supported platforms resolve prebuilt NAPI packages when available, while the TypeScript fallback remains usable and visible in metadata when no compatible addon is installed.

## Defaults and opt-ins

- Default cross-host favorites: `fix`, `verify`, `testing-philosophy`,
  `plan-refine`, `pll`, `best-practice-research`
- Opt-in shared add-ons: `systematic-debugging`, `test-driven-development`,
  `deep-research`
- Opt-in rendered source skill: `monorepo-navigation`
- Default blueprint root: `blueprints/`
- Configurable blueprint root: `.webpressorc.json#blueprintsDir` (for example
  `webpresso/blueprints` in monorepo layouts)

## Dev setup (agent-kit contributors)

```bash
bun install
direnv allow   # exports WP_FORCE_SOURCE=1 — routes wp/audit/test/lint to source
```

With direnv active, `wp …`, `vp run lint`, `vp run typecheck`, and the git hooks
all run from source. No direnv? Set `WP_FORCE_SOURCE=1` manually for ad-hoc
source runs.

Do not use `vp run wp`, `pnpm run wp`, or `bun run wp`. If you want an explicit
repo-local source alias, use `vp run wp:source -- <args>`.

`WP_FORCE_SOURCE=1` is scoped: it routes dev CLI gates to source but keeps the
latency-sensitive `wp-pretool-guard` / `wp-post-tool` hook bins on the compiled
binary (see `bin/_run.js`). Iterate on hook code with `bun src/hooks/…` directly.

## Contribute / Security / License

- [CONTRIBUTING.md](./CONTRIBUTING.md) — setup, verify commands, Lore Commit
  Protocol, and the Changesets release flow.
- [SECURITY.md](./SECURITY.md) — private vulnerability reporting.
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) — Contributor Covenant.
- [CHANGELOG.md](./CHANGELOG.md) — release history (Changesets-managed).
- [VISION.md](./VISION.md) — why this exists and where it's going.
- [docs/markdown-fact-check.md](./docs/markdown-fact-check.md) — appendix: fact-check of current-state documentation claims and package references.

## Benchmarks & Evidence

**Conservative evidence policy:** no numeric performance claim ships without a
first-party result card of the matching metric class checked into
`docs/bench/result-cards/`. See [the benchmark result-card contract](./docs/bench/result-card-contract.md) for the required card format.

**Current measured status:** see [`docs/bench/result-cards/`](./docs/bench/result-cards/) for
checked-in evidence (currently establishing baseline). No numeric claim is made
here until a checked-in first-party result card proves it.

Deterministic byte-budget fields (`gainBytes`, `approxTokensSaved`) are exact
UTF-8 byte accounting plus an approximate `/4` token proxy. They are not
provider token, dollar, or global context-reduction measurements. Recall,
latency, and native-speed claims require separate measured result cards before
any public numeric claim can be made.

## Status

Active development. Review [CHANGELOG.md](./CHANGELOG.md) before upgrading
across minor versions.

## License

Elastic License 2.0 — see [LICENSE](./LICENSE). Vendored catalog skills and runtime integration
licenses are documented in [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).

## Platform support

webpresso hooks are tested on macOS and Linux. **Windows is a declared non-goal** for this release:
- Hook binaries use POSIX shell scripts
- Path handling assumes `/` separators
- Windows users: run inside WSL2 or a POSIX-compatible environment

This is tracked in the [capability matrix](src/cli/commands/docs/generate-capability-matrix.ts).

## Hooks system

webpresso ships a typed hooks-orchestrator for Claude Code, Codex CLI, Cursor, and the degraded OpenCode plugin bridge; see [docs/hook-matrix.md](docs/hook-matrix.md) for host-specific support levels.
See [docs/hooks-quickstart.md](docs/hooks-quickstart.md) to get started.

Key CLIs:
- `wp hooks status` — show per-vendor hook states
- `wp hooks demo <event>` — simulate which hooks would run for an event
- `wp hooks doctor` — diagnose hook problems
- `wp hooks upgrade --workspace` — preview or apply manifest-backed hook refreshes across workspace repos
- `wp setup --with hooks` — install or update hooks
- `wp setup --dry-run` — preview changes without applying

These checks prove hook health, lifecycle state, reference parity gating, real
package contents, package lint, secret policy, and path policy before release
claims move forward. Public replacement-parity wording must cite the green proof
set before promotion: `docs/bench/reference-parity-matrix.md`,
`src/__integration__/reference-parity-host-smoke.integration.test.ts`,
`src/__integration__/reference-parity-tool-surface.integration.test.ts`, and
`docs/bench/session-memory-methodology.md`.

### Curated review skills

`wp setup --with gstack` installs Webpresso-owned, unprefixed workflow skills for outside-voice review and plan critique (`claude`, `plan-eng-review`, `plan-ceo-review`, `plan-design-review`, `review`). These are curated Markdown assets shipped with agent-kit; they do not clone or run an external gstack checkout. To retire an old `~/.claude/skills/gstack` checkout, rerun setup with `WP_GSTACK_CLEANUP_EXTERNAL=1`; the checkout is backed up instead of deleted in place.
