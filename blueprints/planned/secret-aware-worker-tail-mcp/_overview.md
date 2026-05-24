---
type: blueprint
title: Secret-aware Worker Tail and CI Act MCP tools
status: planned
owner: agent-kit
complexity: M
created: '2026-05-23'
last_updated: '2026-05-23'
progress: '0/15 tasks done (0%) - refined 2026-05-23'
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

# Secret-aware Worker Tail and CI Act MCP tools

## Product wedge anchor

Agents debugging Webpresso Cloudflare Workers need one safe entrypoint for live
tail logs. Today they can accidentally run raw `wrangler tail` or hand-roll
`doppler run ... wrangler tail ...`, which leaks long output into context and
duplicates secret-provider knowledge. `wp_worker_tail` gives them a typed MCP
tool that uses the repo secret gate, clips output, and points every common raw
command shape back to the same path.

## Summary

Add focused secret-aware MCP tools for Cloudflare Worker and CI debugging. The
first tool, `wp_worker_tail`, should replace raw `wrangler tail` and
`doppler run ... wrangler tail ...` commands with a typed, bounded,
secret-gate-aware MCP workflow. The companion tool, `wp_ci_act`, should replace
raw `bun apps/scripts/src/ci/act.ts ...` and package-manager/runtime
equivalents with a typed, bounded, secret-gate-aware CI reproduction workflow.

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
- `../monorepo/apps/scripts/src/ci/act.ts` exposes workflow presets
  `ci-e2e`, `ci-generated-live-validation`, and `ci-main`. The generated-live
  validation preset runs `.github/workflows/ci-generated-live-validation.yml`,
  job `generated-live-validation`, requires Chef, and currently tries to
  resolve secrets such as `CHEF_CI_TOKEN`, `GH_PACKAGES_TOKEN`, and
  `NEON_API_KEY_PLATFORM` through direct env/Doppler fallback code.
- `../monorepo/package.json` already provides a repo facade for the generated
  live validation act flow through `ci:act:generated-live-validation`, but
  agents can still bypass it by executing the Bun source file directly.
- `~/repos/ozby/ingest-lens` has the downstream shape this blueprint should
  enable: `package.json` exposes `act:ci`, `act:e2e`, `act:cleanup`, and
  `act:list`, all currently routing through `scripts/act-with-doppler.ts`.
  Its planned `public-ci-surface-adoption` blueprint explicitly waits for a
  public Webpresso CI/secret surface so the repo can keep only workflow/profile
  preset data instead of a local secret-wrapper engine.
- `ingest-lens/scripts/act-secret-profile.ts` is a useful extraction model:
  workflow/job selection maps to least-privilege secret profiles (`none`,
  `github-api`, `neon-control-plane`), allowed keys, required keys, and default
  provider source hints. The key behavior to keep is the profile contract, not
  the direct Doppler implementation.
- `ingest-lens/scripts/act-with-doppler.ts` also carries mature act ergonomics
  that should be extracted into public helpers: Apple Silicon architecture
  defaulting, automatic read-only mounts for absolute `file:` dependencies,
  generated temporary `--secret-file` handling, strict missing-secret mode, and
  optional `GITHUB_PAT -> GITHUB_TOKEN` aliasing for GitHub API profiles.
