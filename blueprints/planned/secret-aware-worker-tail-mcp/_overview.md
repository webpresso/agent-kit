---
type: blueprint
title: Secret-aware Worker Tail MCP tool
status: planned
owner: agent-kit
complexity: M
created: '2026-05-23'
last_updated: '2026-05-23'
progress: '0/12 tasks done (0%) - planned'
depends_on: []
tags:
  - mcp
  - wrangler
  - cloudflare
  - secrets
  - doppler
  - infisical
  - hooks
  - blueprint-authoring
  - oss-reuse
---

# Secret-aware Worker Tail MCP tool

## Product wedge anchor

Agents debugging Webpresso Cloudflare Workers need one safe entrypoint for live
tail logs. Today they can accidentally run raw `wrangler tail` or hand-roll
`doppler run ... wrangler tail ...`, which leaks long output into context and
duplicates secret-provider knowledge. `wp_worker_tail` gives them a typed MCP
tool that uses the repo secret gate, clips output, and points every common raw
command shape back to the same path.

## Summary

Add a focused `wp_worker_tail` MCP tool for live Cloudflare Worker debugging. It
should replace raw `wrangler tail` and `doppler run ... wrangler tail ...`
commands with a typed, bounded, secret-gate-aware MCP workflow.

Evidence gathered during planning:

- Cloudflare's Wrangler docs define `wrangler tail [WORKER]` with flags such as
  `--format`, `--status`, `--env`, `--cwd`, `--config`, `--search`, `--method`,
  `--header`, `--ip`, `--sampling-rate`, and `--version-id`.
- Cloudflare publishes official MCP servers, including observability-oriented
  tools, but public GitHub usage still commonly reaches for `wrangler tail` when
  debugging deployed Workers from a local repo.
- Doppler and Infisical both model secret injection as running a child command
  with injected environment variables, which matches Webpresso's public runtime
  secret-runner and `with-secrets` surfaces.
- `../monorepo` uses `wrangler@4.87.0`, multiple `wrangler.jsonc` Worker
  configs, preview env names such as `webpresso-chef-alpha`, and explicit
  guidance to avoid `.dev.vars` workarounds.
- ADR/planning tooling research shows the same authoring pattern repeatedly:
  MADR ships complete, minimal, and bare templates; adr-tools-style CLIs create
  standardized numbered records; Structured MADR validates YAML frontmatter plus
  body structure in GitHub Actions; Log4brains keeps ADRs next to code and
  supports customizable templates and monorepo/package-specific records; and
  OpenSpec custom schemas model planning as typed artifact pipelines such as
  `proposal -> specs -> design -> adr -> tasks`.
- Deeper OSS reuse evaluation shows no credible reason to replace Webpresso
  blueprints with an external ADR/planning platform. The useful replacement is
  narrower: use the mature Markdown/frontmatter/schema libraries already in
  agent-kit for parsing, validation, and repair instead of adding more
  hand-rolled Markdown surgery.
- Local agent-kit verification confirmed the command surface is `wp audit
  <kind>` and MCP `wp_audit`, not `agent audit`. Repo scripts may internally
  call the TypeScript/Bun source entrypoint, but agent-facing commands should
  use MCP tools, `wp ...`, or `vp run ...`. The update-check opt-out is
  `WP_SKIP_UPDATE_CHECK=1`, not the retired `AK_` namespace.

## Open Source Reuse Evaluation

Sources checked on 2026-05-23:

- `remark` / `unified`: https://unifiedjs.com/explore/package/remark/
- `gray-matter`: https://github.com/jonschlinkert/gray-matter
- Zod 4: https://zod.dev/
- `zod-to-json-schema`: https://github.com/StefanTerdell/zod-to-json-schema
- MADR: https://github.com/adr/madr
- `adr-tools`: https://github.com/npryce/adr-tools
- Structured MADR: https://smadr.dev/guides/local-validation/
- Log4brains: https://github.com/thomvaill/log4brains
- ADR tooling index: https://adr.github.io/adr-tooling/
- OpenSpec custom schemas:
  https://github.com/intent-driven-dev/openspec-schemas
- Plop: https://github.com/plopjs/plop
- Hygen: https://github.com/jondot/hygen

