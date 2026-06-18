---
type: blueprint
title: "Make planned a hard trust state"
owner: ozby
status: planned
complexity: L
created: '2026-06-11'
last_updated: '2026-06-11'
progress: '0% (0/19 tasks done, 0 blocked, updated 2026-06-11)'
tags:
  - blueprints
  - governance
  - audit
  - mcp
max_parallel_agents: 4
---

# Make `planned` a hard trust state

## Product wedge anchor

Agent-kit should make blueprint lifecycle state trustworthy enough that an
implementer can pick up any `planned/` blueprint and execute it from the
document plus the codebase alone. `planned` must mean execution-ready with
recorded proof, not merely "well refined" or "scoped."

## Planning Summary

Strengthen the existing lifecycle instead of introducing another planning
system:

- `draft/` remains the place for open questions, refinement, unverifiable claims,
  and incomplete design.
- `planned/` becomes the repo-standard Definition of Ready: zero open design
  questions, zero material unknowns, complete evidence for material claims,
  closed material decisions, and passing promotion gates.
- Blueprint Markdown carries proof through a minimal in-document Trust Dossier.
- `plan-refine` becomes the producer of promotion-readiness evidence and a
  binary `planned-eligible` / `not-planned-eligible` verdict.
- A new hard audit kind, `blueprint-trust`, validates the dossier and blocks
  `draft → planned` promotion after the new gate exists.
- CLI promotion, CLI recovery move, MCP `wp_blueprint_promote`, and MCP
  `wp_blueprint_transition` all route through one shared promotion service before
  a blueprint can enter `planned/`.

This meta-plan is `planned` under the repo's current lifecycle rules and does
not require a real Trust Dossier until this blueprint implements the new gate.
Current planned eligibility for this meta-plan means: lifecycle format passes,
referenced repo paths exist or are explicitly marked `Create:`, no open
questions remain, task dependencies are explicit, verification routes are
known, and team critique blockers have been incorporated.

## Architecture Overview

- Blueprint Markdown remains the single source of truth.
- Existing lifecycle and format validation remains the first promotion layer.
- Trust validation lives under `src/blueprint/trust/` and is surfaced through
  `src/audit/blueprint-trust.ts` so CLI and MCP audit dispatch can share one
  validator.
- Audit activation is deliberately ordered after repository backfill; adding the
  audit to guardrails before backfill would hard-fail the repo on existing
  executable blueprints.
- Promotion orchestration validates the candidate as planned in memory, runs
  declared Promotion Gates through a narrow argv-only command runner, records
  `verified-at`, `verified-head`, and gate results in the Trust Dossier, then
  persists/moves/re-ingests only if every check passes.
- Existing task evidence in `src/blueprint/evidence.ts` is **not** overloaded;
  Trust Dossier repo/web/derived evidence uses a separate validator with similar
  Zod/canonicalization style.
- Command-running promotion code is not exported from Workers-safe public
  modules; public exports expose pure parser/types only.

## Fact-Check Summary

| ID | Severity | Claim checked | Repo evidence | Refinement applied |
| -- | -------- | ------------- | ------------- | ------------------ |
| F1 | HIGH | `blueprint-trust` does not exist today. | `src/cli/commands/audit.ts`, `src/mcp/tools/_shared/audit-kinds.ts`, and `src/mcp/tools/audit.ts` list current kinds but no `blueprint-trust`. | Tasks create validator/audit first, backfill executable blueprints, then activate the audit. |
| F2 | HIGH | Current task dependency syntax. | Live parser/linter use `**Depends:**`; `docs/blueprint-format.md` still contains stale `**Depends on:**` wording. | Tasks use current `**Depends:**` form and Task 1.2 corrects the stale docs wording. |
| F3 | HIGH | CLI lifecycle paths. | `src/cli/commands/blueprint/router.ts` makes `wp blueprint move` recovery-only unless `--force-recovery`; normal promotion is `promoteBlueprint` in `src/cli/commands/blueprint/mutations.ts`. | Gate both normal promotion and recovery move. |
| F4 | HIGH | MCP lifecycle paths. | `src/mcp/blueprint-server.ts` registers both `wp_blueprint_promote` and `wp_blueprint_transition`. | Gate both MCP paths through the shared promotion service. |
| F5 | HIGH | Audit activation can break the repo before backfill. | `src/cli/commands/audit.ts` registry feeds `guardrails`/`quality`; current README shows existing executable blueprints. | Defer first-class audit registration until after canonical executable blueprints are backfilled. |
| F6 | MEDIUM | Existing evidence helpers can be reused only by style. | `src/blueprint/evidence.ts` is task completion evidence with `test`, `integration`, `audit`, and `manual` kinds. | Add separate Trust Dossier evidence validators. |
| F7 | MEDIUM | Scaffold/template surfaces mention blueprint shape. | `docs/templates/blueprint.md`, `catalog/docs/templates/blueprint.md`, `docs/templates/blueprint.yaml`, `catalog/docs/templates/blueprint.yaml`, and `src/cli/commands/init/scaffold-blueprints.ts` exist. | Exact files are named in scaffold task. |
| F8 | LOW | Verification routing. | MCP `wp_audit`/blueprint tools are available for supported operations; future `blueprint-trust` and some skill/sync checks are CLI-only until wired. | Verification text uses CLI-canonical commands and instructs agents to prefer matching MCP `wp_*` tools when available. |

