---
"@webpresso/agent-kit": patch
---

Regenerate pnpm-lock.yaml to resolve catalog: specifier drift on
`@vitejs/plugin-react` and `vite-plus`. The lockfile carried direct
`^6.0.1` / `^0.1.19` specifiers from before the catalog: migration in
`packages/agent-vitest/package.json`; the post-migration manifests now
use `catalog:`. CI's frozen-lockfile rejects this drift, blocking
Release.yml from publishing any new version. After regen, the lockfile
specifiers match the manifest's `catalog:` references and
frozen-lockfile passes.
