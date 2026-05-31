---
type: guide
last_updated: '2026-05-31'
---

# `wp` extension runtime contract

`@webpresso/agent-kit` owns the base `wp` CLI. Extension packages can add
repo-specific commands without putting framework behavior into the base host.
The base host only discovers, validates, loads, and gates extensions.

Use this contract when a downstream package needs to extend `wp`, such as a
framework package that wants framework-only commands or short aliases.

## Runtime flow

```text
current repo package.json webpresso.wpExtensions opt-in
  -> enabled direct dependencies/devDependencies/optionalDependencies
  -> dependency package.json webpresso.wpExtension
  -> default-exported WpExtensionV1 module
  -> hostRange check
  -> detect({ cwd, env })
  -> command registration
  -> guarded alias registration
```

If any optional extension is missing, broken, incompatible, or not detected for
the current repo, base `wp` should still start.

## Declare the discovery fields

Extension loading is disabled by default. A consuming repository first opts in
from its root `package.json`:

```json
{
  "webpresso": {
    "wpExtensions": ["@example/framework-tools"]
  },
  "devDependencies": {
    "@example/framework-tools": "^1.0.0"
  }
}
```

Use `true` only when the repo intentionally trusts all direct dependencies that
advertise a `wp` extension:

```json
{
  "webpresso": {
    "wpExtensions": true
  }
}
```

An extension package advertises itself from its own `package.json` with
`webpresso.wpExtension`:

```json
{
  "name": "@example/framework-tools",
  "version": "1.0.0",
  "exports": {
    "./wp-extension": {
      "types": "./dist/wp-extension.d.ts",
      "default": "./dist/wp-extension.js"
    }
  },
  "webpresso": {
    "wpExtension": "@example/framework-tools/wp-extension"
  }
}
```

Rules:

- The current repo must enable the extension package via
  `webpresso.wpExtensions`, and list it as a direct `dependencies`,
  `devDependencies`, or `optionalDependencies` entry. Transitive dependencies
  are not scanned.
- Packages without `webpresso.wpExtension` are ignored.
- `webpresso.wpExtension` must be a non-empty module specifier that resolves
  from the extension package manifest.
- Prefer a public package subpath, as shown above. A relative specifier such as
  `./dist/wp-extension.js` is also valid when it resolves from the extension
  package directory.
- Do not point the field at TypeScript source or an internal `src/**` path in a
  published package.

## Default-export `WpExtensionV1`

The extension module must default-export a `WpExtensionV1` object from the
public `@webpresso/agent-kit/wp-extension` contract:

```ts
import type { CAC } from 'cac'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { WpExtensionV1 } from '@webpresso/agent-kit/wp-extension'

const extension: WpExtensionV1 = {
  apiVersion: '1',
  name: '@example/framework-tools',
  version: '1.0.0',
  hostRange: '^0.22.0',
  detect: ({ cwd, env }) =>
    env.EXAMPLE_FRAMEWORK === '1' || existsSync(join(cwd, 'example.config.ts')),
  commands: [
    {
      name: 'example',
      description: 'Run example framework tasks',
      register(cli: CAC) {
        cli.command('example', 'Run example framework tasks').action(() => {
          console.log('example command')
        })
      },
    },
  ],
  aliases: [{ name: 'dev', commandName: 'example' }],
}

export default extension
```

Required fields:

| Field | Shape | Purpose |
| --- | --- | --- |
| `apiVersion` | `'1'` | Pins the extension contract version. |
| `name` | non-empty string | Human-readable extension identity, usually the package name. |
| `version` | non-empty string | Extension package/runtime version. |
| `hostRange` | non-empty string | Compatible base `wp` host versions. |
| `detect` | `(context) => boolean \| Promise<boolean>` | Returns `true` only in repos where commands and aliases should be active. |
| `commands` | `WpExtensionCommandV1[]` | Canonical commands the extension registers. |
| `aliases` | `WpExtensionAliasV1[]` (optional) | Short names that resolve to accepted extension commands. |

`detect({ cwd, env })` must be fast, side-effect free, and repo-aware. Return
`false` for non-matching repos instead of registering commands that will fail
later.

## Set the host compatibility range

`hostRange` is checked before `detect()` and before any command registration.
The current range evaluator recognizes exact versions and caret ranges:

| Range | Accepted examples | Rejected examples |
| --- | --- | --- |
| `0.22.0` | `0.22.0` | `0.22.1`, `0.23.0` |
| `^0.22.0` | `0.22.0`, `0.22.5` | `0.21.9`, `0.23.0` |
| `^1.2.3` | `1.2.3`, `1.2.4`, `1.3.0` | `1.2.2`, `2.0.0` |

