---
type: guide
last_updated: '2026-06-07'
---

# wp hooks demo

`wp hooks demo` runs a pure simulation of the hook dispatch system.

## What it does

- Simulates hook execution for each event + vendor combination
- Shows per-vendor verdicts (allowed/denied/bypassed)
- Makes **no real changes**: no trust is consumed, no logs are written, no files are modified
- Uses the same dispatch logic as the real hooks

## Example output

```
[demo] SessionStart → claude: wp-sessionstart-routing → installed ✅
[demo] SessionStart → codex: wp-sessionstart-routing → pending-trust ⚠️
[demo] PreToolUse → claude: wp-pretool-guard → enforcing ✅
[demo] PreToolUse → codex: wp-pretool-guard → enforcing ✅
[demo] Stop → codex: wp-stop-qa → installed ✅ (stdout must be JSON)
```

## How to interpret

| Status | Meaning |
|---|---|
| `installed` | Hook is registered and will run |
| `enforcing` | Guard hook: failures become denials |
| `pending-trust` | Codex hook not yet trusted — will be skipped until trusted |
| `generated-inactive` | Hook was written by setup but not yet registered |
| `disabled` | Hook was explicitly disabled |
| `degraded` | Hook registered but configuration issue detected |

## See also

- `wp hooks status` — real status from installed configs
- `wp hooks doctor` — diagnose configuration problems
