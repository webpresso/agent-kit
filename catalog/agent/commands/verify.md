---
description: "Post-implementation quality gate that verifies work is actually done, cleans up legacy/backward-compat/dead-code garbage left behind, refreshes affected docs, and requires outside-model approval evidence before merge-ready claims. Use after implementing a feature or fix, before claiming done, or when finalizing a blueprint."
argument-hint: "<target> [--full] where target is: package|file|plan-slug|all"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task, TodoWrite
---

# Verify Command

Canonical doc: @.agent/skills/verify/SKILL.md
