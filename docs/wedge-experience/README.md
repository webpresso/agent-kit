---
type: guide
last_updated: '2026-05-11'
---

# Wedge Experience Demo

Demonstrates 3 concrete value-adds beyond rulesync alone.

## Run the demo

```bash
bash docs/wedge-experience/demo.sh
```

## What it shows

1. **Drift catch**: rulesync alone doesn't catch a skill that's over Codex's 8KB budget; `ak audit skill-sizes` does
2. **AGENTS.md merge**: rulesync doesn't merge layered AGENTS.md; `ak compile` does (with section-keyed precedence)
3. **Audit-to-tech-debt loop**: `ak tech-debt new --from-audit skill-sizes` auto-files a remediation item; rulesync has no tech-debt lifecycle

## Expected output

See `expected-output.txt`.
