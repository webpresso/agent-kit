---
type: rule
slug: extraction-parity
title: Extraction parity — byte-identity + mutation-score verification
status: active
scope: repo
applies_to: [agents, humans]
related: [blueprint-scoping]
created: "2026-05-11"
last_reviewed: "2026-05-31"
---

# Extraction parity — byte-identity + mutation-score verification

Applies to any blueprint that claims to be a **pure relocation** (moving code
between packages without behaviour changes), including:

- **Fold blueprints** — absorbing one package into another (e.g. folding
  `@webpresso/quality-engine` into `@webpresso/agent-kit/quality-engine`).
- **Extraction blueprints** — splitting a module out of a monorepo into a
  standalone public package.
- Any task annotated with "zero behaviour change", "pure move", "rename only",
  or equivalent.

Without an explicit evidence bar, these claims are unverifiable. This rule
establishes the bar.

---

## 1. Byte-identity check (source parity)

Run a recursive diff between the old source tree and its new location
immediately after the relocation lands:

```bash
diff -ru <old-src-dir> <new-src-dir>
```

**Expected result:** empty output, exit code 0.

Any line starting with `+` or `-` (excluding whitespace-only lines) is a
candidate difference. Classify each one before marking the task DONE.

### Acceptable diff categories

The following changes do **not** invalidate a pure-relocation claim, but each
line must be listed in the blueprint task with its category:

| Category                             | Example                                              |
| ------------------------------------ | ---------------------------------------------------- |
| Import path updates                  | `@scope/old-package` → `@scope/new-package`          |
| Subpath alias changes                | `@workspace/utils` → `@webpresso/runtime/utils`      |
| Shebang line adjustments             | `#!/usr/bin/env node` unchanged; path to bin updated |
| `package.json` name / version fields | `"name": "old"` → `"name": "new"`                    |

### Unacceptable without explicit justification

If the diff contains any of the following, the task is **not** a pure
relocation and the blueprint must document why the change was intentional:

- Logic changes in production `.ts` / `.js` source files
- Test removal, test weakening, or assertion changes
- Export surface changes (added / removed / renamed exports not already
  documented in the blueprint's API-delta section)
- Dependency additions or removals not driven by a package rename

If you cannot justify a diff line in one sentence, treat it as an unintended
behaviour change and revert it before proceeding.

---

## 2. Mutation-score parity check (test quality)

A relocation that silently drops coverage defeats the purpose of moving code
with its tests. Capture a Stryker baseline before the move and verify the score
is preserved afterward.

```bash
# Step 1 — capture baseline in the old location (before relocation)
pnpm test:mutation 2>&1 | tee /tmp/stryker-old.txt
# Note the final "Mutation score" line, e.g. "Mutation score: 87.50%"

# Step 2 — after relocation, run the same suite in the new location
pnpm test:mutation 2>&1 | tee /tmp/stryker-new.txt
# Note the final "Mutation score" line
```

If the repo uses a JSON reporter instead:

```bash
vp exec vitest run --config vitest.stryker.config.ts --reporter=json \
  > /tmp/stryker-old.json   # before
vp exec vitest run --config vitest.stryker.config.ts --reporter=json \
  > /tmp/stryker-new.json   # after
```

**Acceptance threshold:** new score ≥ old score − 2 (two-point tolerance
accounts for statistical variance in survivor sampling).

A drop larger than two points signals that tests were lost or weakened during
the move. Investigate and restore coverage before marking the task DONE.

---

## 3. Acceptance criteria template

A blueprint task that claims parity DONE must cite all three items:

```markdown
**Parity evidence:**

- `diff -ru <old-src-dir> <new-src-dir>` output:
  - [ ] Empty (full pass), OR
  - [ ] Non-empty — listed below with category justification:
    - `<diff line>` — acceptable: import path update (`@old` → `@new`)
- Mutation score: **before XX.XX% → after YY.YY%** (Δ = Z pts)
  - [ ] New score ≥ old score − 2 ✓
- Any unacceptable diff lines addressed:
  - [ ] None found, OR [ ] <line> — reverted / justified: <reason>
```

---

## 4. How to apply in a blueprint

Add a dedicated task to the blueprint that runs these checks after the
file-move task completes:

```markdown
#### Task N.M: Verify byte-identity and mutation-score parity

- [ ] Run `diff -ru <old-src-dir> <new-src-dir>` — output must be empty or
      contain only acceptable-category lines (see `extraction-parity` rule).
- [ ] Capture mutation score before relocation; confirm new score ≥ old − 2.
- [ ] List every non-empty diff line with its category justification in this
      task. Unacceptable lines must be reverted before this task closes.
- [ ] Paste parity evidence block (template from `extraction-parity` rule).
```

Reference in the blueprint overview:

```markdown
**Verification standard:** byte-identity + mutation-score parity
(see `catalog/agent/rules/extraction-parity.md`).
```

---

## 5. Deploy-contract relocation parity

If the relocation touches shared deploy-contract material (workflow templates,
policy docs, fixtures, or verifier handoff docs), parity evidence must also
state that these semantics remained unchanged:

- internal lane IDs stay internal and remain exactly `dev`, `preview_main`,
  `preview_pr_<n>`, and `prd`;
- cloud/provider-facing environment names are derived separately and must be
  dash-safe rather than reusing the internal lane IDs as public contract;
- Durable Object-backed previews do **not** rely on provider Preview URLs;
  custom-domain environment previews are the default and `workers_dev_env` is
  exception-only;
- production release metadata stays anchored to
  `deploy.cloudflare.production.metadataPath` in the repo config;
- migration-bearing Durable Object releases fail closed in the consuming
  repo's deploy verifier/workflow;
- provider-specific deployment plumbing does not move into shared
  `@webpresso/agent-kit` surfaces during the extraction.

When any of the above changes intentionally, the move is no longer "pure
relocation" and the blueprint must document the contract delta explicitly
instead of claiming parity.

---

## Why this rule exists

Task 1.4 of the `fold-webpresso-quality-engine-into-webpresso`
blueprint first applied this pattern. Without it, "pure relocation" was an
unchecked claim — the diff step caught an import-path inconsistency that would
otherwise have shipped silently. Codifying the bar here means future fold and
extraction blueprints inherit it rather than re-derive it.

The two-point mutation-score tolerance is intentional: Stryker sampling is
non-deterministic across runs; a tolerance tighter than two points produces
false negatives on large suites.