## Key Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| State semantics | Redefine `planned` as a hard Definition of Ready. | Lifecycle state should communicate operational trust. |
| Proof location | Required Trust Dossier section inside executable blueprint documents. | Keeps proof DRY and reviewable; no sidecars or signing for v1. |
| Audit shape | One hard repo audit kind: `blueprint-trust`. | Cohesive validation without overloading lifecycle checks. |
| Activation order | Implement validator and backfill first; register the hard audit after baseline is clean. | Prevents a half-landed branch from failing all guardrails before existing executable blueprints have dossiers. |
| Evidence scope | Material claims and material decisions only. | Avoids tracking every prose sentence. |
| Evidence implementation | Build dossier evidence under `src/blueprint/trust/`; do not change task evidence kinds. | Existing evidence is task-completion anti-forgery. |
| Promotion surface | Gate CLI `promote`, recovery `move --force-recovery`, MCP `wp_blueprint_promote`, and MCP `wp_blueprint_transition` through one service. | Repo inspection shows separate bypassable paths today. |
| Promotion gate commands | Allowlist repo `wp` facade commands, parse to argv, reject shell syntax, and execute from repo root. | Keeps proof execution deterministic and avoids shell injection or arbitrary command execution. |
| Metadata format | `verified-at` = `new Date().toISOString()`; `verified-head` = full `git rev-parse HEAD` SHA; fail closed if HEAD is unavailable. | Matches ISO evidence style and avoids ambiguous short SHAs. |
| Waivers | No waiver, exception, bypass, or manual attestation for `draft → planned`. | A hard trust state cannot have a soft alternate path. |
| Backfill scope | Backfill only canonical executable blueprint files (`*.md` and `_overview.md` that actually exist) under `planned/`, `in-progress/`, and `completed/`. | Avoids support-note churn and zero-match globs. |

## Proposed Trust Dossier contract

Required for `planned | in-progress | completed` blueprints after this blueprint
ships:

```markdown
## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: <ISO-8601 timestamp>
- verified-head: <full git commit SHA>
- trust-gate-version: <version string>

### Material Claims

| ID | Claim | Evidence |
| -- | ----- | -------- |
| C1 | <architecturally significant claim> | repo:<path>; web:<url> (<YYYY-MM-DD>); derived:C2,C3 |

### Material Decisions

| ID | Decision | Chosen option | Rejected alternatives | Rationale |
| -- | -------- | ------------- | --------------------- | --------- |
| D1 | <significant decision> | <choice> | <alternatives> | <why> |

### Promotion Gates

| Gate | Command | Expected outcome | Last result |
| ---- | ------- | ---------------- | ----------- |
| <name> | <command> | <expected pass condition> | pass at <ISO-8601 timestamp> |

### Residual Unknowns

None.
```

## Promotion gate execution contract

Promotion Gates are proof commands, not a general shell escape hatch:

- Allowed commands are repo `wp` facade commands only, such as `wp audit <kind>`,
  `wp test --file ...`, `wp typecheck`, `wp lint`, and `wp sync --check`.
- The runner parses commands to argv and executes without a shell.
- Reject environment assignments, pipes, redirects, `&&`, `||`, semicolons,
  command substitution, `--fix`, unknown binaries, and unknown `wp` subcommands.
- Execute from the repository root with bounded stdout/stderr summaries.
- Validate candidate Markdown as planned in memory before gate execution.
- On failure, do not mutate Markdown, move files, or re-ingest projection state.
- On success, write `verified-at`, `verified-head`, and all gate `Last result`
  values, revalidate the updated Markdown, then persist/move/re-ingest under the
  existing Markdown mutation lock.

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| ---- | ----- | ------------ | -------------- | ---------------- |
| **Wave 0** | 1.1, 1.2, 1.3, 2.1, 3.1 | None | 5 agents | XS-S |
| **Wave 1** | 3.2, 3.3 | Task 3.1 | 2 agents | S |
| **Wave 2** | 3.4 | Tasks 3.2, 3.3 | 1 agent | S |
| **Wave 3** | 3.5, 4.1 | Task 3.4 | 2 agents | S-M |
| **Wave 4** | 4.2, 4.4 | Task 4.1 | 2 agents | S-M |
| **Wave 5** | 4.3, 4.5 | Tasks 4.2 and/or 4.4 | 2 agents | S-M |
| **Wave 6** | 5.1, 5.2 | Tasks 3.5, 4.2, 4.3, 4.4, 4.5 | 2 agents | M |
| **Wave 7** | 5.3 | Tasks 5.1, 5.2 | 1 agent | M |
| **Wave 8** | 5.4 | Task 5.3 | 1 agent | S |
| **Wave 9** | 5.5 | Task 5.4 | 1 agent | S |
| **Critical path** | 3.1 → 3.2 → 3.4 → 4.1 → 4.2 → 4.3 → 5.1 → 5.3 → 5.4 → 5.5 | — | 10 waves | L |

