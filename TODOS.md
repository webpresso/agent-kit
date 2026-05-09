# TODOs

Durable items that don't justify their own blueprint right now. Promote to a blueprint under `blueprints/draft/` when one of them blocks active work.

---

## 1. Audit `_sandbox/` ignore as a default in `ak audit *` repo guardrails

**What:** Add `_sandbox/` to the default exclude set across every `ak audit` repo guardrail (catalog-drift, blueprint-lifecycle, docs-frontmatter, no-relative-parent-imports, etc.).

**Why:** `_sandbox/` is the user's scratch/archive space (per `~/repos/CLAUDE.md`). Today, `ak audit *` doesn't know that — so repo-wide audits in workspace meta-repo (`/Users/ozby/repos`) surface false positives from stale insul/medtech/mymee dirty trees. Promoting the rule from session-memory feedback (`feedback_ignore_sandbox.md`) to the agent-kit audit defaults benefits every consumer that adopts the same workspace pattern.

**Pros:**
- Consistent default across agent-kit consumers.
- Removes a recurring "ignore sandbox" instruction from session memory.
- Easy to override per-repo via `.agent-kitrc.json`.

**Cons:**
- Slightly opinionated default (assumes `_sandbox/` is sacred).
- Consumers without `_sandbox/` see no behavior change (silent default).

**Context:**
The current implementation excludes `node_modules`, `.git`, generated/, dist/, and several others. `_sandbox/` is a workspace-level convention, not a per-repo one — adding it to defaults is low-risk.

**Depends on / blocked by:** Nothing. Could be a small follow-up PR (one config addition + a test).

---

## 2. Codify the byte-identity + mutation-parity pattern as `catalog/agent/rules/extraction-parity.md`

**What:** Write a new agent-kit rule documenting the "byte-identity + mutation-score parity" verification pattern used by Task 1.4 of the fold-quality-engine blueprint (`webpresso/blueprints/draft/fold-webpresso-quality-engine-into-webpresso-agent-kit-decision-4/_overview.md`).

**Why:** Decision 5 of the public-extraction roadmap is closed but other folds may follow (process-utils precedent shows the workspace will keep extracting and re-folding). The parity check is reusable: any "pure relocation" blueprint can include `diff -ru <old>/src <new>/src` + Stryker baseline comparison. Codifying it as a rule means the next blueprint inherits it automatically.

**Pros:**
- Reusable across future extractions/folds.
- Makes "pure relocation" claims falsifiable with cheap evidence.
- Belongs in `catalog/agent/rules/` because it's catalog content, not repo-specific.

**Cons:**
- Adds one more rule to read for new contributors (low cost — rules are scannable).
- Premature if no second fold ever happens (low likelihood given the active-extraction history).

**Context:**
The pattern is straightforward — captured in Task 1.4 of the fold blueprint. Promoting it to a rule means writing ~80 lines of `extraction-parity.md` with the byte-diff command, the Stryker baseline-capture script, and the acceptance criteria. After the rule lands, future blueprints reference it instead of re-deriving.

**Depends on / blocked by:** The fold blueprint actually executing successfully (so the pattern is battle-tested before promotion).
