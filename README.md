# @webpresso/agent-kit

> TypeScript infrastructure for AI-agent-driven development. One `wp` runtime
> gives agents planning, tests, mutation, e2e, CI, docs, and debt tracking —
> all summary-first so they keep context, and enforced as contracts so docs,
> intent, and code can't drift. MIT. Experimental v0.x.

## Install

Requires Node.js 24 or newer.

Install from the public npm registry:

```bash
npm install -g @webpresso/agent-kit
wp setup
```

That's the product.

No private registry setup is required.

If you do not want a global install, run it one-shot instead:

```bash
npm exec --yes --package @webpresso/agent-kit@latest -- wp setup
```

`wp setup` is safe to run again. It refreshes the webpresso-owned pieces,
creates the default `base-kit` quality scaffold when files are absent, and
preserves consumer-owned files.

The guarantee is **zero hand-wiring**, not zero local dependencies. Fresh repos
get starter `tsconfig`, Vitest, Oxlint, Stryker, Playwright, unit-test, and
file-based e2e smoke assets. Repos still keep authoring-time dependencies that
their configs and tests import directly.

Default workstation presets are separate from repo bootstrap. `omx`, `omc`,
`gstack`, `vision`, `rtk`, and `context-mode` are requested by default and
degrade with explicit skipped/warning output when the matching host or auth is
unavailable. The repo bootstrap is `base-kit`.

### Execution-owned vs authoring-owned dependencies

`wp` now owns **execution** for the generic tool lanes it manages:

- test / mutation
- e2e
- lint
- format
- typecheck

That does **not** mean every local devDependency should disappear.

- Keep local dependencies that your repo **imports directly** from tests,
  config files, or tsconfig types — for example `vitest`,
  `@playwright/test`, `@testing-library/jest-dom`, or `typescript`.
- Review execution-only binaries for removal **only if** they were installed
  just to invoke them locally and nothing imports them directly — for example
  `oxlint`, `oxfmt`, or `markdownlint-cli2`.

`wp setup` prints this migration guidance after scaffolding so consumers do not
accidentally strip authoring-time dependencies just because `wp` can execute
the tool.

Public install claims are checked against the packed artifact with:

```bash
vp run public:consumer-smoke -- --setup-only
```

Use the full smoke without `--setup-only` when you want to install the generated
starter dependencies and run the generated quality commands.

## What it does

`wp` is the toolkit agents use to do real work in a repo. Every piece is built
on two properties that make it *agent-grade* rather than yet-another-bundle:
its output is **summary-first** (agents keep context) and it is **enforced**
(pre-commit + CI gates, not just available).

### The toolkit

- **Planning** — blueprints: markdown plans with a lifecycle
  (`wp audit blueprint-lifecycle`) and a dependency-aware task graph.
  `wp_blueprint_depgraph` returns its dependency graph (nodes + edges), and
  optional runtime adapters (OMX `/pll`) use those dependencies to run
  independent tasks in parallel.
  Authoring now has a structured control plane: `wp_blueprint_put` writes the
  blueprint from typed input and `wp_blueprint_transition` advances lifecycle
  state with revision-aware optimistic concurrency. A future MCP Apps editor is
  explicitly a follow-on enhancement layered on top of those tools, not a
  separate required write surface. See [`docs/lifecycle.md`](docs/lifecycle.md).
- **Tests, types, lint** — `wp_test`, `wp_typecheck`, `wp_lint` over your
  vitest/oxlint setup.
- **Mutation testing** — `wp audit mutation` (Stryker) catches tests that pass
  without actually asserting.
- **End-to-end** — `wp_e2e` runs suite-aware Playwright flows.
- **CI, locally** — `wp_ci_act` runs your GitHub Actions through `act` behind
  the repo secret contract.
- **Docs** — `wp docs lint` and `wp audit docs-frontmatter` keep docs
  structured and current.
- **Tech-debt** — `wp tech-debt` tracks debt through a status lifecycle
  (accepted → needs-remediation → monitoring → resolved), auto-filed from
  failing audits.

### What makes it agent-grade

- **Summary-first output** — the `wp_*` MCP wrappers return summary-first JSON
  with clipped raw output and budget metadata (`bytes`, `tokensSaved`), and
  `wp setup` wires the `rtk` and `context-mode` output-filtering lanes by
  default (skipped in CI and via `WP_SKIP_RTK=1` / `WP_SKIP_CONTEXT_MODE=1`;
  never bundled in the package). Agents reason over the failure set, not the
  thousand-line log. See [`docs/qa-output.md`](docs/qa-output.md).
- **Enforced as contracts** — `wp audit vision` keeps `VISION.md` current,
  `wp audit architecture-drift` keeps architecture docs aligned with the
  implementation they describe, `wp audit bundle-budget` caps client output,
  and the Lore commit protocol (`wp audit commit-message --require-lore`)
  records the *why* behind each change. Every audit runs as a `wp_audit` MCP
  tool **and** as a pre-commit and CI gate — so intent, docs, and code can't
  silently diverge.
- **One operating contract, managed for you** — `wp` generates and keeps your
  `AGENTS.md`, `CLAUDE.md`, and each agent's command, skill, and hook surfaces
  in sync, emitted through rulesync across every supported runtime (see
  [`catalog/agent/rules/supported-agent-clis.md`](catalog/agent/rules/supported-agent-clis.md)).
  `AGENTS.md` is the standard; `wp` keeps everything around it coherent.

## Why it exists

Sharing instructions across agents is largely solved: `AGENTS.md` is the
standard, and emitters like rulesync fan one source out to every runtime. `wp`
manages that layer for you — but the hard part of agent-driven development isn't
a missing instruction file. It is keeping agents **effective** (they burn the
context window on verbose tool output) and keeping the repo **correct** (docs,
plans, and code drift apart as agents move fast).

`wp` is the TypeScript layer for both: summary-first tooling so the window goes
to code, and enforced contracts so the work stays coherent.

```bash
wp setup
```

## Add-ons

Most repos should start with the default setup. Extra integrations and their
default/opt-in behavior are documented in [`docs/add-ons.md`](docs/add-ons.md).

## Package references

If you need config subpaths or dependency references, use the appendix:
[`docs/markdown-fact-check.md`](docs/markdown-fact-check.md).

## Docs

- [Getting started](docs/getting-started.md)
- [Is webpresso for me?](docs/is-agent-kit-for-me.md)
- [Blueprint lifecycle](docs/lifecycle.md)
- [Add-ons](docs/add-ons.md)
- [Blueprint format](docs/blueprint-format.md)
- [Skills catalog](docs/skills-catalog.md)

## Status

Experimental v0.x. Public APIs may change before v1.

## License

MIT — see [LICENSE](./LICENSE). Vendored catalog skills and runtime integration
licenses are documented in [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
