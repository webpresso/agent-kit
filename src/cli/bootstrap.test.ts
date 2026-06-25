/**
 * Tests for bootstrap.ts — D6 + D8 + D19 contracts.
 *
 * Covers:
 *   1. Informational verbs (--version, --help) short-circuit before getRepoKey.
 *   2. Non-informational + not in git repo → NotInGitRepoError thrown.
 *   3. Non-informational + in git + CI=true → runUpdateFlow NOT called.
 *   4. Non-informational + in git + no skip → runUpdateFlow IS called.
 *   5. wp mcp → shouldSkipUpdateCheck returns true, runUpdateFlow NOT called.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// --- mock the imported modules before importing bootstrap ---
vi.mock("#paths/state-root.js", () => ({
  NotInGitRepoError: class NotInGitRepoError extends Error {
    readonly cwd: string;
    constructor(cwd: string, cause?: unknown) {
      super(`Not inside a git repository (cwd=${cwd})`);
      this.name = "NotInGitRepoError";
      this.cwd = cwd;
      if (cause !== undefined) {
        (this as Error & { cause?: unknown }).cause = cause;
      }
    }
  },
  getRepoKey: vi.fn().mockReturnValue("deadbeef12345678"),
}));

vi.mock("#cli/auto-update/skip.js", () => ({
  shouldSkipUpdateCheck: vi.fn().mockReturnValue(false),
}));

vi.mock("#cli/auto-update/run.js", () => ({
  runUpdateFlow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("#cli/auto-update/log.js", () => ({
  logUpdateError: vi.fn(),
}));

// Import after mocks are registered
const { bootstrapAk, isInformationalVerb, isGitRepoOptionalCommand, NotInGitRepoError } =
  await import("#cli/bootstrap.js");
const { getRepoKey } = await import("#paths/state-root.js");
const { shouldSkipUpdateCheck } = await import("#cli/auto-update/skip.js");
const { runUpdateFlow } = await import("#cli/auto-update/run.js");
const { logUpdateError } = await import("#cli/auto-update/log.js");

describe("isInformationalVerb", () => {
  it("returns true for --version", () => {
    expect(isInformationalVerb(["node", "wp", "--version"])).toBe(true);
  });

  it("returns true for -v", () => {
    expect(isInformationalVerb(["node", "wp", "-v"])).toBe(true);
  });

  it("returns true for --help", () => {
    expect(isInformationalVerb(["node", "wp", "--help"])).toBe(true);
  });

  it("returns true for -h", () => {
    expect(isInformationalVerb(["node", "wp", "-h"])).toBe(true);
  });

  it("returns false for normal command", () => {
    expect(isInformationalVerb(["node", "wp", "blueprint"])).toBe(false);
  });

  it("returns false for mcp", () => {
    expect(isInformationalVerb(["node", "wp", "mcp"])).toBe(false);
  });
});

describe("isGitRepoOptionalCommand", () => {
  it("returns true for hook", () => {
    expect(isGitRepoOptionalCommand(["node", "wp", "hook", "pretool-guard"])).toBe(true);
  });

  it("returns true for mcp", () => {
    expect(isGitRepoOptionalCommand(["node", "wp", "mcp"])).toBe(true);
  });

  it("returns false for a normal repo-bound command", () => {
    expect(isGitRepoOptionalCommand(["node", "wp", "blueprint"])).toBe(false);
  });

  it("returns false when no subcommand is present", () => {
    expect(isGitRepoOptionalCommand(["node", "wp"])).toBe(false);
  });
});

describe("bootstrapAk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRepoKey).mockReturnValue("deadbeef12345678");
    vi.mocked(shouldSkipUpdateCheck).mockReturnValue(false);
    vi.mocked(runUpdateFlow).mockResolvedValue(undefined);
  });

  it("D19: --version short-circuits before getRepoKey", async () => {
    await bootstrapAk("0.16.0", ["node", "wp", "--version"]);
    expect(getRepoKey).not.toHaveBeenCalled();
    expect(runUpdateFlow).not.toHaveBeenCalled();
  });

  it("D19: --help short-circuits before getRepoKey", async () => {
    await bootstrapAk("0.16.0", ["node", "wp", "--help"]);
    expect(getRepoKey).not.toHaveBeenCalled();
    expect(runUpdateFlow).not.toHaveBeenCalled();
  });

  it("D6: non-informational + not in git repo → throws NotInGitRepoError", async () => {
    vi.mocked(getRepoKey).mockImplementationOnce(() => {
      throw new NotInGitRepoError("/some/path");
    });
    await expect(bootstrapAk("0.16.0", ["node", "wp", "blueprint"])).rejects.toBeInstanceOf(
      NotInGitRepoError,
    );
    expect(runUpdateFlow).not.toHaveBeenCalled();
  });

  it("hook lane: not in git repo → short-circuits before getRepoKey, does not throw", async () => {
    // A missing git repo must never hard-fail a hook: the host wrapper turns a
    // non-zero exit into a misleading "wp not found" deny.
    vi.mocked(getRepoKey).mockImplementation(() => {
      throw new NotInGitRepoError("/some/path");
    });
    await expect(
      bootstrapAk("0.16.0", ["node", "wp", "hook", "pretool-guard"]),
    ).resolves.toBeUndefined();
    expect(getRepoKey).not.toHaveBeenCalled();
    expect(runUpdateFlow).not.toHaveBeenCalled();
  });

  it("mcp lane: not in git repo → short-circuits before getRepoKey, does not throw", async () => {
    vi.mocked(getRepoKey).mockImplementation(() => {
      throw new NotInGitRepoError("/some/path");
    });
    await expect(bootstrapAk("0.16.0", ["node", "wp", "mcp"])).resolves.toBeUndefined();
    expect(getRepoKey).not.toHaveBeenCalled();
  });

  it("D8: non-informational + in git + CI=true → runUpdateFlow NOT called", async () => {
    vi.mocked(shouldSkipUpdateCheck).mockReturnValueOnce(true);
    await bootstrapAk("0.16.0", ["node", "wp", "blueprint"]);
    expect(getRepoKey).toHaveBeenCalled();
    expect(runUpdateFlow).not.toHaveBeenCalled();
  });

  it("D8: non-informational + in git + no skip → runUpdateFlow IS called with version", async () => {
    await bootstrapAk("0.16.0", ["node", "wp", "blueprint"]);
    expect(runUpdateFlow).toHaveBeenCalledWith("0.16.0");
  });

  it("D13: runUpdateFlow errors are caught by logUpdateError", async () => {
    const boom = new Error("network failure");
    vi.mocked(runUpdateFlow).mockRejectedValueOnce(boom);
    // Should not throw
    await bootstrapAk("0.16.0", ["node", "wp", "blueprint"]);
    // logUpdateError is wired via .catch() — give the microtask queue a tick
    await Promise.resolve();
    expect(logUpdateError).toHaveBeenCalledWith(boom);
  });

  it("D8/mcp: wp mcp → shouldSkipUpdateCheck returns true → runUpdateFlow NOT called", async () => {
    // mcp invocation: shouldSkipUpdateCheck must return true for argv[2]==='mcp'
    vi.mocked(shouldSkipUpdateCheck).mockReturnValueOnce(true);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await bootstrapAk("0.16.0", ["node", "wp", "mcp"]);
    expect(runUpdateFlow).not.toHaveBeenCalled();
    // No stderr writes during bootstrap when mcp
    expect(stderrSpy).not.toHaveBeenCalled();
    stderrSpy.mockRestore();
  });
});
