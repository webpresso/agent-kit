---
"@webpresso/agent-kit": patch
---

fix(doctor): resolve agent-kit root past the native runtime-payload package

`wp hooks doctor`, invoked through the compiled native `wp` runtime, reported
false-negative failures on `plugin.json integrity`, `root launcher contract`,
and `native plugin runtime`. `resolveAgentKitPackageRoot()` walked up from the
running module path and stopped at the runtime-payload sub-package
(`@webpresso/agent-kit-runtime-<os>-<cpu>`), which ships a native `bin/wp` but
no `.claude-plugin/plugin.json`. `isAgentKitPackageRoot()` now rejects
runtime-payload packages (by `package.json#name`), so resolution continues up
to the real `@webpresso/agent-kit` package. Fixes every resolver caller, not
just the doctor.
