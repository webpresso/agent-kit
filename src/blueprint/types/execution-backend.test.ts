import { describe, expect, it } from "vitest";
import { executionBackendSchema } from "./execution-backend.js";

describe("executionBackendSchema", () => {
  it("accepts known backends", () => {
    expect(executionBackendSchema.parse("omx-team")).toStrictEqual("omx-team");
    expect(executionBackendSchema.parse("omx-pll-interactive")).toStrictEqual(
      "omx-pll-interactive",
    );
    expect(executionBackendSchema.parse("claude-subagent")).toStrictEqual("claude-subagent");
    expect(executionBackendSchema.parse("codex-exec")).toStrictEqual("codex-exec");
    expect(executionBackendSchema.parse("local-worktree")).toStrictEqual("local-worktree");
  });

  it("rejects unknown backends", () => {
    expect(() => executionBackendSchema.parse("unknown")).toThrow();
  });

  // Regression guard: if a new variant is added to the enum, this test fails
  // until tests for the new variant are also added. Prevents silent "all backends"
  // assumption drift across consumers.
  it("has exactly 5 variants (omx-team, omx-pll-interactive, claude-subagent, codex-exec, local-worktree)", () => {
    expect(executionBackendSchema.options).toStrictEqual([
      "omx-team",
      "omx-pll-interactive",
      "claude-subagent",
      "codex-exec",
      "local-worktree",
    ]);
    expect(executionBackendSchema.options).toHaveLength(5);
  });
});
