import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");

function readPkg(): {
  exports?: Record<string, unknown>;
  name?: string;
  bin?: unknown;
  tshy?: { exports?: Record<string, unknown> };
} {
  return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    exports?: Record<string, unknown>;
    name?: string;
    bin?: unknown;
    tshy?: { exports?: Record<string, unknown> };
  };
}

function allTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return allTsFiles(full);
    if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      return [full];
    }
    return [];
  });
}

describe("@webpresso/agent-config export isolation", () => {
  it("ships as @webpresso/agent-config with no binary", () => {
    const pkg = readPkg();
    expect(pkg.name).toBe("@webpresso/agent-config");
    expect(pkg.bin).toBeUndefined();
  });

  it("exports all four config groups", () => {
    const pkg = readPkg();
    const exports = pkg.tshy?.exports ?? pkg.exports ?? {};

    // tsconfig group
    expect(exports).toHaveProperty("./tsconfig/base.json");
    expect(exports).toHaveProperty("./tsconfig/cloudflare.json");
    expect(exports).toHaveProperty("./tsconfig/library.json");
    expect(exports).toHaveProperty("./tsconfig/react-library.json");
    expect(exports).toHaveProperty("./tsconfig/react-router.json");

    // vitest group
    expect(exports).toHaveProperty("./vitest/node");
    expect(exports).toHaveProperty("./vitest/react");
    expect(exports).toHaveProperty("./vitest/react-router");
    expect(exports).toHaveProperty("./vitest/workers");
    expect(exports).toHaveProperty("./vitest/react-setup");
    expect(exports).toHaveProperty("./vitest/flakiness-reporter");
    expect(exports).toHaveProperty("./vitest/source-conditions");

    // playwright group
    expect(exports).toHaveProperty("./playwright/quality-scaffold");

    // stryker group
    expect(exports).toHaveProperty("./stryker");

    // workers-test group
    expect(exports).toHaveProperty("./workers-test");
  });

  it("re-exports the agent-core consumer-primitive subset", () => {
    const pkg = readPkg();
    const exports = pkg.tshy?.exports ?? pkg.exports ?? {};

    expect(exports).toHaveProperty("./repo-root");
    expect(exports).toHaveProperty("./process");
    expect(exports).toHaveProperty("./e2e");
    expect(exports).toHaveProperty("./deploy");
    expect(exports).toHaveProperty("./dev");
  });

  it("does not import from @webpresso/agent-kit in source (no circular dep)", () => {
    const srcDir = join(ROOT, "src");
    const violations: string[] = [];

    for (const file of allTsFiles(srcDir)) {
      const content = readFileSync(file, "utf8");
      const lines = content.split("\n");
      for (const [i, line] of lines.entries()) {
        if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;
        if (
          line.includes("from '@webpresso/agent-kit'") ||
          line.includes("'@webpresso/agent-kit/")
        ) {
          violations.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    expect(violations).toStrictEqual([]);
  });

  it("does not import CLI or MCP internals", () => {
    const srcDir = join(ROOT, "src");
    const violations: string[] = [];

    for (const file of allTsFiles(srcDir)) {
      const content = readFileSync(file, "utf8");
      const lines = content.split("\n");
      for (const [i, line] of lines.entries()) {
        if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;
        if (
          line.includes("from '#cli") ||
          line.includes("from '#mcp") ||
          line.includes("from '#blueprint")
        ) {
          violations.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    expect(violations).toStrictEqual([]);
  });
});
