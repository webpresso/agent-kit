---
type: guide
last_updated: '2026-06-08'
---

# Skills catalog

Agentkit ships a curated set of slash-commands, skills, workflows, rules,
guides, and doc templates at `catalog/`. `wp setup` materializes the selected
subset into the repo's canonical/generated agent surfaces. This doc enumerates
what's in the catalog and explains the tiers.

## Tiers

### Tier 1 — Shared favorites (default cross-host contract)

Core to the webpresso operating model and guaranteed by default across the
host-visible Codex and Claude skill surfaces. Every `wp setup` keeps this set
available unless you explicitly opt out of the relevant host/runtime.

**Commands** (`.agent/commands/`):

| Slash | What it does |
|---|---|
| `/verify` | Post-implementation quality gate — 6 phases, evidence-before-claims, test-quality audit, legacy/dead-code sweep |
| `/tph` | Testing-philosophy helper — flags bullshit tests, over-mocking, weak assertions, wrong-named integration tests |
| `/plan-refine` | Hardens a blueprint before `/pll` — tech fact-check, path verification, architecture review, cross-plan alignment |
| `/pll` | Parallel lane launch — runs independent blueprint lanes in git worktrees, one commit per lane after `/verify` passes |
| `/audit` | Code-quality audits (code, test, dup, ux) writing to `docs/research/quality-audits/` |
| `/audit-duplication` | Dedicated jscpd-backed duplication audit |
| `/fix` | Minimal-correct-fix protocol with iron-law invariants |
| `/fix-all` | Parallel DAG error-fix across the repo |
| `/brainstorm` | Pre-plan ideation workflow |
| `/decide` | ADR workflow (`init`, `propose`, `verify`) |

**Paired skills** (`.agent/skills/<name>/SKILL.md`):

- `fix/` — backs `/fix`
- `verify/` — backs `/verify`
- `testing-philosophy/` — backs `/tph`; defines the "no bullshit tests" rules
- `plan-refine/` — backs `/plan-refine`; 6-step refinement pipeline
- `pll/` — backs `/pll`; blueprint-aware parallel execution adapter
- `best-practice-research/` — shared best-practice research workflow for
  current official/upstream guidance before planning or implementation

### Tier 2 — Shared add-ons (opt-in)

Framework-agnostic, cross-stack skills that stay in the catalog but are **not**
projected into host-visible surfaces by default. Add them with `wp setup --with`
or `wp skill install`.

| Skill | Scope |
|---|---|
| `systematic-debugging/` | Root-cause-first debugging methodology. Iron law: no fixes without root cause investigation. |
| `test-driven-development/` | TDD methodology for implementing features + bugfixes. Requires failing tests before production code. |
| `deep-research/` | Multi-phase web research workflow. Balanced pro/con sentiment, 2026-best-practices alignment, timestamped output to `docs/research/`. |

Five skills from webpresso's `.agent/skills/` that are `[OMX]`-marked
and are therefore **not** in the catalog — install OMX separately if
you want them: `ai-slop-cleaner`, `autoresearch`, `code-review`,
`deep-interview`, `security-review`.

### Tier 3 — Rendered/shared source add-on

`monorepo-navigation/` is special:

| Skill | Applies to |
|---|---|
| `monorepo-navigation/` | **Template-based.** Rendered from `pnpm-workspace.yaml` + `package.json` during `wp setup` into the consumer-owned source skill under `agent-skills/monorepo-navigation/`. Placeholders (`{{PACKAGES_TABLE}}`, `{{KEY_LOCATIONS}}`, …) fill what the tool can infer; `{{TODO: ...}}` markers flag fields that need human judgment. The rendered source exists by default, but host-visible projection is opt-in. It also ships `examples/webpresso.md` as a reference. |

### Tier 4 — Tech/library skills (opt-in via `--with`)

Apply only if your stack includes the corresponding library/framework.
Install with:

```bash
wp setup --with tanstack-query,better-auth-best-practices,react-doctor
# Or after initial install:
wp skill install tanstack-query
```

| Skill | Applies to |
|---|---|
| `tanstack-query/` | React Query. Multi-file: `.claude-plugin/`, `references/`, `rules/`, `templates/`. |
| `better-auth-best-practices/` | Better-auth library setup + patterns. |
| `react-doctor/` | React diagnostic runbook. |
| `frontend-design/` | Design-quality methodology for frontend work. |
| `web-design-guidelines/` | General web-UI guidelines. |
| `vercel-react-best-practices/` | Vercel / React deployment hygiene, server-cache patterns, edge-runtime considerations. |

Two skills from webpresso's `.agent/skills/` that are `[OMX]`-marked
and therefore **not** in the catalog: `visual-verdict`, `web-clone`.

## Workflows (always installed)

At `.agent/workflows/*.md`. Each is a short procedural guide the agent
invokes when a matching trigger fires.

| Workflow | Trigger |
|---|---|
| `execute-plan.md` | Driving a blueprint to done |
| `write-plan.md` | Drafting a new blueprint |
| `debug.md` | Investigating a failure |
| `docs.md` | Updating affected documentation |
| `test.md` | Writing or fixing tests |
| `conf.md` | Confidence / verification workflow |
| `fix-all-md-warnings.md` | Resolving markdown lint across the repo |

## Rules (always installed)

At `.agent/rules/*.md`. Short enforceable rules that cite and diff well.

