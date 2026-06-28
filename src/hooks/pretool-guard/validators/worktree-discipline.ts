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
    if (hasGitTargetOverride(op.globals)) return blocked(op.label, input.cwd ?? "", true);
    const effective = resolveEffectiveCwd(command, input.cwd ?? "", op.globals, op.index);
    if (effective.ambiguous) return blocked(op.label, input.cwd ?? "", true);
    if (isPrimaryReposCheckout(effective.cwd)) return blocked(op.label, effective.cwd, false);
  }

  if (hasAmbiguousGitMutationSyntax(command)) return blocked("git", input.cwd ?? "", true);
  return { validator: VALIDATOR_NAME, passed: true };
}

function blocked(op: string, cwd: string, ambiguous: boolean): ValidationResult {
  const where = ambiguous
    ? "with unsupported or unresolved cd/-C syntax (cannot prove it stays out of a primary ~/repos checkout)"
    : `in a primary checkout (${cwd})`;
  return {
    validator: VALIDATOR_NAME,
    passed: false,
    message:
      `"${op}" ${where}. Primary ~/repos checkouts stay on main; work in a managed ` +
      `worktree instead — run \`wp blueprint start <slug>\` (creates the bp/<slug> ` +
      `worktree), cd into an existing ~/.agent/worktrees/ worktree, or use ` +
      `\`git -C <worktree> ...\`. Bypass (exceptional): WORKTREE_DISCIPLINE_SKIP=1.`,
  };
}

