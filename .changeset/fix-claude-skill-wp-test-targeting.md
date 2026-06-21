---
"@webpresso/agent-kit": patch
---

Fix the packaged Claude outside-voice skill auth snippet to use `claude auth status --json` with a plain-status fallback, and allow `wp_test`/`wp_qa` to combine suite labels with explicit file targets without broadening targeted runs.
