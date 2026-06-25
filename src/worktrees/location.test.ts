import { describe, expect, it } from "vitest";

import { resolveGeneratedWorktreePath, resolveWorktreeRoot } from "./location.js";

describe("worktree location policy compatibility helpers", () => {
  it("places generated worktrees in the agent-kit managed global root", () => {
    const root = resolveWorktreeRoot("/repos/webpresso", {
      homeDir: "/home/alice",
      originUrl: "https://github.com/webpresso/agent-kit.git",
    });
    expect(root).toMatch(
      /^\/home\/alice\/\.agent\/worktrees\/repos\/github\.com-webpresso-agent-kit-[a-f0-9]{10}$/,
    );
  });

  it("appends generated worktree slugs below a provided root", () => {
    expect(
      resolveGeneratedWorktreePath("/home/alice/.agent/worktrees/repos/repo", "agent-fix-login"),
    ).toBe("/home/alice/.agent/worktrees/repos/repo/agent-fix-login");
  });
});