### Parallel Metrics Snapshot

| Metric | Formula / Meaning | Target | Actual |
| ------ | ----------------- | ------ | ------ |
| RW0 | Ready tasks in Wave 0 | ≥ planned agents / 2 | 5 ready tasks for 4 planned agents |
| CPR | total_tasks / critical_path_length | ≥ 2.5 | 19 / 10 = 1.9 |
| DD | dependency_edges / total_tasks | ≤ 2.0 | 29 / 19 = 1.53 |
| CP | same-file overlaps per wave | 0 | 0 after serializing CLI recovery behind normal CLI promotion |

**Parallelization score:** C. RW0, DD, and CP are healthy, but CPR misses target
because trust parser → validator → promotion → backfill → activation is
intentionally serialized to keep guardrails green and avoid shared-file conflicts.
Do not chase an A score by registering the hard audit before backfill.

## Phases

### Phase 1: Define the hard lifecycle contract [Complexity: M]

#### [docs] Task 1.1: Reframe lifecycle semantics

- [ ] **Status:** todo
- **Depends:** None
- **Files:**
  - Modify: `docs/lifecycle.md`
  - Modify: `blueprints/README.md`
- **Change:** Replace soft readiness wording with the hard Definition of Ready
  for `planned/`; preserve `draft/` as the only state with open questions,
  material unknowns, and unverifiable claims. Update command examples to reflect
  current reality: normal execution uses `wp blueprint start`, normal promotion
  uses the structured mutation path, and recovery `move` stays recovery-only
  unless deliberately changed.
- **Verify:** `wp audit blueprint-lifecycle`; `wp audit blueprint-readme-drift`
- **Acceptance:**
  - [ ] `docs/lifecycle.md` describes `planned/` as execution-ready with zero material unknowns.
  - [ ] `blueprints/README.md` does not describe `planned/` as merely scoped or committed-to.
  - [ ] Command examples do not imply an ungated normal `wp blueprint move <slug> planned` path.

#### [docs] Task 1.2: Specify the Trust Dossier format

- [ ] **Status:** todo
- **Depends:** None
- **Files:**
  - Modify: `docs/blueprint-format.md`
- **Change:** Add the required Trust Dossier schema for executable blueprints,
  clarify material-claim/material-decision scope, correct stale task dependency
  wording from `**Depends on:**` to `**Depends:**`, and document evidence
  syntaxes: `repo:<path>`, `web:<url> (<YYYY-MM-DD>)`, and
  `derived:<claim-id>[,<claim-id>]`.
- **Verify:** `wp audit blueprint-lifecycle`; `wp lint --file docs/blueprint-format.md`
- **Acceptance:**
  - [ ] The format spec lists the five dossier subsections.
  - [ ] `Residual Unknowns` must be exactly `None.` for planned/in-progress/completed blueprints.
  - [ ] The spec distinguishes Trust Dossier evidence from task completion evidence in `src/blueprint/evidence.ts`.
  - [ ] Task dependency examples use the parser-supported `**Depends:**` spelling.

#### [scaffold] Task 1.3: Update templates and scaffold copy

- [ ] **Status:** todo
- **Depends:** None
- **Files:**
  - Modify: `docs/templates/blueprint.md`
  - Modify: `catalog/docs/templates/blueprint.md`
  - Modify: `docs/templates/blueprint.yaml`
  - Modify: `catalog/docs/templates/blueprint.yaml`
  - Modify: `src/cli/commands/init/scaffold-blueprints.ts`
  - Modify: `src/cli/commands/init/init.integration.test.ts`
- **Change:** Update template guidance, YAML template descriptors, and
  first-time scaffold README text so new repos learn that `planned/` is a hard
  trust state. Keep `.gitkeep` behavior unchanged. If template changes are
  catalog owned, update both catalog and projected docs template and verify sync.
- **Verify:** `wp test --file src/cli/commands/init/init.integration.test.ts`; `wp sync --check`
- **Acceptance:**
  - [ ] Newly scaffolded README text describes `planned/` as execution-ready.
  - [ ] Blueprint templates include a Trust Dossier placeholder or an explicit draft note explaining when the dossier becomes required.
  - [ ] YAML template descriptors include the Trust Dossier section contract.
  - [ ] Template/catalog projection checks pass.

### Phase 2: Make plan refinement produce promotion readiness [Complexity: S]

#### [skill] Task 2.1: Update `plan-refine` contract

- [ ] **Status:** todo
- **Depends:** None
- **Files:**
  - Modify: `catalog/agent/skills/plan-refine/SKILL.md`
- **Change:** Require `plan-refine` to complete the Trust Dossier when the gate
  exists, evidence material claims, close material decisions, define promotion
  gates, and emit a binary `planned-eligible` / `not-planned-eligible` verdict.
  Preserve current validator compatibility: task blocks use `**Status:**`,
  `**Depends:**`, `**Files:**`, `**Change:**`, `**Verify:**`, and
  `**Acceptance:**` unless validators change in the same work.
