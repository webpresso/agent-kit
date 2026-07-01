# Review ledger — Dependabot minimum-release-age cooldown

Committed second-brain record of outside review for the dependency automation fix.
Machine-gate truth is mirrored in `_overview.md` frontmatter `approvals:`.

| Date       | Reviewer      | Rev   | Verdict | Note                                                                                                                                                             |
| ---------- | ------------- | ----- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-30 | test-engineer | final | approve | Confirmed the regression test would fail on the old config and protects the Dependabot cooldown invariant.                                                       |
| 2026-06-30 | code-reviewer | final | approve | Confirmed the failed job root cause, minimal config ownership, and sufficiency of a one-day cooldown for the observed 24h pnpm cutoff.                           |
| 2026-06-30 | verifier      | final | approve | Confirmed local code gates passed and identified merge-readiness blockers; blueprint lifecycle and committed implementation blockers were resolved before merge. |

<!-- wp:review-entry {"id":"2026-06-30T19:10:00.000Z:test-engineer:final","blueprintSlug":"completed/2026-06-30-dependabot-minimum-release-age-cooldown","blueprintPath":"blueprints/completed/2026-06-30-dependabot-minimum-release-age-cooldown/_overview.md","targetKind":"blueprint","targetId":"completed/2026-06-30-dependabot-minimum-release-age-cooldown","timestamp":"2026-06-30T19:10:00.000Z","reviewer":"test-engineer","verdict":"approve","rev":"final","evidence":"reviews.md","source":"subagent"} -->
<!-- wp:review-entry {"id":"2026-06-30T19:13:00.000Z:code-reviewer:final","blueprintSlug":"completed/2026-06-30-dependabot-minimum-release-age-cooldown","blueprintPath":"blueprints/completed/2026-06-30-dependabot-minimum-release-age-cooldown/_overview.md","targetKind":"blueprint","targetId":"completed/2026-06-30-dependabot-minimum-release-age-cooldown","timestamp":"2026-06-30T19:13:00.000Z","reviewer":"code-reviewer","verdict":"approve","rev":"final","evidence":"reviews.md","source":"subagent"} -->
<!-- wp:review-entry {"id":"2026-06-30T19:16:00.000Z:verifier:final","blueprintSlug":"completed/2026-06-30-dependabot-minimum-release-age-cooldown","blueprintPath":"blueprints/completed/2026-06-30-dependabot-minimum-release-age-cooldown/_overview.md","targetKind":"blueprint","targetId":"completed/2026-06-30-dependabot-minimum-release-age-cooldown","timestamp":"2026-06-30T19:16:00.000Z","reviewer":"verifier","verdict":"approve","rev":"final","evidence":"reviews.md","source":"subagent"} -->

## Investigation Evidence

- Failed workflow: GitHub Actions run `28470481969` was the PR CI for this fix; the original failing main signal was Dependabot run `28464668519`, job `84361251460`.
- Original Dependabot failure boundary: `corepack pnpm install --lockfile-only` exited during Dependabot lockfile generation, not during optional-tool PR CI.
- Original pnpm policy failure: `[ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION] 49 lockfile entries failed verification`.
- Observed policy window: failed job time `2026-06-30T17:52:23Z`; pnpm cutoff `2026-06-29T17:52:18Z`, approximately one day.
- Example rejected fresh packages included Cloudflare `workerd` platform packages and `@oxfmt/binding-*` packages published inside the cutoff.

## Investigation Evidence

- Original failing main signal: Dependabot run `28464668519`, job `84361251460`.
- Original Dependabot failure boundary: `corepack pnpm install --lockfile-only` exited during Dependabot lockfile generation, not during optional-tool PR CI.
- Original pnpm policy failure: `[ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION] 49 lockfile entries failed verification`.
- Observed policy window: failed job time `2026-06-30T17:52:23Z`; pnpm cutoff `2026-06-29T17:52:18Z`, approximately one day.
- Example rejected fresh packages included Cloudflare `workerd` platform packages and `@oxfmt/binding-*` packages published inside the cutoff.
