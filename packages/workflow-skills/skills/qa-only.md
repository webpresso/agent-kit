---
name: qa-only
description: |
  Report-only browser QA. Opens a local or supplied URL with the Webpresso browser runtime and produces findings without editing files.
license: MIT
---

# QA-only

Use for browser QA reports when fixes are not requested.

## Rules

- Report only; do not edit files.
- Prefer local preview/dev-server URLs when available, otherwise use the user-provided URL.
- Start with `wp browser doctor`; if it reports a missing browser, run `wp browser install chromium`, then use `wp browser open <url> --json` as a smoke check.
- Include reproduction steps, expected vs actual, severity, evidence, and suggested fixes.
