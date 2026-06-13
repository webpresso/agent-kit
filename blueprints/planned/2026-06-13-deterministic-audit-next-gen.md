---
type: blueprint
title: "Next-gen deterministic audit improvements: metadata, SARIF, diff-aware reporting"
owner: ozby
status: planned
complexity: L
created: "2026-06-13"
last_updated: "2026-06-13"
progress: "0% (planned; research-backed draft, tasks unstarted)"
tags:
  - audit
  - deterministic
  - sarif
  - ci
  - autofix
---

# Next-gen deterministic audit improvements: metadata, SARIF, diff-aware reporting

## Planning Summary

Agent-kit already has a large deterministic audit surface. The next quality step
is not “make it AI-first,” but “make the deterministic system more ergonomic,
more machine-readable, and more scalable in PR workflows.”

This blueprint improves the current hard-gate audit stack by adding:

- richer finding metadata
- safe autofix expansion
- SARIF export
- diff-aware reporting
- clearer blocking vs signal separation

The goal is to make the current deterministic audits easier to trust, easier to
review, and easier to consume in both CLI and GitHub.

## Refinement Notes (2026-06-13)

- Refined against current repo reality after inspecting the live audit registry,
  shared `RepoAuditViolation` / `RepoAuditResult` contract, current
  `changedOnly` plumbing, and existing audit-specific severity/rule metadata.
- Outside-voice Claude review highlighted four important plan gaps that were
  folded in:
  1. add a backward-compat regression harness before expanding the shared audit contract
  2. decouple diff-aware reporting from SARIF generation
  3. sharpen SARIF acceptance to real GitHub-ingestible SARIF 2.1.0 requirements
  4. name concrete safe-autofix seed candidates instead of leaving autofix scope vague
- The blueprint now treats deterministic audit hardening as the foundation that
  any future AI-assisted audit lane should sit on top of.

## Fact-Check Summary

| ID | Severity | Claim checked | Repo evidence | Planning consequence |
| -- | -------- | ------------- | ------------- | -------------------- |
| F1 | HIGH | Audit registration already has a single dispatch surface. | `src/cli/commands/audit.ts`, `src/cli/commands/audit-core.ts`. | Improvements should layer into the existing audit framework, not build a second one. |
| F2 | HIGH | Some deterministic audits already support `--fix`. | `src/audit/blueprint-readme-drift.ts`, wired through `audit.ts`. | Expand safe autofix patterns rather than inventing a new fixer system. |
| F3 | HIGH | The shared audit finding contract is still shallow. | `src/audit/repo-guardrails.ts` defines `RepoAuditViolation` as `{ file?: string; message: string }`. | Treat richer metadata as a real shared-contract expansion, not as already-landed capability. |
| F4 | MEDIUM | Severity and rule-style metadata already exist in some audit-specific paths. | Examples: `src/audit/hook-vendor-drift.ts`, `src/audit/bucket-boundary.ts`, `src/audit/package-surface.ts`, TPH detectors. | Normalize upward from existing pockets of structure instead of inventing a second parallel format. |
| F5 | MEDIUM | Diff-aware audit plumbing partially exists already. | `src/cli/commands/audit-core.ts` and `src/cli/commands/audit.ts` already carry `changedOnly` through some audit paths such as `bucket-boundary`. | The deterministic plan should standardize and broaden `--changed-only`, not claim it is net-new everywhere. |
| F6 | MEDIUM | MCP/CLI result surfaces already prefer structured output. | `src/mcp/tools/audit.ts`, summary-result helpers. | Normalized richer metadata can feed both CLI and MCP naturally. |
| F7 | HIGH | External best practice strongly supports deterministic CI gates plus machine-readable reporting. | Semgrep/reviewdog/GitHub SARIF/Biome patterns. | Prioritize SARIF + diff-aware reporting + safe autofix before any AI hard gating. |

## Scope

### In scope
- enrich deterministic audit metadata
- add SARIF export path
- add diff-aware / changed-only reporting modes
- expand safe autofix for structural audits
- clarify blocking vs signal audit classes

### Out of scope
- replacing deterministic audits with AI
- full code scanning platform rearchitecture
- retrofitting every audit in one giant commit

## Architecture Notes

- The current audit registry is already the right backbone.
- The best leverage point is the shared audit result contract:
  - `RepoAuditResult`
  - `RepoAuditViolation`
  - shared CLI/MCP formatting
