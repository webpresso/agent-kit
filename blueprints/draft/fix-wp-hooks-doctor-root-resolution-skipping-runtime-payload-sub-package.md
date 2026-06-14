---
type: blueprint
title: "Fix wp hooks doctor root resolution skipping runtime-payload sub-package"
status: draft
complexity: S
owner: ""
created: 2026-06-14
last_updated: 2026-06-14
---

## Product wedge anchor

- **Stage outcome:** <cite roadmap section + specific outcome>
- **Consuming surface:** <route / component / verb + path>
- **New user-visible capability:** <one sentence>

## Summary

`wp hooks doctor`, when invoked through the compiled native `wp` runtime, reports three false-negative reds: "plugin.json integrity: plugin root not found", "root launcher contract: bin/wp must be the JS selector, not a native/runtime payload", and "native plugin runtime: launchMode=missing". Root cause: resolveAgentKitPackageRoot() in src/cli/commands/init/package-root.ts walks up from the running module path and wrongly accepts the runtime-payload sub-package @webpresso/agent-kit-runtime-<os>-<cpu> as the agent-kit package root, because isAgentKitPackageRoot() accepts any dir that ships a bin/wp — and that payload package ships a native bin/wp but has no .claude-plugin/plugin.json. The walk stops one package too early, never reaching the real @webpresso/agent-kit (two levels up) which has the JS-selector bin/wp AND plugin.json. Fix: make isAgentKitPackageRoot() reject runtime-payload packages (package.json#name matching /^@webpresso\/agent-kit-runtime-/) so resolution walks past them to the real agent-kit package; this corrects every resolver caller, not just the doctor. TDD: add a colocated regression test (src/cli/commands/init/package-root.test.ts) that builds a temp tree with a nested runtime-payload package and asserts resolveAgentKitPackageRoot() returns the real agent-kit dir — failing before the fix, passing after. Verify wp hooks doctor goes green on the three resolver-driven checks. Out of scope: the 4th red "managed hooks installed" is cwd-anchored and an expected advisory for a dev clone (hooks arrive via plugin/dev:link, not wp setup).

## Tasks

#### Task 1.1: <task title>

**Status:** todo
**Wave:** 0
**Files:**
- (path)

**Acceptance:**
- [ ] <criterion>
