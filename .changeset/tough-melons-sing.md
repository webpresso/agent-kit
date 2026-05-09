---
'@webpresso/agent-kit': patch
---

Keep consumer Claude scaffolds stable across reinstalls by linking rule/subagent files through `node_modules/@webpresso/agent-kit` aliases instead of resolved pnpm store paths, and materialize allowlisted `.claude/rules/*` overrides as real consumer-owned files instead of symlinks.
