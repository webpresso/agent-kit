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
 * The "effective cwd" is the tool's ambient `input.cwd` advanced by any leading
 * `cd <dir>` (incl. env-prefixed / `command` / `builtin` forms) and overridden
 * by a `git -C <dir>` flag, so `cd <worktree> && git commit` is judged against
 * the worktree. It is **fail-closed**: an unresolvable `cd`/`-C` target (shell
 * expansion / command substitution / glob) BLOCKS, since it could hide a move
 * into a primary checkout.
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

  const effective = resolveEffectiveCwd(command, input.cwd ?? "");
  if (effective.ambiguous) return blocked(op, input.cwd ?? "", true);
  if (!isPrimaryReposCheckout(effective.cwd)) return { validator: VALIDATOR_NAME, passed: true };
  return blocked(op, effective.cwd, false);
}

function blocked(op: string, cwd: string, ambiguous: boolean): ValidationResult {
  const where = ambiguous
    ? "with an unresolved cd/-C target (cannot prove it stays out of a primary ~/repos checkout)"
    : `in a primary checkout (${cwd})`;
  return {
    validator: VALIDATOR_NAME,
    passed: false,
    message:
      `"${op}" ${where}. Primary ~/repos checkouts stay on main; work in a managed ` +
      `worktree instead — run \`wp blueprint start <slug>\` (creates the bp/<slug> ` +
      `worktree), or cd into an existing ~/.agent/worktrees/ worktree. ` +
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

/** A target we cannot statically resolve: shell expansion/substitution, glob, or another user's `~`. */
function isUnresolvable(token: string): boolean {
  return /[$`*?]/u.test(token) || /^~[^/]/u.test(token);
}

const DIR_TOKEN = `("[^"]+"|'[^']+'|[^\\s;&|(){}]+)`;
// A `cd` that actually changes the shell's dir: after a separator, optionally
// preceded by env-assignments (`FOO=1 `) and a `command`/`builtin` prefix.
const CD_SEGMENT = new RegExp(
  `(?:^|&&|;|\\|\\||\\(|\\{)\\s*(?:[A-Za-z_]\\w*=\\S*\\s+)*(?:command\\s+|builtin\\s+)?cd\\s+(?!-)${DIR_TOKEN}`,
  "gu",
);
const GIT_DASH_C = new RegExp(`\\bgit\\s+(?:-c\\s+\\S+\\s+)*-C\\s+${DIR_TOKEN}`, "u");

type EffectiveCwd = { ambiguous: true } | { ambiguous: false; cwd: string };

/**
 * The directory the git op actually runs in: `baseCwd` advanced through each
 * leading `cd <dir>` segment, then overridden by a `git -C <dir>` flag. Returns
 * `{ ambiguous: true }` when a target cannot be statically resolved — the caller
 * fails closed so an unparseable move into a primary checkout cannot slip past.
 */
function resolveEffectiveCwd(command: string, baseCwd: string): EffectiveCwd {
  let cwd = baseCwd;
  for (const m of command.matchAll(CD_SEGMENT)) {
    const token = m[1];
    if (!token) continue;
    if (isUnresolvable(stripQuotes(token))) return { ambiguous: true };
    cwd = resolveDir(token, cwd);
  }
  const dashC = GIT_DASH_C.exec(command);
  if (dashC?.[1]) {
    if (isUnresolvable(stripQuotes(dashC[1]))) return { ambiguous: true };
    cwd = resolveDir(dashC[1], cwd);
  }
  return { ambiguous: false, cwd };
}

// git global options that may sit between `git` and the subcommand: `-C <dir>`,
// `-c <kv>` (arg-taking), and common flags. Skipping them means `git -C <dir>
// commit` is still recognised as a commit op (and its -C is resolved by
// resolveEffectiveCwd).
const GIT_GLOBAL =
  "(?:-C\\s+\\S+\\s+|-c\\s+\\S+\\s+|--git-dir=\\S+\\s+|--work-tree=\\S+\\s+|-p\\s+|--no-pager\\s+|--paginate\\s+)*";
const gitOp = (subcommand: string): RegExp =>
  new RegExp(`\\bgit\\s+${GIT_GLOBAL}${subcommand}`, "u");

/** Returns the human label of the forbidden git op, or null if the command is allowed. */
function forbiddenGitOp(command: string): string | null {
  if (!/\bgit\b/.test(command)) return null;
  if (gitOp("commit\\b").test(command)) return "git commit";
  if (gitOp("switch\\b(?!\\s+(?:-h|--help)\\b)").test(command)) return "git switch";
  if (gitOp("checkout\\s+-b\\b").test(command)) return "git checkout -b";
  // branch CREATION only: `git branch <name>`; allow listing/info/delete flags.
  if (gitOp("branch\\s+(?!-|--)\\S").test(command)) return "git branch <name>";
  return null;
}
