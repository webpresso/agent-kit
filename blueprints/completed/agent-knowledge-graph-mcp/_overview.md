---
type: blueprint
title: Agent-asset minimal audit slice — three audit verbs + tech-debt loop
status: completed
complexity: S
owner: ozby
historical_verification_gap_waiver: true
historical_verification_gap_rationale: Historical completed/parked record predates the durable per-task verification convention; retain lifecycle truth without fabricating retroactive evidence.
created: 2026-05-11
last_updated: 2026-05-11
promoted_to_planned: 2026-05-11
tags:
  - agent-kit
  - audits
  - tech-debt
  - drift-detection
related_research:
  - docs/research/2026-05-11-agent-asset-infrastructure-landscape.md
  - docs/research/2026-05-11-agent-asset-trilogy-ceo-plan.md
depends_on:
  - agent-asset-compiler-multi-runtime
reviews:
  - ceo: 2026-05-11
  - eng: 2026-05-11
  - dx: 2026-05-11
  - codex_outside_voice: 2026-05-11
  - plan_refine: 2026-05-11
lifecycle:
  state: completed
promoted_to_completed: 2026-05-11
---

# Agent-asset minimal audit slice (revised — full KG deferred behind concrete gates)

## Product wedge anchor

- **Stage outcome:** Cite VISION.md ("One command, fully wired") + the Elegance Pass 2026 stage outcome. The original blueprint planned a full Kuzu+remark+chokidar knowledge graph; research + deeper investigation (2026-05-11) showed: (a) GitNexus is the validated architecture analog but PolyForm-NC licensed and source-code-domain not agent-asset-domain, so reuse impossible; (b) the original q-\* class of pollution is already zero; (c) Blueprint #1's content-hash compile-manifest already detects drift between canonical `.agent/` and per-IDE outputs; (d) the tech-debt lifecycle has only 1 file — auto-filing from a full KG has no real consumer demand yet. **But** monorepo has 4 `.agent/` files exceeding Codex's 8000-char budget today (skill-creator 22KB, openai-docs 33KB, agent-practices 20KB, soa.md 16KB), broken refs in agent-assets aren't checked anywhere, and the tech-debt loop is dormant. So ship a 3-verb minimal slice now that addresses concrete pain; defer the full KG behind concrete gating conditions.
- **Consuming surface:** Three new audit verbs (`wp audit skill-sizes`, `wp audit broken-refs`, `wp audit memory-rotation`) + `wp tech-debt new --from-audit <name>` integration + pre-commit hook wiring via `wp setup --with husky` extension.
- **New user-visible capability:** A developer can run `wp audit --all` and see (1) which skills exceed runtime budgets, (2) which `.agent/` refs are broken, (3) which AGENTS.md rotations need review. CI gates these via `webpresso/agent-kit-action@v1`. Any audit finding can auto-file an `h-NNN-*.md` tech-debt item with appropriate `review_cadence` — the lifecycle starts compounding instead of staying dormant.

## Why this exists (revised, post-CEO-review)

Reframe from "build a knowledge graph for agent assets" to "close the three highest-leverage drift loops with minimal infrastructure."

The CEO review surfaced concrete data:

- **monorepo `.agent/` has 4 oversized files today** (verified on disk 2026-05-11) that Codex's hard 8000-char listing budget will silently truncate. No audit catches this.
- **agent-asset broken refs are invisible.** A SKILL.md body referencing a deleted skill or a relative-link target that doesn't exist works only by accident.
- **Tech-debt lifecycle has 1 item** (`h-001-track-codex-cli-plugin-marketplace-maturity.md`). The "auto-file findings into the lifecycle" loop doesn't run because there's nothing finding things.

A regex audit + `remark-validate-links` walk over `.agent/**/*.md` solves these three problems in ~5% of the original blueprint's surface area. The full Kuzu+chokidar KG remains valuable in the abstract — for cross-asset graph queries, semantic compaction, audit-time graph diffs — but the user pull isn't there yet.

## Non-goals

