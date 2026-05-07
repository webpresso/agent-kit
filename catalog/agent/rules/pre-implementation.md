---
type: rule
slug: pre-implementation
title: Pre-implementation rules
status: active
scope: repo
applies_to: [agents, humans]
related: []
created: '2026-05-06'
last_reviewed: '2026-05-06'
---

# Pre-Implementation Rules

Applies before non-trivial implementation (new features, bug fixes with
unclear repro, refactors). Skip for typos, renames, and one-line fixes.

## Surface Multiple Interpretations

When a request admits more than one plausible reading, list them with rough
effort/tradeoffs and ask — do not pick silently.

- "Make X faster" → latency, throughput, or perceived speed?
- "Fix auth" → which symptom? which user flow?
- "Export data" → which records, which fields, which delivery?

If only one reading is plausible, proceed and state the reading in one
sentence before editing.

## Define Verifiable Success Criteria

Before editing, state the signal that proves the change is done. Vague plans
("review and improve", "clean up") are not acceptable.

Acceptable signals:

- A failing test that must pass (preferred for bug fixes)
- A specific QA command from the consumer repo's command surface that must
  exit green (e.g. the repo's full QA recipe, or a targeted e2e suite)
- A reproducible repro step whose observed output changes

For UI changes, the signal is an end-to-end test (Playwright spec or
equivalent) under the consumer repo's e2e directory, not manual
click-through.
