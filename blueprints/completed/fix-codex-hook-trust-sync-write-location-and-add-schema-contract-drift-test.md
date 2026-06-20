---
type: blueprint
title: Fix Codex hook trust-sync write location and add schema contract drift test
status: completed
complexity: M
owner: ozby
created: '2026-06-20'
last_updated: '2026-06-20'
completed_at: '2026-06-20'
progress: '100% (4/4 tasks done, 0 blocked, updated 2026-06-20)'
---

# Fix Codex hook trust-sync write location and add schema contract drift test

## Product wedge anchor

- **Stage outcome:** wp setup completes and Codex CLI hooks fire — prerequisite for Tier 1 Codex CLI support
- **Consuming surface:** wp setup CLI verb; Codex hook trust flow at end of setup
- **New user-visible capability:** After wp setup, all Codex hooks are trusted and fire correctly

## Summary

codex-trust-sync.ts called api.configBatchWrite with no filePath, routing trust state into hooks.json. Codex HooksFile is deny_unknown_fields and only accepts 'hooks' — any other top-level key causes parse failure breaking ALL Codex hooks. Fix: pass filePath pointing to config.toml (honouring $CODEX_HOME) so trust state lands in [hooks].state. Secondary: codexHooksSchema.strict() rejects unknown top-level keys.

#### Task 1.1: Regression test: configBatchWrite must target config.toml via filePath

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"command":"wp test --file src/cli/commands/init/scaffolders/agent-hooks/codex-trust-sync.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-20T00:00:00Z"}]
```

**Wave:** 0

**Acceptance:**
- [x] Regression test in codex-trust-sync.test.ts asserts filePath: CONFIG_FILE in batchWrites
#### Task 1.2: Fix trust-sync to pass filePath pointing at config.toml

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"command":"wp test --file src/cli/commands/init/scaffolders/agent-hooks/codex-trust-sync.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-20T00:00:00Z"}]
```

**Wave:** 1

**Acceptance:**
- [x] defaultCodexConfigFilePath() returns ~/.codex/config.toml honouring $CODEX_HOME via ||
- [x] configBatchWrite passes filePath: configFilePath
#### Task 2.1: Make codexHooksSchema strict and add contract tests

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"command":"wp test --file src/cli/commands/init/scaffolders/agent-hooks/schemas/codex-hooks.schema.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-20T00:00:00Z"}]
```

**Wave:** 0

**Acceptance:**
- [x] Schema rejects { hooks: {}, state: {} }
- [x] Schema accepts { hooks: { PreToolUse: [...] } }
#### Task 3.1: Full QA pass + codex review follow-ups

**Status:** done
**Verification:**

```webpresso-evidence-v1
[{"command":"wp test --file src/cli/commands/init/scaffolders/agent-hooks/codex-trust-sync.test.ts src/cli/commands/init/scaffolders/agent-hooks/schemas/codex-hooks.schema.test.ts src/cli/commands/init/scaffolders/agent-hooks/index.test.ts","exit_code":0,"kind":"test","result":"pass","ts":"2026-06-20T00:00:00Z"}]
```

**Wave:** 2

**Acceptance:**
- [x] All 3 test files green
- [x] Scaffold batchWrite assertions updated with filePath: expect.any(String)
- [x] Empty CODEX_HOME guard fixed: ?? to ||
