---
type: guide
title: Is webpresso for me?
description: A one-screen answer to whether webpresso fits your repo.
last_updated: '2026-05-27'
---

# Is webpresso for me?

Yes, if your repo has more than one coding-agent surface or you want one clean
setup path.

## Use it when

- Multiple agents need the same repo instructions.
- Skills, hooks, or agent rules are being copied by hand.
- You want planning files and quality gates available to agents by default.
- You want setup to be re-runnable instead of tribal knowledge.

## Skip it when

- You only want a prompt library.
- You do not want repo-local agent files.
- Your repo cannot run Node-based developer tooling.

## The test

Run:

```bash
wp setup
```

If the generated repo contract, hooks, blueprints, and templates are useful,
webpresso fits. If not, remove the generated files and keep your current setup.

## Mental model

webpresso is not another agent. It is the convenience layer that gives every
agent the same front door.
