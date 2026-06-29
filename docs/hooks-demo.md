---
type: guide
last_updated: "2026-06-08"
---

# Hooks demo

`wp hooks demo` is a pure simulation surface. It does **not** execute hooks,
rewrite configs, mutate trust state, or write hook logs. It only renders the
simulated verdicts for the current event/vendor/tool scenario.

## Basic usage

```bash
wp hooks demo SessionStart
wp hooks demo PreToolUse --tool Bash
wp hooks demo Stop --vendor codex
```

## Simulated verdicts

- `would-run` — the hook is registered and would run for this scenario
- `would-enforce` — the guard hook would run and enforce policy for this scenario
- `skipped-matcher` — the hook is installed, but the simulated tool did not match its matcher
- `disabled` — the vendor is explicitly disabled in `.webpresso/hooks-manifest.json`

## Example

```bash
wp hooks demo PreToolUse --tool Bash
```

This prints a labeled simulation of the hooks that would fire for a `PreToolUse`
event when the tool name is `Bash`.

## See also

- `wp hooks status`
- `wp hooks doctor`
- `wp setup repair --restore-hooks`
