---
type: blueprint
title: "Advisory AI-assisted audit lane for docs and tool ergonomics"
owner: ozby
status: draft
complexity: M
created: "2026-06-13"
last_updated: "2026-06-13"
progress: "0% (draft; research-backed draft, tasks unstarted)"
tags:
  - audit
  - ai
  - docs
  - ergonomics
  - evals
---

# Advisory AI-assisted audit lane for docs and tool ergonomics

## Planning Summary

Agent-kit’s current audit surface is already strong at deterministic merge-gate
invariants: package surface, secrets, blueprint lifecycle truth, hook surfaces,
and path policy. The missing capability is nuanced quality judgment where static
rules are weak:

- whether docs are actually useful
- whether tool descriptions are clear to agents
- whether PR narratives explain intent and verification well

This blueprint adds an **advisory**, non-blocking AI-assisted audit lane for
those cases. It does **not** replace deterministic audits and should not become
a required gate until it is calibrated against human judgment.

## Refinement Notes (2026-06-13)

- Refined against current repo reality after inspecting the live audit registry,
  existing deterministic `ai-contracts` ownership, current MCP/CLI result
  contracts, and the repo’s existing injected-interface pattern for LLM-facing
  abstractions (`FactExtractionLLM`).
- Outside-voice Claude review identified two blocking draft issues and several
  hardening tweaks that were folded in:
  1. the fixture-baseline task now depends on the schema/rubric being defined first
  2. credential and token/cost-budget strategy is now a first-class design task
  3. the ownership boundary between deterministic `ai-contracts` and qualitative `docs-rubric-ai` is explicit
  4. provider skip behavior and budget enforcement are part of the contract, not an implementation afterthought
- The blueprint remains intentionally in `draft` because the advisory AI lane
  still needs calibration strategy and human-ground-truth collection before it
  is strong enough for planned execution.

## Fact-Check Summary

| ID  | Severity | Claim checked                                                                                     | Repo evidence                                                                                                                      | Planning consequence                                                                          |
| --- | -------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| F1  | HIGH     | Current `wp audit` registry is predominantly deterministic.                                       | `src/cli/commands/audit.ts`, `src/cli/commands/audit-core.ts` enumerate repo/file/AST/schema-based audits only.                    | AI should be layered in as a new lane, not woven into existing hard gates.                    |
| F2  | HIGH     | Existing “AI contracts” audit is still deterministic.                                             | `src/audit/ai-contracts.ts` checks docs, interfaces, and source predicates via TS AST inspection.                                  | Reuse its style of strict structured output, but not its implementation model.                |
| F3  | HIGH     | No AI audit kind exists today.                                                                    | `src/mcp/tools/_shared/audit-kinds.ts` has no AI-assisted audit entry; `src/mcp/tools/audit.ts` has no provider-backed audit path. | Treat `docs-rubric-ai` as net-new end-to-end work, not a small extension of an existing lane. |
| F4  | MEDIUM   | MCP/CLI output contracts are already summary-first and structured.                                | `src/mcp/tools/_shared/result.ts`, `src/mcp/tools/audit.ts`, `src/cli/commands/audit.ts`.                                          | AI audit should emit a narrow structured schema rather than prose blobs.                      |
| F5  | MEDIUM   | The repo already has an internal pattern for LLM interface abstraction.                           | `src/ai-memory/facts/extractor.ts` defines `FactExtractionLLM` and uses a narrow injected interface.                               | Reuse that design style for provider abstraction instead of inventing ad hoc call sites.      |
| F6  | HIGH     | External best practice favors deterministic grading first, then LLM grading for nuanced judgment. | OpenAI evaluation best-practices docs; Anthropic eval docs and agent-evals guidance.                                               | Keep AI audit advisory at first; require rubric, fixtures, and calibration before trust.      |

## Scope

### In scope

- Add one new `wp audit` kind for advisory AI-assisted review
- Restrict its domain to docs/tool-description/PR-quality judgment
- Define a strict rubric and machine-readable result schema
- Store fixtures for repeatable prompt-contract tests
- Make CI integration non-blocking at first

### Out of scope

- Replacing secrets/package/path/lifecycle audits with AI
- Letting AI decide merge-blocking hard invariants
- Broad “review the whole repo with an LLM” behavior
- Provider lock-in at the blueprint level

## Architecture Notes

- The new audit should look like a normal `wp audit <kind>` entry:
  - registered in `src/cli/commands/audit.ts`
  - present in `src/mcp/tools/_shared/audit-kinds.ts`
  - exposed through the existing MCP `wp_audit` surface