- **Verify:** `wp audit catalog-drift`; `wp sync --check`
- **Acceptance:**
  - [ ] The skill rejects speculative abstractions, unverifiable material claims, and "decide during implementation" placeholders.
  - [ ] The skill says not to require a Trust Dossier for blueprints implementing the future gate before it exists.
  - [ ] The final response contract includes the binary verdict.

### Phase 3: Add `blueprint-trust` validator and local audit wrapper [Complexity: L]

#### [trust] Task 3.1: Implement Trust Dossier parser and types

- [ ] **Status:** todo
- **Depends:** None
- **Files:**
  - Create: `src/blueprint/trust/dossier.ts`
  - Create: `src/blueprint/trust/dossier.test.ts`
  - Modify: `src/blueprint/index.ts`
- **Change:** Parse `## Trust Dossier` and its five required subsections from
  blueprint Markdown. Return typed structures for readiness verdict, material
  claims, material decisions, promotion gates, and residual unknowns. Keep this
  parser pure: no filesystem reads, command execution, or promotion side effects.
  Export only pure parser/types from Workers-safe public modules.
- **Verify:** `wp test --file src/blueprint/trust/dossier.test.ts`; `wp typecheck`
- **Acceptance:**
  - [ ] Missing dossier and missing subsection cases produce section-specific errors.
  - [ ] Valid minimal dossier parses with stable typed output.
  - [ ] Placeholder markers such as `<...>` are surfaced as validation issues.
  - [ ] Headings inside fenced code blocks are ignored; a blueprint whose only `## Trust Dossier` appears in an example fence fails as missing dossier.
  - [ ] Duplicate subsection headings and malformed/extra table columns are rejected with section-specific errors.

#### [trust] Task 3.2: Validate repo/web/derived evidence

- [ ] **Status:** todo
- **Depends:** Task 3.1
- **Files:**
  - Create: `src/blueprint/trust/evidence.ts`
  - Create: `src/blueprint/trust/evidence.test.ts`
- **Change:** Validate material-claim evidence syntax. `repo:<path>` resolves
  under repo root and rejects missing paths. `web:<url> (<YYYY-MM-DD>)` requires
  URL and explicit date but does not fetch the network. `derived:<claim-id>[,<claim-id>]`
  references parsed claim IDs and must not create cycles.
- **Verify:** `wp test --file src/blueprint/trust/evidence.test.ts`; `wp typecheck`
- **Acceptance:**
  - [ ] Tests cover missing repo paths, path escapes, absolute paths, empty evidence cells, multiple evidence tokens in one cell, missing web dates, invalid URLs, unknown derived IDs, derived self-reference, and cycles.
  - [ ] Duplicate material-claim IDs are rejected.
  - [ ] Web evidence validation is deterministic and offline.
  - [ ] Evidence errors identify the failed material claim ID.

#### [trust] Task 3.3: Validate ambiguity and unresolved content

- [ ] **Status:** todo
- **Depends:** Task 3.1
- **Files:**
  - Create: `src/blueprint/trust/ambiguity.ts`
  - Create: `src/blueprint/trust/ambiguity.test.ts`
- **Change:** Detect banned ambiguity language in execution-bearing sections:
  tasks, material decisions, promotion gates, and residual unknowns. Limit
  scanning to these sections to avoid false positives in background prose, risk
  descriptions, or normal task status values.
- **Verify:** `wp test --file src/blueprint/trust/ambiguity.test.ts`; `wp typecheck`
- **Acceptance:**
  - [ ] Tests reject `TBD`, `TODO`, `decide during implementation`, `open question`, and placeholder angle-bracket values in execution sections.
  - [ ] Tests allow the same words in historical/refinement prose when not actionable.
  - [ ] Tests do not reject normal task status lines.
  - [ ] Residual unknowns must be exactly `None.` for executable states.

#### [trust] Task 3.4: Compose the trust validator

- [ ] **Status:** todo
- **Depends:** Task 3.2, Task 3.3
- **Files:**
  - Create: `src/blueprint/trust/validator.ts`
  - Create: `src/blueprint/trust/validator.test.ts`
- **Change:** Compose parser, evidence validation, ambiguity validation,
  readiness verdict checks, material decision checks, and promotion gate result
  checks into one `validateBlueprintTrust` API accepting repo root, blueprint
  path, blueprint status, Markdown content, and a promotion-candidate flag.
- **Verify:** `wp test --file src/blueprint/trust/validator.test.ts`; `wp typecheck`
- **Acceptance:**
  - [ ] Draft blueprints can opt out unless explicitly validated as promotion candidates.
  - [ ] Planned/in-progress/completed blueprints require a valid dossier.
  - [ ] Nonzero `unresolved-count`, `promotion-ready: false`, missing decisions, or non-pass gate rows produce actionable errors.
  - [ ] Fixture matrix covers every Trust Dossier failure class and snapshots normalized violations as `{ file, section, claimId?, message }`.

#### [audit] Task 3.5: Add repo audit wrapper without hard registry activation

