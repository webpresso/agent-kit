import { afterEach, describe, expect, it, vi } from "vitest";

import { signalProcessTree, terminateProcessTreeWithEscalation } from "./index";

afterEach(() => vi.restoreAllMocks());

describe("signalProcessTree", () => {
  it("signals the process group on non-win32, falling back to the child on error", () => {
    if (process.platform === "win32") return; // group semantics are POSIX-only
    const kill = vi.fn();
    const groupKill = vi.spyOn(process, "kill").mockImplementation(() => true as never);
    signalProcessTree({ pid: 4242, kill }, "SIGTERM");
    expect(groupKill).toHaveBeenCalledWith(-4242, "SIGTERM");
    expect(kill).not.toHaveBeenCalled();
  });

  it("falls back to child.kill when the group signal throws", () => {
    if (process.platform === "win32") return;
    const kill = vi.fn();
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw new Error("ESRCH");
    });
    signalProcessTree({ pid: 4242, kill }, "SIGKILL");
    expect(kill).toHaveBeenCalledWith("SIGKILL");
  });
});

describe("terminateProcessTreeWithEscalation", () => {
  it("signals immediately and returns a cancel fn that clears the escalation timer", () => {
    vi.useFakeTimers();
    const kill = vi.fn();
    vi.spyOn(process, "kill").mockImplementation(() => true as never);
    const cancel = terminateProcessTreeWithEscalation({ pid: 10, kill }, { escalationDelayMs: 50 });
    cancel();
    vi.advanceTimersByTime(100);
    // Only the initial SIGTERM group signal fired; escalation was cancelled.
    expect(vi.mocked(process.kill).mock.calls.length).toBe(1);
    vi.useRealTimers();
  });
});
