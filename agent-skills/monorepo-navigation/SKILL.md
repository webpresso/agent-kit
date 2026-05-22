---
type: skill
slug: monorepo-navigation
title: Monorepo Navigation
status: active
scope: repo
applies_to: [agents]
related: []
created: '2026-05-13'
last_reviewed: '2026-05-13'
name: monorepo-navigation
description: Navigate the @webpresso/agent-kit monorepo efficiently. Knows package structure, where to find code, dynamic targeting patterns, and cross-package dependencies. Use when unsure where code lives, doing simple read-only file/symbol/pattern lookup, finding imports, or working across packages.
argument-hint: '<query or path>'
allowed-tools: Read, Grep, Glob, Bash
---

# Monorepo Navigation Guide

## Package Structure

### Packages

| Package | Path | Purpose | Common Files |
| ------- | ---- | ------- | ------------ |
| `@webpresso/agent-docs-lint` | `packages/agent-docs-lint` | {{TODO: describe}} | {{TODO: common files}} |
| `@webpresso/agent-e2e-preset` | `packages/agent-e2e-preset` | {{TODO: describe}} | {{TODO: common files}} |
| `@webpresso/agent-kit` | `.` | {{TODO: describe}} | {{TODO: common files}} |
| `@webpresso/agent-launch` | `packages/agent-launch` | {{TODO: describe}} | {{TODO: common files}} |
| `@webpresso/agent-oxlint` | `packages/agent-oxlint` | {{TODO: describe}} | {{TODO: common files}} |
| `@webpresso/agent-stryker` | `packages/agent-stryker` | {{TODO: describe}} | {{TODO: common files}} |
| `@webpresso/agent-test-preset` | `packages/agent-test-preset` | {{TODO: describe}} | {{TODO: common files}} |
| `@webpresso/agent-tsconfig` | `packages/agent-tsconfig` | {{TODO: describe}} | {{TODO: common files}} |
| `@webpresso/agent-vitest` | `packages/agent-vitest` | {{TODO: describe}} | {{TODO: common files}} |
| `@webpresso/agent-workers-test` | `packages/agent-workers-test` | {{TODO: describe}} | {{TODO: common files}} |
<!-- Rendered from pnpm-workspace.yaml / package.json workspaces during `wp init`.
     Format: | Package | Path | Purpose | Common Files |
     Purpose + Common Files start as {{TODO: describe ...}} placeholders. -->

### Key Locations

{{TODO: populate this section — list the typical file roots in your project.}}
<!-- Heuristically filled from the package tree:
     "API routes", "Components", "Database schemas", "Tests", etc.
     Left as TODOs if not inferrable. -->

## Preferred Inspection Flow

{{TODO: document your repo's preferred inspection order.
  Typical default: grep → read → trace imports → ask.
  Many repos prefer: IDE jump-to-def first, grep as fallback.}}

## Finding Code

### I need to find...

{{TODO: populate with common queries specific to your repo.
  Examples:
  - an API route handler → look in ...
  - a database query → look in ...
  - a React component → look in ...
  - a job/queue consumer → look in ...}}

## Cross-Package Import Patterns

### Importing from other packages

```typescript
import { /* ... */ } from '@webpresso/agent-docs-lint'
import { /* ... */ } from '@webpresso/agent-e2e-preset'
import { /* ... */ } from '@webpresso/agent-kit'
import { /* ... */ } from '@webpresso/agent-launch'
import { /* ... */ } from '@webpresso/agent-oxlint'
import { /* ... */ } from '@webpresso/agent-stryker'
```
<!-- From package.json name fields: e.g.,
     import { Button } from '@myorg/ui' -->

### Package names

- `agent-docs-lint` → `@webpresso/agent-docs-lint`
- `agent-e2e-preset` → `@webpresso/agent-e2e-preset`
- `agent-kit` → `@webpresso/agent-kit`
- `agent-launch` → `@webpresso/agent-launch`
- `agent-oxlint` → `@webpresso/agent-oxlint`
- `agent-stryker` → `@webpresso/agent-stryker`
- `agent-test-preset` → `@webpresso/agent-test-preset`
- `agent-tsconfig` → `@webpresso/agent-tsconfig`
- `agent-vitest` → `@webpresso/agent-vitest`
- `agent-workers-test` → `@webpresso/agent-workers-test`
<!-- Short names (for CLI targeting) vs full @scope/name. -->

## Common Workflows

{{TODO: add repo-specific common workflows.
  E.g., "Adding a new API endpoint", "Adding a migration".}}
