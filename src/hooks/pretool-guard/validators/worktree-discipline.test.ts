import { homedir } from "node:os";

import { describe, expect, it } from "vitest";

import type { ToolInput } from "#hooks/shared/types";

import { validateWorktreeDiscipline } from "./worktree-discipline.js";

const PRIMARY = `${homedir()}/repos/webpresso/agent-kit`;
const WORKTREE = `${homedir()}/.agent/worktrees/repos/github.com-webpresso-agent-kit-abc/blueprints/x/owner`;

const bash = (command: string, cwd?: string): ToolInput => ({ cwd, tool_input: { command } });

describe("validateWorktreeDiscipline", () => {
  it("blocks `git commit` in a primary ~/repos checkout", () => {
    const r = validateWorktreeDiscipline(bash('git commit -m "x"', PRIMARY));
    expect(r.passed).toBe(false);
    expect(r.message).toContain("wp blueprint start");
  });

  it("allows `git commit` inside a managed worktree", () => {
    expect(validateWorktreeDiscipline(bash('git commit -m "x"', WORKTREE)).passed).toBe(true);
  });

  it("blocks `git switch <branch>` in a primary checkout", () => {
    expect(validateWorktreeDiscipline(bash("git switch feature", PRIMARY)).passed).toBe(false);
  });

  it("blocks `git checkout -b <branch>` in a primary checkout", () => {
    expect(validateWorktreeDiscipline(bash("git checkout -b feature", PRIMARY)).passed).toBe(false);
  });

  it("blocks other branch-creating checkout forms in a primary checkout", () => {
    expect(validateWorktreeDiscipline(bash("git checkout -B feature", PRIMARY)).passed).toBe(false);
    expect(validateWorktreeDiscipline(bash("git checkout --orphan feature", PRIMARY)).passed).toBe(
      false,
    );
    expect(
      validateWorktreeDiscipline(bash("git checkout --no-track -b feature HEAD", PRIMARY)).passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(bash("git checkout -q -B feature HEAD", PRIMARY)).passed,
    ).toBe(false);
    expect(validateWorktreeDiscipline(bash("git checkout -bfoo", PRIMARY)).passed).toBe(false);
    expect(validateWorktreeDiscipline(bash("git checkout -Bfoo", PRIMARY)).passed).toBe(false);
    expect(
      validateWorktreeDiscipline(bash("git checkout --track origin/foo", PRIMARY)).passed,
    ).toBe(false);
  });

  it("blocks branch creation `git branch <name>` in a primary checkout", () => {
    expect(validateWorktreeDiscipline(bash("git branch feature", PRIMARY)).passed).toBe(false);
  });

  it("blocks branch copy/track creation forms in a primary checkout", () => {
    expect(
      validateWorktreeDiscipline(bash("git branch --track feature origin/main", PRIMARY)).passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(bash("git branch --create-reflog feature", PRIMARY)).passed,
    ).toBe(false);
    expect(validateWorktreeDiscipline(bash("git branch --force feature", PRIMARY)).passed).toBe(
      false,
    );
    expect(validateWorktreeDiscipline(bash("git branch -f feature HEAD", PRIMARY)).passed).toBe(
      false,
    );
    expect(
      validateWorktreeDiscipline(bash("git branch --no-track feature HEAD", PRIMARY)).passed,
    ).toBe(false);
    expect(validateWorktreeDiscipline(bash("git branch -c main feature", PRIMARY)).passed).toBe(
      false,
    );
    expect(validateWorktreeDiscipline(bash("git branch -C main feature", PRIMARY)).passed).toBe(
      false,
    );
    expect(validateWorktreeDiscipline(bash("git branch -m old new", PRIMARY)).passed).toBe(false);
    expect(validateWorktreeDiscipline(bash("git branch -M old new", PRIMARY)).passed).toBe(false);
  });

  it("allows branch listing/delete-info forms in a primary checkout", () => {
    expect(validateWorktreeDiscipline(bash("git branch -a", PRIMARY)).passed).toBe(true);
    expect(validateWorktreeDiscipline(bash("git branch --list", PRIMARY)).passed).toBe(true);
    expect(validateWorktreeDiscipline(bash("git branch --list feature", PRIMARY)).passed).toBe(
      true,
    );
    expect(validateWorktreeDiscipline(bash("git branch --contains HEAD", PRIMARY)).passed).toBe(
      true,
    );
    expect(validateWorktreeDiscipline(bash("git branch --merged main", PRIMARY)).passed).toBe(true);
    expect(validateWorktreeDiscipline(bash("git branch -r origin/main", PRIMARY)).passed).toBe(
      true,
    );
    expect(validateWorktreeDiscipline(bash("git branch --delete feature", PRIMARY)).passed).toBe(
      true,
    );
  });

  it("allows a file restore `git checkout -- file.ts` in a primary checkout", () => {
    expect(validateWorktreeDiscipline(bash("git checkout -- file.ts", PRIMARY)).passed).toBe(true);
  });

  it("allows benign git commands outside primary/worktree paths", () => {
    expect(validateWorktreeDiscipline(bash("git add file.ts", "/tmp/build")).passed).toBe(true);
    expect(validateWorktreeDiscipline(bash("git fetch", "/tmp/build")).passed).toBe(true);
    expect(validateWorktreeDiscipline(bash("git worktree list", "/tmp/build")).passed).toBe(true);
  });

  it("allows benign git commands with unsupported globals even in primary cwd", () => {
    expect(validateWorktreeDiscipline(bash("git --literal-pathspecs status", PRIMARY)).passed).toBe(
      true,
    );
    expect(validateWorktreeDiscipline(bash("git --no-optional-locks status", PRIMARY)).passed).toBe(
      true,
    );
  });

  it("allows `git commit` outside ~/repos (e.g. CI / other paths)", () => {
    expect(validateWorktreeDiscipline(bash('git commit -m "x"', "/tmp/build")).passed).toBe(true);
  });

  it("allows `cd <worktree> && git commit` even when ambient cwd is primary", () => {
    const r = validateWorktreeDiscipline(bash(`cd ${WORKTREE} && git commit -m "x"`, PRIMARY));
    expect(r.passed).toBe(true);
  });

  it("allows quoted `cd '<worktree>' && git commit` when ambient cwd is primary", () => {
    const r = validateWorktreeDiscipline(bash(`cd '${WORKTREE}' && git commit -m "x"`, PRIMARY));
    expect(r.passed).toBe(true);
  });

  it("allows `git -C <worktree> commit` when ambient cwd is primary", () => {
    const r = validateWorktreeDiscipline(bash(`git -C ${WORKTREE} commit -m "x"`, PRIMARY));
    expect(r.passed).toBe(true);
  });

  it("still blocks `cd <primary> && git commit` when ambient cwd is elsewhere", () => {
    const r = validateWorktreeDiscipline(bash(`cd ${PRIMARY} && git commit -m "x"`, "/tmp/build"));
    expect(r.passed).toBe(false);
  });

  it("blocks env-prefixed `FOO=1 cd <primary> && git commit` (no bypass)", () => {
    const r = validateWorktreeDiscipline(bash(`FOO=1 cd ${PRIMARY} && git commit -m "x"`, "/tmp"));
    expect(r.passed).toBe(false);
  });

  it("blocks `command cd <primary> && git commit` (no bypass)", () => {
    const r = validateWorktreeDiscipline(
      bash(`command cd ${PRIMARY} && git commit -m "x"`, "/tmp"),
    );
    expect(r.passed).toBe(false);
  });

  it("blocks `builtin cd <primary> && git commit` (no bypass)", () => {
    const r = validateWorktreeDiscipline(
      bash(`builtin cd ${PRIMARY} && git commit -m "x"`, "/tmp"),
    );
    expect(r.passed).toBe(false);
  });

  it("blocks `git -C <primary> commit` (no bypass)", () => {
    const r = validateWorktreeDiscipline(bash(`git -C ${PRIMARY} commit -m "x"`, "/tmp"));
    expect(r.passed).toBe(false);
  });

  it("fails closed on an unresolved cd target (command substitution)", () => {
    const r = validateWorktreeDiscipline(bash('cd "$(some-dir)" && git commit -m "x"', "/tmp"));
    expect(r.passed).toBe(false);
  });

  it("fails closed on an unresolved `git -C` target", () => {
    const r = validateWorktreeDiscipline(bash('git -C "$WT" commit -m "x"', "/tmp"));
    expect(r.passed).toBe(false);
  });

  it("blocks a later forbidden op in primary in a compound command", () => {
    // First op (commit) runs in /tmp (allowed), but the later switch runs in
    // primary after the cd — every op must be evaluated.
    const r = validateWorktreeDiscipline(
      bash(`git commit -m "x" && cd ${PRIMARY} && git switch feat`, "/tmp"),
    );
    expect(r.passed).toBe(false);
  });

  it("blocks `cd <primary> && git commit && cd /tmp` (trailing cd ignored)", () => {
    const r = validateWorktreeDiscipline(
      bash(`cd ${PRIMARY} && git commit -m "x" && cd /tmp`, "/tmp"),
    );
    expect(r.passed).toBe(false);
  });

  it("blocks ambient-primary `git commit` after a non-persistent subshell cd", () => {
    const r = validateWorktreeDiscipline(bash(`(cd /tmp) && git commit -m "x"`, PRIMARY));
    expect(r.passed).toBe(false);
  });

  it("fails closed on a non-persistent subshell cd before git commit", () => {
    const r = validateWorktreeDiscipline(bash(`(cd ${PRIMARY}) && git commit -m "x"`, "/tmp"));
    expect(r.passed).toBe(false);
  });

  it("blocks `git commit` inside a subshell-local primary cd", () => {
    const r = validateWorktreeDiscipline(bash(`(cd ${PRIMARY} && git commit -m "x")`, "/tmp"));
    expect(r.passed).toBe(false);
  });

  it("allows `git commit` inside a subshell-local worktree cd", () => {
    const r = validateWorktreeDiscipline(bash(`(cd ${WORKTREE} && git commit -m "x")`, PRIMARY));
    expect(r.passed).toBe(true);
  });

  it("fails closed on `cd - && git commit`", () => {
    const r = validateWorktreeDiscipline(bash(`cd - && git commit -m "x"`, "/tmp"));
    expect(r.passed).toBe(false);
  });

  it("blocks `cd -- <primary> && git commit`", () => {
    const r = validateWorktreeDiscipline(bash(`cd -- ${PRIMARY} && git commit -m "x"`, "/tmp"));
    expect(r.passed).toBe(false);
  });

  it("allows `cd -- <worktree> && git commit` from primary", () => {
    const r = validateWorktreeDiscipline(bash(`cd -- ${WORKTREE} && git commit -m "x"`, PRIMARY));
    expect(r.passed).toBe(true);
  });

  it("allows `pushd <worktree> && git commit` from primary", () => {
    const r = validateWorktreeDiscipline(bash(`pushd ${WORKTREE} && git commit -m "x"`, PRIMARY));
    expect(r.passed).toBe(true);
  });

  it("blocks `pushd <primary> && git commit` from elsewhere", () => {
    const r = validateWorktreeDiscipline(bash(`pushd ${PRIMARY} && git commit -m "x"`, "/tmp"));
    expect(r.passed).toBe(false);
  });

  it("fails closed for failed/unsupported cd before semicolon then git commit", () => {
    const r = validateWorktreeDiscipline(
      bash(`cd /definitely/not/a/worktree; git commit -m "x"`, PRIMARY),
    );
    expect(r.passed).toBe(false);
  });

  it("fails closed for skipped cd before semicolon then git commit", () => {
    const r = validateWorktreeDiscipline(bash(`false && cd /tmp; git commit -m "x"`, PRIMARY));
    expect(r.passed).toBe(false);
  });

  it("does not treat quoted cd text as an effective cwd change", () => {
    const r = validateWorktreeDiscipline(bash(`echo "; cd /tmp" && git commit -m "x"`, PRIMARY));
    expect(r.passed).toBe(false);
  });

  it("fails closed for semicolon cd before git commit", () => {
    const r = validateWorktreeDiscipline(bash(`cd ${PRIMARY}; git commit -m "x"`, "/tmp"));
    expect(r.passed).toBe(false);
  });

  it("fails closed for semicolon cd to worktree from non-primary cwd", () => {
    const r = validateWorktreeDiscipline(bash(`cd ${WORKTREE}; git commit -m "x"`, "/tmp"));
    expect(r.passed).toBe(false);
  });

  it("fails closed for unsupported || cd control flow before git commit", () => {
    const r = validateWorktreeDiscipline(bash(`true || cd /tmp && git commit -m "x"`, PRIMARY));
    expect(r.passed).toBe(false);
  });

  it("fails closed for unsupported || cd control flow from non-primary cwd", () => {
    const r = validateWorktreeDiscipline(
      bash(`true || cd ${WORKTREE} && git commit -m "x"`, "/tmp"),
    );
    expect(r.passed).toBe(false);
  });

  it("applies git -C effective cwd to switch", () => {
    expect(
      validateWorktreeDiscipline(bash(`git -C ${WORKTREE} switch feature`, PRIMARY)).passed,
    ).toBe(true);
    expect(
      validateWorktreeDiscipline(bash(`git -C ${PRIMARY} switch feature`, "/tmp")).passed,
    ).toBe(false);
  });

  it("applies git -C effective cwd to branch creation", () => {
    expect(
      validateWorktreeDiscipline(bash(`git -C ${WORKTREE} branch feature`, PRIMARY)).passed,
    ).toBe(true);
    expect(
      validateWorktreeDiscipline(bash(`git -C ${PRIMARY} branch feature`, "/tmp")).passed,
    ).toBe(false);
  });

  it("fails closed on inline git alias mutation globals", () => {
    expect(
      validateWorktreeDiscipline(bash(`git -c alias.ci='commit -m x' ci`, PRIMARY)).passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(bash(`git -c alias.sw='switch feature' sw`, PRIMARY)).passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(bash(`git -c alias.br='branch feature' br`, PRIMARY)).passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(bash(`git -c alias.co='checkout -b feature' co`, PRIMARY)).passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(
        bash(`git -c alias.ci='!git co""mmit --allow-empty -m x' ci`, PRIMARY),
      ).passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(
        bash(`git -c alias.ci='!$(command -v git) commit --allow-empty -m x' ci`, PRIMARY),
      ).passed,
    ).toBe(false);
  });

  it("fails closed on unsupported git globals before forbidden ops", () => {
    expect(
      validateWorktreeDiscipline(bash(`git --literal-pathspecs commit -m x`, PRIMARY)).passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(bash(`git --no-optional-locks commit -m x`, PRIMARY)).passed,
    ).toBe(false);
    expect(validateWorktreeDiscipline(bash(`git -P commit -m x`, PRIMARY)).passed).toBe(false);
  });

  it("fails closed on quoted or escaped git executable/subcommands", () => {
    expect(validateWorktreeDiscipline(bash(`"git" commit -m x`, PRIMARY)).passed).toBe(false);
    expect(validateWorktreeDiscipline(bash(`'git' commit -m x`, PRIMARY)).passed).toBe(false);
    expect(validateWorktreeDiscipline(bash(String.raw`g\it commit -m x`, PRIMARY)).passed).toBe(
      false,
    );
    expect(validateWorktreeDiscipline(bash(String.raw`gi\t commit -m x`, PRIMARY)).passed).toBe(
      false,
    );
    expect(validateWorktreeDiscipline(bash(`g""it commit -m x`, PRIMARY)).passed).toBe(false);
    expect(validateWorktreeDiscipline(bash(`git "commit" -m x`, PRIMARY)).passed).toBe(false);
    expect(validateWorktreeDiscipline(bash(String.raw`git com\mit -m x`, PRIMARY)).passed).toBe(
      false,
    );
    expect(validateWorktreeDiscipline(bash(String.raw`git co\mmit -m x`, PRIMARY)).passed).toBe(
      false,
    );
    expect(validateWorktreeDiscipline(bash(`git c""ommit -m x`, PRIMARY)).passed).toBe(false);
    expect(validateWorktreeDiscipline(bash(`git "branch" feat`, PRIMARY)).passed).toBe(false);
    expect(validateWorktreeDiscipline(bash(`git checkout "-b" feat`, PRIMARY)).passed).toBe(false);
    expect(
      validateWorktreeDiscipline(bash(`$(command -v git) commit --allow-empty -m x`, PRIMARY))
        .passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(bash(`git $(printf commit) --allow-empty -m x`, PRIMARY)).passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(bash(`$(command -v git) -C ${PRIMARY} commit -m x`, "/tmp"))
        .passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(bash(`$(command -v git) --no-pager commit -m x`, PRIMARY)).passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(bash(`$(command -v git) "commit" -m x`, PRIMARY)).passed,
    ).toBe(false);
  });

  it("fails closed on git-dir/work-tree target overrides", () => {
    expect(
      validateWorktreeDiscipline(bash(`git --work-tree=${PRIMARY} commit -m x`, "/tmp")).passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(
        bash(`git --git-dir ${PRIMARY}/.git --work-tree ${PRIMARY} commit -m x`, "/tmp"),
      ).passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(
        bash(`GIT_DIR=${PRIMARY}/.git GIT_WORK_TREE=${PRIMARY} git commit -m x`, "/tmp"),
      ).passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(
        bash(`FOO=1 GIT_DIR=${PRIMARY}/.git GIT_WORK_TREE=${PRIMARY} git commit -m x`, "/tmp"),
      ).passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(bash(`env -C ${PRIMARY} git commit -m x`, "/tmp")).passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(
        bash(`env GIT_DIR=${PRIMARY}/.git GIT_WORK_TREE=${PRIMARY} git commit -m x`, "/tmp"),
      ).passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(bash(`git --work-tree=${WORKTREE} commit -m x`, "/tmp")).passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(bash(`env -C ${WORKTREE} git commit -m x`, "/tmp")).passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(bash(`env -C ${PRIMARY} -S 'git commit -m x'`, "/tmp")).passed,
    ).toBe(false);
    expect(validateWorktreeDiscipline(bash(`"/usr/bin/git" commit -m x`, PRIMARY)).passed).toBe(
      false,
    );
    expect(
      validateWorktreeDiscipline(
        bash(`GIT_DIR=${PRIMARY}/.git GIT_WORK_TREE=${PRIMARY} /usr/bin/git commit -m x`, "/tmp"),
      ).passed,
    ).toBe(false);
  });

  it("fails closed on nested shell or eval git mutation forms", () => {
    expect(
      validateWorktreeDiscipline(bash(`bash -lc 'cd ${PRIMARY} && git commit -m x'`, "/tmp"))
        .passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(bash(`bash -lc 'cd ${PRIMARY} && "git" commit -m x'`, "/tmp"))
        .passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(bash(`sh -c 'cd ${PRIMARY} && git commit -m x'`, "/tmp")).passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(bash(`eval 'cd ${PRIMARY} && git commit -m x'`, "/tmp")).passed,
    ).toBe(false);
    expect(
      validateWorktreeDiscipline(bash(`eval 'cd ${PRIMARY} && "git" commit -m x'`, "/tmp")).passed,
    ).toBe(false);
  });

  it("does not exempt primary subdirs that merely contain .agent/worktrees", () => {
    const fake = `${PRIMARY}/.agent/worktrees/fake`;
    expect(validateWorktreeDiscipline(bash(`git commit -m x`, fake)).passed).toBe(false);
  });

  it("blocks cumulative `git -C /tmp -C <primary> commit` (every -C applied)", () => {
    const r = validateWorktreeDiscipline(bash(`git -C /tmp -C ${PRIMARY} commit -m "x"`, "/tmp"));
    expect(r.passed).toBe(false);
  });

  it("allows cumulative `git -C /tmp -C <worktree> commit`", () => {
    const r = validateWorktreeDiscipline(bash(`git -C /tmp -C ${WORKTREE} commit -m "x"`, PRIMARY));
    expect(r.passed).toBe(true);
  });

  it("ignores non-git bash commands", () => {
    expect(validateWorktreeDiscipline(bash("npm test", PRIMARY)).passed).toBe(true);
  });

  it("ignores non-bash tool inputs", () => {
    expect(
      validateWorktreeDiscipline({ tool_input: { file_path: "a", content: "b" } }).passed,
    ).toBe(true);
  });

  it("honors WORKTREE_DISCIPLINE_SKIP=1 bypass", () => {
    const prev = process.env.WORKTREE_DISCIPLINE_SKIP;
    process.env.WORKTREE_DISCIPLINE_SKIP = "1";
    try {
      const r = validateWorktreeDiscipline(bash('git commit -m "x"', PRIMARY));
      expect(r.passed).toBe(true);
      expect(r.skipped).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.WORKTREE_DISCIPLINE_SKIP;
      else process.env.WORKTREE_DISCIPLINE_SKIP = prev;
    }
  });
});
