import type { ToolInput, ValidationResult } from "#hooks/shared/types";

import { homedir } from "node:os";

import { getCommand, isBashInput } from "#hooks/shared/types";
import { createSkipResult } from "./skip-result.js";

const VALIDATOR_NAME = "worktree-discipline";

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
export function validateWorktreeDiscipline(input: ToolInput): ValidationResult {
  if (process.env.WORKTREE_DISCIPLINE_SKIP === "1") return createSkipResult(VALIDATOR_NAME);
  if (!isBashInput(input)) return { validator: VALIDATOR_NAME, passed: true };

  const command = getCommand(input);
  if (!command) return { validator: VALIDATOR_NAME, passed: true };

  const op = forbiddenGitOp(command);
  if (!op) return { validator: VALIDATOR_NAME, passed: true };

  const cwd = input.cwd ?? "";
  if (!isPrimaryReposCheckout(cwd)) return { validator: VALIDATOR_NAME, passed: true };

  return {
    validator: VALIDATOR_NAME,
    passed: false,
    message:
      `"${op}" in a primary checkout (${cwd}). Primary ~/repos checkouts stay on main; ` +
      `work in a managed worktree instead — run \`wp blueprint start <slug>\` (creates the ` +
      `bp/<slug> worktree), or cd into an existing ~/.agent/worktrees/ worktree. ` +
      `Bypass (exceptional): WORKTREE_DISCIPLINE_SKIP=1.`,
  };
}

/** A primary checkout = under ~/repos/ and NOT inside a managed worktree. */
function isPrimaryReposCheckout(cwd: string): boolean {
  if (!cwd) return false;
  if (cwd.includes("/.agent/worktrees/")) return false;
  const reposRoot = `${homedir()}/repos/`;
  return cwd === `${homedir()}/repos` || cwd.startsWith(reposRoot);
}

/** Returns the human label of the forbidden git op, or null if the command is allowed. */
function forbiddenGitOp(command: string): string | null {
  if (!/\bgit\b/.test(command)) return null;
  if (/\bgit\s+commit\b/.test(command)) return "git commit";
  if (/\bgit\s+switch\b(?!\s+(?:-h|--help)\b)/.test(command)) return "git switch";
  if (/\bgit\s+checkout\s+-b\b/.test(command)) return "git checkout -b";
  // branch CREATION only: `git branch <name>`; allow listing/info/delete flags.
  if (/\bgit\s+branch\s+(?!-|--)\S/.test(command)) return "git branch <name>";
  return null;
}
