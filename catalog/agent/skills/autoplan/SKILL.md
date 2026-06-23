---
name: autoplan
description: |
  Auto-review pipeline for plans. Runs CEO, design, engineering, and developer-experience review passes in sequence, makes low-risk review decisions, and surfaces only material scope/taste tradeoffs.
license: MIT
---

# Autoplan review pipeline

Use when the user asks to auto-review a plan, run all reviews, or make plan-review decisions.

## Workflow

1. Read the target plan or infer the current plan from the thread.
2. Run these review lenses in order: `/plan-ceo-review`, `/plan-design-review`, `/plan-eng-review`, `/plan-devex-review`.
3. Apply the six decision principles: user outcome, smallest viable scope, reversibility, evidence, maintainability, and verification cost.
4. Produce one consolidated review with: keep/change/drop decisions, unresolved taste calls, required tests, and final go/no-go.
5. Do not edit code unless the user separately asks for implementation.