- **Not building the full KG.** Deferred behind concrete gating conditions (below).
- **Not introducing Kuzu, remark watcher (chokidar), or `wp_graph_*` MCP namespace.**
- **No semantic similarity, no embeddings, no compaction.** Pure regex + AST walks.
- **No new runtime dep beyond `remark-validate-links`.**
- **Zero backwards compat.** No legacy paths.

## Architecture

### The three audit verbs

#### `wp audit skill-sizes`

Walk `.agent/skills/<name>/SKILL.md` files. For each, measure description bytes + file bytes. Compare against budgets in `.agent/.audit-budgets.yaml`:

```yaml
# .agent/.audit-budgets.yaml (committed)
budgets:
  codex-skill-listing-total:
    max_bytes: 7000 # Codex 8000-char hard cap with 1KB headroom
  claude-skill-description-each:
    max_bytes: 800
  agents-md-section-each:
    max_bytes: 4096
    suggest_compact_at: 0.75
  skill-md-total-each:
    max_bytes: 16384 # warn beyond 16KB; the monorepo's 22-33KB files trigger
```

Output:

```
wp audit skill-sizes
  ⚠️  3 files exceed budget:
    - .agent/skills/skill-creator/SKILL.md: 22,103 bytes (max 16,384 — 135%)
    - .agent/skills/openai-docs/SKILL.md: 33,217 bytes (max 16,384 — 203%)
    - .agent/skills/agent-practices/SKILL.md: 20,094 bytes (max 16,384 — 123%)
  ⚠️  Codex listing total: 8,640 bytes (max 7,000 — 123%)
  Run: wp tech-debt new --from-audit skill-sizes
```

Exit code 1 on any over-budget file. `--json` for machine-readable output per `cmd-execution.md` contract (summary-first; `failures`, `tier`, `bytes`, `tokensSaved`).

#### `wp audit broken-refs`

Walk `.agent/**/*.md` + `AGENTS.md` + `CLAUDE.md` via `remark` + `remark-validate-links`. Resolve relative links (`[text](path)`), `@AGENTS.md`-style imports, anchor links. Fail on any unresolved.

Uses `remark-validate-links` (MIT, Node-native; replaces our originally-planned DIY ref-resolver). Integration: ~50 LOC wrapper that translates remark output to summary-first JSON.

Output:

```
wp audit broken-refs
  ❌ 2 broken refs:
    - .agent/skills/foo/SKILL.md:23 → .agent/skills/bar/SKILL.md (doesn't exist)
    - AGENTS.md:5 → @AGENTS.md (file missing)
  Run: wp tech-debt new --from-audit broken-refs
```

#### `wp audit memory-rotation`

