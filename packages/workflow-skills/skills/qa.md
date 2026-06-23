---
name: qa
description: |
  Browser QA plus fix loop. Runs Webpresso browser inspection and may fix source only after an explicit mutation gate.
license: MIT
---

# Browser QA with mutation gate

Use when the user asks to QA a web app and fix issues.

## Mutation gate

1. First run report-only QA exactly like `/qa-only`.
2. Present findings and the proposed source-edit scope.
3. Do not modify files unless the user explicitly authorizes fixes or the original request already clearly requested fixing.
4. After edits, re-run the specific browser check and relevant code tests.

If the request only says audit/test/check, stay report-only.
