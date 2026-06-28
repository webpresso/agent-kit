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

  it("blocks branch creation `git branch <name>` in a primary checkout", () => {
    expect(validateWorktreeDiscipline(bash("git branch feature", PRIMARY)).passed).toBe(false);
  });

  it("allows branch listing `git branch -a` in a primary checkout", () => {
    expect(validateWorktreeDiscipline(bash("git branch -a", PRIMARY)).passed).toBe(true);
  });

  it("allows a file restore `git checkout -- file.ts` in a primary checkout", () => {
    expect(validateWorktreeDiscipline(bash("git checkout -- file.ts", PRIMARY)).passed).toBe(true);
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

  it("blocks `cd <primary> && git commit && cd /tmp` (trailing cd ignored)", () => {
    const r = validateWorktreeDiscipline(
      bash(`cd ${PRIMARY} && git commit -m "x" && cd /tmp`, "/tmp"),
    );
    expect(r.passed).toBe(false);
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
