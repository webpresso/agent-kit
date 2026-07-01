import type { ToolInput, ValidationResult } from "#hooks/shared/types";
/**
 * Primary-on-main discipline (governance Piece 3).
 *
 * Primary checkouts under `~/repos/*` must stay on `main` and never be worked on
 * directly — branch/commit work happens in a managed `bp/<slug>` worktree under
 * `~/.agent/worktrees/`. This validator gives STRONG AGENT-LEVEL prevention: it
 * blocks the branch-mutating / commit git ops when the effective cwd is a
 * primary `~/repos/*` checkout (not a worktree). It is NOT a hard git guard —
 * direct shell/git outside the agent can bypass it (documented in
 * `catalog/agent/rules/pre-implementation.md`).
 *
 * ```
 *  effective cwd under ~/.agent/worktrees/  → ALLOW (managed worktree)
 *  effective cwd under ~/repos/* (primary)  → BLOCK git switch | checkout -b | branch <name> | commit
 *  effective cwd elsewhere (e.g. CI)        → ALLOW (rule scoped to local ~/repos primaries)
 * ```
 *
 * The "effective cwd" is the tool's ambient `input.cwd`, lowered only by a
 * success-gated cwd chain that directly governs the forbidden git op, e.g.
 * `cd <worktree> && git commit` or `(cd <worktree> && git commit)`, then by
 * EVERY `git -C <dir>` flag on the matched invocation (git applies them
 * cumulatively). Unsupported cwd-changing control flow, option-bearing `cd`,
 * `cd -`, or unresolvable `cd`/`-C` targets fail closed because they could hide
 * a primary-checkout mutation. Prefer `git -C <worktree> ...` or running the
 * command with the tool cwd already set to the worktree.
 *
 * Known best-effort limits (acceptable for an agent guard with a documented
 * `WORKTREE_DISCIPLINE_SKIP=1` escape — the threat model is accidental misuse,
 * not an adversary evading its own guard): a forbidden git literal inside a
 * quoted argument (`echo "git commit"`) is matched, and `popd` / dir-stack
 * unwinding is not modeled.
 *
 * Conservative on `git checkout`: branch switches/creation are blocked in
 * primary checkouts, but explicit file restores (`git checkout -- file`,
 * `git checkout -- .`) are allowed. Branch *listing* (`git branch`, `-a`,
 * `--list`, …) is allowed; branch creation/copy/move/reset forms are blocked.
 */
export declare function validateWorktreeDiscipline(input: ToolInput): ValidationResult;
//# sourceMappingURL=worktree-discipline.d.ts.map