| Blueprint concern | Candidate OSS | Decision | Why |
| --- | --- | --- | --- |
| YAML frontmatter parse/serialize | `gray-matter`, `yaml`, `js-yaml` | **Adopt existing repo deps** | Agent-kit already uses `gray-matter` broadly. Its upstream explicitly handles parsing and stringifying frontmatter and avoids regex-only frontmatter parsing, which is exactly what scaffold/repair need. |
| Markdown section parsing and repair | `remark` / `unified` / mdast | **Use for structural edits and repair** | `remark` is built for parsing and serializing Markdown. Use it for section-aware repair, heading insertion, and deterministic rewrites. Keep simple regex only for narrow read-only checks where already tested. |
| Public MCP input schemas and fix-hint shape | Zod 4 | **Keep as source of truth** | MCP tool descriptors are already Zod-first. New authoring tools should define Zod schemas once and derive types/errors from them. |
| JSON Schema emission for MCP descriptors | Zod 4 native JSON Schema, existing `zod-to-json-schema` fallback | **Prefer Zod 4; do not deepen `zod-to-json-schema` reliance** | Zod now has native JSON Schema support. The current auto-discovery helper already prefers Zod 4 and falls back to `zod-to-json-schema`; new code should use that path rather than adding direct calls. |
| Blueprint validation core | Existing `wp_blueprint_validate`, docs-linter blueprint rules, Zod schemas | **Consolidate in-tree** | The current MCP validator, docs linter, and parser contain overlapping rule knowledge. Reuse one structured validation core with rule IDs and `fixHints` instead of adding Ajv/check-jsonschema as a second authority. |
| ADR template content | MADR, Nygard/`adr-tools`, Structured MADR | **Adapt templates, do not depend** | These tools are strong for decision logs, but their numbering, status vocabulary, file locations, and ADR-only semantics do not match blueprint lifecycle, task acceptance, or MCP mutation requirements. |
| Planning artifact pipelines | OpenSpec custom schemas | **Borrow schema/template model only** | OpenSpec's artifact pipeline is a useful precedent for typed workflows and template variants, but adopting it would duplicate blueprint lifecycle and move work into a separate planning substrate. |
| Discoverability/indexing | Log4brains, ADR tooling index, adr-log | **Implement native index; borrow UX ideas** | Log4brains proves searchable docs-as-code and monorepo/package-specific ADRs are useful, but its static-site and ADR metadata model are not the MCP summary-first index Webpresso needs. |
| Scaffold generator engine | Plop, Hygen | **Reject for v1** | Both are credible generators, but they add a separate template DSL/CLI workflow. A typed MCP scaffolder can use repo-owned Zod schemas, lifecycle placement, and validator feedback directly with less surface area. |

Replacement decisions for this blueprint:

- Replace any planned regex-only blueprint repair path with
  `gray-matter` plus `remark`/`unified` section-aware transforms.
- Replace string-template frontmatter generation with `gray-matter.stringify`
  or a repo helper that uses the existing YAML stack and preserves stable field
  order.
- Do not replace blueprints with MADR, Structured MADR, OpenSpec, Log4brains,
  Plop, or Hygen.
- Do not add new blueprint-authoring dependencies unless a follow-up spike
  proves an existing in-repo dependency cannot handle the required operation.

## Public Interface

Add MCP tool `wp_worker_tail`.

Inputs:

- `cwd?: string`
- `worker: string`
- `environment?: string`
- `config?: string`
- `status?: "ok" | "error" | "canceled"` default `"error"`
- `format?: "json" | "pretty"` default `"json"`
- `search?: string`
- `method?: string`
- `header?: string[]`
- `ip?: string[]`
- `samplingRate?: number`
- `versionId?: string`
- `timeoutMs?: number` default `30000`
- `maxEvents?: number` default `20`
- `envProfile?: string` default `"secrets-only"`

Output:

- `{ passed, summary, exitCode, details, events, rawOutput, failures }`
- `events` parses JSON tail lines when `format: "json"` and preserves compact
  fallback lines for non-JSON warnings or status messages.

Add blueprint authoring assist MCP functionality to reduce invalid blueprint
drafts:

- `wp_blueprint_scaffold`: create a valid `_overview.md` skeleton from typed
  fields such as title, owner, lifecycle state, complexity, wedge, summary,
  tags, tasks, acceptance criteria, and optional ADR-style decision metadata.
  Use Zod for inputs and the repo's existing frontmatter serializer instead of
  string-splicing YAML.
- `wp_blueprint_repair`: take an existing blueprint path or markdown string plus
  validator gaps and return a valid patch plan or rewritten markdown that fills
  required structure without inventing implementation scope. Structural repairs
  should use `gray-matter` plus `remark`/`unified` rather than regex-only body
  rewrites.
- `wp_blueprint_validate` enhancement: keep current pass/fail behavior, but add
  machine-actionable `fixHints` grouped by frontmatter, required sections, task
  shape, and lifecycle placement. Fix hints should include stable rule IDs so
  MCP, docs-lint, and future CI annotations share one validation vocabulary.