Do not rely on full npm semver syntax such as `>=`, `~`, `||`, or prerelease
range semantics unless the base contract explicitly adds support for them.

Downstream packages should keep their `hostRange` as narrow as their tests. For
pre-1.0 base hosts, `^0.<minor>.<patch>` means “this minor line only.”

## Command precedence

Base `wp` commands always win.

Registration rules:

1. Base commands are registered first.
2. Compatible extensions whose `detect()` returned `true` may register commands.
3. If an extension command name collides with a base command, that extension
   command is skipped with a warning.
4. If an extension command name collides with an earlier accepted extension
   command, the later command is skipped with a warning.

Downstream packages should give canonical commands specific names, such as a
framework or package prefix. Save short names like `dev` for aliases, not
canonical command names.

## Alias precedence

Aliases are convenience routes, not overrides. An alias is accepted only when all
of these conditions are true:

1. the extension loaded successfully;
2. `hostRange` matches the current base `wp` version;
3. `detect(context)` returned `true`;
4. `commandName` points to an accepted extension command;
5. the alias name does not collide with a base command;
6. the alias name does not collide with an accepted extension command;
7. no earlier accepted extension already claimed the alias name.

If two extensions request the same alias, the first accepted extension keeps it
and the later extension receives a warning. Do not depend on extension ordering
for important behavior; choose unique canonical commands and treat aliases as
optional sugar.

## Diagnostics and degradation

Extension diagnostics are warnings, not silent failures. In the CLI, warnings are
printed to stderr before command dispatch.

| Condition | Runtime behavior |
| --- | --- |
| Root package omits `webpresso.wpExtensions` or sets it to `false` | Extension loading stays disabled; base `wp` continues without warning. |
| Root package sets `webpresso.wpExtensions` to `true` | Every direct dependency, dev dependency, and optional dependency may advertise an extension. |
| Root package sets `webpresso.wpExtensions` to an array | Only named direct dependencies may advertise extensions. |
| `webpresso.wpExtensions` is neither `true` nor an array | Warn and skip extension loading. |
| `webpresso.wpExtensions` names a non-string or empty package entry | Warn and skip that entry. |
| `webpresso.wpExtensions` names a package that is not a direct dependency | Warn and skip that package. |
| Enabled direct dependency does not declare `webpresso.wpExtension` | Ignore that dependency without warning. |
| Enabled dependency declares `webpresso.wpExtension`, but the module cannot resolve | Warn and skip that extension. |
| Extension module import throws | Warn and skip that extension. |
| Module does not default-export `WpExtensionV1` | Warn and skip that extension. |
| `hostRange` does not match the current base `wp` version | Warn and skip that extension. |
| `detect()` returns `false` | Skip commands and aliases without warning; the repo simply does not match. |
| `detect()` throws | Warn and skip that extension. |
| Command collides with base or an accepted extension command | Warn and skip the colliding command. |
| Alias targets an unregistered command or collides with an existing command/alias | Warn and skip the alias. |

Warnings should name the package and the rejected extension, command, or alias so
downstream maintainers can fix the package without debugging base `wp` internals.

## Keep framework behavior out of base `wp`

The base runtime may own:

- the public `WpExtensionV1` types;
- package discovery through `webpresso.wpExtension`;
- host compatibility checks;
- command and alias collision policy;
- warning and degradation behavior.

The downstream extension must own:

- framework-specific repo detection;
- framework-specific commands and command help text;
- framework-specific aliases;
- framework package dependencies;
- framework docs and troubleshooting.

Do not add framework-specific config probes, environment variables, command
implementations, aliases, or package dependencies to base `wp`. If behavior only
makes sense when a framework package is installed, put it in that package's
extension module.

## Downstream handoff checklist

Before shipping an extension package:

- Add `webpresso.wpExtension` to the extension package manifest.
- Export a compiled default `WpExtensionV1` module from a public package subpath.
- Import types only from `@webpresso/agent-kit/wp-extension`.
- Set a tested `hostRange` and update it deliberately when the base contract
  changes.
- Keep `detect()` fast, side-effect free, and strict enough to avoid leaking
  aliases into non-matching repos.
- Use specific canonical command names; reserve short names for guarded aliases.
- Test missing module, invalid module, host mismatch, detect mismatch, command
  collision, and alias collision paths.
