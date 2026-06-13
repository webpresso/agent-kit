---
title: Agent-kit history audit
last_updated: 2026-06-13
type: research
---

# Agent-kit history audit

Classification: `clean-public-snapshot-preferred`

This artifact records the public-readiness history posture used by
`scripts/public-readiness.ts`. The release gate treats repository visibility and
package readiness separately:

- Public package readiness is proven by tarball, package-surface, install-docs,
  stale-surface, and secret/path checks.
- Repository visibility remains an operator-controlled decision outside package
  publication.
- If historical repository contents become release-blocking, the classification
  must change to `rewrite-required` before publishing claims are promoted.

The current release path is forward-only for package artifacts: ship only the
bounded npm surface and keep generated/runtime/private worktree surfaces out of
the tarball.