- [ ] **Status:** todo
- **Depends:** Task 3.4
- **Files:**
  - Create: `src/audit/blueprint-trust.ts`
  - Create: `src/audit/blueprint-trust.test.ts`
- **Change:** Add a RepoAuditResult-shaped wrapper that scans canonical
  executable blueprints under `blueprints/planned`, `blueprints/in-progress`,
  and `blueprints/completed`, delegates to `validateBlueprintTrust`, and reports
  file/section-specific violations. Keep the wrapper importable by tests and
  promotion code, but do not add it to the CLI/MCP hard audit registry until
  after backfill.
- **Verify:** `wp test --file src/audit/blueprint-trust.test.ts`; `wp typecheck`
- **Acceptance:**
  - [ ] The audit ignores `blueprints/draft/**` during normal repo-wide audit.
  - [ ] The audit fails executable blueprints with absent or malformed dossiers.
  - [ ] The audit report includes file path and failed subsection.
  - [ ] Repo-wide audit fixture includes one valid planned blueprint, one invalid planned blueprint, one invalid draft blueprint that is ignored, and one draft promotion candidate validated explicitly.

### Phase 4: Gate promotion on proof execution [Complexity: L]

#### [promotion] Task 4.1: Create shared promotion trust service

- [ ] **Status:** todo
- **Depends:** Task 3.4
- **Files:**
  - Create: `src/blueprint/trust/promotion.ts`
  - Create: `src/blueprint/trust/promotion.test.ts`
- **Change:** Implement a shared service for `draft → planned` candidates that
  validates lifecycle format and Trust Dossier content, enforces the Promotion
  Gate command contract, runs declared gates from repo root, reads full
  `git rev-parse HEAD`, writes `verified-at`, `verified-head`, and gate
  `Last result` values into Markdown, then returns updated content for callers
  to persist under their existing locks.
- **Verify:** `wp test --file src/blueprint/trust/promotion.test.ts`; `wp typecheck`
- **Acceptance:**
  - [ ] Success tests prove metadata and gate results are written before callers move the file.
  - [ ] Failure tests cover missing git HEAD, invalid dossier, nonzero unresolved count, failing gate command, missing command, rejected shell syntax, rejected `--fix`, and output bounding.
  - [ ] Gate commands execute from repo root without a shell.
  - [ ] Failure does not mutate Markdown or move files.
  - [ ] The service has no CLI/MCP-specific output formatting.

#### [cli] Task 4.2: Gate normal CLI promotion

- [ ] **Status:** todo
- **Depends:** Task 4.1
- **Files:**
  - Modify: `src/cli/commands/blueprint/mutations.ts`
  - Modify: `src/cli/commands/blueprint/mutations.test.ts`
  - Modify: `src/cli/commands/blueprint/router-output.ts`
  - Modify: `src/cli/commands/blueprint/router-output.test.ts`
- **Change:** For `wp blueprint promote <slug> planned`, call the shared
  promotion trust service before any filesystem move. Persist returned Markdown,
  then move/re-ingest only if trust succeeds. Update help/output so public
  command guidance names `promote` consistently. Preserve the existing
  completion gate for `completed`.
- **Verify:** `wp test --file src/cli/commands/blueprint/mutations.test.ts --file src/cli/commands/blueprint/router-output.test.ts`
- **Acceptance:**
  - [ ] `draft → planned` fails before move when validation or any declared Promotion Gate fails.
  - [ ] Successful promotion writes verification metadata and re-ingests the projection DB.
  - [ ] Existing `planned → completed` behavior remains unchanged except shared imports if needed.
  - [ ] CLI help lists the normal promotion command and does not imply recovery move is the normal path.

#### [cli] Task 4.3: Gate recovery `move` path

- [ ] **Status:** todo
- **Depends:** Task 4.2
- **Files:**
  - Modify: `src/cli/commands/blueprint/router.ts`
  - Modify: `src/cli/commands/blueprint/router-dispatch.test.ts`
- **Change:** Ensure recovery-only `wp blueprint move <slug> planned --force-recovery`
  cannot bypass trust validation for `draft → planned`. If recovery moves should
  stay raw, explicitly reject this transition through `move` and instruct
  operators to use `wp blueprint promote`.
- **Verify:** `wp test --file src/cli/commands/blueprint/router-dispatch.test.ts`
- **Acceptance:**
  - [ ] Tests prove recovery move cannot create a planned blueprint without a valid dossier.
  - [ ] Error text names the supported promotion command or failed trust subsection.
  - [ ] Other recovery moves retain current behavior.

#### [mcp] Task 4.4: Gate MCP promote and transition paths

- [ ] **Status:** todo
- **Depends:** Task 4.1
- **Files:**
  - Modify: `src/mcp/blueprint-server.ts`
  - Modify: `src/mcp/blueprint-server.transition.test.ts`
  - Modify: `src/mcp/blueprint-server.platform-first.lifecycle.test.ts`
  - Modify: `src/mcp/blueprint-workflow.integration.test.ts`
