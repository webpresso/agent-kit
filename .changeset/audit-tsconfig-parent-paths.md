---
"@webpresso/agent-kit": minor
---

Extend `ak audit no-relative-parent-imports` to also scan every
`tsconfig*.json` for parent-relative paths (`../`) in any string value:
`extends`, `paths`, `references`, `include`, `exclude`, `rootDir`,
`outDir`, `baseUrl`, etc. Use a package alias
(`@scope/preset/tsconfig.json`) or a workspace path mapping instead.

The walker skips `node_modules`, `dist`, `build`, `.git`, `.cache`,
`.next`, `.turbo`, `.omx`, and `.claude` (per-worktree clones live there).

Also fixes four stale `extends` paths inside agent-kit's own packages
(`agent-e2e-preset`, `agent-launch`, `agent-test-preset`, `agent-vitest`):
the T1.1 absorption renamed `packages/typescript-config/` →
`packages/agent-tsconfig/`, but the `extends` strings still pointed at
the pre-rename directory via `../typescript-config/`. They now resolve
via the published alias `@webpresso/agent-tsconfig/<preset>.json`, which
is both correct and survives future renames.

Picked up automatically by `ak audit guardrails` and `ak audit quality`.
