---
type: blueprint
title: "Fix release-publish transient package type-contract drift"
owner: ozby
status: draft
complexity: S
created: "2026-06-28"
last_updated: "2026-06-28"
tags:
  - release
  - typecheck
  - publish
---

# Summary

Follow-up to the merged release-order repair. The final independent code-review lane found that `PublishablePackage` gained `workspaceDependencies`, but transient prepared/runtime package literals in `scripts/release-publish.ts` still omit that required field. Runtime behavior is already correct; this is a type-contract cleanliness fix so the final ultragoal gate can close on APPROVE/CLEAR instead of COMMENT/CLEAR.

# Fix

- add `workspaceDependencies: []` to transient prepared/runtime package literals that are not discovered from manifests
- keep release behavior unchanged

# Verification

- targeted `tsc --noEmit`
- targeted release-publish tests
- blueprint lifecycle / PR coverage audits
