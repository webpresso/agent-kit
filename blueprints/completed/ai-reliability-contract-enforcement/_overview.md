---
type: blueprint
title: AI reliability contract enforcement
status: completed
owner: agent-kit
historical_verification_gap_waiver: true
historical_verification_gap_rationale: Historical completed/parked record predates the durable per-task verification convention; retain lifecycle truth without fabricating retroactive evidence.
complexity: M
created: '2026-05-27'
last_updated: '2026-05-28'
completed_at: '2026-05-28'
progress: '100% (4/4 tasks done, 0 blocked) - local AI reliability contract enforcement completed and verified on 2026-05-28'
depends_on: []
tags:
  - ai
  - audit
  - mcp
  - docs
parent_roadmap: in-progress/ai-reliability-contract-roadmap
---

# AI reliability contract enforcement

## Product wedge anchor

The repo already has the core ingredients for AI-safe tool surfaces:
`structuredContent`, `isError`, `outputSchema`, and summary-first `wp_*` MCP
results. What is missing is a named, auditable contract that proves those
surfaces stay intact as the package evolves.

## Summary

Verified on 2026-05-27:

- `src/mcp/auto-discover.ts` defines `ToolHandlerResult` with
  `structuredContent` and `isError`, and `ToolDescriptor` with optional
  `outputSchema`.
- `src/mcp/tools/_shared/result.ts` is the summary-first result helper.
- `src/mcp/server.integration.test.ts` already exercises `tools/list` and
  structured output passthrough.
- The remaining gap is an explicit `wp audit ai-contracts` gate and canonical
  docs that describe the contract to consumers.

## Key decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Contract scope | Webpresso enforcement only | Keeps this blueprint inside the local repo boundary. |
| Enforcement style | Source audit, MCP test anchor, docs | Minimal moving parts; high signal for regressions. |
| Consumer adoption | Documentary follow-up in IngestLens | Cross-repo adoption should not block local enforcement. |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable | Effort (T-shirt) |
| --- | --- | --- | --- | --- |
| **Wave 0** | 1.1, 1.2 | None | 2 agents | XS-S |
| **Wave 1** | 1.3, 1.4 | 1.1, 1.2 | 2 agents | S |
| **Critical path** | 1.1 → 1.3 | — | 2 waves | M |

#### Task 1.1: [audit] Add `wp audit ai-contracts`

**Status:** done

**Depends:** None

Add a repo audit that checks the canonical AI reliability contract doc, the
summary-first MCP result helper, the MCP discovery contract, and the core
`wp_*` tool source markers (`outputSchema`, `createSummaryResult`,
`isError: true` where protocol-level failures are expected).

**Files:**

- Create: `src/audit/ai-contracts.ts`
- Create: `src/audit/ai-contracts.test.ts`
- Modify: `src/cli/commands/audit.ts`
- Modify: `src/cli/commands/audit-core.ts`

**Steps (TDD):**

1. Write failing unit tests for passing and failing AI contract fixtures.
2. Run: `wp_test({"files":["src/audit/ai-contracts.test.ts"]})` — verify FAIL.
3. Implement `auditAiContracts()` and register `ai-contracts` in the CLI audit surface.
4. Run: `wp_test({"files":["src/audit/ai-contracts.test.ts"]})` — verify PASS.
5. Run: `wp_typecheck({})`.

**Acceptance:**

- [x] `wp audit ai-contracts` resolves through the CLI audit registry
- [x] Contract violations point to exact files and markers
- [x] `wp_typecheck` passes

#### Task 1.2: [docs] Publish the canonical contract doc

**Status:** done

**Depends:** None

Add a canonical guide that explains the AI reliability contract in product
terms: schema-backed outputs, protocol-level `isError`, prompt-vs-enforcement,
summary-first outputs, and consumer adoption boundaries.

**Files:**

- Create: `docs/ai-reliability-contract.md`
- Modify: `README.md`
- Modify: `docs/is-agent-kit-for-me.md`

**Steps (TDD):**

1. Add or update docs references so the repo fails active guidance review when
   the AI contract doc is missing from the user-facing audit story.
2. Run the relevant docs checks — verify FAIL.
3. Publish the contract doc and wire it into README / product-fit guidance.
4. Re-run docs checks — verify PASS.
5. Run: `wp_qa({"files":["README.md","docs/ai-reliability-contract.md","docs/is-agent-kit-for-me.md"]})`.