- **Change:** For both `wp_blueprint_promote` and `wp_blueprint_transition`
  requests moving `draft → planned`, reuse the shared promotion trust service
  before local transition. Preserve stale revision checks, project resolution,
  projection ingest, and completed-state open-task validation.
- **Verify:** `wp test --file src/mcp/blueprint-server.transition.test.ts --file src/mcp/blueprint-server.platform-first.lifecycle.test.ts --file src/mcp/blueprint-workflow.integration.test.ts`
- **Acceptance:**
  - [ ] MCP promote and MCP transition refuse the same invalid dossiers and failing gates as CLI promotion.
  - [ ] MCP success responses include new revision/content hash after metadata is written and ingested.
  - [ ] Stale revision failures happen before trust gate execution.
  - [ ] Tests prove neither MCP lifecycle tool bypasses the Trust Dossier requirement.

#### [qa] Task 4.5: Add CLI/MCP promotion parity matrix

- [ ] **Status:** todo
- **Depends:** Task 4.2, Task 4.4
- **Files:**
  - Modify: `src/cli/commands/blueprint/mutations.test.ts`
  - Modify: `src/mcp/blueprint-workflow.integration.test.ts`
- **Change:** Add a shared fixture matrix proving the same dossier/gate inputs
  produce equivalent outcomes through CLI promotion, MCP promote, and MCP
  transition. Use valid dossier, missing dossier, malformed dossier, failing
  Promotion Gate, stale MCP revision, and recovery move fixtures.
- **Verify:** `wp test --file src/cli/commands/blueprint/mutations.test.ts --file src/mcp/blueprint-workflow.integration.test.ts`
- **Acceptance:**
  - [ ] Same valid fixture succeeds through CLI and both MCP lifecycle tools.
  - [ ] Same invalid dossier fails with equivalent file/subsection evidence.
  - [ ] Same failing Promotion Gate fails before any move through every path.
  - [ ] MCP stale revision still fails before trust gate execution.

### Phase 5: Backfill, activate hard audit, and verify baseline [Complexity: L]

#### [blueprints] Task 5.1: Backfill current planned blueprints

- [ ] **Status:** todo
- **Depends:** Task 3.5, Task 4.2, Task 4.3, Task 4.4, Task 4.5
- **Files:**
  - Modify: `blueprints/planned/*.md`
- **Change:** Backfill canonical planned blueprint documents until each Trust
  Dossier is complete and all material claims, decisions, residual unknowns, and
  gate rows pass. Do not touch `draft/` blueprints unless they are being promoted
  in the same change.
- **Verify:** targeted `blueprint-trust` validator tests or temporary direct wrapper invocation; `wp audit blueprint-lifecycle`; `wp audit blueprint-readme-drift`
- **Acceptance:**
  - [ ] Every existing `blueprints/planned/*.md` file has a valid dossier.
  - [ ] Backfilled claims cite only repo paths that exist or web evidence with dates.
  - [ ] `blueprints/README.md` remains current.

#### [blueprints] Task 5.2: Backfill completed flat blueprints

- [ ] **Status:** todo
- **Depends:** Task 3.5, Task 4.5
- **Files:**
  - Modify: `blueprints/completed/*.md`
- **Change:** Backfill canonical completed flat blueprint documents. Batch the
  work by file cluster if the final implementation wants smaller PR slices, but
  keep the acceptance bar identical: valid dossier, zero residual unknowns, and
  passing recorded gates.
- **Verify:** targeted `blueprint-trust` validator tests or temporary direct wrapper invocation; `wp audit blueprint-lifecycle`
- **Acceptance:**
  - [ ] Every existing `blueprints/completed/*.md` file has a valid dossier.
  - [ ] Completed dossiers do not reopen implementation questions.

#### [blueprints] Task 5.3: Backfill completed overview blueprints and conditional executable matches

- [ ] **Status:** todo
- **Depends:** Task 5.1, Task 5.2
- **Files:**
  - Modify: `blueprints/completed/**/_overview.md`
  - Modify existing matches if present: `blueprints/planned/**/_overview.md`
  - Modify existing matches if present: `blueprints/in-progress/*.md`
  - Modify existing matches if present: `blueprints/in-progress/**/_overview.md`
- **Change:** Backfill canonical `_overview.md` executable blueprints and any
  in-progress/planned nested canonical files that exist at implementation time.
  Do not manufacture zero-match files solely to satisfy globs.
- **Verify:** targeted `blueprint-trust` validator tests or temporary direct wrapper invocation; `wp audit blueprint-lifecycle`; `wp audit blueprint-readme-drift --fix` if the index changes
- **Acceptance:**
  - [ ] Every existing executable `_overview.md` file has a valid dossier.
  - [ ] Zero-match lifecycle globs are documented as no-ops, not failures.
  - [ ] `blueprints/README.md` is regenerated if lifecycle/index content changes.

#### [dispatch] Task 5.4: Activate `blueprint-trust` in CLI and MCP audit surfaces

