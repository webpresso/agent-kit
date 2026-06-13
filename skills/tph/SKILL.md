---
type: skill
slug: tph
title: TPH (Testing Philosophy Helper)
status: active
scope: repo
applies_to: [agents]
related: [testing-philosophy]
created: '2026-06-13'
last_reviewed: '2026-06-13'
name: tph
description: Literal /tph shortcut for the testing-philosophy skill and wp audit tph. Use when reviewing test quality, detecting over-mocking or weak assertions, or enforcing integration-first testing.
---

# TPH (Testing Philosophy Helper)

This is the short-name alias for the canonical `testing-philosophy` skill.

Use the full testing-philosophy workflow in `../testing-philosophy/SKILL.md` and run the repo audit when available:

```bash
wp audit tph
```

Focus on:

- integration-first tests over brittle implementation mocks;
- E2E tests that go through real user/browser or HTTP boundaries;
- weak assertions, tautologies, and over-mocking;
- correct test naming and suite placement;
- mutation-test-worthy coverage for new logic.