| Rule | Gist |
|---|---|
| `blueprint-scoping.md` | Infra blueprints must anchor to a product wedge or stay in `draft/`. |
| `cmd-execution.md` | How to run repo commands (use the task runner, don't shell raw). |
| `generated-code-governance.md` | Don't hand-edit generated files; re-generate from the source of truth. |
| `repo-restrictions.md` | What agents may / may not do in this repo. |
| `agent-guide.md` | Top-level behavior rules (deterministic boundaries, lore-commit protocol, etc). |

## Guides (always installed)

At `.agent/guides/*.md`. Longer-form operational policy.

- `agent-guardrails.md` — the agent's behavioral envelope.
- `parallel-execution.md` — how to structure work for `/pll`.
- `plan-audit-checklist.md` — pre-exec check for blueprints.
- `skills.md` — how skills work + how to write new ones.

## Doc templates (always installed)

At `docs/templates/*`. Used by consumers who scaffold new docs by hand.
A dedicated `wp docs new` scaffold command is not shipped today.

- `blueprint.md` + `blueprint.yaml` — the canonical plan template.
- `adr.md` — Architecture Decision Record.
- `guide.md` — how-to guide shape.
- `research.md` — research doc frontmatter + structure.
- `postmortem.md` — incident postmortem.
- `system.md` — system-level reference doc.
- `runbook.md` — ops runbook.
- `tech-debt.md` — tech-debt tracking item.

## `AGENTS.md` template

`catalog/AGENTS.md.tpl` is the base Operating Contract — rendered into
your repo's `AGENTS.md` during `wp setup` (only if none exists).
Placeholders:

- `{{REPOSITORY_MAP}}` — bulleted list of workspace packages inferred
  from `pnpm-workspace.yaml` / `package.json workspaces`.
- `{{TECH_STACK}}` — short description from `package.json` + detected
  frameworks (React, Hono, Drizzle, etc.).
- `{{ESCALATION_MAP}}` — left as `{{TODO: ...}}` for the human to fill.
- `{{DURABLE_PLANNING_ROOT}}` — defaults to `.agent/planning/`; override
  via `.webpressorc.json`.
- `{{BLUEPRINTS_DIR}}` — defaults to `blueprints/`; override via
  `.webpressorc.json#blueprintsDir` (for example `webpresso/blueprints` in
  monorepo layouts).

After rendering, the `AGENTS.md` is shared ownership: reruns of `wp setup`
refresh webpresso-managed blocks in place, while fully unmanaged/divergent
files are left alone unless `--overwrite` is used.

The generated default root `AGENTS.md` is intentionally kept under an 8 KB
budget so it can stay in prompt without crowding out the actual repo/task
context.

## Catalog updates

The default shared-favorites contract is refreshed by rerunning `wp setup` and
`wp sync`. Consumer-owned canonical sources such as `agent-rules/` and
`agent-skills/` keep local edits unless you explicitly replace them.

Shared add-ons, the rendered `monorepo-navigation` host projection, and
tech/library skills are installed one at a time with `wp skill install <name>`
or selected during setup with `wp setup --with <name>`. Agent Kit does not ship
a public `wp skill refresh` placeholder; registry refresh can be added later
when there is a concrete upstream contract.

## Counts

| Category | Count |
|---|---|
| Commands | 10 |
| Skills (shared favorites) | 6 |
| Skills (shared + rendered opt-ins) | 4 |
| Skills (tech/library opt-in) | 6 |
| Workflows | 7 |
| Rules | 5 |
| Guides | 4 |
| Doc templates | 8 |
| `AGENTS.md.tpl` | 1 |

Total catalog size: **51 primary files** (plus the support files inside
multi-file skills like `tanstack-query/` and the reference example in
`monorepo-navigation/examples/`).

## What's deliberately NOT in the catalog

- **OMX-owned skills.** Install OMX for `/plan`, `/ralph`, `/ralplan`,
  `/ultrawork`, `/team`, `/autopilot`, `/ai-slop-cleaner`, `/autoresearch`,
  `/code-review`, `/security-review`, `/deep-interview`, `/visual-verdict`,
  `/web-clone`, etc.
- **Webpresso-specific rules.** `cloudflare-runtime-invariants.md`,
  `no-pnpm-commands.md`, `command-naming-refactor.md`,
  `sdk-architecture-diagrams.md` stay in webpresso's own `.agent/rules/`.
- **Webpresso-specific guides.** `agent-practices.md`, `ai-safety.md`,
  `artifact-collection-hook.md`, `doc-quality-roadmap.md`,
  `lint-import-safety.md`, `mcp-servers.md`,
  `schema-codegen-infrastructure.md`, `systems-inventory.md`,
  `tanstack-query-contract.md`, `typed-routes-usage.md` stay in webpresso.
- **Runtime framework skills bound to a particular app.** If a skill is
  tightly coupled to a repo's specific package layout, it stays in that
  repo (or becomes a consumer-specific opt-in).

## Adding to the catalog

The catalog is versioned alongside the package. To add a skill:

1. Write the `SKILL.md` under `catalog/agent/skills/<name>/`.
2. Apply the generalization rules (no `@webpresso/*` refs, no `[OMX]`,
   no `wp blueprint`, no hardcoded repo paths).
3. If it should be opt-in, document it in the relevant opt-in tier list and update
   `wp setup`'s `--with` allowlist.
4. Ship with a Changesets entry.

Consumers pick it up on their next `pnpm update webpresso &&
vp exec wp setup` cycle.