- The provider boundary should follow the existing injected-interface pattern
  already used elsewhere in the repo (`FactExtractionLLM`-style shape), but the
  AI audit must remain isolated from ai-memory concerns.
- `src/audit/ai-contracts.ts` should continue to own deterministic structural
  correctness checks. `docs-rubric-ai` should own only qualitative usefulness
  judgment that cannot be enforced well with AST/schema checks.
- Results should be structured:
  - overall pass/signal state
  - rubric subscores
  - file-targeted findings
  - raw provider text hidden behind optional debug mode only
- The initial lane should be **advisory**:
  - non-zero exit only if the transport or schema is broken
  - low-quality scores should surface as warnings / signal output, not merge blockers
- CI integration must define a stable credential strategy and a graceful skip
  path when no provider key is available.
- Provider calls must respect an explicit token or cost budget per invocation.

## Quick Reference

| Wave | Tasks         | Dependencies  | Parallelizable | Effort |
| ---- | ------------- | ------------- | -------------- | ------ |
| 0    | 1.1, 1.2, 1.3 | None          | Yes            | S      |
| 1    | 0.1, 2.1, 2.2 | 1.1, 1.2, 1.3 | Yes            | S-M    |
| 2    | 3.1, 3.2      | 0.1, 2.1, 2.2 | Yes            | M      |
| 3    | 4.1           | 3.1, 3.2      | No             | S      |

## Phases

### Phase 1: Define the audit contract [Complexity: S]

#### [design] Task 1.1: Define the advisory AI audit schema and rubric

- [ ] **Status:** todo
- **Depends:** None
- **Files:**
  - Create: `/Users/ozby/repos/webpresso/agent-kit/src/audit/docs-rubric-ai.ts`
  - Create: `/Users/ozby/repos/webpresso/agent-kit/src/audit/docs-rubric-ai.test.ts`
  - Create: `/Users/ozby/repos/webpresso/agent-kit/docs/ai-audit-rubric.md`
- **Change:** Define one narrow initial audit kind, likely `docs-rubric-ai`, with
  rubric dimensions such as specificity, actionability, correctness-signal, and
  agent ergonomics.
- **Verify:** `wp test --file src/audit/docs-rubric-ai.test.ts`
- **Acceptance:**
  - [ ] Audit result schema is strict and machine-readable
  - [ ] Rubric criteria are explicit and versioned in-repo
  - [ ] Tests cover valid, invalid, and partial provider responses

#### [design] Task 1.2: Decide the first audited surfaces

- [ ] **Status:** todo
- **Depends:** None
- **Files:**
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/docs/ai-audit-rubric.md`
  - Create: `/Users/ozby/repos/webpresso/agent-kit/src/audit/docs-rubric-ai.fixtures.test.ts`
- **Change:** Narrow the initial target set to changed docs, tool descriptors,
  and optionally PR narrative text. Explicitly exclude deterministic contract
  domains.
- **Verify:** `wp test --file src/audit/docs-rubric-ai.fixtures.test.ts`
- **Acceptance:**
  - [ ] Initial target surface is narrow enough to calibrate
  - [ ] Non-goals are documented clearly

#### [design] Task 1.3: Define credential and cost-budget strategy

- [ ] **Status:** todo
- **Depends:** None
- **Files:**
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/docs/ai-audit-rubric.md`
  - Create: `/Users/ozby/repos/webpresso/agent-kit/src/audit/providers/ai-audit-provider-budget.test.ts`
- **Change:** Define the stable env var contract, token/cost budget, and
  structured skip behavior when credentials are absent.
- **Verify:** `wp test --file src/audit/providers/ai-audit-provider-budget.test.ts`
- **Acceptance:**
  - [ ] The draft names the credential/env contract explicitly
  - [ ] Missing credentials degrade to a structured non-failing skip result
  - [ ] A per-invocation token or cost budget is part of the contract

### Phase 0: Prompt-contract baseline [Complexity: S]

#### [eval] Task 0.1: Capture a fixture baseline for the audit schema and rubric outputs

- [ ] **Status:** todo
- **Depends:** Tasks 1.1, 1.2
- **Files:**
  - Create: `/Users/ozby/repos/webpresso/agent-kit/src/audit/__fixtures__/docs-rubric-ai/`
  - Create: `/Users/ozby/repos/webpresso/agent-kit/src/audit/docs-rubric-ai.contract.test.ts`
- **Change:** Establish a fixture-backed baseline for the intended AI audit
  output schema after the schema/rubric exists but before live provider behavior
  is trusted, so prompt or schema drift can be detected independently of vendor
  behavior.
