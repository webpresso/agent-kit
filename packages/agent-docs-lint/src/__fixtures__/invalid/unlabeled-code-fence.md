---
type: guide
---

# Guide with Unlabeled Code Fence

This document has deprecated commands in unlabeled code fences, which SHOULD be flagged.

## Unlabeled Fence Example

```
just typecheck cli2
pnpm vitest src/test.ts
just lint-file src/index.ts
```

Unlabeled code fences are treated as bash and should be validated.
