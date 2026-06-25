import { describe, expect, it } from "vitest";

import {
  RUNTIME_BINARY_NAME,
  RUNTIME_TARGETS,
  resolveRuntimeTarget,
  runtimeBinaryFilename,
  runtimePackageDirName,
} from "./runtime-targets.js";

describe("runtime target matrix", () => {
  it("declares the v1 compiled Bun runtime target set explicitly", () => {
    expect(RUNTIME_TARGETS.map((target) => target.id)).toEqual([
      "darwin-arm64",
      "darwin-x64",
      "linux-x64",
      "linux-arm64",
      "windows-x64",
    ]);
    expect(RUNTIME_TARGETS.every((target) => target.bunTarget.startsWith("bun-"))).toBe(true);
    expect(RUNTIME_TARGETS.every((target) => target.packageName.startsWith("@webpresso/"))).toBe(
      true,
    );
  });

  it("uses stable binary names across POSIX and Windows targets", () => {
    expect(RUNTIME_BINARY_NAME).toBe("wp");
    expect(runtimeBinaryFilename(RUNTIME_TARGETS[0])).toBe("wp");
    expect(runtimeBinaryFilename(RUNTIME_TARGETS.find((target) => target.os === "win32")!)).toBe(
      "wp.exe",
    );
  });

  it("resolves host targets and package directory names deterministically", () => {
    expect(resolveRuntimeTarget("linux", "arm64")?.id).toBe("linux-arm64");
    expect(resolveRuntimeTarget("freebsd" as NodeJS.Platform, "x64")).toBeUndefined();
    expect(runtimePackageDirName("@webpresso/agent-kit-runtime-linux-x64")).toBe(
      "agent-kit-runtime-linux-x64",
    );
  });
});
