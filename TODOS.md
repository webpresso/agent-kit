# TODOs

Durable items that don't justify their own blueprint right now. Promote to a blueprint under `blueprints/draft/` when one of them blocks active work.

---

## 1. Codify the byte-identity + mutation-parity pattern as `catalog/agent/rules/extraction-parity.md`

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