- [ ] **Status:** todo
- **Depends:** Task 5.3
- **Files:**
  - Modify: `src/cli/commands/audit.ts`
  - Modify: `src/cli/commands/audit-core.test.ts`
  - Modify: `src/mcp/tools/_shared/audit-kinds.ts`
  - Modify: `src/mcp/tools/audit.ts`
  - Modify: `src/mcp/tools/audit.test.ts`
- **Change:** Register `blueprint-trust` as a first-class hard audit kind in CLI
  and MCP only after backfill is complete. Keep outputs RepoAuditResult-shaped
  and ensure unknown-kind help lists include the new kind.
- **Verify:** `wp test --file src/cli/commands/audit-core.test.ts --file src/mcp/tools/audit.test.ts`; `wp audit blueprint-trust`
- **Acceptance:**
  - [ ] `wp audit blueprint-trust` and MCP `wp_audit({ kind: "blueprint-trust" })` run the same validator.
  - [ ] Both surfaces return equivalent failure summaries for the same malformed dossier fixture.
  - [ ] `src/mcp/tools/_shared/audit-kinds.ts` contains `blueprint-trust`.
  - [ ] Unknown-kind messages and enum validation include the new audit kind.

#### [qa] Task 5.5: Run final verification and package-surface checks

- [ ] **Status:** todo
- **Depends:** Task 5.4
- **Files:**
  - Modify: `blueprints/planned/2026-06-11-planned-trust-gate.md` if closeout evidence is recorded
- **Change:** Run the narrowest complete QA set for changed docs, skill,
  templates, audit, CLI, MCP, and blueprint fixtures. Because this blueprint
  changes public package surfaces (`catalog/`, docs templates, CLI/MCP audit
  kinds, and package-exported blueprint modules), include package-surface and
  sync checks.
- **Verify:** `wp audit blueprint-trust`; `wp audit blueprint-lifecycle`; `wp audit blueprint-readme-drift`; `wp audit package-surface`; `wp audit catalog-drift`; `wp sync --check`; `wp typecheck`; `wp lint`; `wp test`
- **Acceptance:**
  - [ ] All verification commands pass or blockers are recorded with exact command output.
  - [ ] Public package surface audit passes and excludes private/generated agent runtime state.
  - [ ] Completion report includes commands/tools run, pass/fail evidence, and any remaining blockers.

## Verification Gates

Verification commands below are CLI-canonical. Agents should use MCP
`wp_audit`, `wp_test`, `wp_lint`, and `wp_typecheck` when available, falling
back to the equivalent direct `wp ...` CLI command. Never route these through
package-manager wrappers.

| Gate | Command | Success Criteria |
| ---- | ------- | ---------------- |
| Blueprint lifecycle | `wp audit blueprint-lifecycle` | Zero lifecycle violations |
| Blueprint README drift | `wp audit blueprint-readme-drift` | Generated blueprint index is current |
| Blueprint trust | `wp audit blueprint-trust` | Available after Task 5.4; all executable blueprints have valid Trust Dossiers |
| Catalog drift | `wp audit catalog-drift` | Generated skill/catalog surfaces are synced |
| Package surface | `wp audit package-surface` | Public package contents include intended docs/catalog/code only |
| Type safety | `wp typecheck` | Zero TypeScript errors |
| Lint | `wp lint` | Zero lint violations |
| Tests | `wp test` | Affected and regression tests pass |
| Sync | `wp sync --check` | Generated agent surfaces match catalog sources |

## Closed Refinement Decisions

| Former open question | Closed decision | Evidence |
| -------------------- | --------------- | -------- |
| Which evidence helpers should repo/web/derived validators reuse? | Create separate Trust Dossier evidence validators under `src/blueprint/trust/evidence.ts`; reuse Zod/canonicalization style, not task evidence kinds. | `src/blueprint/evidence.ts` is task evidence only. |
| What timestamp and commit format should promotion write? | `verified-at` uses `new Date().toISOString()`; `verified-head` uses the full SHA from `git rev-parse HEAD`; fail closed when HEAD cannot be read. | `src/blueprint/evidence.ts` requires ISO-8601 parseable timestamps. |
| Which audits are part of promotion today? | Compose current lifecycle/README/frontmatter checks where relevant, declared Promotion Gates, and new `blueprint-trust`; do not invent a roadmap/frontmatter promotion service. | `src/cli/commands/audit.ts` registry lists current repo-level audit kinds. |
| Minimal fixture set for CLI/MCP parity? | Use valid dossier, missing dossier, malformed dossier, failing Promotion Gate, stale MCP revision, and recovery move fixtures across CLI promotion, MCP promote, and MCP transition. | CLI and MCP lifecycle tests exist at `src/cli/commands/blueprint/mutations.test.ts`, `src/mcp/blueprint-server.transition.test.ts`, and `src/mcp/blueprint-workflow.integration.test.ts`. |
| Whether this blueprint should stay planned after critique? | Yes, after applying critique fixes: the plan is executable under current lifecycle rules and explicitly scopes future hard trust semantics. | Current `wp_blueprint_validate`, `blueprint-lifecycle`, and README drift audits pass after promotion; team blockers are addressed in this revision. |

## Cross-Plan References