- **Verify:** `wp test --file src/audit/docs-rubric-ai.contract.test.ts`
- **Acceptance:**
  - [ ] The result envelope is fixed before provider integration
  - [ ] Schema drift is detectable without live model calls
  - [ ] The fixture distinguishes pass / warn / malformed-result cases

### Phase 2: Wire the audit into `wp audit` [Complexity: S-M]

#### [infra] Task 2.1: Register the new audit kind end to end

- [ ] **Status:** todo
- **Depends:** Tasks 0.1, 1.1, 1.2, 1.3
- **Files:**
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/src/cli/commands/audit.ts`
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/src/cli/commands/audit-core.ts`
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/src/mcp/tools/_shared/audit-kinds.ts`
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/src/mcp/tools/audit.ts`
- **Change:** Add `docs-rubric-ai` as a standard audit kind using the existing
  audit dispatch model.
- **Verify:** `wp test --file src/cli/commands/audit-core.test.ts --file src/mcp/tools/audit.test.ts`
- **Acceptance:**
  - [ ] `wp audit docs-rubric-ai` is discoverable via CLI and MCP
  - [ ] Unknown-provider / malformed-result cases fail loudly and structurally

#### [infra] Task 2.2: Add provider adapter boundary and debug mode

- [ ] **Status:** todo
- **Depends:** Tasks 0.1, 1.1, 1.3, 2.1
- **Files:**
  - Create: `/Users/ozby/repos/webpresso/agent-kit/src/audit/providers/ai-audit-provider.ts`
  - Create: `/Users/ozby/repos/webpresso/agent-kit/src/audit/providers/ai-audit-provider.test.ts`
- **Change:** Isolate provider invocation behind one adapter boundary so the
  audit logic stays testable without coupling the whole repo to a single vendor.
- **Verify:** `wp test --file src/audit/providers/ai-audit-provider.test.ts`
- **Acceptance:**
  - [ ] Provider boundary is mockable and deterministic in tests
  - [ ] Debug/raw mode is opt-in only
  - [ ] The boundary shape follows the repo’s existing injected-interface style instead of embedding provider calls into audit handlers
  - [ ] Provider calls respect the declared token/cost budget and skip contract

### Phase 3: Calibration and fixture discipline [Complexity: M]

#### [eval] Task 3.1: Add calibration fixtures with expected rubric outcomes

- [ ] **Status:** todo
- **Depends:** Tasks 2.1, 2.2
- **Files:**
  - Create: `/Users/ozby/repos/webpresso/agent-kit/src/audit/__fixtures__/docs-rubric-ai/`
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/src/audit/docs-rubric-ai.test.ts`
- **Change:** Add representative “good”, “weak”, and “ambiguous” doc/tool
  fixtures so output drift is measurable and reviewable.
- **Verify:** `wp test --file src/audit/docs-rubric-ai.test.ts`
- **Acceptance:**
  - [ ] Fixtures cover clear pass / warn / ambiguous cases
  - [ ] Prompt or schema drift breaks tests visibly

#### [eval] Task 3.2: Add advisory CI/report mode only

- [ ] **Status:** todo
- **Depends:** Task 3.1
- **Files:**
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/.github/workflows/ci*.yml`
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/docs/ai-audit-rubric.md`
- **Change:** Run the audit in non-blocking mode or optional report mode so the
  team can compare outputs against human review before promotion.
- **Verify:** `wp audit docs-rubric-ai`; CI dry-run on a fixture branch
- **Acceptance:**
  - [ ] Audit can run in CI without becoming a hard merge gate
  - [ ] Report mode is documented
  - [ ] CI behavior when no provider key is configured is explicit and tested

### Phase 4: Promotion rule [Complexity: S]

#### [policy] Task 4.1: Define criteria for any future hard-gate promotion

- [ ] **Status:** todo
- **Depends:** Tasks 3.1, 3.2
- **Files:**
  - Modify: `/Users/ozby/repos/webpresso/agent-kit/docs/ai-audit-rubric.md`
- **Change:** Record the rule that no AI audit becomes blocking until it has
  calibrated fixture coverage, low disagreement against human review, and
  acceptable false-positive rates.
- **Verify:** doc review only
- **Acceptance:**
  - [ ] Promotion rule is explicit
  - [ ] Advisory-vs-blocking boundary is not ambiguous
  - [ ] The draft names how human ground-truth will actually be collected before promotion is reconsidered

## Merge Criteria

Do not mark this blueprint complete until:

- one advisory AI audit kind exists end to end in the normal `wp audit` surface
- its result schema is strict and fixture-tested
- its domain is explicitly limited to qualitative judgment surfaces
- CI integration is advisory only
- promotion criteria for any future hard gate are documented