- Both repos have raw Wrangler dev/deploy/e2e entrypoints that inject secrets
  or live infrastructure (`scripts/run-workers-dev.ts`,
  `apps/e2e/scripts/e2e-with-neon.ts`, monorepo Wrangler launch descriptors).
  These should not be forced into `wp_worker_tail`, but they are follow-up
  candidates for shared secret-gated worker-dev/e2e wrappers once tail and act
  are stable.
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
  <kind>` and MCP `wp_audit`. Repo scripts may internally execute TypeScript
  through their runtime substrate, but CLI-shaped agent-facing commands should
  use MCP tools, `wp ...`, or `vp run ...`. The update-check opt-out is
  `WP_SKIP_UPDATE_CHECK=1`, not any retired namespace.

Verified source references checked on 2026-05-23:

- Cloudflare Workers Wrangler command docs:
  https://developers.cloudflare.com/workers/wrangler/commands/workers/
- nektos/act upstream repository and usage docs:
  https://github.com/nektos/act and https://nektosact.com/usage/
- Doppler secrets access docs:
  https://docs.doppler.com/docs/accessing-secrets
- Infisical CLI run docs:
  https://infisical.com/docs/cli/commands/run
- Zod 4 JSON Schema docs:
  https://zod.dev/json-schema

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

## Refinement Findings

| ID | Severity | Claim or risk | Verified reality | Blueprint fix |
| --- | --- | --- | --- | --- |
| F1 | HIGH | `wp_ci_act` could simply wrap the monorepo act source file. | `../monorepo/apps/scripts/src/ci/act.ts` is useful, but it owns repo-specific presets and direct env/Doppler fallback behavior. `src/cli/commands/ci.ts` in agent-kit also currently shells through `bun` and a consumer-local `apps/scripts/src/lib/with-secrets.ts`. | Require a public secret-gate runner and CI act helper surface; do not call the source adapter or consumer-local wrapper directly from MCP. |
| F2 | HIGH | Secret-provider behavior can be copied from downstream scripts. | IngestLens has mature act ergonomics, but its wrapper calls Doppler directly. Webpresso needs provider-agnostic `with-secrets`/secret-runner semantics so Infisical or another provider can remain behind config. | Extract profile/preset semantics and act ergonomics, but route all secret lookup through the shared Webpresso secret gate. |
| F3 | HIGH | Pretool routing can match one exact command string. | Users already tried Corepack, pnpm, Bun, local binary, and path-based forms. Hook matching must normalize command families, not brittle strings. | Add normalized source-entrypoint and package-binary routing tasks across `vp`, Corepack, pnpm, npm/npx, Yarn, Bun, and path-based local bins. |
| F4 | MEDIUM | Cloudflare official MCP tooling replaces a repo-local tail wrapper. | Cloudflare publishes MCP surfaces, but the problem here is local repo execution with Webpresso secret policy, bounded output, and pretool redirection. | Keep `wp_worker_tail` tail-only and local-context-aware; avoid a generic `wp_wrangler` in v1. |
| F5 | MEDIUM | Blueprint authoring should adopt an external ADR/planning platform. | MADR, Structured MADR, Log4brains, OpenSpec, Plop, and Hygen are credible precedents, but none match Webpresso lifecycle directories, task DAGs, MCP mutation, and validator flow. | Keep Webpresso blueprints; reuse in-repo `gray-matter`, `remark`/`unified`, and Zod rather than replacing the substrate. |
| F6 | MEDIUM | `wp_blueprint_validate` alone is enough for agents. | Current validation reports gaps, but agents still had to hand-fix task shape, lifecycle, and command hygiene. | Add structured `fixHints`, scaffold/repair tools, index/search, and template variants. |
| F7 | MEDIUM | Worker dev/e2e wrappers should be folded into this blueprint. | Monorepo and IngestLens both have `wrangler dev`, Neon branch, and e2e secret wrappers, but those paths have different runtime and lifecycle risks than tail/act. | Mark worker-dev/e2e as explicit follow-up candidates; make the shared runner reusable without broadening v1 scope. |
| F8 | LOW | Zod JSON Schema emission needs a new library choice. | Agent-kit auto-discovery already prefers Zod 4 native JSON Schema and falls back to existing `zod-to-json-schema`. | Do not add schema dependencies; keep Zod as the single public MCP schema source. |

## Technology Choices

| Concern | Choice | Reason |
| --- | --- | --- |
| Secret provider | Public Webpresso `with-secrets`/secret-runner contract | Keeps Doppler, Infisical, and future providers behind config; MCP must not construct provider CLI invocations. |
| Worker log execution | Tail-only `wp_worker_tail` MCP tool | Solves bounded live debugging without opening an arbitrary Wrangler command runner. |
| CI reproduction | Preset/profile-shaped `wp_ci_act` MCP tool plus helper library | Preserves least-privilege CI secrets and lets downstream repos migrate wrappers into data-only preset maps. |
| CLI guidance | MCP tools, `wp ...`, or `vp run ...` | Matches current repo contract and avoids raw Bun/TypeScript source-entrypoint advice. |
| Blueprint parsing | Existing `gray-matter`, `remark`/`unified`, Zod | Credible libraries are already present; avoids a second planning platform or template DSL. |

## DRY/SOLID Ownership Contract

The refactor boundary is deliberately three-layered so each repo owns exactly
one reason to change:

| Layer | Owning repo | Responsibility | Must not own |
| --- | --- | --- | --- |
| Public agent and helper surface | `webpresso/agent-kit` | MCP schemas, bounded execution envelopes, command routing, shared redaction, secret-gate runner, CI act profile/helper contracts, blueprint-authoring tools. | Monorepo-only workflow details, IngestLens-only preset maps, or provider-specific Doppler/Infisical command composition. |
| Webpresso workflow adapter | `webpresso/monorepo` | Webpresso workflow presets, Chef CI URL defaults, `@repo/ci-runtime` facade integration, and migration of `apps/scripts/src/ci/act.ts` plus E2E host adapter off consumer-local `with-secrets` paths. | Generic MCP schemas, generic act profile semantics, or downstream IngestLens policy. |
| Consumer preset data | `ozby/ingest-lens` | Workflow-to-profile mappings, repo docs, package scripts, and regression tests for its `none`, `github-api`, and `neon-control-plane` behavior. | Secret-provider engines, act temp-file engines, or Webpresso internal source paths. |

SOLID guardrails for implementation:

- **Single responsibility:** split `ci-act` into `profile resolution`,
  `secret-gate resolution`, `act argv/temp-file assembly`, `process execution`,
  and `redaction`; each helper has one test surface.
- **Open/closed:** new repos add workflow/profile preset data; they do not edit
  the shared execution engine for every workflow.
- **Interface segregation:** `wp_worker_tail` depends only on tail descriptors;
  `wp_ci_act` depends only on CI act descriptors; blueprint-authoring tools do
  not import worker/CI execution helpers.
- **Dependency inversion:** agent-kit depends on public secret-gate interfaces
  and injected runners, not on Doppler, Infisical, monorepo source files, or
  IngestLens scripts.
- **DRY rule:** if behavior appears in both monorepo and IngestLens, it belongs
  in the shared helper unless it is explicit repo policy data. If behavior
  appears in only one repo, keep it local until the rule of three is met.

## Cross-Plan References

| Artifact | Relationship | Required alignment |
| --- | --- | --- |
| `~/repos/ozby/ingest-lens/blueprints/planned/public-ci-surface-adoption/_overview.md` | Downstream consumer waiting on public Webpresso CI/secret surfaces. | Preserve `none`, `github-api`, and `neon-control-plane` profiles so IngestLens can delete `act-with-doppler.ts` engine code and keep only preset data. |
| `../monorepo/webpresso/blueprints/planned/secret-aware-ci-act-helper-adoption/_overview.md` | Webpresso monorepo migration plan for consuming the upstream helper surface. | Keep Webpresso workflow presets and Chef defaults repo-owned while moving reusable act/secret/redaction mechanics upstream. |
| `../monorepo/apps/scripts/src/ci/act.ts` | Existing CI act adapter and preset evidence. | Treat as source evidence and migration target, not as the agent-kit MCP implementation boundary. |
| `../monorepo/packages/feature/ci-runtime/src/transport/global-wp.ts` | Existing repo facade for invoking `wp` from CI runtime. | Prefer repo-owned facades where present; avoid path-based source execution. |
| `../monorepo/packages/cli/cli-utils/src/wrangler-launch-descriptor.ts` | Mature secret-aware Wrangler dev descriptor. | Borrow secret-profile and launch-descriptor ideas for future worker-dev/e2e work, not v1 tail scope. |
| `src/mcp/blueprint-server.ts` and `src/blueprint/core/validation/*` | Current blueprint MCP and validation surfaces. | Keep validation, repair hints, lifecycle audits, and docs lint on one rule vocabulary. |

## Risks and Edge Cases

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Secret values leak through command echoes, act `-s KEY=value`, Wrangler JSON, or failure logs. | HIGH | Central redaction helper applied to command previews, summaries, failures, parsed events, and bounded raw output. |
| Missing secret-gate config causes agents to fall back to raw Doppler/Infisical. | HIGH | Fail closed with actionable secret-gate setup guidance; keep generic `doppler run` blocked. |
| Package-manager wrapper normalization misses a new command family. | MEDIUM | Parse source-entrypoint intent after stripping known wrappers and add table-driven routing tests for each runner family. |
| `act` or Docker is not installed/running. | MEDIUM | Return structured failure with compact remediation; dry-run remains default. |
| Temporary secret/env files remain on disk after failures. | HIGH | Create files with mode `0600`, use scoped cleanup/finally blocks, and test failure cleanup. |
| Two blueprint-authoring tasks modify `src/mcp/blueprint-server.ts` concurrently. | MEDIUM | Serialize shared-file tasks or extract services first; waves below avoid same-file conflict pressure. |
| Worker tail produces long-running streams or mixed JSON/warning output. | MEDIUM | Enforce `timeoutMs`, `maxEvents`, and bounded raw output; parse JSON lines opportunistically. |
| Local Chef token fallback is enabled for a non-local URL. | HIGH | Reject `allowLocalChefToken` unless the Chef URL is explicitly local. |

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

Add MCP tool `wp_ci_act`.

Inputs:

- `cwd?: string`
- `workflow?: "ci-e2e" | "ci-generated-live-validation" | "ci-main"` default
  `"ci-e2e"`
- `job?: string`
- `prNumber?: string`
- `repo?: string` default `"webpresso/monorepo"`
- `workflowPath?: string`; optional path for repos that provide workflow/profile
  presets rather than one of the built-in Webpresso workflow IDs
- `eventName?: "push" | "pull_request" | "workflow_dispatch"` default
  `"pull_request"` for built-in Webpresso workflow IDs
- `chefUrl?: string` default from the underlying repo wrapper
- `secretProfile?: "auto" | "none" | "github-api" | "neon-control-plane" | "webpresso-chef-ci"`
  default `"auto"`
- `strictSecrets?: boolean` default `true` when `execute` is true
- `mapGithubPatToToken?: boolean` default `false`
- `containerArchitecture?: "linux/arm64" | "linux/amd64"`
- `platformImage?: string`
- `eventPath?: string`
- `execute?: boolean` default `false`
- `allowHostMutation?: boolean` default `false`
- `allowLocalChefToken?: boolean` default `false`; only valid for local Chef
  URLs
- `timeoutMs?: number` default `120000`
- `maxOutputBytes?: number` default `60000`
- `envProfile?: string` default `"secrets-only"`

Output:

- `{ passed, summary, exitCode, details, command, failures, rawOutput }`
- `details` includes the resolved workflow path/job, required secret names,
  allowed secret names, selected secret profile, whether execution was a dry
  run, and whether host mutation was enabled.
- `rawOutput` is bounded and redacted; secret values and `act -s KEY=value`
  payloads must never be returned.

Secret requirements:

- Resolve `GH_PACKAGES_TOKEN` for `ci-main`, `ci-e2e`, and
  `ci-generated-live-validation`.
- Resolve `NEON_API_KEY_PLATFORM` for `ci-e2e` and
  `ci-generated-live-validation`.
- Resolve `CHEF_CI_TOKEN` when the selected workflow requires Chef and the Chef
  URL is not an explicitly allowed local fallback URL.
- Support repo-owned workflow/profile preset data so downstream repos can keep
  IngestLens-style mappings such as:
  - `.github/workflows/ci.yml` -> `none`
  - `.github/workflows/testing-e2e-act.yml` -> `none`
  - `.github/workflows/cleanup-stale-neon-e2e-branches.yml` or job `cleanup`
    -> `neon-control-plane`
- For profile `none`, inject no secrets even if ambient provider data exists.
- For profile `github-api`, allow `GITHUB_TOKEN` and `GITHUB_PAT`; optionally
  alias `GITHUB_PAT` to `GITHUB_TOKEN` only when explicitly requested.
- For profile `neon-control-plane`, allow and require `NEON_API_KEY`,
  `NEON_PROJECT_ID`, and `NEON_PARENT_BRANCH_ID`.
- For profile `webpresso-chef-ci`, allow only the Webpresso CI secrets required
  by the selected workflow preset.
- Do not expose `--chef-token <value>` in agent-facing docs, hook guidance, dry
  run output, or MCP payloads.
- Do not invoke `doppler run`, `doppler secrets get`, `infisical run`, or
  provider-specific lookup commands directly. Use the shared Webpresso
  secret-provider gate.

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

The implementation should add focused wrappers, not generic arbitrary command
runners. `wp_worker_tail` is tail-only in v1, not a generic `wp_wrangler`.
`wp_ci_act` is workflow/profile-preset-only in v1, not a generic `act` shell.

0. **Command facade and namespace hygiene**
   - Agent-facing docs, hook guidance, validation output, and pretool rewrites
     should emit MCP tools, `wp ...`, or repo scripts through `vp run ...`.
   - Treat raw TypeScript/Bun source-entrypoint execution as an internal
     source-test implementation detail, not user guidance.
   - Treat package-manager/runtime chains such as Corepack -> pnpm -> exec ->
     TypeScript runtime -> repo source file as semantic source-entrypoint
     execution. Normalize those chains before routing so agents cannot bypass
     MCP guidance by adding `corepack`, `--dir`, `exec`, or `tsx` wrappers.
     Cover equivalent local-binary runner families too: `vp exec`/`vp dlx`,
     pnpm optional `exec`, `npm exec`/`npx`, `yarn exec`/`yarn dlx`, and `bunx`.
   - Use `WP_SKIP_UPDATE_CHECK=1` when suppressing CLI update checks. Do not
     introduce or suggest retired update-check env names.
   - Audit command guidance must use `wp audit <kind>` or MCP `wp_audit`. There
     is no separate generic agent subcommand namespace.
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
     Reuse the public `with-secrets.ts`/secret-runner contract; do not call
     `doppler`, `infisical`, or any provider CLI directly.

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

3. **CI act argument builder**
   - Prefer a repo-owned CI facade when the target repo exposes one, such as the
     monorepo `vp run --filter=@repo/ci-runtime ci:global-wp -- ci act ...`
     surface, rather than calling `apps/scripts/src/ci/act.ts` directly.
   - Keep the public MCP schema workflow/profile-preset-shaped. Do not accept
     arbitrary `act` arguments in v1.
   - Extract a public `ci-act` helper surface that can consume repo-owned
     workflow/profile preset data. This lets IngestLens migrate from
     `scripts/act-with-doppler.ts` while retaining its current `none`,
     `github-api`, and `neon-control-plane` semantics.
   - Map `workflow`, `job`, `prNumber`, `repo`, `chefUrl`,
     `workflowPath`, `eventName`, `secretProfile`, `strictSecrets`,
     `mapGithubPatToToken`, `containerArchitecture`, `platformImage`,
     `eventPath`, `execute`, `allowHostMutation`, and `allowLocalChefToken` to
     typed act execution descriptors.
   - Default to dry-run behavior unless `execute: true` is supplied.
   - Reject `allowLocalChefToken` for non-local Chef URLs.
   - Run through the shared secret gate so `CHEF_CI_TOKEN`, `GH_PACKAGES_TOKEN`,
     `NEON_API_KEY_PLATFORM`, and profile-specific downstream secrets are
     provided as environment variables without provider-specific command lookup.
   - Reuse IngestLens-style least-privilege secret filtering: only inject the
     keys allowed by the selected profile, and fail early on required keys in
     strict execute mode.
   - Generate temporary `--secret-file` and `--env-file` contents with mode
     `0600`, clean them after execution, and report only secret key names, never
     values.
   - Preserve act runtime ergonomics from downstream repos: Apple Silicon
     default architecture handling and read-only container mounts for absolute
     `file:` dependencies that act cannot otherwise see.
   - Redact generated `act` command lines so `-s KEY=value`, bearer tokens, and
     token-like output cannot leak into MCP results.
   - Fail with compact guidance when `act` or Docker is unavailable.

4. **Pretool routing**
   - Route `wrangler tail ...`, path-based `node_modules/.bin/wrangler tail ...`,
     `pnpm exec wrangler tail ...`, and
     `doppler run ... wrangler tail ...` to `wp_worker_tail`.
   - Route or correct stale agent-kit validation command shapes such as raw
     TypeScript/Bun CLI entrypoints, retired update-check env names, and
     invented audit subcommands toward `wp ...`, `vp run ...`, or MCP
     `wp_audit` guidance.
   - Route direct E2E source-entrypoint chains such as
     `corepack pnpm --dir <pkg> exec tsx src/cli/run-e2e.ts ...` toward
     `wp_e2e`. The match should be based on the normalized command shape and
     known source-entrypoint path, not one exact string.
   - Route package-manager execution of known quality binaries such as Vitest,
     Playwright, oxlint, tsc, prettier, and markdownlint-cli2 toward the
     corresponding `wp_*` MCP tool even when agents use Corepack, optional pnpm
     `exec`, npm/npx, Yarn, Bun, or `vp` wrappers.
   - Route secret-touching CI source-entrypoint execution such as
     `bun apps/scripts/src/ci/act.ts --workflow ... --execute ...`,
     `bun run apps/scripts/src/ci/act.ts ...`,
     `pnpm exec bun apps/scripts/src/ci/act.ts ...`, and Corepack-proxied
     equivalents toward `wp_ci_act`. If the wrapper is not implemented yet, the
     hook should hard-deny with actionable secret-provider-gate guidance.
   - Keep generic `doppler run` blocked with repo secret-gate or MCP guidance.
   - Do not route `wrangler types` to this tool; `../monorepo` treats generated
     Wrangler type commands as maintenance/preflight and secret-free.

5. **Blueprint authoring assist**
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

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| --- | --- | --- | --- | --- |
| **Wave 0** | 1.1, 1.2, 1.6, 1.8, 1.12 | None | 5 agents | XS-S |
| **Wave 1** | 1.3, 1.13, 1.14 | Wave 0 partial | 3 agents | S |
| **Wave 2** | 1.4, 1.7, 1.15 | Wave 0/1 partial | 3 agents | S-M |
| **Wave 3** | 1.5, 1.9 | Wave 2 partial | 2 agents | S |
| **Wave 4** | 1.10, 1.11 | Wave 3 | 2 agents | S-M |
| **Critical path** | 1.1 -> 1.3 -> 1.4 -> 1.5 -> 1.10 -> 1.11 | - | 6 waves | M |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| --- | --- | --- | --- |
| RW0 | Ready tasks in Wave 0 | >= planned agents / 2 | 5 |
| CPR | total_tasks / critical_path_length | >= 2.5 | 15 / 6 = 2.5 |
| DD | dependency_edges / total_tasks | <= 2.0 | 18 / 15 = 1.2 |
| CP | same-file overlaps per wave | 0 | 0 after serializing shared blueprint-server edits |

Refinement delta: blueprint authoring tasks are serialized where they touch
`src/mcp/blueprint-server.ts`; worker-tail, CI-act, routing, and authoring
helpers remain split by file cluster so `/pll` can start five independent lanes
and open three more as soon as the first scaffold and interface tasks land.

## Tasks

#### [mcp-schema] Task 1.1: Add the `wp_worker_tail` MCP tool surface

**Status:** todo

**Depends:** None

Create the public MCP descriptor for `wp_worker_tail` with Zod input/output
schemas, summary-first result shape, dry schema errors, and no command execution
logic beyond calling an injected runner. Keep this task focused on the tool
contract so downstream runner/parser tasks can build against a stable interface.

**Files:**

- Create: `src/mcp/tools/worker-tail.ts`
- Create: `src/mcp/tools/worker-tail.test.ts`
- Modify: `src/mcp/server.integration.test.ts`

**Steps (TDD):**

1. Write failing tests that assert schema defaults, invalid input errors, and
   auto-discovered MCP registration for `wp_worker_tail`.
2. Run: `wp_test({"files":["src/mcp/tools/worker-tail.test.ts","src/mcp/server.integration.test.ts"]})` and verify FAIL.
3. Implement the tool descriptor and delegate execution to an injectable runner.
4. Run: `wp_test({"files":["src/mcp/tools/worker-tail.test.ts","src/mcp/server.integration.test.ts"]})` and verify PASS.
5. Run: `wp_lint({"files":["src/mcp/tools/worker-tail.ts","src/mcp/tools/worker-tail.test.ts","src/mcp/server.integration.test.ts"]})`.
6. Run: `wp_typecheck({})`.

**Acceptance:**

- [ ] `wp_worker_tail` is registered as an MCP tool with the documented input
  and output shapes.
- [ ] Empty or invalid inputs fail through schema validation with concise
  errors.
- [ ] The tool delegates execution through an injectable runner rather than
  embedding provider or Wrangler process logic.
- [ ] Focused MCP registration and schema tests pass.

#### [secrets] Task 1.2: Add the shared secret-gate runner

**Status:** todo

**Depends:** None

Add a shared command-runner helper for MCP tools that executes through the
public Webpresso `with-secrets`/secret-runner contract. The helper must fail
closed when secret-gate configuration is missing and must not call provider CLIs
or consumer-local `apps/scripts/src/lib/with-secrets.ts` paths directly.

**Files:**

- Create: `src/mcp/tools/_shared/secret-gate-runner.ts`
- Create: `src/mcp/tools/_shared/secret-gate-runner.test.ts`
- Modify: `src/mcp/tools/_shared/run-command.ts`

**Steps (TDD):**

1. Write failing tests for provider-agnostic execution, missing gate failure,
   secret-free execution allowance, and rejection of direct provider command
   construction.
2. Run: `wp_test({"files":["src/mcp/tools/_shared/secret-gate-runner.test.ts","src/mcp/tools/_shared/run-command.test.ts"]})` and verify FAIL.
3. Implement the helper using the public Webpresso secret-gate contract and the
   existing bounded command-runner conventions.
4. Run: `wp_test({"files":["src/mcp/tools/_shared/secret-gate-runner.test.ts","src/mcp/tools/_shared/run-command.test.ts"]})` and verify PASS.
5. Run: `wp_lint({"files":["src/mcp/tools/_shared/secret-gate-runner.ts","src/mcp/tools/_shared/secret-gate-runner.test.ts","src/mcp/tools/_shared/run-command.ts"]})`.
6. Run: `wp_typecheck({})`.

**Acceptance:**

- [ ] Commands run through the public Webpresso secret gate rather than direct
  provider invocations.
- [ ] Source code does not depend on a consumer-local
  `apps/scripts/src/lib/with-secrets.ts` path.
- [ ] Source code does not construct `doppler run`, `doppler secrets get`,
  `infisical run`, or equivalent provider-specific invocations.
- [ ] Missing secret-gate configuration returns a compact structured failure
  unless the command is explicitly secret-free.

#### [worker-tail] Task 1.3: Add the Wrangler tail argument builder

**Status:** todo

**Depends:** Task 1.1, Task 1.2

Build a typed `wrangler tail` descriptor that maps `wp_worker_tail` inputs to
argv without `bash -lc`, resolves package-local binaries through the existing
MCP runner path, and enforces lifecycle bounds for `timeoutMs` and `maxEvents`.

**Files:**

- Create: `src/mcp/tools/_shared/wrangler-tail.ts`
- Create: `src/mcp/tools/_shared/wrangler-tail.test.ts`
- Modify: `src/mcp/tools/worker-tail.ts`

**Steps (TDD):**

1. Write failing tests for the `webpresso-chef-alpha` preview error-tail case,
   optional flags, timeout cancellation, max-event cancellation, and non-shell
   argv construction.
2. Run: `wp_test({"files":["src/mcp/tools/_shared/wrangler-tail.test.ts","src/mcp/tools/worker-tail.test.ts"]})` and verify FAIL.
3. Implement the builder and runner integration.
4. Run: `wp_test({"files":["src/mcp/tools/_shared/wrangler-tail.test.ts","src/mcp/tools/worker-tail.test.ts"]})` and verify PASS.
5. Run: `wp_lint({"files":["src/mcp/tools/_shared/wrangler-tail.ts","src/mcp/tools/_shared/wrangler-tail.test.ts","src/mcp/tools/worker-tail.ts"]})`.
6. Run: `wp_typecheck({})`.

**Acceptance:**

- [ ] Typed inputs map to Wrangler flags without `bash -lc`.
- [ ] The motivating call maps to
  `wrangler tail webpresso-chef-alpha --env preview --format json --status error`.
- [ ] Tail execution stops after `timeoutMs` or `maxEvents`.
- [ ] Package-local Wrangler binaries are preferred through existing MCP runner
  resolution.

#### [worker-tail] Task 1.4: Parse and bound tail output

**Status:** todo

**Depends:** Task 1.3

Parse JSON tail lines into compact events while preserving bounded non-JSON
warnings, Cloudflare status lines, and process errors. The parser should be
usable independently from live Wrangler execution so tests can cover mixed
stream output without network access.

**Files:**

- Create: `src/mcp/tools/_shared/wrangler-tail-output.ts`
- Create: `src/mcp/tools/_shared/wrangler-tail-output.test.ts`
- Modify: `src/mcp/tools/_shared/wrangler-tail.ts`

**Steps (TDD):**

1. Write failing tests for JSON line parsing, mixed warning/JSON output,
   malformed JSON fallback, max event truncation, and raw output byte limits.
2. Run: `wp_test({"files":["src/mcp/tools/_shared/wrangler-tail-output.test.ts","src/mcp/tools/_shared/wrangler-tail.test.ts"]})` and verify FAIL.
3. Implement the parser and bounded output accumulator.
4. Run: `wp_test({"files":["src/mcp/tools/_shared/wrangler-tail-output.test.ts","src/mcp/tools/_shared/wrangler-tail.test.ts"]})` and verify PASS.
5. Run: `wp_lint({"files":["src/mcp/tools/_shared/wrangler-tail-output.ts","src/mcp/tools/_shared/wrangler-tail-output.test.ts","src/mcp/tools/_shared/wrangler-tail.ts"]})`.
6. Run: `wp_typecheck({})`.

**Acceptance:**

- [ ] JSON tail lines become compact `events`.
- [ ] Non-JSON warnings are preserved only in bounded summary/raw output fields.
- [ ] Malformed JSON does not fail the whole tool unless process execution
  fails.
- [ ] Output bounds are deterministic and tested.

#### [redaction] Task 1.5: Redact sensitive output

**Status:** todo

**Depends:** Task 1.4, Task 1.7

Add a reusable redaction helper for MCP tool outputs that removes token-like
values, bearer tokens, `act -s KEY=value` payloads, `--chef-token` values, and
known secret-looking fields from summaries, failures, parsed events, command
previews, and bounded raw output.

**Files:**

- Create: `src/mcp/tools/_shared/redaction.ts`
- Create: `src/mcp/tools/_shared/redaction.test.ts`
- Modify: `src/mcp/tools/_shared/wrangler-tail-output.ts`
- Modify: `src/mcp/tools/_shared/ci-act-runner.ts`

**Steps (TDD):**

1. Write failing tests for token-like strings, bearer headers, `-s KEY=value`,
   `--chef-token`, parsed event fields, and nested result objects.
2. Run: `wp_test({"files":["src/mcp/tools/_shared/redaction.test.ts","src/mcp/tools/_shared/wrangler-tail-output.test.ts","src/mcp/tools/_shared/ci-act-runner.test.ts"]})` and verify FAIL.
3. Implement the redaction helper and wire it into tail and CI act output paths.
4. Run: `wp_test({"files":["src/mcp/tools/_shared/redaction.test.ts","src/mcp/tools/_shared/wrangler-tail-output.test.ts","src/mcp/tools/_shared/ci-act-runner.test.ts"]})` and verify PASS.
5. Run: `wp_lint({"files":["src/mcp/tools/_shared/redaction.ts","src/mcp/tools/_shared/redaction.test.ts","src/mcp/tools/_shared/wrangler-tail-output.ts","src/mcp/tools/_shared/ci-act-runner.ts"]})`.
6. Run: `wp_typecheck({})`.

**Acceptance:**

- [ ] Returned payloads do not expose token-looking or known secret-looking
  values.
- [ ] Redaction applies to parsed events, summaries, failures, command previews,
  and raw output.
- [ ] Redaction is shared by `wp_worker_tail` and `wp_ci_act`.

#### [mcp-schema] Task 1.6: Add the `wp_ci_act` MCP tool surface

**Status:** todo

**Depends:** None

Create the public MCP descriptor for `wp_ci_act` with Zod input/output schemas,
dry-run by default, summary-first payloads, and no direct source-entrypoint or
provider execution. The schema must be workflow/profile-preset-shaped, not an
arbitrary `act` argv passthrough.

**Files:**

- Create: `src/mcp/tools/ci-act.ts`
- Create: `src/mcp/tools/ci-act.test.ts`
- Modify: `src/mcp/server.integration.test.ts`

**Steps (TDD):**

1. Write failing tests for schema defaults, supported workflow IDs, custom
   workflow path/profile inputs, invalid values, and MCP registration.
2. Run: `wp_test({"files":["src/mcp/tools/ci-act.test.ts","src/mcp/server.integration.test.ts"]})` and verify FAIL.
3. Implement the tool descriptor and delegate execution to an injectable runner.
4. Run: `wp_test({"files":["src/mcp/tools/ci-act.test.ts","src/mcp/server.integration.test.ts"]})` and verify PASS.
5. Run: `wp_lint({"files":["src/mcp/tools/ci-act.ts","src/mcp/tools/ci-act.test.ts","src/mcp/server.integration.test.ts"]})`.
6. Run: `wp_typecheck({})`.

**Acceptance:**

- [ ] `wp_ci_act` is registered as an MCP tool with the documented input and
  output shapes.
- [ ] Built-in workflow inputs are constrained to `ci-e2e`,
  `ci-generated-live-validation`, and `ci-main`.
- [ ] Repos may supply workflow path/profile preset data without gaining raw
  arbitrary `act` argv execution.
- [ ] `execute` defaults to false so dry-run behavior is the safe default.

#### [ci-act] Task 1.7: Add the CI act wrapper runner

**Status:** todo

**Depends:** Task 1.2, Task 1.6, Task 1.8

Add the secret-aware CI act runner that maps typed MCP inputs to repo-owned CI
facades or public helper descriptors. It must migrate away from the current
agent-kit `wp ci act` pattern that shells through `bun` plus a consumer-local
`apps/scripts/src/lib/with-secrets.ts`.

**Files:**

- Create: `src/mcp/tools/_shared/ci-act-runner.ts`
- Create: `src/mcp/tools/_shared/ci-act-runner.test.ts`
- Modify: `src/mcp/tools/ci-act.ts`
- Modify: `src/cli/commands/ci.ts`
- Modify: `src/cli/commands/ci.test.ts`

**Steps (TDD):**

1. Write failing tests for `ci-generated-live-validation` with
   `chefUrl: "https://chef-ci-alpha.api.webpresso.cloud"`, dry-run default,
   execute mode, missing Docker/act failures, non-local Chef fallback
   rejection, bounded output, and no direct source adapter invocation.
2. Run: `wp_test({"files":["src/mcp/tools/_shared/ci-act-runner.test.ts","src/mcp/tools/ci-act.test.ts","src/cli/commands/ci.test.ts"]})` and verify FAIL.
3. Implement the runner and update the CLI facade to use the same public helper
   boundary instead of consumer-local secret-wrapper paths.
4. Run: `wp_test({"files":["src/mcp/tools/_shared/ci-act-runner.test.ts","src/mcp/tools/ci-act.test.ts","src/cli/commands/ci.test.ts"]})` and verify PASS.
5. Run: `wp_lint({"files":["src/mcp/tools/_shared/ci-act-runner.ts","src/mcp/tools/_shared/ci-act-runner.test.ts","src/mcp/tools/ci-act.ts","src/cli/commands/ci.ts","src/cli/commands/ci.test.ts"]})`.
6. Run: `wp_typecheck({})`.

**Acceptance:**

- [ ] The runner uses the shared Webpresso secret gate for workflow-required
  keys such as `CHEF_CI_TOKEN`, `GH_PACKAGES_TOKEN`, and
  `NEON_API_KEY_PLATFORM`.
- [ ] The runner does not call `doppler`, `infisical`, or
  `apps/scripts/src/ci/act.ts` directly from agent-kit.
- [ ] The runner prefers a repo-owned facade when present, such as
  `vp run --filter=@repo/ci-runtime ci:global-wp -- ci act ...`.
- [ ] `allowLocalChefToken` is rejected for non-local Chef URLs.
- [ ] Missing `act`, missing Docker, or missing secret-gate configuration
  returns a concise structured failure with remediation.

#### [ci-act] Task 1.8: Extract reusable CI act preset/profile helpers

**Status:** todo

**Depends:** None

Extract public helper logic for act workflow presets, least-privilege secret
profiles, temporary secret/env files, and runtime ergonomics so consumer repos
can migrate local wrappers into data-only presets. Preserve IngestLens behavior
without preserving its direct Doppler lookup.

**Files:**

- Create: `src/mcp/tools/_shared/ci-act-profile.ts`
- Create: `src/mcp/tools/_shared/ci-act-profile.test.ts`
- Create: `src/mcp/tools/_shared/ci-act-temp-files.ts`
- Create: `src/mcp/tools/_shared/ci-act-temp-files.test.ts`

**Steps (TDD):**

1. Write failing tests for profile resolution from workflow/job, strict missing
   secrets, profile `none`, `github-api`, `neon-control-plane`,
   `webpresso-chef-ci`, optional `GITHUB_PAT -> GITHUB_TOKEN` aliasing, Apple
   Silicon architecture defaults, temporary file cleanup, and read-only mounts
   for absolute `file:` dependencies.
2. Run: `wp_test({"files":["src/mcp/tools/_shared/ci-act-profile.test.ts","src/mcp/tools/_shared/ci-act-temp-files.test.ts"]})` and verify FAIL.
3. Implement the profile and temp-file helpers without provider-specific secret
   lookup.
4. Run: `wp_test({"files":["src/mcp/tools/_shared/ci-act-profile.test.ts","src/mcp/tools/_shared/ci-act-temp-files.test.ts"]})` and verify PASS.
5. Run: `wp_lint({"files":["src/mcp/tools/_shared/ci-act-profile.ts","src/mcp/tools/_shared/ci-act-profile.test.ts","src/mcp/tools/_shared/ci-act-temp-files.ts","src/mcp/tools/_shared/ci-act-temp-files.test.ts"]})`.
6. Run: `wp_typecheck({})`.

**Acceptance:**

- [ ] A public helper resolves a secret profile from workflow path, job, and
  optional explicit profile ID.
- [ ] The helper supports `none`, `github-api`, `neon-control-plane`, and
  `webpresso-chef-ci` profiles with explicit allowed and required key lists.
- [ ] Profile `none` injects no secrets.
- [ ] `github-api` supports optional `GITHUB_PAT -> GITHUB_TOKEN` aliasing only
  when requested.
- [ ] `neon-control-plane` preserves IngestLens parity for `NEON_API_KEY`,
  `NEON_PROJECT_ID`, and `NEON_PARENT_BRANCH_ID`.
- [ ] Temporary secret/env files use restrictive permissions, clean up after
  success and failure, and expose only key names in summaries.
- [ ] Apple Silicon act architecture defaulting and read-only mounts for
  absolute `file:` dependencies are preserved.

#### [hooks] Task 1.9: Extend pretool routing

**Status:** todo

**Depends:** Task 1.1, Task 1.6, Task 1.8

Extend pretool command normalization so raw Wrangler tail, CI act source
entrypoints, IngestLens-style act wrappers, known E2E source runners, local
quality-tool binaries, and stale agent-kit audit command shapes are forwarded
or blocked with the correct MCP/Webpresso guidance.

**Files:**

- Modify: `src/hooks/pretool-guard/dev-routing.ts`
- Modify: `src/hooks/pretool-guard/dev-routing.test.ts`
- Modify: `catalog/agent/rules/cmd-execution.md`

**Steps (TDD):**

1. Write failing routing tests for raw/path-based `wrangler tail`,
   `doppler run ... wrangler tail`, Corepack/pnpm/npm/npx/Yarn/Bun/vp quality
   binaries, `corepack pnpm --dir ... exec tsx src/cli/run-e2e.ts`, monorepo
   `apps/scripts/src/ci/act.ts`, IngestLens `scripts/act-with-doppler.ts`,
   stale `AK_SKIP_UPDATE_CHECK`, invented `wp agent audit`, and non-tail
   Wrangler commands that must remain allowed.
2. Run: `wp_test({"files":["src/hooks/pretool-guard/dev-routing.test.ts"]})` and verify FAIL.
3. Implement table-driven normalization and route guidance.
4. Run: `wp_test({"files":["src/hooks/pretool-guard/dev-routing.test.ts"]})` and verify PASS.
5. Run: `wp_lint({"files":["src/hooks/pretool-guard/dev-routing.ts","src/hooks/pretool-guard/dev-routing.test.ts","catalog/agent/rules/cmd-execution.md"]})`.
6. Run: `wp_typecheck({})`.

**Acceptance:**

- [ ] Raw and wrapped Wrangler tail commands are denied with `wp_worker_tail`
  guidance.
- [ ] Stale verification forms are denied or corrected with `WP_SKIP_UPDATE_CHECK=1`,
  `wp audit <kind>`, `vp run ...`, or MCP `wp_audit` guidance.
- [ ] Package-manager/runtime source-entrypoint chains for known E2E runners are
  denied with `wp_e2e` guidance, including Corepack-proxied pnpm forms.
- [ ] Package-manager local-binary execution of known test, lint, typecheck,
  format, QA, and E2E tools is denied with matching `wp_*` guidance across
  `vp`, pnpm, npm/npx, Yarn, Bun, and Corepack proxy forms.
- [ ] Secret-touching CI act source-entrypoint commands are denied with
  `wp_ci_act` guidance and secret-provider-gate language.
- [ ] Non-tail Wrangler commands such as `wrangler types` are not routed to
  `wp_worker_tail`.

#### [qa] Task 1.10: Add focused end-to-end MCP and routing tests

**Status:** todo

**Depends:** Task 1.5, Task 1.7, Task 1.9

Add integration-level tests that exercise the connected behavior across the MCP
tools, secret-gate runner, output redaction, CI act profiles, and pretool
routing. Keep these tests bounded and fake external processes; do not require
Cloudflare, Docker, Doppler, or Infisical credentials.

**Files:**

- Modify: `src/mcp/tools/worker-tail.test.ts`
- Modify: `src/mcp/tools/ci-act.test.ts`
- Modify: `src/mcp/server.integration.test.ts`
- Modify: `src/hooks/pretool-guard/dev-routing.test.ts`

**Steps (TDD):**

1. Write failing cross-component tests for the motivating Worker tail case,
   generated-live-validation CI act case, IngestLens profile parity, missing
   secret-gate failure, and redacted bounded outputs.
2. Run: `wp_test({"files":["src/mcp/tools/worker-tail.test.ts","src/mcp/tools/ci-act.test.ts","src/mcp/server.integration.test.ts","src/hooks/pretool-guard/dev-routing.test.ts"]})` and verify FAIL.
3. Wire missing integration paths or fix contracts exposed by the tests.
4. Run: `wp_test({"files":["src/mcp/tools/worker-tail.test.ts","src/mcp/tools/ci-act.test.ts","src/mcp/server.integration.test.ts","src/hooks/pretool-guard/dev-routing.test.ts"]})` and verify PASS.
5. Run: `wp_lint({"files":["src/mcp/tools/worker-tail.test.ts","src/mcp/tools/ci-act.test.ts","src/mcp/server.integration.test.ts","src/hooks/pretool-guard/dev-routing.test.ts"]})`.
6. Run: `wp_typecheck({})`.

**Acceptance:**

- [ ] Tests cover the motivating `webpresso-chef-alpha` preview tail case.
- [ ] Tests cover `ci-generated-live-validation` with
  `chefUrl: "https://chef-ci-alpha.api.webpresso.cloud"`.
- [ ] Tests cover IngestLens act profiles: no-secret local CI/e2e, Neon cleanup
  profile, strict missing-secret failure, and optional PAT aliasing.
- [ ] Tests cover secret-gate use, missing gate failure, routing, and redaction
  for both tools.

#### [docs] Task 1.11: Update generated routing and docs surfaces

**Status:** todo

**Depends:** Task 1.10

Update generated MCP tool listings, command-routing docs, and blueprint docs
surfaces only where drift tests require it. Any generated surface must be
produced through repo-approved workflows rather than hand-edited.

**Files:**

- Modify: `catalog/agent/rules/cmd-execution.md`
- Modify: `src/mcp/server.integration.test.ts`
- Modify: `packages/agent-docs-lint/src/validators/deprecated-commands.ts`
- Modify: `packages/agent-docs-lint/src/validators/deprecated-commands.test.ts`

**Steps (TDD):**

1. Write or update failing drift/deprecated-command tests for new MCP guidance
   and stale command forms.
2. Run: `wp_test({"files":["src/mcp/server.integration.test.ts","packages/agent-docs-lint/src/validators/deprecated-commands.test.ts"]})` and verify FAIL.
3. Regenerate or update docs through the repo-approved command surface.
4. Run: `wp_test({"files":["src/mcp/server.integration.test.ts","packages/agent-docs-lint/src/validators/deprecated-commands.test.ts"]})` and verify PASS.
5. Run: `wp_audit({"kind":"catalog-drift"})`, `wp_audit({"kind":"docs-frontmatter"})`, and `wp_audit({"kind":"blueprint-lifecycle"})`.
6. Run: `wp_typecheck({})`.

**Acceptance:**

- [ ] Registered tool/docs drift checks pass.
- [ ] Deprecated command guidance catches raw Bun/TypeScript CLI examples,
  retired update-check env names, and invented audit subcommands.
- [ ] Any changed generated surface is produced through the repo-approved
  workflow.

#### [blueprint-mcp] Task 1.12: Add blueprint scaffold MCP functionality

**Status:** todo

**Depends:** None

Add `wp_blueprint_scaffold` or equivalent write-capable functionality that
creates a validator-compliant `_overview.md` from structured fields and task
definitions. The scaffold should reuse repo frontmatter/Markdown helpers and
write only inside configured lifecycle directories.

**Files:**

- Create: `src/blueprint/scaffold.ts`
- Create: `src/blueprint/scaffold.test.ts`
- Modify: `src/mcp/blueprint-server.ts`
- Modify: `src/mcp/blueprint-server.test.ts`

**Steps (TDD):**

1. Write failing tests for minimal scaffold input, lifecycle placement, stable
   frontmatter order, valid task shape, duplicate path refusal, and immediate
   validation success.
2. Run: `wp_test({"files":["src/blueprint/scaffold.test.ts","src/mcp/blueprint-server.test.ts"]})` and verify FAIL.
3. Implement the scaffold service and MCP registration using Zod input schemas
   and existing frontmatter serialization.
4. Run: `wp_test({"files":["src/blueprint/scaffold.test.ts","src/mcp/blueprint-server.test.ts"]})` and verify PASS.
5. Run: `wp_lint({"files":["src/blueprint/scaffold.ts","src/blueprint/scaffold.test.ts","src/mcp/blueprint-server.ts","src/mcp/blueprint-server.test.ts"]})`.
6. Run: `wp_typecheck({})`.

**Acceptance:**

- [ ] A minimal scaffolded blueprint passes `wp_blueprint_validate` without
  manual frontmatter, wedge, task, or acceptance fixes.
- [ ] The tool writes only inside the configured blueprint lifecycle directory.
- [ ] The implementation uses Zod input schemas and existing
  `gray-matter`/YAML frontmatter paths.
- [ ] No Plop, Hygen, Log4brains, OpenSpec, or ADR CLI dependency is added.

#### [blueprint-mcp] Task 1.13: Add blueprint repair or fix-hint functionality

**Status:** todo

**Depends:** Task 1.12

Extend blueprint authoring support so validator gaps become deterministic
`fixHints` or a repair patch/rewrite. Repairs must fill only structural gaps;
unknown product intent must remain an explicit placeholder.

**Files:**

- Create: `src/blueprint/repair.ts`
- Create: `src/blueprint/repair.test.ts`
- Modify: `src/blueprint/core/validation/index.ts`
- Modify: `src/blueprint/core/validation/index.test.ts`
- Modify: `src/mcp/blueprint-server.ts`
- Modify: `src/mcp/blueprint-server.test.ts`

**Steps (TDD):**

1. Write failing tests for missing frontmatter, missing wedge, malformed task
   shape, missing `Depends`/`Files`/`Steps (TDD)`/checkbox acceptance, and
   preservation of existing sections.
2. Run: `wp_test({"files":["src/blueprint/repair.test.ts","src/blueprint/core/validation/index.test.ts","src/mcp/blueprint-server.test.ts"]})` and verify FAIL.
3. Implement rule IDs, structured `fixHints`, and optional AST-backed repair
   using `remark`/`unified` plus existing frontmatter helpers.
4. Run: `wp_test({"files":["src/blueprint/repair.test.ts","src/blueprint/core/validation/index.test.ts","src/mcp/blueprint-server.test.ts"]})` and verify PASS.
5. Run: `wp_lint({"files":["src/blueprint/repair.ts","src/blueprint/repair.test.ts","src/blueprint/core/validation/index.ts","src/blueprint/core/validation/index.test.ts","src/mcp/blueprint-server.ts","src/mcp/blueprint-server.test.ts"]})`.
6. Run: `wp_typecheck({})`.

**Acceptance:**

- [ ] `wp_blueprint_validate` exposes actionable structured fix hints, or a
  repair tool returns a patch/rewrite for known structural gaps.
- [ ] The repair path does not invent product intent; unknown content remains an
  explicit placeholder.
- [ ] Structural Markdown fixes use `remark`/`unified` or an equivalent existing
  AST helper, not broad regex-only rewrites.
- [ ] MCP validation, docs-lint blueprint rules, and repair hints share stable
  rule IDs and one canonical validation vocabulary.

#### [blueprint-mcp] Task 1.14: Add blueprint index and relationship metadata support

**Status:** todo

**Depends:** Task 1.12

Add `wp_blueprint_index` or an equivalent read-only MCP surface that returns
blueprint title, slug, lifecycle status, owner, tags, `depends_on`, and optional
ADR-style decision links. Derive the index from frontmatter and existing
blueprint storage; do not introduce a manual registry.

**Files:**

- Create: `src/blueprint/index.ts`
- Create: `src/blueprint/index.test.ts`
- Modify: `src/mcp/blueprint-server.ts`
- Modify: `src/mcp/blueprint-server.test.ts`

**Steps (TDD):**

1. Write failing tests for planned/in-progress/completed discovery, tag/owner
   filtering, `depends_on` relationships, decision metadata, bounded summary
   output, and stale/malformed blueprint handling.
2. Run: `wp_test({"files":["src/blueprint/index.test.ts","src/mcp/blueprint-server.test.ts"]})` and verify FAIL.
3. Implement the index service and read-only MCP registration.
4. Run: `wp_test({"files":["src/blueprint/index.test.ts","src/mcp/blueprint-server.test.ts"]})` and verify PASS.
5. Run: `wp_lint({"files":["src/blueprint/index.ts","src/blueprint/index.test.ts","src/mcp/blueprint-server.ts","src/mcp/blueprint-server.test.ts"]})`.
6. Run: `wp_typecheck({})`.

**Acceptance:**

- [ ] Agents can query existing planned/draft/completed blueprints before
  creating a new one.
- [ ] The index is derived from frontmatter and existing blueprint storage.
- [ ] No separate manually edited registry is introduced.
- [ ] Log4brains, adr-log, and static-site ADR portals remain UX precedents, not
  runtime dependencies.

#### [blueprint-mcp] Task 1.15: Add template variants for blueprint scaffolding

**Status:** todo

**Depends:** Task 1.12

Support `minimal`, `standard`, and `adr-heavy` scaffold variants so authors can
choose the smallest valid artifact that fits the work. All variants must remain
Webpresso blueprints with lifecycle status, task dependencies, TDD steps, and
acceptance criteria.

**Files:**

- Create: `src/blueprint/scaffold-variants.ts`
- Create: `src/blueprint/scaffold-variants.test.ts`
- Modify: `src/blueprint/scaffold.ts`
- Modify: `src/blueprint/scaffold.test.ts`

**Steps (TDD):**

1. Write failing tests that scaffold each variant and validate it with the same
   blueprint validator.
2. Run: `wp_test({"files":["src/blueprint/scaffold-variants.test.ts","src/blueprint/scaffold.test.ts"]})` and verify FAIL.
3. Implement variant templates by adapting MADR/Nygard/Structured MADR concepts
   only as optional sections.
4. Run: `wp_test({"files":["src/blueprint/scaffold-variants.test.ts","src/blueprint/scaffold.test.ts"]})` and verify PASS.
5. Run: `wp_lint({"files":["src/blueprint/scaffold-variants.ts","src/blueprint/scaffold-variants.test.ts","src/blueprint/scaffold.ts","src/blueprint/scaffold.test.ts"]})`.
6. Run: `wp_typecheck({})`.

**Acceptance:**

- [ ] Every variant passes `wp_blueprint_validate` immediately after creation.
- [ ] `adr-heavy` includes decision drivers, considered options, decision
  outcome, and consequences sections without making them mandatory for all
  blueprints.
- [ ] ADR-heavy wording may adapt ADR concepts, but the file remains a
  Webpresso blueprint with lifecycle status, tasks, dependencies, and
  acceptance criteria.

## Acceptance Criteria

- `wp_worker_tail` returns bounded, structured results for Worker tail sessions
  and never streams unlimited raw Wrangler output into context.
- Raw `wrangler tail` commands and wrapped `doppler run ... wrangler tail ...`
  commands are denied by pretool routing with guidance to use `wp_worker_tail`.
- Raw `bun apps/scripts/src/ci/act.ts ...` commands and package-manager/runtime
  equivalents are denied by pretool routing with guidance to use `wp_ci_act`
  and the repo secret-provider gate.
- `wp_ci_act` returns bounded, structured dry-run/execute results for supported
  CI workflow presets and never returns raw unlimited `act` logs or secret
  values.
- `wp_ci_act` resolves `CHEF_CI_TOKEN`, `GH_PACKAGES_TOKEN`, and
  `NEON_API_KEY_PLATFORM` through the shared Webpresso secret gate according to
  the selected workflow preset, never through direct Doppler/Infisical calls.
- `wp_ci_act` supports repo-owned workflow/profile preset data so consumer repos
  such as IngestLens can migrate local `act-with-doppler` engines into public
  helpers without broadening secret exposure.
- CI act profiles enforce least-privilege injection: no-secret workflows inject
  nothing, Neon cleanup workflows inject only required Neon control-plane keys,
  and Webpresso Chef workflows inject only their required CI keys.
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
  or MCP tool names; they do not suggest raw TypeScript/Bun source-entrypoint
  execution, retired update-check env names, or invented audit subcommands.

## Verification Plan

- `wp_test` for the new MCP tool tests, secret-gate runner tests, and pretool
  routing tests.
- `wp_test` for `wp_ci_act` schema, workflow preset mapping, dry-run default,
  execute mode, missing-secret failure, local Chef fallback rejection, and output
  redaction.
- `wp_test` for extracted act profile helpers using IngestLens parity cases:
  `none`, `github-api`, `neon-control-plane`, required-key checks, architecture
  defaulting, temporary secret-file rendering, and absolute `file:` dependency
  mount generation.
- `wp_test` for blueprint scaffold/repair tool tests and validator fix-hint
  tests.
- `wp_test` for blueprint index/search and template variant tests.
- `wp_test` coverage for malformed blueprint repair round-trips through
  `gray-matter` and `remark`/`unified` without dropping existing sections.
- `wp_test` coverage for raw and wrapped CI act routing, including `bun`,
  `bun run`, `pnpm exec bun`, and Corepack-proxied pnpm forms.
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
- Downstream consumer repos should provide workflow/profile preset data rather
  than vendoring secret-wrapper engines. IngestLens is the reference consumer:
  `ci.yml` and `testing-e2e-act.yml` intentionally use profile `none`, while
  `cleanup-stale-neon-e2e-branches.yml` uses a Neon control-plane profile.
- Raw worker dev/e2e helpers that start `wrangler dev`, provision Neon branches,
  or pass `--var SECRET:value` are out of scope for this blueprint, but the
  shared secret-gate runner should make future `wp_worker_dev` or `wp_e2e`
  hardening straightforward.
- Blueprint authoring assist should stay docs-as-code: Markdown remains the
  durable artifact, while structured MCP inputs, metadata, and validation make it
  easier to create correctly.
- Existing dependencies are preferred for blueprint authoring: `gray-matter` for
  frontmatter, Zod for schemas, Zod 4 native JSON Schema through the existing MCP
  helper, and `remark`/`unified` for body transforms.
- `zod-to-json-schema` remains an existing compatibility fallback only; new
  blueprint tools should not call it directly.
