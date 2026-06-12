---
"@webpresso/agent-kit": patch
---

fix(audit): exclude test files from secrets-policy SECRET_VALUE_PATTERN scan

Test files (.test.ts, .spec.ts, etc.) legitimately contain fake credentials for
testing secret-handling code. Scanning them for secret-like values produces false
positives (e.g. Langfuse fixture keys like "pk-lf-test" or "sk-lf-test").

`shouldScanGitFileForSecretValues` now returns false for any file matching
`.test.{ts,tsx,js,jsx,mjs,cjs}` or `.spec.{ts,tsx,js,jsx,mjs,cjs}`.
