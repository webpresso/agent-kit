---
type: blueprint
title: >-
  Render Trust Dossier in wp_blueprint_put to close the dossier authoring
  catch-22
status: planned
complexity: S
owner: ozby
created: "2026-06-28"
last_updated: "2026-06-28"
progress: "100% (3/3 tasks done, 0 blocked, updated 2026-06-28)"
tags:
  - blueprint-tooling
  - mcp
  - dx
  - trust-gate
---

# Render Trust Dossier in wp_blueprint_put to close the dossier authoring catch-22

## Product wedge anchor

- **Stage outcome:** Blueprint lifecycle authoring is fully MCP-sanctioned end to end: an agent can take a blueprint draft to planned without fighting the pretool-guard.
- **Consuming surface:** The wp_blueprint_put MCP tool and its renderer (src/mcp/blueprint-server.ts: putDocumentSchema and renderBlueprintMarkdownFromDocument).
- **New user-visible capability:** An agent authors a complete, promotion-ready Trust Dossier through wp_blueprint_put alone, instead of hacking dossier markdown into the summary field.

## Summary

Authoring a Trust Dossier through the sanctioned path is a **catch-22**. The pretool-guard denies Write/Edit and Bash writes into blueprints/, routing blueprint authoring to wp_blueprint MCP. But wp_blueprint_put's putDocumentSchema has no trust-dossier field, and renderBlueprintMarkdownFromDocument emits only Product wedge anchor + Summary + Tasks. So the `## Trust Dossier` section that wp_blueprint_promote requires cannot be authored through the only allowed writer (this very blueprint was promoted only via the summary-embed hack).

### Fix

Extend putDocumentSchema with an optional structured trust_dossier object and render it as a real `## Trust Dossier` section. Shape mirrors the trust gate's parser: readiness verdict; material_claims (id, claim, evidence as repo:<path> tokens); material_decisions (id, decision, chosen, rejected, rationale); promotion_gates (gate, command, expected, last_result); residual_unknowns. Validate at the put layer against the gate's known rules so authors get early errors: evidence is repo:<existing-path> with NO line-number suffix; promotion gate commands are wp facade commands; residual_unknowns renders exactly `None.` when empty.

### Codex blocking change: prove promote consumes it

Do NOT merely assert the markdown renders. The acceptance must run a real round-trip: wp_blueprint_put with trust_dossier, then wp_blueprint_promote draft->planned SUCCEEDS, with NO summary-embedding hack. First confirm what section ordering and exact subsection text the trust-gate parser requires (read the gate that emits 'missing Trust Dossier section' and 'Residual Unknowns must be exactly None.'), then render to match it. Section placement (after tasks vs before) is whatever the parser actually accepts, verified by the passing promote, not by visual rendering.

### Out of scope

The trust-gate validation rules themselves; the pretool-guard routing policy; non-dossier sections.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-27T23:08:18.007Z
- verified-head: 2b83330804972998d3d680cfb9c1210b35031742
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                                                                                                                   | Evidence                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| C1  | wp_blueprint_put's document schema and renderer live in the blueprint MCP server and currently emit only anchor, summary, and tasks (no Trust Dossier). | repo:src/mcp/blueprint-server.ts |
| C2  | The trust gate that requires a Trust Dossier section is part of the blueprint tooling, so the renderer must match its expected sections.                | repo:src/mcp/blueprint-server.ts |

### Material Decisions

| ID  | Decision          | Chosen option                                                  | Rejected alternatives                      | Rationale                                                                      |
| --- | ----------------- | -------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| D1  | Dossier authoring | Add an optional trust_dossier to put and render a real section | Keep embedding dossier markdown in summary | The summary hack is fragile and undiscoverable; the writer should be complete. |
| D2  | Acceptance bar    | A passing put-then-promote round-trip                          | Asserting markdown renders                 | Codex: prove the gate consumes the output, not just that it renders.           |

