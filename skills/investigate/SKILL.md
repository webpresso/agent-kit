---
name: investigate
description: |
  Systematic debugging with root-cause investigation. Use when the user reports errors, regressions, broken behavior, stack traces, or asks why something failed.
license: MIT
---

# Investigate

Iron law: do not apply fixes until there is a plausible root cause tied to evidence.

## Phases

1. Reproduce or capture the failure evidence.
2. Map the expected behavior and the actual behavior.
3. Trace from the symptom to the smallest responsible boundary.
4. Form hypotheses and disconfirm the cheapest ones first.
5. Implement the smallest root-cause fix.
6. Verify with the failing check first, then adjacent regression coverage.

Report root cause, changed files, and verification evidence.