- Some audits already carry richer internal findings (`severity`, `rule`, or
  equivalent) before flattening to the shared contract; the right move is to
  normalize that information upward instead of rebuilding it in every caller.
- SARIF export should be built from those normalized result objects, not from
  bespoke string scraping.
- Diff-aware review output should preserve full-scan truth while reducing PR
  noise.
- This blueprint should stay compatible with the existing `wp audit guardrails`
  aggregation path so new metadata/reporting does not weaken current merge-gate
  behavior.

## Quick Reference

| Wave | Tasks | Dependencies | Parallelizable | Effort |
| ---- | ----- | ------------ | -------------- | ------ |
| 0 | 0.1, 1.1, 1.2, 1.3 | None | Yes | S |
| 1 | 2.1, 2.2 | 0.1, 1.1, 1.2, 1.3 | Yes | M |
| 2 | 3.1, 3.2 | 1.1, 1.2, 2.1, 2.2 | Yes | M |
| 3 | 4.1, 4.2 | 3.1, 3.2 | Yes | M-L |

## Phases

### Phase 0: Backward-compatibility baseline [Complexity: S]

#### [infra] Task 0.1: Create a regression harness for the current audit result contract

- [ ] **Status:** todo
- **Depends:** None
- **Files:**
  - Create: `/Users/ozby/repos/webpresso/agent-kit/src/audit/__fixtures__/baseline-audit-fixture/`
  - Create: `/Users/ozby/repos/webpresso/agent-kit/src/audit/audit-contract-regression.test.ts`
- **Change:** Capture a fixture repo and run the existing deterministic audit
  surface against it so the shared result-contract expansion can prove it did
  not silently break current audit behavior.
- **Verify:** `wp test --file src/audit/audit-contract-regression.test.ts`
- **Acceptance:**
  - [ ] A fixture-backed baseline exists for current deterministic audit output
  - [ ] The regression harness fails if current audits no longer conform to the expected envelope
  - [ ] Task 1.1 can use this harness as its backward-compatibility proof

### Phase 1: Strengthen the shared audit contract [Complexity: S]

#### [infra] Task 1.1: Expand the shared finding contract with optional metadata

- [ ] **Status:** todo
- **Depends:** None
- **Files:**
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/src/audit/repo-guardrails.ts`
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/src/cli/commands/audit.ts`
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/src/mcp/tools/audit.ts`
- **Change:** Extend `RepoAuditViolation` with optional fields such as
  `severity`, `ruleId`, and `fixable`, then thread them through the shared audit
  formatters without breaking current callers.
- **Verify:** `wp test --file src/cli/commands/audit-core.test.ts --file src/mcp/tools/audit.test.ts`
- **Acceptance:**
  - [ ] Existing audits remain backward-compatible
  - [ ] New metadata is optional but renderable everywhere

#### [infra] Task 1.2: Classify blocking vs signal audits

- [ ] **Status:** todo
- **Depends:** None
- **Files:**
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/src/cli/commands/audit.ts`
  - Create: `/Users/ozby/repos/webpresso/agent-kit/docs/audit-classes.md`
- **Change:** Introduce a clear class model so not every audit has to behave as
  a merge-blocking invariant.
- **Verify:** doc + dispatch tests
- **Acceptance:**
  - [ ] Blocking vs signal classification is explicit
  - [ ] Guardrails aggregation remains deterministic

#### [infra] Task 1.3: Classify which audits are safe for `--changed-only`

- [ ] **Status:** todo
- **Depends:** None
- **Files:**
  - Create: `/Users/ozby/repos/webpresso/agent-kit/docs/audit-changed-only-matrix.md`
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/src/cli/commands/audit.ts`
- **Change:** Explicitly classify each deterministic audit kind as
  `changed-only` safe or full-scan only, with rationale. This prevents a flag
  that silently does nothing or produces semantically unsafe partial audits.
- **Verify:** targeted audit dispatch tests + doc review
- **Acceptance:**
  - [ ] Every deterministic audit kind is classified
  - [ ] `--changed-only` is rejected or ignored explicitly where unsafe
  - [ ] The rationale is documented for future contributors

### Phase 2: Machine-readable and PR-native reporting [Complexity: M]

#### [infra] Task 2.1: Add SARIF export

- [ ] **Status:** todo
- **Depends:** Tasks 0.1, 1.1, 1.2
- **Files:**
  - Create: `/Users/ozby/repos/webpresso/agent-kit/src/audit/sarif.ts`
  - Create: `/Users/ozby/repos/webpresso/agent-kit/src/audit/sarif.test.ts`
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/src/cli/commands/audit.ts`
- **Change:** Support `--sarif <path>` for deterministic audits and guardrail
  composites.
