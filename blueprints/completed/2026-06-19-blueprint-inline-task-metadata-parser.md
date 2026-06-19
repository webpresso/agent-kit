---
type: blueprint
title: Blueprint inline task metadata parser fix
status: completed
complexity: S
owner: agent-kit
created: '2026-06-19'
last_updated: '2026-06-19'
progress: '100% (1/1 tasks done, 0 blocked)'
tags:
  - blueprint
  - parser
  - audit
---

# Blueprint inline task metadata parser fix

## Summary

Blueprint task metadata appeared in compact form such as `**Status:** todo **Depends:** None`. The core parser and lifecycle audit treated the rest of the line as part of the status, and task mutation lookup did not recognize bracketed task headings.

## Tasks

#### [blueprint] Task 1.1: Normalize compact task metadata across parser, audit, and mutation paths

**Status:** done

**Depends:** None

**Acceptance:**

- [x] Core blueprint parsing accepts compact inline `Status` + `Depends` metadata.
- [x] Lifecycle audit validates the normalized status token instead of the full metadata line.
- [x] Blueprint task mutation finds bracketed task headings and preserves inline dependency metadata.

## Verification

- `./node_modules/.bin/vitest run src/blueprint/core/parser.test.ts src/cli/commands/blueprint/mutations.test.ts src/blueprint/lifecycle/audit.test.ts -t 'compact inline task metadata|compact bracketed task status|compact inline status metadata'`
- `./bin/wp blueprint audit --all --strict` confirms the invalid inline-status parser errors are gone; remaining failures are historical completed-blueprint content-policy violations.
