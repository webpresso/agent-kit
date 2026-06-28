# Review ledger — worktree-discipline-honor-effective-cwd

Committed second-brain record of every review round (approvals AND rejections).
Machine-gate truth lived in `_overview.md` frontmatter `approvals:` for promotion; this is the
human-readable history + rejection reasoning worth keeping after completion.

| Date       | Reviewer      | Rev   | Verdict           | Note                                                                                                                                              |
| ---------- | ------------- | ----- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-28 | codex         | 1     | REJECT            | Initial effective-cwd fix missed env-prefixed/`command`/`builtin` cd forms, unresolved targets, and other shell ambiguity risks.                  |
| 2026-06-28 | codex         | 2     | REJECT            | Multiple cumulative `git -C` flags were not applied in order.                                                                                     |
| 2026-06-28 | codex         | 3     | REJECT            | `cd` segments after the forbidden git op were incorrectly applied to the op.                                                                      |
| 2026-06-28 | eng-review    | 4     | APPROVE           | Security-focused Claude review approved the best-effort guard and called out the multi-op gap that was then fixed.                                |
| 2026-06-28 | codex         | 4     | REJECT            | Only the first forbidden git op in a compound command was evaluated; later primary mutations could slip through.                                  |
| 2026-06-28 | deepseek      | 5     | APPROVE           | Approved rev with all-op/cumulative-`-C` handling; later Codex found one subshell semantic blocker.                                               |
| 2026-06-28 | codex         | 5     | REJECT            | Subshell `(cd /tmp) && git commit` was treated as a persistent cwd change; fixed by ignoring `(`-scoped cd for later ops.                         |
| 2026-06-28 | deepseek      | final | APPROVE           | Final rev correctly models persistent cd/pushd, cumulative `git -C`, fail-closed ambiguity, compound ops, and non-persistent subshell cd.         |
| 2026-06-28 | codex         | final | APPROVE-WITH-NITS | No blocking correctness/security hole. Nit: regex/static shell model is best-effort, acceptable under the documented agent-guard threat model.    |
| 2026-06-28 | critic        | post  | REJECT            | Post-merge-head review caught remaining checkout/config/env bypass classes: `git checkout -q -`, `--detach`, `--config-env`, and `GIT_CONFIG_*`.  |
| 2026-06-28 | code-reviewer | post  | APPROVE           | Confirmed checkout restore, multi-cd, nested shell/eval/env, checkout dash, env `-C`, and escaped-cd cases were fixed; 57 validator tests passed. |
| 2026-06-28 | critic        | final | APPROVE           | Approved the final branch after the additional bypass fixes and resync; PR #294 merged with CI green.                                             |

**Outcome:** ≥2 distinct approvals (codex + deepseek) promoted the blueprint to `planned`; later critic/code-reviewer rounds approved the final implementation before PR #294 merged.
