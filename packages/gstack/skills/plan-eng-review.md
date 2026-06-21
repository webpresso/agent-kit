---
name: plan-eng-review
description: |
  Engineering-manager plan review. Use before implementation to lock down
  architecture, data flow, sequencing, edge cases, tests, and rollout risk.
license: MIT
upstream:
  source: https://github.com/garrytan/gstack
---
<!-- Derived from MIT-licensed gstack workflow ideas; see packages/gstack/NOTICE.gstack.md. -->

# Engineering plan review

Review the plan as an engineering manager who must make it safe to execute.

## Process

1. Identify the target outcome, non-goals, constraints, owners, and stop condition.
2. Map the implementation path: changed files, data flow, public interfaces, migrations, and backward-compatibility concerns.
3. List edge cases and failure modes by severity.
4. Check test shape: unit, integration, e2e, fixtures, regression coverage, and verification commands.
5. Recommend the smallest plan repair that materially reduces risk.

## Output

- **Verdict:** ready / ready with edits / not ready
- **Blocking issues:** concrete fixes required before coding
- **Recommended edits:** concise patch-level plan changes
- **Verification contract:** commands and evidence required before completion
