import type { ToolInput, ValidationResult } from "#hooks/shared/types";
/**
 * Primary-on-main discipline (governance Piece 3).
 *
 * Primary checkouts under `~/repos/*` must stay on `main` and never be worked on
 * directly — branch/commit work happens in a managed `bp/<slug>` worktree under
 * `~/.agent/worktrees/`. This validator gives STRONG AGENT-LEVEL prevention: it
 * blocks the branch-mutating / commit git ops when the cwd is a primary
 * `~/repos/*` checkout (not a worktree). It is NOT a hard git guard — direct
 * shell/git outside the agent can bypass it (documented in
 * `catalog/agent/rules/pre-implementation.md`).
 *
 * ```
 *  cwd under ~/.agent/worktrees/  → ALLOW (managed worktree)
 *  cwd under ~/repos/* (primary)  → BLOCK git switch | checkout -b | branch <name> | commit
 *  cwd elsewhere (e.g. CI)        → ALLOW (rule scoped to local ~/repos primaries)
 * ```
 *
 * Conservative on `git checkout`: only `checkout -b` (new branch) is blocked;
 * bare `git checkout <ref/path>` is left alone so file restores
 * (`git checkout -- file`, `git checkout .`) are never false-positives. Branch
 * *listing* (`git branch`, `-a`, `--list`, …) is allowed; only branch *creation*
 * (`git branch <name>`) is blocked.
 */
export declare function validateWorktreeDiscipline(input: ToolInput): ValidationResult;
//# sourceMappingURL=worktree-discipline.d.ts.map