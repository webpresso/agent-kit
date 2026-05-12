---
type: blueprint
title: extract-package eval
status: in-progress
complexity: M
---
# extract-package eval

## Goals
Extract `src/math/index.ts` (which exports `add`, `subtract`, `multiply`) from
the monorepo into a standalone `packages/math/` package.

Per the extraction-parity rule:
- `diff -ru src/math/ packages/math/src/` must be empty (byte identity).
- Mutation score must not drop by more than 2 points.

**Verification standard:** byte-identity + mutation-score parity
(see `catalog/agent/rules/extraction-parity.md`).

## Tasks
#### Task 1.1: Extract math package
**Status:** todo
**Depends:** None
Copy src/math/ to packages/math/src/. Create packages/math/package.json.
Update imports in consumers. Run diff -ru to verify byte identity.

#### Task 1.2: Verify byte-identity and mutation-score parity
**Status:** todo
**Depends:** Task 1.1
- [ ] Run `diff -ru src/math/ packages/math/src/` — output must be empty or
      contain only acceptable-category lines (see `extraction-parity` rule).
- [ ] Capture mutation score before relocation; confirm new score >= old - 2.
- [ ] List every non-empty diff line with its category justification in this
      task. Unacceptable lines must be reverted before this task closes.
- [ ] Paste parity evidence block (template from `extraction-parity` rule).
