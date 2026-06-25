import { describe, expect, it } from "vitest";

import {
  SESSION_MEMORY_NATIVE_ADDON_FILENAME,
  SESSION_MEMORY_NATIVE_TARGETS,
  resolveSessionMemoryNativeTarget,
  sessionMemoryNativePackageDirName,
} from "./native-targets.js";

describe("session-memory native target matrix", () => {
  it("declares per-platform optional NAPI package targets", () => {
    expect(SESSION_MEMORY_NATIVE_TARGETS.map((target) => target.id)).toEqual([
      "darwin-x64",
      "darwin-arm64",
      "linux-x64",
      "linux-arm64",
      "win32-x64",
      "win32-arm64",
    ]);
    expect(
      SESSION_MEMORY_NATIVE_TARGETS.every(
        (target) =>
          target.packageName === `@webpresso/agent-kit-session-memory-${target.id}` &&
          target.addonFilename === SESSION_MEMORY_NATIVE_ADDON_FILENAME,
      ),
    ).toBe(true);
  });

  it("resolves host platform and architecture to the matching optional package", () => {
    expect(resolveSessionMemoryNativeTarget("win32", "arm64")?.packageName).toBe(
      "@webpresso/agent-kit-session-memory-win32-arm64",
    );
    expect(resolveSessionMemoryNativeTarget("freebsd" as NodeJS.Platform, "x64")).toBeUndefined();
  });

  it("derives stable package directory names for staged native packages", () => {
    expect(sessionMemoryNativePackageDirName("@webpresso/agent-kit-session-memory-linux-x64")).toBe(
      "agent-kit-session-memory-linux-x64",
    );
  });
});
