---
type: blueprint
status: draft
complexity: {{complexity}}
created: '{{date}}'
last_updated: '{{date}}'
progress: '0% (drafted)'
depends_on: []
tags: []
---

# {{title}}

**Goal:** {{description}}

## Planning Summary

- Goal input: `{{description}}`
- Complexity: `{{complexity}}`
- Draft slug: `{{slug}}`
- Output path: `{{output_path}}`
- Generated command: `wp blueprint new "{{description}}" --complexity {{complexity}}`

## Architecture Overview

```text
TODO: describe the architecture here
```

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| TODO | TODO | TODO |

## Quick Reference (Execution Waves)

| Wave | Tasks | Dependencies | Parallelizable |
|------|-------|--------------|----------------|
| **Wave 0** | 1.1 | None | 1 agent |
| **Wave 1** | 1.2 | 1.1 | 1 agent |

### Phase 1: Implementation

#### Task 1.1: Core implementation

**Status:** todo

**Depends:** None

TODO: describe the first task.

**Files:**
- Create: `TODO/path/to/file.ts`
- Create: `TODO/path/to/file.test.ts`

**Steps (TDD):**
1. Write failing test for the expected behaviour
2. Implement minimal code to pass
3. Run `pnpm test` — verify PASS

**Acceptance:**
- [ ] TODO acceptance criterion

#### Task 1.2: Integration and verification

**Status:** todo

**Depends:** Task 1.1

TODO: describe the second task.

**Files:**
- Modify: `TODO/path/to/existing.ts`

**Steps (TDD):**
1. Write failing integration test
2. Implement
3. Run `pnpm test` — verify PASS

**Acceptance:**
- [ ] TODO acceptance criterion

## Verification Gates

| Gate | Command | Success Criteria |
|------|---------|-----------------|
| Type safety | `pnpm typecheck` | Zero errors |
| Tests | `pnpm test` | All pass |

## Non-goals

- TODO: list what this blueprint does not cover
