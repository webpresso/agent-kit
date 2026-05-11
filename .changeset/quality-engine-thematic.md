---
"@webpresso/agent-kit": minor
---

**`@webpresso/agent-kit/quality-engine`**: update `SHARED_FUNCTIONS`
registry to point at the new thematic `@webpresso/runtime-*` packages
that replaced the deleted `@webpresso/utils` god-package.

| Category | Old `package` value | New `package` value |
| --- | --- | --- |
| `string`, `date`, `duration`, `format` | `@webpresso/utils` | `@webpresso/runtime-format` |
| `error` | `@webpresso/utils` (source `errors`) | `@webpresso/runtime-format` (source `errors`) |
| `id` | `@webpresso/utils` (source `id`) | `@webpresso/runtime` (source `utils/id` — legacy subpath) |
| `validation` | `@webpresso/utils` | `@webpresso/runtime-validation` |
| `@webpresso/hono-utils` entries | unchanged | unchanged |

`createBlockedResult(sharedFunc)` now emits suggestions like
`import { capitalize } from '@webpresso/runtime-format/string'`. Downstream
consumers of `ak audit package-imports-gate` and the pretool-guard
package-imports validator pick this up automatically — no consumer
config change needed beyond bumping agent-kit.
