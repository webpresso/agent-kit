---
type: rule
slug: engineering-principles
title: Engineering Principles
status: active
scope: repo
applies_to: [agents]
related:
  - package-conventions
  - pre-implementation
created: '2026-05-26'
last_reviewed: '2026-05-26'
---

# Engineering Principles

Use these as design filters before adding code, abstractions, packages, or
process. They are guardrails, not slogans.

## Core filters

- **DRY:** remove real duplication after the second concrete use. Do not invent
  shared abstractions for hypothetical future callers.
- **SOLID:** keep responsibilities narrow, dependencies pointed inward, and
  extension seams explicit. Prefer existing interfaces and module boundaries
  over new framework layers.
- **YAGNI:** do not add config knobs, adapters, packages, extensibility points,
  or migration layers until a current task needs them.
- **KISS:** choose the smallest readable implementation that preserves behavior
  and passes tests. Prefer deletion and existing utilities before new code.

## Planning and review gate

Before approving or implementing a plan, verify:

- the change solves the stated user/product need without speculative scope;
- each new abstraction has at least two concrete users or a hard boundary need;
- each new dependency replaces more code/risk than it adds;
- the task can be explained in one direct sentence;
- tests prove behavior rather than implementation ceremony.

If a plan fails this gate, simplify it before execution.
