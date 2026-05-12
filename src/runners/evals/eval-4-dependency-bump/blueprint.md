---
type: blueprint
title: dependency-bump eval
status: in-progress
complexity: XS
---
# dependency-bump eval

## Goals
Bump `zod` from `^3.22.0` to `^3.23.0` in package.json.
Run `pnpm install --frozen-lockfile` to verify the bump is compatible.
No test failures after the bump.

## Tasks
#### Task 1.1: Bump zod version
**Status:** todo
**Depends:** None
Update package.json zod version and verify pnpm install succeeds.
