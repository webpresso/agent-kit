---
type: guide
---

# Guide with Inline Code

This document has deprecated commands in inline code, which should NOT be flagged.

## Inline Code Examples

The old command `just lint-file src/index.ts` is deprecated.

You should not use `pnpm vitest` directly anymore.

The command `just typecheck cli2` uses positional arguments.

These inline code references should be ignored by the validator since they're not in bash code blocks.

## Correct Usage

```bash
just lint --file src/index.ts
just test --file src/index.test.ts
just typecheck --package cli2
```

All these are correct and should pass validation.
