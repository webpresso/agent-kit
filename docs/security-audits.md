---
type: guide
last_updated: "2026-06-12"
---

# Security audits

`@webpresso/agent-kit` ships governance audit subcommands that enforce
secret hygiene across every repo that uses it. They run identically as a
`wp audit <kind>` CLI command, a `wp_audit` MCP tool call, and a
pre-commit/CI gate.

## Gate behaviour

Every audit checks for `.webpresso/secrets.config.json` at the repo root
before scanning. If the file is absent the audit exits immediately with
`ok: true, checked: 0` — no violations, no noise. This means:

- Repos that have not opted in are never penalised.
- The audits are safe to wire into shared CI templates that run across mixed
  repos.

Once `.webpresso/secrets.config.json` is present the audit runs in full.

## Audits

### `secrets-policy`

Scans both the working tree and git-tracked history for forbidden secret
carriers.

**Catches:**

- `.env`, `.env.*`, `.dev.vars`, `.dev.vars.*`
- Common credential file names (`credentials.json`, `*.pem`, `*.key`,
  `service-account*.json`, etc.)
- Any tracked file whose content matches a secret-value pattern (high-entropy
  tokens, API key shapes)

**Why two passes?** A file can be deleted from disk but remain in git history.
The git-tracked pass catches files that were committed and then removed, so
the violation surfaces before a push rather than after a security scan.

```bash
wp audit secrets-policy
# or via MCP:
wp_audit(kind="secrets-policy")
```

### `no-dev-vars`

Flags `.dev.vars` and `.env` files anywhere in the repo tree. These files
are the primary vector for Cloudflare Workers and Node.js local-dev secrets
leaking into commits.

```bash
wp audit no-dev-vars
```

This audit is intentionally narrow — it only checks for file presence, not
content. Pair it with `secrets-policy` for content-level enforcement.

### `secret-provider-quarantine`

Scans source files for direct secret-provider CLI invocations and
provider-specific flags. Consumer code must go through the
`wp secrets run --sink <sink> --profile <profile> -- <cmd>` abstraction, which selects the configured provider
at runtime rather than hard-coding it.

**Catches:**

- Direct invocation of the secret manager CLI (e.g. the provider's own
  `run` subcommand)
- Provider-specific flags passed to the legacy secret wrapper (e.g. `--doppler`,
  `--infisical`) instead of the provider-neutral form
- Direct provider `secrets download` calls
- Imports of the deprecated internal secret-runner runtime path (use `@webpresso/framework/runtime/env` instead)

```bash
wp audit secret-provider-quarantine
```

**Scans:** all `.md`, `.ts`, `.tsx`, `.js`, `.json`, `.yaml`, `.toml`, `.txt`
files, excluding `node_modules`, `.git`, `dist`, `coverage`, `.claude`,
`.codex`, `.omx`, and `blueprints`.

### `secrets-config`

Validates `.webpresso/secrets.config.json`:

1. File exists (if absent, returns `ok: true, checked: 0` — see gate behaviour)
2. Content is valid JSON
3. No field value matches a secret-value pattern (high-entropy string, known
   token shapes)

This catches the common mistake of putting an actual secret value into the
config file, which is meant to hold only metadata (provider name, project ID,
environment name).

```bash
wp audit secrets-config
```

### `consumer-agent-kit-dependency`

Fails when a consumer repo keeps `@webpresso/agent-kit` in `dependencies` or
`devDependencies`, or keeps retired local setup-webpresso ownership artifacts.
The approved boundary is:

- local presets/config only via `@webpresso/agent-config`
- `wp` execution through the global CLI / MCP surface
- no repo-local `@webpresso/agent-kit` project dependency
- no repo-local setup-webpresso action or version-resolution helper

The audit automatically skips the `@webpresso/agent-kit` source repo itself.

```bash
wp audit consumer-agent-kit-dependency
```

## Pre-commit wiring

Add to `.husky/pre-commit`:

```sh
#!/usr/bin/env sh
set -eu
wp audit secrets-policy
wp audit no-dev-vars
wp audit secret-provider-quarantine
wp audit secrets-config
```

## CI wiring

In `.github/workflows/ci.yml`:

```yaml
- name: Audit secrets governance
  run: |
    wp audit secrets-policy
    wp audit no-dev-vars
    wp audit secret-provider-quarantine
    wp audit secrets-config
```

## MCP usage

All supported audits are available through the `wp_audit` MCP tool:

```
wp_audit(kind="secrets-policy")
wp_audit(kind="no-dev-vars")
wp_audit(kind="secret-provider-quarantine")
wp_audit(kind="secrets-config")
wp_audit(kind="consumer-agent-kit-dependency")
```

Each returns a structured result:

```json
{
  "ok": false,
  "title": "secrets-policy",
  "checked": 12,
  "violations": [{ "file": ".env", "message": ".env: forbidden secret carrier" }]
}
```

## `.webpresso/secrets.config.json` format

```json
{
  "schemaVersion": 1,
  "providers": {
    "default": {
      "type": "doppler",
      "project": "my-project"
    }
  },
  "profiles": {},
  "sinks": {}
}
```

Valid top-level fields: `schemaVersion`, `providers`, `profiles`, and `sinks`.
The reusable workflow shell reads `providers.default.type` and
`providers.default.project`. No secret values — only metadata.

## Source

- [`src/audit/secrets-policy.ts`](../src/audit/secrets-policy.ts)
- [`src/audit/no-dev-vars.ts`](../src/audit/no-dev-vars.ts)
- [`src/audit/secret-provider-quarantine.ts`](../src/audit/secret-provider-quarantine.ts)
- [`src/audit/secrets-config.ts`](../src/audit/secrets-config.ts)
- [`src/audit/lib/secrets-policy.ts`](../src/audit/lib/secrets-policy.ts) — shared types and helpers
