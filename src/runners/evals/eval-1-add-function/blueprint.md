---
type: blueprint
title: add-function eval
status: in-progress
complexity: XS
---
# add-function eval

## Goals
Add `src/add.ts` exporting `add(a: number, b: number): number` that returns `a + b`.
Add `src/add.test.ts` asserting `add(2, 3)` equals `5`.
`pnpm test src/add.test.ts` exits 0.

## Tasks
#### Task 1.1: Add add.ts + add.test.ts
**Status:** todo
**Depends:** None
Create `src/add.ts` with `export function add(a: number, b: number): number { return a + b }`.
Create `src/add.test.ts` asserting the result via toStrictEqual.
