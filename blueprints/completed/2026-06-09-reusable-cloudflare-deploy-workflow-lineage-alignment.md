---
type: blueprint
title: "agent-kit: reusable Cloudflare deploy workflow lineage alignment"
owner: ozby
status: completed
complexity: M
created: "2026-06-09"
last_updated: "2026-06-11"
progress: "100% (completed 2026-06-11)"
depends_on:
  - 2026-06-02-agent-kit-wp-deploy-orchestrator-toolchain-isolation
  - 2026-05-30-cross-project-wp-execution-map
tags:
  - agent-kit
  - github-actions
  - reusable-workflows
  - cloudflare
  - deploy
---

# agent-kit: reusable Cloudflare deploy workflow lineage alignment

**Goal:** Make `agent-kit` the truthful current-source owner of the shared
Cloudflare reusable workflow shell that downstream consumer repos already use,
and publish an ADR naming the authoritative immutable lineage.

## Completion summary

- Restored `.github/workflows/cloudflare-preview.yml` and
  `.github/workflows/cloudflare-production.yml` to current-source `agent-kit`.
- Restored the reusable-workflow contract doc and the workflow-shell regression
  test.
- Added ADR 0001 naming `317fc3aa5952f5dee0604413a0b9dd1e6d7635dd` as the
  authoritative downstream lineage until consumers intentionally repin.
- Updated the GitHub action guide so the repo-hosted reusable workflow shell and
  the separate audit action are no longer conflated.

## Acceptance

- [x] Current-source `agent-kit` carries the reusable workflow family that
      downstream repos pin.
- [x] An ADR names the authoritative reusable deploy lineage.
- [x] Shared docs explain the caller contract and immutable-SHA rule.
- [x] Workflow-shell ownership is explicit instead of accidental.

## Verification

- `wp test --file src/build/reusable-cloudflare-workflows.test.ts`
- `wp test --file src/audit/cloudflare-deploy-contract.test.ts`
- `wp lint docs/github-action.md docs/reusable-cloudflare-deploy-workflows.md docs/adrs/0001-reusable-cloudflare-workflow-lineage.md`
