import { describe, expect, it } from "vitest";

import { installManagedRunnerHermeticHooks } from "#test-helpers/managed-runner";
import { getManagedRunner, setRtkAvailabilityProbeForTest } from "./index.js";

installManagedRunnerHermeticHooks();

describe("getManagedRunner", () => {
  it("caches identical resolutions without leaking output mode across cache entries", () => {
    const filtered = getManagedRunner("vitest");
    const filteredAgain = getManagedRunner("vitest");
    const unfiltered = getManagedRunner("vitest", { outputPolicy: "structured" });

    expect(filteredAgain).toBe(filtered);
    expect(filtered).toEqual({
      tool: "vitest",
      command: "rtk",
      args: [expect.stringContaining("vitest")],
      source: "managed",
    });
    expect(unfiltered).toEqual({
      tool: "vitest",
      command: expect.stringContaining("vitest"),
      args: [],
      source: "managed",
    });
    expect(unfiltered).not.toBe(filtered);
  });

  it("caches bundled vp resolutions independently from other tools", () => {
    const first = getManagedRunner("vp", {
      outputPolicy: "structured",
      nodeExecPath: "/usr/local/bin/node",
    });
    const second = getManagedRunner("vp", {
      outputPolicy: "structured",
      nodeExecPath: "/usr/local/bin/node",
    });

    expect(second).toBe(first);
    expect(first).toEqual({
      tool: "vp",
      command: "/usr/local/bin/node",
      args: [expect.stringMatching(/vite-plus.*bin.*vp/)],
      source: "managed",
    });
  });

  it("does not reuse bundled vp cache entries across different node executables", () => {
    const first = getManagedRunner("vp", {
      outputPolicy: "structured",
      nodeExecPath: "/usr/local/bin/node",
    });
    const second = getManagedRunner("vp", {
      outputPolicy: "structured",
      nodeExecPath: "/opt/node/bin/node",
    });

    expect(first.command).toBe("/usr/local/bin/node");
    expect(second.command).toBe("/opt/node/bin/node");
    expect(second).not.toBe(first);
  });

  it("supports legacy filterOutput opt-out callers", () => {
    const legacy = getManagedRunner("vitest", { filterOutput: false });
    expect(legacy).toEqual({
      tool: "vitest",
      command: expect.stringContaining("vitest"),
      args: [],
      source: "managed",
    });
  });

  it("degrades filtered output requests when rtk is unavailable", () => {
    setRtkAvailabilityProbeForTest(false);

    expect(getManagedRunner("vitest")).toEqual({
      tool: "vitest",
      command: expect.stringContaining("vitest"),
      args: [],
      source: "managed",
    });
  });
});
