---
"@webpresso/agent-kit": minor
---

Make `wp setup` self-aware in the agent-kit source repo. Instead of refusing to
run (or requiring the blunt `--source-maintenance` override), running setup in
the `@webpresso/agent-kit` source tree now enters a phased self-host mode:
`wp setup` reports drift in check-only mode by default, and source writes are
gated behind `wp setup --apply --phase <hook-contracts|projections|agents-md|gitignore|runtime-hooks|all-safe>`.
Applies are refused when there are dirty paths outside the selected phase's
allowlist, and `--cleanup-gitignored-index` opts the gitignore phase into
untracking generated paths.
