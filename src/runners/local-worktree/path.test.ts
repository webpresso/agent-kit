import { describe, expect, it, vi } from "vitest";

import { generateWorktreePath } from "./path.js";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: () => "12345678-1234-4234-9234-123456789abc" };
});

describe("generateWorktreePath", () => {
  it("places scratch worktrees under the global managed worktree root", () => {
    const result = generateWorktreePath("/repo", "task-x");

    expect(result).toMatch(
      /^.*\/\.agent\/worktrees\/repos\/local-repo-[a-f0-9]{10}\/blueprints\/task-x\/\.scratch\/local-worktree-12345678-1234-4234-9234-123456789abc$/,
    );
  });
});