/** A primary checkout = under ~/repos/ and NOT inside a managed worktree. */
function isPrimaryReposCheckout(cwd: string): boolean {
  if (!cwd) return false;
  const managedWorktreesRoot = `${homedir()}/.agent/worktrees/`;
  if (cwd === `${homedir()}/.agent/worktrees` || cwd.startsWith(managedWorktreesRoot)) return false;
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

/** A target we cannot statically resolve: shell expansion/substitution, glob, `cd -`, or another user's `~`. */
function isUnresolvable(token: string): boolean {
  return token === "-" || /[$`*?]/u.test(token) || /^~[^/]/u.test(token);
}

const GIT_TARGET_OVERRIDE = /(?:^|\s)(?:--git-dir(?:=|\s)|--work-tree(?:=|\s))/u;

function hasGitTargetOverride(globals: string): boolean {
  return GIT_TARGET_OVERRIDE.test(globals);
}

function shellWords(fragment: string): string[] | "ambiguous" {
  const words: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (const ch of fragment.trim()) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (quote !== "'" && ch === "\\") {
      escaped = true;
      continue;
    }
    if ((ch === '"' || ch === "'") && (quote === null || quote === ch)) {
      quote = quote === ch ? null : ch;
      continue;
    }
    if (!quote && /\s/u.test(ch)) {
      if (current) words.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (escaped || quote) return "ambiguous";
  if (current) words.push(current);
  return words;
}

function splitShellSegments(command: string): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (const ch of command) {
    if (escaped) {
      current += `\\${ch}`;
      escaped = false;
      continue;
    }
    if (quote === '"' && ch === "\\") {
      escaped = true;
      continue;
    }
    if ((ch === '"' || ch === "'") && (quote === null || quote === ch)) {
      quote = quote === ch ? null : ch;
      current += ch;
      continue;
    }
    if (!quote && /[;&|(){}]/u.test(ch)) {
      if (current.trim()) segments.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) segments.push(current);
  return segments;
}

function mutationLabelFromGitArgs(args: string[]): string | null {
  for (let i = 0; i < args.length; i += 1) {
    const word = args[i];
    if (!word) continue;
    if (word === "-C" || word === "-c" || word === "--git-dir" || word === "--work-tree") {
      i += 1;
      continue;
    }
    if (
      word.startsWith("-C") ||
      word.startsWith("-c") ||
      word.startsWith("--git-dir=") ||
      word.startsWith("--work-tree=")
    )
      continue;
    if (word === "-p" || word === "--paginate" || word === "--no-pager") continue;
    if (word.startsWith("-")) continue;

    if (word === "commit") return "git commit";
    if (word === "switch")
      return args[i + 1] === "-h" || args[i + 1] === "--help" ? null : "git switch";
    if (word === "checkout")
      return args[i + 1] === "-b" || args[i + 1] === "-B" || args[i + 1] === "--orphan"
        ? "git checkout"
        : null;
    if (word === "branch") {
      const next = args[i + 1];
      if (!next) return null;
      return !next.startsWith("-") || next === "--track" || next === "-c" || next === "-C"
        ? "git branch"
        : null;
    }
    return null;
  }
  return null;
}

function hasUnsupportedGlobalBeforeMutation(args: string[]): boolean {
  let unsupported = false;
  for (let i = 0; i < args.length; i += 1) {
    const word = args[i];
    if (!word) continue;
    if (word === "-C" || word === "-c" || word === "--git-dir" || word === "--work-tree") {
      i += 1;
      continue;
    }
    if (
      word.startsWith("-C") ||
      word.startsWith("-c") ||
      word.startsWith("--git-dir=") ||
      word.startsWith("--work-tree=")
    )
      continue;
    if (word === "-p" || word === "--paginate" || word === "--no-pager") continue;
    if (word.startsWith("-")) {
      unsupported = true;
      continue;
    }
    return unsupported && mutationLabelFromGitArgs(args.slice(i)) !== null;
  }
  return false;
}

function hasEnvTargetOverrideBeforeGit(words: string[], gitIndex: number): boolean {
  for (let i = 0; i < gitIndex; i += 1) {
    const word = words[i];
    if (!word) continue;
    if (word.startsWith("GIT_DIR=") || word.startsWith("GIT_WORK_TREE=")) return true;
    if (word === "env") continue;
    if (word === "-C" && i + 1 < gitIndex) return true;
  }
  return false;
}

function hasAmbiguousGitMutationSyntax(command: string): boolean {
  // Nested shells/eval re-interpret quoted code; do not try to model their cwd.
  if (
    /\b(?:bash|sh|zsh)\b[^;&|(){}]*(?:-c|-lc)\s+["'][^"']*\bgit\s+(?:commit|switch|checkout|branch)\b/u.test(
      command,
    )
  )
    return true;
  if (/\beval\s+["'][^"']*\bgit\s+(?:commit|switch|checkout|branch)\b/u.test(command)) return true;

  for (const segment of splitShellSegments(command)) {
    const words = shellWords(segment);
    if (words === "ambiguous")
      return /\bgit\b/u.test(segment) && /\b(?:commit|switch|checkout|branch)\b/u.test(segment);

    for (let i = 0; i < words.length; i += 1) {
      if (words[i] !== "git") continue;
      const args = words.slice(i + 1);
      const mutation = mutationLabelFromGitArgs(args);
      if (!mutation) continue;
      if (hasEnvTargetOverrideBeforeGit(words, i)) return true;
      if (
        args.some(
          (word) =>
            word === "--git-dir" ||
            word === "--work-tree" ||
            word.startsWith("--git-dir=") ||
            word.startsWith("--work-tree="),
        )
      )
        return true;
      if (hasUnsupportedGlobalBeforeMutation(args)) return true;
      // If the shell-tokenized form is a mutation but the literal regex did not
      // match it, quotes or escapes changed argv shape. Fail closed.
      if (forbiddenGitOps(segment).length === 0) return true;
    }
  }
  return false;
}

const DIR_TOKEN = String.raw`(?:"[^"]+"|'[^']+'|[^\s;&|(){}]+)`;
const QUOTED_ARG = String.raw`(?:"[^"]+"|'[^']+'|\S+)`;
const CD_TARGET = String.raw`(?:--\s+)?(${DIR_TOKEN}|-)`;
const CD_LEADER = String.raw`(?:[A-Za-z_]\w*=\S*\s+)*(?:command\s+|builtin\s+)?(?:cd|pushd)\s+`;
const CD_START = String.raw`(?:^|&&|\(|\{)`;
// A success-gated cwd chain that directly governs the forbidden git op. We only
// trust cwd changes in this shape; `;`, `||`, skipped/failed `cd`, quoted spoof
// text, and other unsupported shell control flow fail closed instead.
const CD_CHAIN = new RegExp(String.raw`(?:${CD_START}\s*${CD_LEADER}${CD_TARGET}\s*&&\s*)+$`, "u");
const CD_IN_CHAIN = new RegExp(String.raw`${CD_START}\s*${CD_LEADER}${CD_TARGET}\s*&&`, "gu");
const CWD_WORD = new RegExp(
  String.raw`(?:^|[;{}()&|]\s*|\s+)(?:[A-Za-z_]\w*=\S*\s+)*(?:command\s+|builtin\s+)?(?:cd|pushd)\b`,
  "gu",
);
const DASH_C = new RegExp(String.raw`-C\s+(${DIR_TOKEN})`, "gu");

type EffectiveCwd = { ambiguous: true } | { ambiguous: false; cwd: string };

function isInsideSingleOrDoubleQuotes(command: string, index: number): boolean {
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let i = 0; i < index; i += 1) {
    const ch = command[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && ch === "\\") {
      escaped = true;
      continue;
    }
    if ((ch === '"' || ch === "'") && (quote === null || quote === ch)) {
      quote = quote === ch ? null : ch;
    }
  }
  return quote !== null;
}

function hasUnquotedCwdCommand(command: string): boolean {
  for (const m of command.matchAll(CWD_WORD)) {
    if (!isInsideSingleOrDoubleQuotes(command, m.index ?? 0)) return true;
  }
  return false;
}

/** Apply one dir token to `cwd`, or signal ambiguity if it cannot be statically resolved. */
function applyDir(token: string | undefined, cwd: string): { cwd: string } | "ambiguous" {
  if (!token) return { cwd };
  if (isUnresolvable(stripQuotes(token))) return "ambiguous";
  return { cwd: resolveDir(token, cwd) };
}

function applySuccessGatedCwdChain(commandPrefix: string, baseCwd: string): EffectiveCwd {
  const chain = CD_CHAIN.exec(commandPrefix);
  const chainStart = chain?.index ?? commandPrefix.length;
  // If there is any other unquoted cwd-changing syntax before this simple chain,
  // we cannot prove the chain governs the op. Fail closed.
  if (hasUnquotedCwdCommand(commandPrefix.slice(0, chainStart))) return { ambiguous: true };
  if (!chain) return { ambiguous: false, cwd: baseCwd };

  let cwd = baseCwd;
  for (const m of chain[0].matchAll(CD_IN_CHAIN)) {
    const next = applyDir(m[1], cwd);
    if (next === "ambiguous") return { ambiguous: true };
    cwd = next.cwd;
  }
  return { ambiguous: false, cwd };
}

/**
 * The directory the git op actually runs in: `baseCwd` lowered by the
 * success-gated cwd chain that directly governs this op, then through EVERY
 * `git -C <dir>` flag on the matched invocation. Returns `{ ambiguous: true }`
 * when any cwd-changing syntax cannot be statically proven safe.
 */
function resolveEffectiveCwd(
  command: string,
  baseCwd: string,
  opGlobals: string,
  opIndex: number,
): EffectiveCwd {
  const fromCwdChain = applySuccessGatedCwdChain(command.slice(0, opIndex), baseCwd);
  if (fromCwdChain.ambiguous) return fromCwdChain;

  let cwd = fromCwdChain.cwd;
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
  `(?:-C\\s+${QUOTED_ARG}\\s+|-c\\s+${QUOTED_ARG}\\s+|--git-dir(?:=\\S+|\\s+${QUOTED_ARG})\\s+|` +
  `--work-tree(?:=\\S+|\\s+${QUOTED_ARG})\\s+|-p\\s+|--no-pager\\s+|--paginate\\s+)*`;

type ForbiddenOp = { label: string; globals: string; index: number };

// Any forbidden subcommand: commit, switch (not -h/--help), branch-creating
// checkout forms, or branch creation/copy/track forms. Listing/info/delete
// branch flags are allowed.
const FORBIDDEN_SUBCOMMAND =
  "(commit\\b|switch\\b(?!\\s+(?:-h|--help)\\b)|checkout\\s+(?:-b|-B|--orphan)\\b|branch\\s+(?:(?!-|--)\\S|--track\\b|-c\\b|-C\\b))";
const FORBIDDEN_OP = new RegExp(`\\bgit\\s+(${GIT_GLOBAL_RUN})${FORBIDDEN_SUBCOMMAND}`, "gu");

function labelFor(subcommand: string): string {
  if (subcommand.startsWith("commit")) return "git commit";
  if (subcommand.startsWith("switch")) return "git switch";
  if (subcommand.startsWith("checkout")) return "git checkout";
  return "git branch";
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
