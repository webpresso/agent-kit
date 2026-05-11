---
"@webpresso/agent-kit": patch
---

`ak audit no-relative-parent-imports` now also skips `.stryker-tmp/`
directories (mutation-testing sandboxes — gitignored, generated per
package). Without this skip, the audit reports parent-path violations
on tsconfigs Stryker materialises inside `<pkg>/.stryker-tmp/sandbox-*/`,
which are throwaway copies that legitimately point back at sibling
packages and would otherwise force every Stryker-using consumer to
exclude paths manually.
