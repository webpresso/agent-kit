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
 * `cd <dir>` (incl. env-prefixed / `command` / `builtin` forms) and then by
 * EVERY `git -C <dir>` flag on the matched invocation (git applies them
 * cumulatively). So `cd <worktree> && git commit` is judged against the
 * worktree. It is **fail-closed**: an unresolvable `cd`/`-C` target (shell
 * expansion / command substitution / glob) BLOCKS, since it could hide a move
 * into a primary checkout.
 *
 * Known best-effort limits (acceptable for an agent guard with a documented
 * `WORKTREE_DISCIPLINE_SKIP=1` escape — the threat model is accidental misuse,
 * not an adversary evading its own guard): subshell-scoped `cd` that does not
 * persist (`(cd /x) && git …`) is over-trusted; a forbidden git literal inside a
 * quoted argument (`echo "git commit"`) is matched; and `popd` / dir-stack
 * unwinding is not modeled.
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

  // Evaluate EVERY forbidden op in the (possibly compound) command: block if any
  // one of them runs in a primary checkout, not just the first by check order.
  for (const op of forbiddenGitOps(command)) {
    const effective = resolveEffectiveCwd(command, input.cwd ?? "", op.globals, op.index);
    if (effective.ambiguous) return blocked(op.label, input.cwd ?? "", true);
    if (isPrimaryReposCheckout(effective.cwd)) return blocked(op.label, effective.cwd, false);
  }
  return { validator: VALIDATOR_NAME, passed: true };
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
const QUOTED_ARG = `(?:"[^"]+"|'[^']+'|\\S+)`;
// A `cd`/`pushd` that changes the shell's dir: after a separator, optionally
// preceded by env-assignments (`FOO=1 `) and a `command`/`builtin` prefix.
const CD_SEGMENT = new RegExp(
  `(?:^|&&|;|\\|\\||\\(|\\{)\\s*(?:[A-Za-z_]\\w*=\\S*\\s+)*(?:command\\s+|builtin\\s+)?(?:cd|pushd)\\s+(?!-)${DIR_TOKEN}`,
  "gu",
);
const DASH_C = new RegExp(`-C\\s+${DIR_TOKEN}`, "gu");

type EffectiveCwd = { ambiguous: true } | { ambiguous: false; cwd: string };

/** Apply one dir token to `cwd`, or signal ambiguity if it cannot be statically resolved. */
function applyDir(token: string | undefined, cwd: string): { cwd: string } | "ambiguous" {
  if (!token) return { cwd };
  if (isUnresolvable(stripQuotes(token))) return "ambiguous";
  return { cwd: resolveDir(token, cwd) };
}

/**
 * The directory the git op actually runs in: `baseCwd` advanced through each
 * leading `cd <dir>` segment, then through EVERY `git -C <dir>` flag on the
 * matched invocation (git rebases cwd per `-C`, cumulatively). Returns
 * `{ ambiguous: true }` when any target cannot be statically resolved — the
 * caller fails closed so an unparseable move into a primary checkout cannot slip
 * past.
 */
function resolveEffectiveCwd(
  command: string,
  baseCwd: string,
  opGlobals: string,
  opIndex: number,
): EffectiveCwd {
  let cwd = baseCwd;
  for (const m of command.matchAll(CD_SEGMENT)) {
    // Only `cd`s BEFORE the forbidden op establish its cwd; a trailing
    // `… && git commit && cd /tmp` must not be judged against /tmp.
    if (m.index !== undefined && m.index >= opIndex) break;
    const next = applyDir(m[1], cwd);
    if (next === "ambiguous") return { ambiguous: true };
    cwd = next.cwd;
  }
  for (const m of opGlobals.matchAll(DASH_C)) {
    const next = applyDir(m[1], cwd);
    if (next === "ambiguous") return { ambiguous: true };
    cwd = next.cwd;
  }
  return { ambiguous: false, cwd };
}

// git global options that may sit between `git` and the subcommand: `-C <dir>`
// and `-c <kv>` (arg-taking), plus common flags. Skipping them means
// `git -C <dir> commit` is still recognised as a commit op, and the captured run
// is replayed by resolveEffectiveCwd to honor every `-C`.
const GIT_GLOBAL_RUN =
  `(?:-C\\s+${QUOTED_ARG}\\s+|-c\\s+${QUOTED_ARG}\\s+|--git-dir=\\S+\\s+|` +
  `--work-tree=\\S+\\s+|-p\\s+|--no-pager\\s+|--paginate\\s+)*`;

type ForbiddenOp = { label: string; globals: string; index: number };

// Any forbidden subcommand: commit, switch (not -h/--help), checkout -b, or
// branch CREATION (`branch <name>`; listing/info/delete flags are allowed).
const FORBIDDEN_SUBCOMMAND =
  "(commit\\b|switch\\b(?!\\s+(?:-h|--help)\\b)|checkout\\s+-b\\b|branch\\s+(?!-|--)\\S)";
const FORBIDDEN_OP = new RegExp(`\\bgit\\s+(${GIT_GLOBAL_RUN})${FORBIDDEN_SUBCOMMAND}`, "gu");

function labelFor(subcommand: string): string {
  if (subcommand.startsWith("commit")) return "git commit";
  if (subcommand.startsWith("switch")) return "git switch";
  if (subcommand.startsWith("checkout")) return "git checkout -b";
  return "git branch <name>";
}

/** Every forbidden git op in the command (label, its global-option run, position). */
function forbiddenGitOps(command: string): ForbiddenOp[] {
  if (!/\bgit\b/.test(command)) return [];
  const ops: ForbiddenOp[] = [];
  for (const m of command.matchAll(FORBIDDEN_OP)) {
    ops.push({ label: labelFor(m[2] ?? ""), globals: m[1] ?? "", index: m.index ?? 0 });
  }
  return ops;
}