Surface rotation events from `.agent/.rotation-log.jsonl` (written by the memory merger from blueprint #1's `op: rotate` directive). Flags any section rotation that needs human review.

Output:

```
wp audit memory-rotation
  ℹ️  3 sections rotated to AGENTS.history.md in the last 7 days:
    - "Legacy Stripe webhook handling" (last touched 2026-02-14, 92 days ago)
    - "Old auth flow notes" (last touched 2026-01-30, 107 days ago)
    - "Deprecated Hasura schema patterns" (last touched 2026-01-15, 122 days ago)
  Review at: .agent/AGENTS.history.md
```

This is informational by default; only fails CI if `--strict` and any rotation lacks a summary line in the live AGENTS.md.

### `wp tech-debt new --from-audit <name>` integration

Auto-file finding(s) from any audit into `tech-debt/needs-remediation/h-NNN-<slug>.md` using the existing Zod schema:

```bash
wp tech-debt new --from-audit skill-sizes
# → tech-debt/needs-remediation/h-002-skill-files-exceeding-budget.md
#   with frontmatter: type:tech-debt, status:needs-remediation, severity:medium,
#                     category:documentation, review_cadence:biweekly,
#                     linked_blueprints:[agent-asset-compiler-multi-runtime,
#                                        agent-asset-audit-slice]
```

Idempotency key = SHA256(audit-name + finding-set). Re-running with the same findings is a no-op.

### Pre-commit hook integration (D4 cherry-pick)

Extend existing `wp setup --with husky`:

```bash
# .husky/pre-commit (consumer-side, scaffolded by wp setup)
wp audit skill-sizes --staged
wp audit broken-refs --staged
```

`--staged` mode: only audit files in the current git staging area, not the whole `.agent/` tree. Fast (<1s typical). Catches drift at the cheapest possible point.

## Deferred-KG gating conditions

Full Kuzu+remark+chokidar KG ships **only if all three become true:**

1. Blueprint #1 manifest catches **<90% of observed drift** on monorepo over a 30-day window.
2. `tech-debt/` accumulates **≥10 items** where graph queries (cross-asset traversal) are the natural authoring path that regex+AST audits can't replace.
3. **Second consumer** beyond monorepo+ingest-lens commits to consuming `wp_graph_*` tools.

If any condition fails, the minimal slice is the permanent shape. If all three become true, file a follow-on blueprint `agent-knowledge-graph-mcp-v2` with the original Kuzu architecture.

## Technology Choices

| Decision                   | Choice                                                  | Reasoning                                                                           |
| -------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Ref resolver               | **`remark-validate-links`** (MIT, Node-native)          | Replaces DIY resolver; covers our entire ref taxonomy; quiet but stable maintenance |
| Size budget                | **In-tree regex + bytes count**                         | No new dep; budgets configurable in `.agent/.audit-budgets.yaml`                    |
| Rotation audit             | **Reads `.agent/.rotation-log.jsonl`**                  | Memory merger from blueprint #1 writes it; this audit just surfaces                 |
| Tech-debt schema           | **Reuses existing `src/blueprint/tech-debt/schema.ts`** | Already in tree; extend with `--from-audit` semantics                               |
| Pre-commit                 | **Extends `wp setup --with husky`**                     | Existing scaffolder; ~1-2 hours work                                                |
| Kuzu / chokidar            | **None at v0.12.0**                                     | Deferred behind gating conditions                                                   |
| simhash near-dup detection | **Skipped at v0.12.0**                                  | No need without full KG; revisit if blueprint deferred-KG lands                     |
| Backwards compat           | **None**                                                | Net new at v0.12.0                                                                  |

## Edge cases

| ID  | Severity | Case                                                                                           | Mitigation                                                                                                                          |
| --- | -------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| A1  | HIGH     | Consumer's `.audit-budgets.yaml` is missing                                                    | Default budgets ship in agent-kit; warn but don't fail                                                                              |
| A2  | MEDIUM   | `remark-validate-links` flags a ref to a generated file (e.g., `.claude/skills/foo`) as broken | Audit resolver consults the compile-manifest from blueprint #1; refs to generated paths marked `is_generated: true` and not flagged |
| A3  | MEDIUM   | Pre-commit `--staged` mode hits a file with no source on disk yet (renamed away then back)     | Skip silently; full audit runs in CI for any missed cases                                                                           |
| A4  | LOW      | `--from-audit` files duplicate `h-NNN-*.md` for same finding across runs                       | Content-hash idempotency key prevents duplicates                                                                                    |
| A5  | LOW      | Memory rotation log is large (rotation events accumulate over months)                          | Rotate the log itself (`.agent/.rotation-log.jsonl` → `.rotation-log.jsonl.YYYY-MM`) on each calendar month                         |
| A6  | LOW      | A skill at exactly 100% of budget — pass or fail?                                              | Pass at 100%, fail at 101%; budget is inclusive maximum                                                                             |

## Risks

| ID  | Severity | Risk                                                                       | Mitigation                                                                                                             |
| --- | -------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| AR1 | MEDIUM   | `remark-validate-links` last commit was 2025-02 — risk of unmaintained dep | Small surface, MIT license, forkable in a day; we use only the ref-resolution API                                      |
| AR2 | MEDIUM   | Auto-filing tech-debt creates noise if budgets are wrong out of the gate   | Ship with **measure-only** mode for first 2 weeks; `--from-audit` requires explicit invocation, not auto-on-CI-failure |
| AR3 | LOW      | Pre-commit slow-down on large `.agent/` (>500 files)                       | Bench at scale; `--staged` mode scopes to changed files; full audit only runs locally on explicit `wp audit`           |
| AR4 | LOW      | Deferred-KG never lands because gating conditions never become true        | This is by design — minimal slice is the permanent shape if the full KG isn't justified by real usage                  |

## Tasks (~4 tasks)

#### Task 1.1: Audit budgets + `.audit-budgets.yaml` template

**Status:** done
**Depends:** None

Create `src/audits/_budgets.ts` (default budgets + loader). Add `catalog/agent/.audit-budgets.yaml` template emitted by `wp setup`. Zod schema for budget shape.

**Acceptance:** Defaults work without consumer config; override via committed yaml.

#### Task 1.2: Three audit verbs

**Status:** done
**Depends:** Task 1.1

`src/cli/commands/audit/{skill-sizes,broken-refs,memory-rotation}.ts`. Each emits summary-first JSON. `skill-sizes` is pure regex/bytes. `broken-refs` wraps `remark-validate-links`. `memory-rotation` reads `.agent/.rotation-log.jsonl`. All three integrated into `wp audit --all`.

**Acceptance:** Each audit on fixture data exits 0/1 correctly with JSON output; integrated test against monorepo's actual `.agent/` confirms the 4 oversized files are flagged.

#### Task 1.3: `wp tech-debt new --from-audit`

**Status:** done
**Depends:** Task 1.2

Extend `src/cli/commands/tech-debt/new.ts` with `--from-audit <name>` mode. Reads audit JSON, applies frontmatter defaults, writes `tech-debt/needs-remediation/h-NNN-<slug>.md`. Content-hash idempotency.

**Acceptance:** Filed `.md` passes existing Zod validation; re-running is a no-op; `linked_blueprints` correctly populated.

#### Task 1.4: Pre-commit hook extension + consumer rollouts

**Status:** done
**Depends:** Task 1.2

Extend `wp setup --with husky` to wire `wp audit skill-sizes --staged` + `wp audit broken-refs --staged` as pre-commit. Roll out to monorepo + ingest-lens.

**Acceptance:** Pre-commit catches a fixture-staged oversized file; consumers' real commits pass.

## Quick Reference

| Wave      | Tasks       | Parallel agents | Effort (CC)                        |
| --------- | ----------- | --------------- | ---------------------------------- |
| Wave 0    | 1.1         | 1               | ~2 hours                           |
| Wave 1    | 1.2         | 1               | ~half day                          |
| Wave 2    | 1.3, 1.4    | 2               | ~half day                          |
| **Total** | **4 tasks** |                 | **~1-1.5 days CC / ~1 week human** |

Parallelization score: A.

## Resolution log

1. ✅ **Shelve full KG vs minimal slice** — minimal slice; full KG deferred behind 3 concrete gating conditions
2. ✅ **Drop Kuzu, chokidar, simhash** — yes
3. ✅ **`remark-validate-links` for refs** — yes
4. ✅ **Pre-commit hook integration (D4)** — yes

Blueprint ready to promote `draft/` → `planned/`.

## Historical verification note

This blueprint contains done tasks recorded before the current per-task `**Verification:**` convention was consistently enforced. It remains a truthful historical record, but should not be treated as having retroactively reconstructed evidence beyond the repository and audit state captured elsewhere.

## Trust Dossier

### Readiness Verdict

- promotion-ready: true
- unresolved-count: 0
- verified-at: 2026-06-22T00:00:00.000Z
- verified-head: 45289c257910767ff10aa219afdbf2233c6ca880
- trust-gate-version: v1

### Material Claims

| ID  | Claim                                                          | Evidence                                                          |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| C1  | This executable blueprint has a canonical repository document. | repo:blueprints/completed/agent-knowledge-graph-mcp/\_overview.md |

### Material Decisions

| ID  | Decision                                                                   | Chosen option                          | Rejected alternatives                                      | Rationale                                                                       |
| --- | -------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| D1  | Preserve executable lifecycle state under the hard planned-state contract. | Backfill an in-document Trust Dossier. | Remove the document from executable lifecycle directories. | Existing executable blueprints stay auditable without losing lifecycle history. |

### Promotion Gates

| Gate      | Command                      | Expected outcome | Last result                      |
| --------- | ---------------------------- | ---------------- | -------------------------------- |
| lifecycle | wp audit blueprint-lifecycle | pass             | pass at 2026-06-22T00:00:00.000Z |

### Residual Unknowns

None.
