---
type: guide
last_updated: '2026-06-10'
---

# wp hooks doctor

`wp hooks doctor` is the canonical post-setup operator success check. It performs a 3-way comparison:
1. What wp setup wrote (the hooks manifest at `.webpresso/hooks-manifest.json`)
2. What is actually installed (`.claude/settings.json`, `.codex/hooks.json`)
3. What wp currently expects (the canonical WP_HOOK_SPECS)

It also reports the public precedence model:

- **MCP first** — use `wp_*` tools when the host can see them
- **Direct `wp` fallback only** — use `wp ...` when MCP is unavailable
- **No wrappers** — do not use `bun run wp`, `pnpm run wp`, `npm run wp`, `yarn wp`, or `vp run wp`

## Verdicts

| Verdict | Meaning | Resolution |
|---|---|---|
| `ok` | Hook matches manifest and current spec | Nothing to do |
| `missing` | Hook in manifest but absent from installed config | Re-run `wp setup --with hooks` |
| `unknown` | Hook in installed config but not in manifest | Run `wp hooks status` to investigate |

## Running

```bash
wp hooks doctor
```

After a fresh `wp setup`, the success path is:

```bash
wp hooks doctor
```

Then in Claude or Codex, run the same read-only proof command:

```text
wp_audit(kind="docs-frontmatter")
```

With `--vendor` flag to check one vendor:
```bash
wp hooks doctor --vendor codex
```

Attempt the safe auto-repair lane:

```bash
wp hooks doctor --fix
```

`--fix` is intentionally honest:

- **`fixed`** — doctor applied the safe manifest-backed restore path or found nothing to change
- **`prepared`** — a safe restore path exists, but doctor is only describing it
- **`requires-approval`** — a broader `wp setup` run would be needed, so doctor refuses to do it automatically
- **`blocked`** — installed hook config appears hand-edited or otherwise unsafe to overwrite automatically

## Common scenarios

### All hooks show `missing`

The hooks were never installed or the config was reset. Re-run:
```bash
wp setup --with hooks
```

If a manifest already exists, `wp hooks doctor --fix` can use the narrower
restore path:

```bash
wp setup --restore-hooks
```

### Codex hooks show `pending-trust`

This is normal after first install. Trust the hooks:
```bash
codex hooks trust
```

### Some hooks show `unknown`

Hooks were added to the config outside of `wp setup`. These are safe but untracked.
Run `wp hooks status` first. `wp hooks doctor --fix` intentionally refuses to
overwrite these hand-edited/untracked entries automatically and prints the
preserved files it left untouched.

### Manifest absent

If `.webpresso/hooks-manifest.json` is missing, doctor treats all installed hooks as `unknown`.
Re-run `wp setup` to regenerate the manifest. `wp hooks doctor --fix` reports
this as `requires-approval` instead of silently running the broader setup flow
for you.
