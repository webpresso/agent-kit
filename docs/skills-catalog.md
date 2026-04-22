# Skills catalog

Agentkit ships a curated set of slash-commands, skills, workflows, rules,
guides, and doc templates at `packages/cli/agent-kit/catalog/`. `ak init`
copies the selected subset into your repo's `.agent/` tree. This doc
enumerates what's in the catalog and explains the tiers.

## Tiers

### Tier 1 — Blueprint-native (always installed)

Core to the agent-kit operating model. Every `ak init` installs these.

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

- `verify/` — backs `/verify`
- `testing-philosophy/` — backs `/tph`; defines the "no bullshit tests" rules
- `plan-refine/` — backs `/plan-refine`; 6-step refinement pipeline
- `pll/` — backs `/pll`; blueprint-aware parallel execution adapter

### Tier 2 — Methodology skills (always installed)

Framework-agnostic, cross-stack skills that make agents more effective.

| Skill | Scope |
|---|---|
| `systematic-debugging/` | Root-cause-first debugging methodology. Iron law: no fixes without root cause investigation. |
| `test-driven-development/` | TDD methodology for implementing features + bugfixes. Requires failing tests before production code. |
| `deep-research/` | Multi-phase web research workflow. Balanced pro/con sentiment, 2026-best-practices alignment, timestamped output to `docs/research/`. |

Three skills from webpresso's `.agent/skills/` that are `[OMX]`-marked
and are therefore **not** in the catalog — install OMX separately if
you want them: `ai-slop-cleaner`, `autoresearch`, `code-review`,
`deep-interview`, `security-review`.

### Tier 3 — Tech/library skills (opt-in via `--with`)

Apply only if your stack includes the corresponding library/framework.
Install with:

```bash
ak init --with tanstack-query,better-auth-best-practices,react-doctor
# Or after initial install:
ak skills install tanstack-query
```

| Skill | Applies to |
|---|---|
| `tanstack-query/` | React Query. Multi-file: `.claude-plugin/`, `references/`, `rules/`, `templates/`. |
| `better-auth-best-practices/` | Better-auth library setup + patterns. |
| `react-doctor/` | React diagnostic runbook. |
| `frontend-design/` | Design-quality methodology for frontend work. |
| `web-design-guidelines/` | General web-UI guidelines. |
| `vercel-react-best-practices/` | Vercel / React deployment hygiene, server-cache patterns, edge-runtime considerations. |
| `monorepo-navigation/` | **Template-based.** Scaffolded from `pnpm-workspace.yaml` + `package.json` during `ak init`. Placeholders (`{{PACKAGES_TABLE}}`, `{{KEY_LOCATIONS}}`, …) fill what the tool can infer; `{{TODO: ...}}` markers flag fields that need human judgment. Also ships `examples/webpresso.md` as a reference. |

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

At `docs/templates/*`. Used by `ak docs new` (planned) and by
consumers who scaffold new docs by hand.

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
your repo's `AGENTS.md` during `ak init` (only if none exists).
Placeholders:

- `{{REPOSITORY_MAP}}` — bulleted list of workspace packages inferred
  from `pnpm-workspace.yaml` / `package.json workspaces`.
- `{{TECH_STACK}}` — short description from `package.json` + detected
  frameworks (React, Hono, Drizzle, etc.).
- `{{ESCALATION_MAP}}` — left as `{{TODO: ...}}` for the human to fill.
- `{{DURABLE_PLANNING_ROOT}}` — defaults to `.agent/planning/`; override
  via `.agent-kitrc.json`.

After rendering, the `AGENTS.md` is the consumer's to own — agent-kit
never rewrites it unless `ak init --overwrite` is used.

## Upstream refresh

Each Tier-3 skill carries `upstream` frontmatter:

```yaml
upstream:
  source: null          # 'github:org/repo' or 'url:https://...' once wired
  last_synced: "2026-04-22"
```

`ak skills refresh [--source <...>]` will re-pull skill content from an
upstream registry. Currently a no-op placeholder — the command exits
cleanly with a "no upstream configured" message. Implementation lands
once an official source is identified (Anthropic's claude-code skills
tree is a candidate).

Tier-1 and Tier-2 skills don't carry `upstream` frontmatter because
they're agent-kit's own — they get updated via `pnpm update
@webpresso/agent-kit` and `ak init --overwrite` (or manual merge).

## Counts

| Category | Count |
|---|---|
| Commands | 10 |
| Skills (Tier-1 paired) | 4 |
| Skills (Tier-2) | 3 |
| Skills (Tier-3) | 7 |
| Workflows | 7 |
| Rules | 5 |
| Guides | 4 |
| Doc templates | 8 |
| `AGENTS.md.tpl` | 1 |

Total catalog size: **49 primary files** (plus the support files inside
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

1. Write the `SKILL.md` under `packages/cli/agent-kit/catalog/agent/skills/<name>/`.
2. Apply the generalization rules (no `@webpresso/*` refs, no `[OMX]`,
   no `wp blueprint`, no hardcoded repo paths).
3. If it should be opt-in, document it in the Tier-3 list and update
   `ak init`'s `--with` allowlist.
4. Ship with a Changesets entry.

Consumers pick it up on their next `pnpm update @webpresso/agent-kit &&
npx ak init --overwrite` cycle.
