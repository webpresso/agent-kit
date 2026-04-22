---
name: monorepo-navigation
description: Navigate the {{PROJECT_NAME}} monorepo efficiently. Knows package structure, where to find code, dynamic targeting patterns, and cross-package dependencies. Use when unsure where code lives, doing simple read-only file/symbol/pattern lookup, finding imports, or working across packages.
---

# Monorepo Navigation Guide

## Package Structure

### Packages

{{PACKAGES_TABLE}}
<!-- Rendered from pnpm-workspace.yaml / package.json workspaces during `ak init`.
     Format: | Package | Path | Purpose | Common Files |
     Purpose + Common Files start as {{TODO: describe ...}} placeholders. -->

### Key Locations

{{KEY_LOCATIONS}}
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

{{CROSS_PACKAGE_IMPORTS}}
<!-- From package.json name fields: e.g.,
     import { Button } from '@myorg/ui' -->

### Package names

{{PACKAGE_NAMES}}
<!-- Short names (for CLI targeting) vs full @scope/name. -->

## Common Workflows

{{TODO: add repo-specific common workflows.
  E.g., "Adding a new API endpoint", "Adding a migration".}}
