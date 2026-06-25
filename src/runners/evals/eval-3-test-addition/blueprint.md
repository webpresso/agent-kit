---
type: blueprint
title: test-addition eval
status: in-progress
complexity: S
---

# test-addition eval

## Goals

Add a missing test for `src/multiply.ts` which exports `multiply(a, b)`.
The test file `src/multiply.test.ts` must assert `multiply(3, 4) === 12` via toStrictEqual.
`pnpm test src/multiply.test.ts` exits 0.

## Tasks

#### Task 1.1: Add multiply.test.ts

**Status:** todo
**Depends:** None
Create src/multiply.test.ts with a single test asserting multiply(3,4) === 12 via toStrictEqual.
