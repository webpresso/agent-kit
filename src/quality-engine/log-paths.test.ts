/**
 * Log Paths Tests
 *
 * Tests for log path generation and context extraction.
 */

import { describe, expect, it } from "vitest";

import {
  defaultPackageLogContext,
  extractLogContext,
  extractPackageLogContext,
  generateLogPath,
} from "./log-paths";

describe("generateLogPath", () => {
  it("generates log path with date and time folders", () => {
    const path = generateLogPath("test", {
      now: new Date(2026, 1, 12, 14, 23, 45),
    });
    expect(path).toBe("logs/12-02-2026/14-23-45_test.log");
  });

  it("includes context in filename when provided", () => {
    const path = generateLogPath("test", {
      context: "cli2",
      now: new Date(2026, 1, 12, 14, 23, 45),
    });
    expect(path).toBe("logs/12-02-2026/14-23-45_test-cli2.log");
  });

  it("uses custom logs directory when provided", () => {
    const path = generateLogPath("test", {
      logsDir: "custom-logs",
      now: new Date(2026, 1, 12, 14, 23, 45),
    });
    expect(path).toBe("custom-logs/12-02-2026/14-23-45_test.log");
  });

  it("can skip the dated folder layout", () => {
    const path = generateLogPath("test", {
      logsDir: ".artifacts/logs",
      includeDateFolder: false,
      now: new Date(2026, 1, 12, 14, 23, 45),
    });
    expect(path).toBe(".artifacts/logs/14-23-45_test.log");
  });

  it("generates lint log paths", () => {
    const path = generateLogPath("lint");
    expect(path).toMatch(/^logs\/\d{2}-\d{2}-\d{4}\/\d{2}-\d{2}-\d{2}_lint\.log$/);
  });

  it("generates typecheck log paths", () => {
    const path = generateLogPath("typecheck");
    expect(path).toMatch(/^logs\/\d{2}-\d{2}-\d{4}\/\d{2}-\d{2}-\d{2}_typecheck\.log$/);
  });

  it("generates qa log paths", () => {
    const path = generateLogPath("qa");
    expect(path).toMatch(/^logs\/\d{2}-\d{2}-\d{4}\/\d{2}-\d{2}-\d{2}_qa\.log$/);
  });
});

describe("extractLogContext", () => {
  it("returns undefined for all targets", () => {
    expect(extractLogContext({ type: "all", value: [] })).toBe(undefined);
  });

  it("extracts package name from package targets", () => {
    const context = extractLogContext({
      type: "package",
      value: ["--filter=@webpresso/cli2"],
    });
    expect(context).toBe("cli2");
  });

  it("extracts multiple package names", () => {
    const context = extractLogContext({
      type: "package",
      value: ["--filter=@webpresso/cli2", "--filter=@webpresso/config"],
    });
    expect(context).toBe("cli2-config");
  });

  it("extracts package names from non-webpresso scoped filters", () => {
    const context = extractLogContext({
      type: "package",
      value: ["--filter=@repo/client", "--filter=@scope/shared-ui"],
    });
    expect(context).toBe("client-shared-ui");
  });

  it("extracts package names from unscoped filters", () => {
    const context = extractLogContext({
      type: "package",
      value: ["--filter=frontend"],
    });
    expect(context).toBe("frontend");
  });

  it("returns timestamp for file targets", () => {
    const context = extractLogContext({
      type: "file",
      value: ["foo.ts"],
    });
    expect(context).toMatch(/^\d+$/);
  });

  it("supports custom package context formatting", () => {
    const context = extractLogContext(
      {
        type: "package",
        value: ["--filter=@repo/client", "--filter=@scope/shared-ui"],
      },
      {
        packageContext: (filters) =>
          filters.map((filter) => extractPackageLogContext(filter)).join(","),
      },
    );

    expect(context).toBe("client,shared-ui");
  });

  it("supports custom file context formatting", () => {
    const context = extractLogContext(
      {
        type: "file",
        value: ["src/foo.test.ts", "src/bar.test.ts"],
      },
      {
        fileContext: (files) => `${files.length}-files`,
      },
    );

    expect(context).toBe("2-files");
  });

  it("returns undefined for empty package targets", () => {
    expect(extractLogContext({ type: "package", value: [] })).toBe(undefined);
  });

  it("returns undefined for empty file targets", () => {
    expect(extractLogContext({ type: "file", value: [] })).toBe(undefined);
  });
});

describe("extractPackageLogContext", () => {
  it("returns package short names for scoped filters", () => {
    expect(extractPackageLogContext("--filter=@repo/client")).toBe("client");
  });

  it("returns package names for unscoped filters", () => {
    expect(extractPackageLogContext("--filter=frontend")).toBe("frontend");
  });

  it("returns undefined for empty filters", () => {
    expect(extractPackageLogContext("--filter=")).toBe(undefined);
  });
});

describe("defaultPackageLogContext", () => {
  it("joins package names with dashes", () => {
    expect(defaultPackageLogContext(["--filter=@repo/client", "--filter=@scope/shared-ui"])).toBe(
      "client-shared-ui",
    );
  });
});