- `wp_blueprint_index`: maintain or return an index of blueprint titles, slugs,
  statuses, owners, tags, and decision relationships so agents can find related
  planning records before creating duplicates.

## Architecture Overview

The implementation should be tail-only in v1, not a generic arbitrary
`wp_wrangler` command runner.

0. **Command facade and namespace hygiene**
   - Agent-facing docs, hook guidance, validation output, and pretool rewrites
     should emit MCP tools, `wp ...`, or repo scripts through `vp run ...`.
   - Treat `bun ./src/cli/cli.ts ...` and `bun src/cli/cli.ts ...` as internal
     package-script/source-test implementation details, not user guidance.
   - Use `WP_SKIP_UPDATE_CHECK=1` when suppressing CLI update checks. Do not
     introduce or suggest `AK_SKIP_UPDATE_CHECK`.
   - Audit command guidance must use `wp audit <kind>` or MCP `wp_audit`. There
     is no `agent audit` CLI namespace.
   - Known correct forms include:

     ```bash
     WP_SKIP_UPDATE_CHECK=1 wp audit docs-frontmatter
     WP_SKIP_UPDATE_CHECK=1 wp audit blueprint-lifecycle --legacy-omx
     vp run docs:check
     vp run blueprints:check
     ```

1. **Secret-gate command runner**
   - Resolve the project root from `cwd`.
   - Execute through the public Webpresso secret gate rather than a
     consumer-local app script. The runner may invoke the public
     `@webpresso/runtime` `with-secrets` surface directly or an equivalent
     package-level helper that preserves the same provider-agnostic contract.

   - Let the public secret-gate surface own provider selection through the
     existing `@webpresso/webpresso/runtime/env` mechanism,
     `WP_SECRET_MANAGER`, `WEBPRESSO_SECRET_MANAGER`, and the runtime secrets
     config contract:

     ```text
     <git-common-dir>/webpresso/secrets.json
     <cwd>/.webpresso/secrets.config.json
     ```

   - Do not require consumer repos to vendor or mirror
     `apps/scripts/src/lib/with-secrets.ts`.
   - Do not construct `doppler run` or `infisical run` directly in agent-kit.
   - If no secret gate exists, fail clearly unless the command is explicitly
     classified as secret-free.

2. **Wrangler argument builder**
   - Use the existing MCP command runner behavior so package-local
     `node_modules/.bin` binaries resolve first.
   - Prefer typed Wrangler flags over `bash -lc`.
   - Add `--env` only when `environment` is provided.
   - Add `--cwd` or `--config` only when the caller supplies them.
   - The motivating call:

     ```ts
     wp_worker_tail({
       worker: 'webpresso-chef-alpha',
       environment: 'preview',
       status: 'error',
     })
     ```

     maps to:

     ```bash
     wrangler tail webpresso-chef-alpha --env preview --format json --status error
     ```

3. **Pretool routing**
   - Route `wrangler tail ...`, path-based `node_modules/.bin/wrangler tail ...`,
     `pnpm exec wrangler tail ...`, and
     `doppler run ... wrangler tail ...` to `wp_worker_tail`.
   - Route or correct stale agent-kit validation command shapes such as raw
     TypeScript/Bun CLI entrypoints, `AK_SKIP_UPDATE_CHECK`, and `agent audit`
     toward `wp ...`, `vp run ...`, or MCP `wp_audit` guidance.
   - Keep generic `doppler run` blocked with repo secret-gate or MCP guidance.
   - Do not route `wrangler types` to this tool; `../monorepo` treats generated
     Wrangler type commands as maintenance/preflight and secret-free.

4. **Blueprint authoring assist**
   - Reuse the existing blueprint validator as the source of truth for required
     shape: frontmatter fields, `## Product wedge anchor`, `#### Task` sections,
     and per-task `**Acceptance:**` subsections.
   - Consolidate overlapping validation logic behind one structured rule set
     used by MCP validation, docs-lint, lifecycle audits, and repair hints.
   - Generate skeletons from structured input rather than prompting agents to
     remember Markdown conventions.
   - Use `gray-matter`/existing YAML helpers for frontmatter and
     `remark`/`unified` for section-aware Markdown transformations. Regex is
     acceptable for narrow, already-tested detection rules, but not as the
     primary repair engine.
   - Offer template variants, following MADR and OpenSpec precedent:
     `minimal`, `standard`, and `adr-heavy`. All variants must pass the same
     validator, but include different optional sections.
   - Make repair suggestions deterministic: do not silently invent task intent;
     only fill known structural gaps and mark missing user intent as explicit
     placeholders.
   - Keep lifecycle writes in the blueprint tools, not ad hoc shell commands, so
     new blueprints are placed under `planned`, `draft`, or other lifecycle dirs
     consistently.
   - Keep local and CI validation aligned: the same validation rules should back
     MCP feedback, audits, and any future GitHub annotation workflow.
   - Keep an index/search surface for discoverability, similar to ADR indexes and
     docs-as-code portals, but generated from the existing blueprint metadata.
   - Keep the scaffold engine native to MCP. Do not introduce Plop, Hygen,
     Log4brains, OpenSpec, Structured MADR, or ADR CLI dependencies for v1.

