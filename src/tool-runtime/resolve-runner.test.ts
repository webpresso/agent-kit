import { spawnSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { installManagedRunnerHermeticHooks } from "#test-helpers/managed-runner";
import { resolveRunner, setRtkAvailabilityProbeForTest } from "./resolve-runner.js";

// Mock only the external subprocess boundary so the probe tests below can drive
// the rtk capability check deterministically. The pinned tests never reach it.
vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

function spawnResult(overrides: {
  status: number | null;
  signal?: NodeJS.Signals;
}): ReturnType<typeof spawnSync> {
  return {
    status: overrides.status,
    signal: overrides.signal ?? null,
    pid: 1,
    output: [],
    stdout: "",
    stderr: "",
  } as unknown as ReturnType<typeof spawnSync>;
}

installManagedRunnerHermeticHooks();

describe("resolveRunner", () => {
  it("uses RTK-filtered managed runners by default", () => {
    expect(resolveRunner("vitest")).toEqual({
      tool: "vitest",
      command: "rtk",
      args: [expect.stringContaining("vitest")],
      source: "managed",
    });
  });

  it("supports explicitly opting out of RTK filtering for managed runners", () => {
    expect(resolveRunner("vitest", { outputPolicy: "structured" })).toEqual({
      tool: "vitest",
      command: expect.stringContaining("vitest"),
      args: [],
      source: "managed",
    });
  });

  it("resolves tsc through managed vp exec instead of a bare binary", () => {
    expect(resolveRunner("tsc", { outputPolicy: "structured" })).toEqual({
      tool: "tsc",
      command: expect.stringContaining("typescript"),
      args: [],
      source: "managed",
    });
  });

  it("resolves oxfmt through the bundled Vite+ fmt facade", () => {
    expect(resolveRunner("oxfmt", { outputPolicy: "structured" })).toEqual({
      tool: "oxfmt",
      command: process.execPath,
      args: [expect.stringMatching(/vite-plus.*bin.*vp/), "fmt"],
      source: "managed",
    });
  });

  it("resolves oxlint through the bundled Vite+ lint facade", () => {
    expect(resolveRunner("oxlint", { outputPolicy: "structured" })).toEqual({
      tool: "oxlint",
      command: process.execPath,
      args: [expect.stringMatching(/vite-plus.*bin.*vp/), "lint"],
      source: "managed",
    });
  });

  it("falls back oxlint to `vp lint`, never `vp exec oxlint` or `vp exec vp`", () => {
    expect(
      resolveRunner("oxlint", {
        outputPolicy: "structured",
        resolvePackageBin: () => null,
      }),
    ).toEqual({
      tool: "oxlint",
      command: "vp",
      args: ["lint"],
      source: "fallback",
    });
  });

  it("falls back oxfmt to `vp fmt`, never `vp exec oxfmt` or `vp exec vp`", () => {
    expect(
      resolveRunner("oxfmt", {
        outputPolicy: "structured",
        resolvePackageBin: () => null,
      }),
    ).toEqual({
      tool: "oxfmt",
      command: "vp",
      args: ["fmt"],
      source: "fallback",
    });
  });

  it("resolves vp through the bundled Vite+ bin with the current Node runtime", () => {
    expect(
      resolveRunner("vp", { outputPolicy: "structured", nodeExecPath: "/usr/local/bin/node" }),
    ).toEqual({
      tool: "vp",
      command: "/usr/local/bin/node",
      args: [expect.stringMatching(/vite-plus.*bin.*vp/)],
      source: "managed",
    });
  });

  it("uses the same RTK-default wrapper for bundled vp", () => {
    expect(resolveRunner("vp", { nodeExecPath: "/usr/local/bin/node" })).toEqual({
      tool: "vp",
      command: "rtk",
      args: ["/usr/local/bin/node", expect.stringMatching(/vite-plus.*bin.*vp/)],
      source: "managed",
    });
  });

  it("uses the same RTK-default wrapper for fallback runners", () => {
    expect(
      resolveRunner("custom-tool", {
        fallbackCommand: "vp",
        fallbackArgs: ["exec", "custom-tool"],
      }),
    ).toEqual({
      tool: "custom-tool",
      command: "rtk",
      args: ["vp", "exec", "custom-tool"],
      source: "fallback",
    });
  });

  it("supports explicit structured output for fallback runners", () => {
    expect(
      resolveRunner("custom-tool", {
        fallbackCommand: "vp",
        fallbackArgs: ["exec", "custom-tool"],
        outputPolicy: "structured",
      }),
    ).toEqual({
      tool: "custom-tool",
      command: "vp",
      args: ["exec", "custom-tool"],
      source: "fallback",
    });
  });

  it("accepts legacy filterOutput false as a structured-output selector", () => {
    expect(resolveRunner("tsc", { filterOutput: false })).toEqual({
      tool: "tsc",
      command: expect.stringContaining("typescript"),
      args: [],
      source: "managed",
    });
  });

  it("degrades to unwrapped command when rtk is unavailable", () => {
    setRtkAvailabilityProbeForTest(false);
    expect(resolveRunner("vitest")).toEqual({
      tool: "vitest",
      command: expect.stringContaining("vitest"),
      args: [],
      source: "managed",
    });
  });
});

describe("rtk capability probe", () => {
  beforeEach(() => {
    // Override the hermetic baseline so the real probe runs against the mock.
    setRtkAvailabilityProbeForTest(null);
    vi.mocked(spawnSync).mockReset();
  });

  it("probes the unique `rtk gain` capability with a bounded timeout, not `--version`", () => {
    vi.mocked(spawnSync).mockReturnValue(spawnResult({ status: 0 }));
    resolveRunner("vitest");
    expect(spawnSync).toHaveBeenCalledWith(
      "rtk",
      ["gain", "--help"],
      expect.objectContaining({ timeout: 3000 }),
    );
  });

  it("wraps the command through rtk when the capability probe exits 0", () => {
    vi.mocked(spawnSync).mockReturnValue(spawnResult({ status: 0 }));
    expect(resolveRunner("vitest")).toStrictEqual({
      tool: "vitest",
      command: "rtk",
      args: [expect.stringContaining("vitest")],
      source: "managed",
    });
  });

  it("degrades when a foreign rtk (Rust Type Kit) fails the capability probe", () => {
    vi.mocked(spawnSync).mockReturnValue(spawnResult({ status: 1 }));
    expect(resolveRunner("vitest")).toStrictEqual({
      tool: "vitest",
      command: expect.stringContaining("vitest"),
      args: [],
      source: "managed",
    });
  });

  it("degrades when the probe times out (status null + signal)", () => {
    vi.mocked(spawnSync).mockReturnValue(spawnResult({ status: null, signal: "SIGTERM" }));
    expect(resolveRunner("vitest").command).not.toBe("rtk");
  });

  it("degrades when rtk is not installed (spawn throws ENOENT)", () => {
    vi.mocked(spawnSync).mockImplementation(() => {
      throw new Error("spawnSync rtk ENOENT");
    });
    expect(resolveRunner("vitest").command).not.toBe("rtk");
  });
});
