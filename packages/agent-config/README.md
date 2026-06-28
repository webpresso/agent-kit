# @webpresso/agent-config

Shared consumer-facing config presets and low-level primitive re-exports for
webpresso consumers.

`@webpresso/agent-config` is the package consumers install. It owns the stable
config surface (`/vitest/*`, `/tsconfig/*`, `/stryker`, `/workers-test`) and now
also re-exports the shared low-level primitives sourced from
[`@webpresso/agent-core`](../agent-core/README.md).

> Consumers should import these APIs from `@webpresso/agent-config`, **not**
> from `@webpresso/agent-core` and never from `@webpresso/agent-kit`.

## Consumer primitive subpaths

| Subpath                             | Purpose                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| `@webpresso/agent-config/repo-root` | Strict repo-root discovery (`findRepoRoot`, `resolveFromRepoRoot`, `walkToRepoRoot`). |
| `@webpresso/agent-config/process`   | Process-tree signalling and graceful-then-forceful termination.                       |
| `@webpresso/agent-config/e2e`       | Open-port resolution, HTTP health polling, fail-closed secret-env resolution.         |
| `@webpresso/agent-config/deploy`    | Semantic release-version assertion and release-metadata validation.                   |
| `@webpresso/agent-config/dev`       | Workspace-local binary/command resolution and child-process env construction.         |

## Existing config/test surface

`@webpresso/agent-config` continues to publish:

- `@webpresso/agent-config/tsconfig/*`
- `@webpresso/agent-config/vitest/*`
- `@webpresso/agent-config/stryker`
- `@webpresso/agent-config/workers-test`

## Relationship to other packages

- `@webpresso/agent-config` — consumer-installed package surface
- `@webpresso/agent-core` — internal shared leaf that backs the primitive re-exports
- `@webpresso/agent-kit` — internal `wp` engine / CLI and broader public subpath host
