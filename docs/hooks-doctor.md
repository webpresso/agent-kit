---
type: guide
last_updated: '2026-06-07'
---

# wp hooks doctor

`wp hooks doctor` performs a 3-way comparison:
1. What wp setup wrote (the hooks manifest at `.webpresso/hooks-manifest.json`)
2. What is actually installed (`.claude/settings.json`, `.codex/hooks.json`)
3. What wp currently expects (the canonical WP_HOOK_SPECS)

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

With `--vendor` flag to check one vendor:
```bash
wp hooks doctor --vendor codex
```

## Common scenarios

### All hooks show `missing`

The hooks were never installed or the config was reset. Re-run:
```bash
wp setup --with hooks
```

### Codex hooks show `pending-trust`

This is normal after first install. Trust the hooks:
```bash
codex hooks trust
```

### Some hooks show `unknown`

Hooks were added to the config outside of `wp setup`. These are safe but untracked.
Run `wp setup --with hooks` to bring them under manifest management.

### Manifest absent

If `.webpresso/hooks-manifest.json` is missing, doctor treats all installed hooks as `unknown`.
Re-run `wp setup --with hooks` to regenerate the manifest.
