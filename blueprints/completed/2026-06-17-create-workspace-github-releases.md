---
type: blueprint
title: Create workspace package GitHub releases
status: completed
complexity: S
owner: agent-kit
created: '2026-06-17'
last_updated: '2026-06-17'
progress: '100% (completed 2026-06-17)'
tags:
  - release
  - github
  - changesets
  - agent-config
completed_at: '2026-06-17'
---

# Create workspace package GitHub releases

## Summary

Ensure the custom release path creates discoverable GitHub Releases for public
non-root workspace packages, such as `@webpresso/agent-config`, instead of only
creating the root `@webpresso/agent-kit` runtime release.

## Acceptance

- [x] The publish handoff records every package published by `release:publish`.
- [x] Already-published changed workspace package versions stay in the handoff so release-finalization reruns can repair missing GitHub Releases.
- [x] The release workflow watches workspace package manifest/changelog version surfaces.
- [x] The release workflow creates package-specific GitHub Releases for non-root packages.
- [x] Root runtime binary release/tag/branch finalization only runs when the root package is in the publish handoff.
- [x] The already-published `@webpresso/agent-config@0.1.5` GitHub Release is backfilled.

## Verification

- `gh release view '@webpresso/agent-config@0.1.5' --repo webpresso/agent-kit --json tagName,name,url,targetCommitish`
- `./bin/wp audit ai-contracts`
- `./bin/wp lint --file ...`
- `./bin/wp typecheck`
- `pnpm exec vitest run scripts/release-publish.test.ts src/build/auth-preflight-packages.test.ts`
- `./bin/wp audit blueprint-lifecycle`
- `./bin/wp audit blueprint-readme-drift`
- `./bin/wp audit guardrails`