### Promotion Gates

| Gate       | Command                  | Expected outcome | Last result                      |
| ---------- | ------------------------ | ---------------- | -------------------------------- |
| trust-gate | wp audit blueprint-trust | pass             | pass at 2026-06-27T23:08:18.007Z |

### Residual Unknowns

None.

## Implementation notes

Tasks follow.

#### Task 1.1: Confirm the trust-gate's required dossier shape and ordering

**Status:** done
**Wave:** 0

Read the trust gate (the code that emits 'missing Trust Dossier section', 'placeholder values are not allowed', 'repo evidence path does not exist', 'must use wp facade commands', and 'Residual Unknowns must be exactly None.'). Record the exact required subsections, evidence-token grammar, gate-command rule, and any ordering constraint relative to tasks.

**Finding (2026-06-28):** `parseTrustDossier` requires a `## Trust Dossier` section with exact `### Readiness Verdict`, `### Material Claims`, `### Material Decisions`, `### Promotion Gates`, and `### Residual Unknowns` subsections (`src/blueprint/trust/dossier.ts`). `validateTrustEvidence` accepts `repo:<path>` under the repo root and rejects line-number suffixes because they do not resolve as paths (`src/blueprint/trust/evidence.ts`). `parseAllowedWpCommand` restricts gates to `wp`/`./bin/wp` facade commands (`src/blueprint/trust/gates.ts`). `validateTrustAmbiguity` requires Residual Unknowns to be exactly `None.` (`src/blueprint/trust/ambiguity.ts`). Rendering must place the dossier after `####` task blocks, because the parser's H2/H3 section slicing would otherwise include task headings in Residual Unknowns.

**Acceptance:**

- [x] The gate's required dossier structure and validation rules are documented in this blueprint with file references.
- [x] Any section-ordering requirement (dossier before/after tasks) is established empirically.

#### Task 1.2: Add optional trust_dossier to putDocumentSchema and render it

**Status:** done
**Wave:** 0

Extend putDocumentSchema (~L2064) with an optional trust_dossier object and extend renderBlueprintMarkdownFromDocument (~L2090) to emit a `## Trust Dossier` section matching Task 1.1's findings. Add light put-time validation (repo: evidence without line numbers; wp-facade gate commands; residual_unknowns normalized to None. when empty).

**Evidence (2026-06-28):** `putDocumentSchema` now accepts optional `trust_dossier` (`src/mcp/blueprint-server.ts:2102`). The renderer emits Trust Dossier after tasks, with residual unknowns normalized to `None.` for empty input (`src/mcp/blueprint-server.ts:2178`). `validatePutTrustDossier` runs the existing trust validator before persistence with `requirePassingGates: false` (`src/mcp/blueprint-server.ts:2266`). Tests reject `repo:package.json:1` and `node scripts/check.js` with clear errors (`src/mcp/blueprint-server.test.ts:208`).

**Acceptance:**

- [x] A put document with trust_dossier renders the gate-conformant section; existing draft puts are unaffected (optional field).
- [x] Put-time validation rejects line-numbered evidence and non-wp gate commands with a clear error.

#### Task 1.3: Round-trip test through promote

**Status:** done
**Wave:** 0

In blueprint-server.test.ts, author a temp blueprint via wp_blueprint_put with trust_dossier, then promote draft->planned and assert success WITHOUT the summary-embedding hack.

**Evidence (2026-06-28):** `src/mcp/blueprint-server.test.ts` now authors a draft through `wp_blueprint_put` with structured `trust_dossier`, asserts the summary contains no embedded dossier markdown, promotes it with `wp_blueprint_promote`, and verifies the planned markdown records a passing gate. The same file asserts renderer ordering and exact required subsection text.

**Acceptance:**

- [x] A put-then-promote round-trip passes draft->planned using only structured trust_dossier input.
- [x] Renderer/section tests assert the gate-required ordering and subsection text.
