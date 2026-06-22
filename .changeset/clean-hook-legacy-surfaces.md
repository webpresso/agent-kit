---
"@webpresso/agent-kit": patch
---

Simplify generated Claude/Codex hooks to dispatch directly through `wp hook <name>`, remove legacy JS shim and shell-wrapper hook surfaces, and drop agent-kit-owned gstack/OMX wrapper normalization from the normal setup path.

Add affected-only blueprint lifecycle pre-push coverage so local verification catches PR-touched blueprint lifecycle failures without sweeping unrelated blueprint debt.
