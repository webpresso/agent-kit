---
type: rule
slug: public-package-safety
title: Public Package Safety
status: active
scope: repo
applies_to: [agents]
related:
  - package-conventions
  - repo-restrictions
created: '2026-05-26'
last_reviewed: '2026-05-26'
paths:
  - 'package.json'
  - '.npmignore'
  - '.npmrc'
  - 'README.md'
  - 'docs/**'
  - 'catalog/**'
---

# Public Package Safety

Treat every publishable package tarball as public, even when today's registry
or `publishConfig.access` is restricted. A package release is a disclosure
boundary: only intentional API, documentation, and assets belong inside it.

## Keep out by default

- secrets, credentials, private keys, tokens, and token-shaped fixtures;
- absolute local paths such as `/Users/...` or machine-specific cache paths;
- private repo names, customer/workspace examples, and internal package aliases
  such as `@repo/*` unless they are deliberately public examples;
- strategy notes, research docs, founder/market context, private roadmaps, and
  unpublished architecture rationale;
- raw `src/`, tests, fixtures, snapshots, generated IDE/agent surfaces, and
  sourcemaps with embedded source unless the package is intentionally
  open-sourcing that material;
- helper binaries, subpath exports, or files that are not meant to be durable
  public API.

## Required release gate

Before any package is made public, or before changing `files`, `bin`, `exports`,
publish workflow, registry, or catalog assets:

1. Run a dry tarball inspection with the repo's package manager facade or
   `npm pack --dry-run --json`.
2. Review the resulting file list as the source of truth for what will ship.
3. Run the package-surface/secret guardrail available in the repo.
4. Confirm public `bin`, `exports`, and `files` are intentional API.
5. Remove or quarantine denied content before publishing.

If the tarball includes a denied class of content, the package is not ready to
publish. Fix the package surface instead of documenting the leak as acceptable.