| Blueprint | Relationship | Required alignment |
| --------- | ------------ | ------------------ |
| None | Local standalone governance blueprint | No upstream blueprint must land first. |

## Edge Cases and Error Handling

| ID | Edge Case | Risk | Solution | Task |
| -- | --------- | ---- | -------- | ---- |
| E1 | `blueprint-trust` is referenced before it exists. | Current audits fail with unknown kind. | Only require the command after Task 5.4; this meta-plan stays under current lifecycle rules until then. | Task 5.4 |
| E2 | CLI normal promotion, CLI recovery move, MCP promote, and MCP transition diverge. | A bypass can create untrusted planned blueprints. | Shared promotion service plus parity tests on all four paths. | Tasks 4.1-4.5 |
| E3 | Trust Dossier evidence accidentally changes task completion evidence semantics. | Existing task verification anti-forgery could regress. | Keep dossier evidence in `src/blueprint/trust/` and avoid modifying `src/blueprint/evidence.ts`. | Tasks 3.1-3.4 |
| E4 | Web evidence validation performs network fetches during repo audit. | Audits become slow/flaky and violate local determinism. | Validate URL/date syntax only; fact-checking remains a plan-refine producer responsibility. | Task 3.2 |
| E5 | Ambiguity detector flags harmless historical prose. | Backfill becomes noisy. | Scope banned language to execution-bearing sections and exempt normal task status values. | Task 3.3 |
| E6 | Backfilling all executable blueprints causes broad churn. | Hard to review and may conflict with unrelated work. | Split planned, completed-flat, and completed-overview backfill tasks; activate audit only after backfill. | Tasks 5.1-5.4 |
| E7 | Example Trust Dossier fence is parsed as a real dossier. | Templates or docs can falsely pass. | Parser ignores headings inside fenced code blocks. | Task 3.1 |
| E8 | Promotion gate command strings become shell execution. | Security risk and nondeterministic gates. | Allowlist `wp` argv grammar and reject shell metacharacters/env/redirects/`--fix`. | Task 4.1 |

## Non-goals

- Adding a new lifecycle state.
- Creating a sidecar proof database or separate attestation file.
- Adding cryptographic signing, notarization, or provenance infrastructure.
- Tracking every prose sentence as a claim.
- Performing network fetches during `wp audit blueprint-trust`.
- Exporting command-running promotion code through Workers-safe public modules.
- Allowing waivers, manual attestations, bypass flags, or warning-only trust
  failures for `planned/`.

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Backfilling executable blueprints reveals real gaps. | HIGH | Treat failures as real blockers and split backfill into reviewable lifecycle batches. |
| Hard audit is activated before backfill. | HIGH | Keep registry/MCP activation in Task 5.4 after backfill tasks. |
| Promotion Gate execution is slow or unsafe. | HIGH | Keep gates explicit, allowlisted, argv-only, bounded, and non-shell. |
| Ambiguity detection false-positives. | MEDIUM | Limit scanning to execution-bearing sections and add allowed-prose fixtures. |
| Shared promotion service becomes too broad. | MEDIUM | Keep it focused on `draft → planned`; leave start/finalize behavior in existing lifecycle code. |
| Public package leak through catalog/docs/template changes. | HIGH | Require `wp audit package-surface`, `wp audit catalog-drift`, and `wp sync --check`. |

## Technology Choices

| Component | Technology | Version | Why |
| --------- | ---------- | ------- | --- |
| Trust parsing/validation | TypeScript + Zod-style validation | Existing repo stack | Matches current TypeScript/Zod conventions. |
| Repo audit output | Existing RepoAuditResult shape | Current code | Integrates with CLI audit and MCP `wp_audit`. |
| Evidence URI syntax | `repo:`, `web:`, `derived:` strings in Markdown tables | v1 internal contract | Human-reviewable and keeps Markdown canonical. |
| Promotion gate runner | Parsed argv for allowlisted `wp` commands | v1 internal contract | Avoids shell execution while reusing repo command facades. |
| Promotion metadata | ISO timestamp + full git SHA | v1 internal contract | Deterministic without signing infrastructure. |
| Verification command surface | MCP `wp_*` tools when available, direct `wp` CLI fallback | Current repo rule | Matches repo routing while keeping blueprint commands operator-readable. |

## Refinement Summary

| Metric | Value |
| ------ | ----- |
| Findings total | 27 |
| Critical | 0 |
| High | 12 |
| Medium | 11 |
| Low | 4 |
| Fixes applied | 27/27 |
| Open questions closed | 4/4 |
| Cross-plans updated | 0 |
| Edge cases documented | 8 |
| Risks documented | 6 |
| Technology choices documented | 6 |
| Parallelization score | C (intentional safety serialization) |
| Critical path | 10 waves |
| Max parallel agents | 4 |
| Total tasks | 19 |
| Blueprint compliant | 19/19 task blocks use current `**Status:**` / `**Depends:**` / `**Files:**` / `**Change:**` / `**Verify:**` / `**Acceptance:**` shape |
| Team critique verdict | Initial reject/partial confidence findings incorporated; no known hard blocker remains under current lifecycle rules |