## Tasks

#### Task 1.1: Add the `wp_worker_tail` MCP tool surface

**Status:** todo

Add the tool descriptor, input schema, output schema, and summary-first result
payload.

**Acceptance:**

- `wp_worker_tail` is registered as an MCP tool with the documented input and
  output shapes.
- Empty or invalid inputs fail through schema validation with concise errors.

#### Task 1.2: Add the shared secret-gate runner

**Status:** todo

Add a shared MCP runner that uses the public Webpresso secret gate and never
shells out to provider-specific `doppler` or `infisical` commands.

**Acceptance:**

- Commands run through the public Webpresso secret gate rather than direct
  provider invocations.
- Source code does not depend on a consumer-local
  `apps/scripts/src/lib/with-secrets.ts` path.
- Source code does not construct provider-specific `doppler run` or
  `infisical run` invocations.

#### Task 1.3: Add the Wrangler tail argument builder

**Status:** todo

Build typed Wrangler tail args and handle process lifecycle for `timeoutMs` and
`maxEvents`.

**Acceptance:**

- Typed inputs map to Wrangler flags without `bash -lc`.
- Tail execution stops after `timeoutMs` or `maxEvents`.

#### Task 1.4: Parse and bound tail output

**Status:** todo

Parse JSON tail lines into compact events while preserving bounded warning and
status output.

**Acceptance:**

- JSON tail lines become compact `events`.
- Non-JSON warnings are preserved only in bounded summary/raw output fields.

#### Task 1.5: Redact sensitive output

**Status:** todo

Redact token-like and secret-like values from all returned output.

**Acceptance:**

- Returned payloads do not expose token-looking or known secret-looking values.
- Redaction applies to parsed events, summaries, failures, and raw output.

#### Task 1.6: Extend pretool routing

**Status:** todo

Route raw, path-based, package-manager, and
`doppler run ... wrangler tail ...` forms to `wp_worker_tail`.

**Acceptance:**

- Raw and wrapped Wrangler tail commands are denied with `wp_worker_tail`
  guidance.
- Stale verification forms are denied or corrected with modern facade guidance:
  `WP_SKIP_UPDATE_CHECK=1`, `wp audit <kind>`, `vp run ...`, or MCP `wp_audit`.
- Non-tail Wrangler commands are not accidentally routed to `wp_worker_tail`.

#### Task 1.7: Add focused tests

**Status:** todo

Cover tool behavior, secret-gate behavior, output parsing, redaction, and
pretool routing.

**Acceptance:**

- Focused tests cover the motivating `webpresso-chef-alpha` preview tail case.
- Tests cover secret-gate use, missing gate failure, routing, and redaction.

#### Task 1.8: Update generated routing/docs surfaces if needed

**Status:** todo

Update MCP routing docs or generated routing blocks if registered tool drift
tests require it.

**Acceptance:**

- Registered tool/docs drift checks pass.
- Any changed generated surface is produced through the repo-approved workflow.

#### Task 1.9: Add blueprint scaffold MCP functionality

**Status:** todo

Add `wp_blueprint_scaffold` or equivalent functionality that creates a
validator-compliant `_overview.md` from structured fields and task definitions.

**Acceptance:**

- A minimal scaffolded blueprint passes `wp_blueprint_validate` without manual
  frontmatter, wedge, task, or acceptance fixes.
- The tool writes only inside the configured blueprint lifecycle directory.
- The implementation uses Zod input schemas and the existing
  `gray-matter`/YAML frontmatter path; it does not add Plop, Hygen, or another
  generator dependency.

#### Task 1.10: Add blueprint repair or fix-hint functionality

**Status:** todo

Extend blueprint authoring support so agents can turn validator gaps into
deterministic corrections instead of hand-editing by trial and error.

**Acceptance:**

- `wp_blueprint_validate` exposes actionable structured fix hints, or a new
  repair tool returns a patch/rewrite that addresses known structural gaps.
