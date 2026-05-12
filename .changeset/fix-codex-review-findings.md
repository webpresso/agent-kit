---
"@webpresso/agent-kit": patch
---

Fix four post-ship findings from codex review: add scripts/migration-notice.ts to package files so postinstall doesn't fail on install; strip postinstall from webpresso staging package; add set -o pipefail to public npm publish CI step; fix getRepoKey() to resolve relative .git paths against the correct cwd; pass process.argv[1] (installed CLI script) to detect() instead of process.argv[0] (Bun runtime).
