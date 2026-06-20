---
name: review
description: |
  Pre-landing code review. Analyze the current diff for correctness, security,
  trust boundaries, data-loss risk, test quality, and maintainability before merge.
license: MIT
upstream:
  source: https://github.com/garrytan/gstack
---
<!-- Derived from MIT-licensed gstack workflow ideas; see packages/gstack/NOTICE.gstack.md. -->

# Pre-landing review

Use this skill before landing a branch or when the user asks for a code review.

## Steps

1. Inspect `git status --short`, the merge base, and the full diff.
2. Identify changed behavior, public APIs, config, data paths, and generated files.
3. Review for correctness, security, privacy, data-loss risk, race conditions, and hidden side effects.
4. Evaluate tests: do they prove the changed behavior and avoid shallow assertions?
5. Separate blocking findings from nits and praise.

## Output

- **Verdict:** approve / approve with nits / changes requested
- **Blocking findings:** severity, file/line, evidence, and suggested fix
- **Non-blocking notes:** small improvements only
- **Verification gaps:** commands that still need to pass or evidence missing
