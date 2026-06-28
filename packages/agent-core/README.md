# @webpresso/agent-core

Shared low-level primitives for webpresso consumer infrastructure. A pure-Node
leaf package depended on by both [`@webpresso/agent-kit`](../../) and
[`@webpresso/agent-config`](../agent-config).

> Consumers should not import this package directly. Import the same primitives
> through [`@webpresso/agent-config`](../agent-config), which re-exports the
> consumer-facing subset under stable subpaths.

## Subpaths

| Import                            | Provides                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `@webpresso/agent-core/repo-root` | Strict repo-root discovery (`findRepoRoot`, `resolveFromRepoRoot`, `walkToRepoRoot`). |
| `@webpresso/agent-core/process`   | Process-tree signalling and graceful-then-forceful termination.                       |
| `@webpresso/agent-core/e2e`       | Open-port resolution, HTTP health polling, fail-closed secret-env resolution.         |
| `@webpresso/agent-core/deploy`    | Semantic release-version assertion and release-metadata validation.                   |
| `@webpresso/agent-core/dev`       | Workspace-local binary/command resolution and child-process env construction.         |

## License

[Elastic License 2.0](./LICENSE).
