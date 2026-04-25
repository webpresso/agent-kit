---
name: monorepo-navigation
description: Navigate the @webpresso/agent-kit monorepo efficiently. Knows package structure, where to find code, dynamic targeting patterns, and cross-package dependencies. Use when unsure where code lives, doing simple read-only file/symbol/pattern lookup, finding imports, or working across packages.
---

# Monorepo Navigation Guide

## Package Structure

### Packages

This repo is a single-package project.
<!-- Rendered from pnpm-workspace.yaml / package.json workspaces during `ak init`.
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

{{TODO: document cross-package imports if this repo later becomes a monorepo.}}
<!-- From package.json name fields: e.g.,
     import { Button } from '@myorg/ui' -->

### Package names

_n/a — single-package project_
<!-- Short names (for CLI targeting) vs full @scope/name. -->

## Common Workflows

{{TODO: add repo-specific common workflows.
  E.g., "Adding a new API endpoint", "Adding a migration".}}
