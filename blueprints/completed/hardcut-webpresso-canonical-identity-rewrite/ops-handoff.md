---
type: note
title: Hardcut webpresso external ops handoff
status: active
owner: agent
created: '2026-05-25'
last_updated: '2026-05-25'
tags:
  - hardcut
  - ops
  - npm
  - github
---

# Hardcut webpresso external ops handoff

## Purpose

The in-repo identity hardcut is complete. This note captures the remaining
external operations that cannot be finished from git alone.

## Completed in-repo state

- Root package identity is `webpresso`.
- Live plugin/runtime/docs/setup surfaces are hardcut to `webpresso`.
- Legacy helper workspaces are deleted.
- No compatibility shim or backward-compat code path remains.
- Repo verification is green:
  - full tests
  - QA
  - docs frontmatter
  - blueprint lifecycle
  - release dry-run path

## External npm registry checklist

1. Confirm the canonical npm owner/publisher for `webpresso`.
2. Confirm 2FA / provenance / publish permissions for the release operator.
3. Verify the npmjs package page for `webpresso` reflects the intended public
   metadata after the next publish.
4. Audit any previously published legacy names:
   - `@webpresso/agent-kit`
   - `@webpresso/agent-*`
   - any historical `agent-kit`-named plugin/package artifacts
5. For each legacy name, decide which action npm policy allows:
   - deprecate with explicit migration text
   - transfer ownership
   - keep published history untouched
   - escalate to npm support if policy or ownership blocks cleanup
6. Do **not** reintroduce compatibility publish paths in repo code as a cleanup
   workaround.

## External GitHub repository rename checklist

1. Rename the repository from `webpresso/agent-kit` to `webpresso/webpresso`.
2. Re-check all GitHub Actions, badges, marketplace references, and docs links
   after rename.
3. Verify downstream consumers that pin the repository slug explicitly:
   - action-like references
   - setup snippets
   - clone commands
   - marketplace/install docs
4. Confirm redirects behave as expected, but do not rely on redirects as the
   only long-term state.
5. Re-run post-rename smoke checks for:
   - README links
   - release workflow references
   - plugin manifests / marketplace metadata
   - any repo-slug assertions or audits

## Success criteria

- npm canonical ownership is confirmed for `webpresso`.
- Legacy published names are either deprecated, intentionally retained, or
  explicitly escalated outside the repo.
- GitHub repository rename is complete and verified.
- No compatibility-code rollback is introduced to paper over external ops gaps.