**Acceptance:**

- [x] Consumers have one canonical AI reliability contract doc
- [x] README references the new audit surface
- [x] Docs checks pass

#### Task 1.3: [mcp] Extend `wp_audit` MCP coverage for `ai-contracts`

**Status:** done

**Depends:** Task 1.1, Task 1.2

Expose the new audit through the existing `wp_audit` MCP tool so agent callers
can use the same contract gate without shelling out.

**Files:**

- Modify: `src/mcp/tools/audit.ts`
- Modify: `src/mcp/tools/audit.test.ts`
- Modify: `src/local.ts`

**Steps (TDD):**

1. Add failing `wp_audit` MCP tests for the `ai-contracts` kind.
2. Run: `wp_test({"files":["src/mcp/tools/audit.test.ts"]})` — verify FAIL.
3. Register the new kind and export the public local API helper.
4. Run: `wp_test({"files":["src/mcp/tools/audit.test.ts"]})` — verify PASS.
5. Run: `wp_typecheck({})`.

**Acceptance:**

- [x] `wp_audit` accepts `kind: "ai-contracts"`
- [x] MCP payloads stay summary-first and structured
- [x] `wp_typecheck` passes

#### Task 1.4: [blueprint] Add the roadmap + local child blueprint

**Status:** done

**Depends:** Task 1.1, Task 1.2

Add a parent roadmap plus this local child blueprint so the contract work has a
durable execution surface and a documentary link to the IngestLens adoption
lane.

**Files:**

- Create: `blueprints/planned/ai-reliability-contract-roadmap/_overview.md`
- Create: `blueprints/planned/ai-reliability-contract-enforcement/_overview.md`

**Steps (TDD):**

1. Create roadmap + child blueprint drafts with explicit waves and dependencies.
2. Run: `WP_SKIP_UPDATE_CHECK=1 wp audit blueprint-lifecycle` — verify FAIL if format is incomplete.
3. Fix any lifecycle or roadmap-link issues.
4. Run: `WP_SKIP_UPDATE_CHECK=1 wp audit blueprint-lifecycle` — verify PASS.
5. Run: `WP_SKIP_UPDATE_CHECK=1 wp audit roadmap-links --strict`.

**Acceptance:**

- [x] Parent roadmap and local child blueprint are lifecycle-valid
- [x] Cross-repo documentary references are explicit
- [x] `wp audit roadmap-links --strict` passes

## Verification Gates

| Gate | Command | Success Criteria |
| --- | --- | --- |
| Audit unit tests | `wp_test({"files":["src/audit/ai-contracts.test.ts"]})` | All pass |
| MCP audit tool tests | `wp_test({"files":["src/mcp/tools/audit.test.ts"]})` | All pass |
| Typecheck | `wp_typecheck({})` | Pass |
| Lifecycle audit | `WP_SKIP_UPDATE_CHECK=1 wp audit blueprint-lifecycle` | Pass |
| Roadmap links audit | `WP_SKIP_UPDATE_CHECK=1 wp audit roadmap-links --strict` | Pass |

## Cross-Plan References

| Blueprint | Relationship | Required alignment |
| --- | --- | --- |
| `planned/ai-reliability-contract-roadmap` | Local parent roadmap | Must list this child in Wave 0. |
| [`ozby/ingest-lens: adopt-ai-reliability-contract`](https://github.com/ozby/ingest-lens/tree/main/blueprints/planned) | Documentary downstream adopter | Will implement provenance/confidence/replay adoption once this audit/doc surface is stable. |

## Risks and edge cases

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Audit becomes too implementation-specific and blocks harmless refactors. | MEDIUM | Keep checks focused on contract markers, not exact formatting. |
| Docs drift from the real enforcement surface. | HIGH | Gate on both the doc and the code/test contract markers. |
| Cross-repo adoption stalls and leaves the contract theoretical. | MEDIUM | Keep the documentary downstream blueprint explicit in the roadmap. |
## Historical verification note

This blueprint contains done tasks recorded before the current per-task `**Verification:**` convention was consistently enforced. It remains a truthful historical record, but should not be treated as having retroactively reconstructed evidence beyond the repository and audit state captured elsewhere.