- The repair path does not invent product intent; unknown content remains an
  explicit placeholder for the author to fill.
- Structural Markdown fixes use `remark`/`unified` or an equivalent existing
  AST helper, not broad regex-only rewrites.
- MCP validation, docs-lint blueprint rules, and repair hints share stable rule
  IDs and one canonical validation vocabulary.

#### Task 1.11: Add blueprint index and relationship metadata support

**Status:** todo

Add `wp_blueprint_index` or an equivalent read-only MCP surface that returns
blueprint title, slug, lifecycle status, owner, tags, depends-on relationships,
and optional ADR-style decision links.

**Acceptance:**

- Agents can query existing planned/draft/completed blueprints before creating a
  new one.
- The index is derived from frontmatter and existing blueprint storage; no
  separate manually edited registry is introduced.
- The index remains native to agent-kit. Log4brains, adr-log, and static-site
  ADR portals are treated as UX precedents, not runtime dependencies.

#### Task 1.12: Add template variants for blueprint scaffolding

**Status:** todo

Support `minimal`, `standard`, and `adr-heavy` scaffold variants so authors can
choose the smallest valid artifact that fits the work.

**Acceptance:**

- Every variant passes `wp_blueprint_validate` immediately after creation.
- `adr-heavy` includes decision drivers, considered options, decision outcome,
  and consequences sections without making them mandatory for all blueprints.
- ADR-heavy wording may adapt MADR/Nygard/Structured MADR concepts, but the file
  remains a Webpresso blueprint with lifecycle status, tasks, dependencies, and
  acceptance criteria.

## Acceptance Criteria

- `wp_worker_tail` returns bounded, structured results for Worker tail sessions
  and never streams unlimited raw Wrangler output into context.
- Raw `wrangler tail` commands and wrapped `doppler run ... wrangler tail ...`
  commands are denied by pretool routing with guidance to use `wp_worker_tail`.
- Secret-provider behavior is DRY and SOLID: agent-kit calls the public
  Webpresso secret gate and does not duplicate Doppler or Infisical selection
  logic.
- Missing secret-gate configuration fails loudly with actionable guidance.
- `wrangler types` and other known secret-free maintenance commands are not
  accidentally routed to `wp_worker_tail`.
- Blueprint authoring support can create or repair a minimal planned blueprint
  that passes `wp_blueprint_validate` on the first validation run.
- Blueprint authoring support includes discoverability and template variants so
  agents can avoid duplicate blueprints and choose the right amount of ADR
  structure for the work.
- Agent-facing command examples for audits and validation use `wp`, `vp run`,
  or MCP tool names; they do not suggest raw `bun src/cli/cli.ts`,
  `AK_SKIP_UPDATE_CHECK`, or the nonexistent `agent audit` namespace.

## Verification Plan

- `wp_test` for the new MCP tool tests, secret-gate runner tests, and pretool
  routing tests.
- `wp_test` for blueprint scaffold/repair tool tests and validator fix-hint
  tests.
- `wp_test` for blueprint index/search and template variant tests.
- `wp_test` coverage for malformed blueprint repair round-trips through
  `gray-matter` and `remark`/`unified` without dropping existing sections.
- Dependency audit: implementation should add no blueprint-authoring dependency
  unless a documented spike proves the existing stack is insufficient.
- `wp_typecheck`.
- `wp_lint` for touched source and test files.
- `wp_audit` or blueprint validation for this planned blueprint.
- Command-hygiene check: scan planned blueprint and catalog guidance for stale
  agent-facing command forms, allowing raw Bun CLI only inside package scripts,
  source tests, or clearly labeled historical evidence.

## Assumptions

- First implementation is tail-only; a generic `wp_wrangler` can be considered
  later if more Wrangler operations need MCP wrappers.
- Doppler is the current Webpresso provider, but provider-specific logic belongs
  behind the existing secret gate so Infisical remains a compatible future path.
- Cloudflare's official MCP ecosystem is complementary; this tool exists for
  local repo execution where the agent has workspace context, local Wrangler, and
  the repo's secret-provider configuration.
- Blueprint authoring assist should stay docs-as-code: Markdown remains the
  durable artifact, while structured MCP inputs, metadata, and validation make it
  easier to create correctly.
- Existing dependencies are preferred for blueprint authoring: `gray-matter` for
  frontmatter, Zod for schemas, Zod 4 native JSON Schema through the existing MCP
  helper, and `remark`/`unified` for body transforms.
- `zod-to-json-schema` remains an existing compatibility fallback only; new
  blueprint tools should not call it directly.