- **Verify:** `wp test --file src/audit/sarif.test.ts`
- **Acceptance:**
  - [ ] SARIF generation works for single-audit and guardrails mode
  - [ ] Output includes required SARIF 2.1.0 envelope fields such as `$schema`, `version`, `runs[].tool.driver.name`, and `runs[].results[].ruleId`
  - [ ] Output is validated against the SARIF schema or a GitHub-ingestion-compatible fixture
  - [ ] At least one fixture proves a deterministic audit can be serialized into a code-scanning-ready result

#### [infra] Task 2.2: Standardize diff-aware reporting

- [ ] **Status:** todo
- **Depends:** Tasks 0.1, 1.1, 1.3
- **Files:**
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/src/cli/commands/audit.ts`
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/src/audit/*` (only where needed)
- **Change:** Standardize `--changed-only` and diff-aware reporting across more
  deterministic audits, using the existing `changedOnly` plumbing where present
  instead of inventing a second switch or separate execution path.
- **Verify:** targeted audit tests + fixture branch
- **Acceptance:**
  - [ ] Contributor runs can limit output to changed files
  - [ ] CI full-scan behavior remains unchanged unless explicitly configured

### Phase 3: Expand safe autofix [Complexity: M]

#### [infra] Task 3.1: Identify and implement safe autofix candidates

- [ ] **Status:** todo
- **Depends:** Tasks 1.1, 1.2
- **Files:**
  - Modify selected existing audits such as:
    - `/Users/ozby/repos/webpresso/agent-kit/src/audit/blueprint-readme-drift.ts`
    - docs/frontmatter-related audit surfaces
    - small generated-surface alignment audits
- **Change:** Expand only semantics-preserving autofixes.
- **Verify:** per-audit fixture tests
- **Acceptance:**
  - [ ] The first concrete autofix targets are named before implementation starts
  - [ ] Safe fixes are explicit and tested
  - [ ] No ambiguous or behavior-changing fixes auto-apply

**Seed candidates to validate first:**
- `blueprint-readme-drift`
- docs frontmatter normalization
- selected generated-surface alignment audits where the intended file content is already derivable deterministically

#### [infra] Task 3.2: Surface fixability in audit output

- [ ] **Status:** todo
- **Depends:** Task 3.1
- **Files:**
  - Modify: shared CLI/MCP audit rendering
- **Change:** Tell contributors whether a finding is auto-fixable and which
  command to run.
- **Verify:** CLI/MCP output tests
- **Acceptance:**
  - [ ] Fixability shows up in summaries and structured output

### Phase 4: Consolidate audit ergonomics [Complexity: M-L]

#### [infra] Task 4.1: Normalize audit envelopes across CLI and MCP

- [ ] **Status:** todo
- **Depends:** Tasks 2.1, 2.2, 3.2
- **Files:**
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/src/cli/commands/audit.ts`
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/src/mcp/tools/audit.ts`
- **Change:** Ensure the same result model can drive:
  - CLI summary
  - MCP structured payload
  - SARIF export
  - PR annotation/report modes
- **Verify:** integration tests for CLI + MCP audit output
- **Acceptance:**
  - [ ] One normalized result model powers all surfaces

#### [infra] Task 4.2: Add contributor-facing audit guidance

- [ ] **Status:** todo
- **Depends:** Task 4.1
- **Files:**
  - Create: `/Users/ozby/repos/webpresso/agent-kit/docs/audit-workflow.md`
- **Change:** Document how blocking, signal, autofix, diff-aware, and SARIF
  modes are meant to be used by humans and agents.
- **Verify:** docs review only
- **Acceptance:**
  - [ ] Audit UX is documented coherently

## Merge Criteria

Do not mark this blueprint complete until:
- the deterministic audit result contract carries richer structured metadata
- SARIF export exists
- diff-aware reporting is standardized across the intended audit subset
- at least one additional safe autofix path is landed
- blocking vs signal audit classes are documented and wired into repo behavior

## Cross-Plan References

| Reference | Relationship |
| --- | --- |
| `../draft/2026-06-13-ai-assisted-audit-lane.md` | Deterministic-first foundation; AI lane stays advisory on top of this contract work. |
