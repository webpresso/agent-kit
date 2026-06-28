import type { ToolInput, ValidationResult } from "#hooks/shared/types";

import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

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

  const cwd = effectiveCwd(command, input.cwd ?? "");
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

function stripQuotes(value: string): string {
  const first = value[0];
  if ((first === '"' || first === "'") && value.at(-1) === first) return value.slice(1, -1);
  return value;
}

/** Resolve a `cd`/`-C` target (handling quotes, `~`, and relative paths) to an absolute dir. */
function resolveDir(raw: string, base: string): string {
  let dir = stripQuotes(raw);
  if (dir === "~") dir = homedir();
  else if (dir.startsWith("~/")) dir = `${homedir()}/${dir.slice(2)}`;
  return isAbsolute(dir) ? dir : resolve(base || homedir(), dir);
}

const CD_SEGMENT = /(?:^|&&|;|\|\||\(|\{)\s*cd\s+(?!-)("[^"]+"|'[^']+'|[^\s;&|(){}]+)/g;
const GIT_DASH_C = /\bgit\s+(?:-c\s+\S+\s+)*-C\s+("[^"]+"|'[^']+'|[^\s;&|(){}]+)/;

/**
 * The directory the git op actually runs in: `baseCwd` advanced through each
 * leading `cd <dir>` segment, then overridden by a `git -C <dir>` flag. Honoring
 * these matches the command's real behavior, so `cd <worktree> && git commit` is
 * evaluated against the worktree rather than the tool's ambient (often primary)
 * cwd. Bare commits and `cd <primary> && git commit` still resolve to primary.
 */
function effectiveCwd(command: string, baseCwd: string): string {
  let cwd = baseCwd;
  for (const m of command.matchAll(CD_SEGMENT)) {
    if (m[1]) cwd = resolveDir(m[1], cwd);
  }
  const dashC = GIT_DASH_C.exec(command);
  if (dashC?.[1]) cwd = resolveDir(dashC[1], cwd);
  return cwd;
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
