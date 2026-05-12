---
type: blueprint
title: multi-file-refactor eval
status: in-progress
complexity: S
---
# multi-file-refactor eval

## Goals
Extract the duplicated `clamp(n, min, max)` function from `src/a.ts` and `src/b.ts`
into `src/utils/clamp.ts`. Both files import from the new location.
`pnpm test` exits 0 after the refactor.

## Tasks
#### Task 1.1: Extract clamp utility
**Status:** todo
**Depends:** None
Move `clamp` from src/a.ts and src/b.ts to src/utils/clamp.ts.
Update both files to import from the new location.
