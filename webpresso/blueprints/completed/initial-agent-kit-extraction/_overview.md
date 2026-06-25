---
type: blueprint
status: completed
complexity: S
created: "2026-01-01"
last_updated: "2026-04-25"
progress: "100% (completed)"
depends_on: []
tags: [agent-kit, extraction]
---

# Initial agent-kit extraction

**Goal:** Extract @webpresso/agent-kit from the webpresso monorepo as a standalone public package.

## Planning Summary

- Goal input: `Extract @webpresso/agent-kit from the webpresso monorepo as a standalone public package.`
- Complexity: `S`
- Draft slug: `initial-agent-kit-extraction`

## Architecture Overview

```text
webpresso/monorepo/packages/agent-kit/ → webpresso/agent-kit/ (standalone repo)
```

## Quick Reference (Execution Waves)

| Wave       | Tasks | Dependencies | Parallelizable |
| ---------- | ----- | ------------ | -------------- |
| **Wave 0** | 1.1   | None         | 1 agent        |

### Phase 1: Extraction

#### Task 1.1: Move to standalone repo

**Status:** done

**Depends:** None

Move agent-kit source into a standalone public repo.

**Files:**

- Create: `webpresso/agent-kit/package.json`

**Acceptance:**

- [x] Package builds in isolation
- [x] Published to npm as @webpresso/agent-kit

## Verification Gates

| Gate  | Command      | Success Criteria |
| ----- | ------------ | ---------------- |
| Build | `pnpm build` | Clean            |
| Tests | `pnpm test`  | All pass         |

## Non-goals

- Migrating all monorepo deps to consume the public package.
