import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ToolInput } from "#hooks/shared/types";

import { validateFileConventions } from "./file-conventions.js";

const roots: string[] = [];
const previousSkip = process.env.FILE_CONVENTIONS_SKIP;

beforeEach(() => {
  delete process.env.FILE_CONVENTIONS_SKIP;
});

afterEach(() => {
  if (previousSkip === undefined) delete process.env.FILE_CONVENTIONS_SKIP;
  else process.env.FILE_CONVENTIONS_SKIP = previousSkip;
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function input(filePath?: string, cwd?: string): ToolInput {
  return filePath ? { cwd, tool_input: { file_path: filePath } } : { cwd, tool_input: {} };
}

function tempRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "wp-file-conventions-"));
  roots.push(root);
  return root;
}

describe("validateFileConventions", () => {
  it.each([
    "/etc",
    "/etc/passwd",
    "/usr/bin/tool",
    "/bin/sh",
    "/sbin/reboot",
    "/var/log/app",
    "/sys/kernel",
    "/proc/cpuinfo",
    "/dev/null",
  ])("blocks writes to system path %s", (filePath) => {
    const result = validateFileConventions(input(filePath));

    expect(result.passed).toBe(false);
    expect(result.message).toContain("Cannot write to system path");
  });

  it("passes non-system paths and missing file paths", () => {
    expect(validateFileConventions(input("src/index.ts"))).toEqual({
      validator: "file-conventions",
      passed: true,
    });
    expect(validateFileConventions(input())).toEqual({
      validator: "file-conventions",
      passed: true,
    });
  });

  it("delegates non-canonical planning paths to path-contract checks", () => {
    const result = validateFileConventions(input("docs/blueprints/new-feature.md"));

    expect(result.passed).toBe(false);
    expect(result.message).toContain("Planning markdown must live under");
  });

  it("delegates blueprint folder supporting docs to path-contract checks", () => {
    const root = tempRepo();
    mkdirSync(path.join(root, "blueprints", "planned", "feature"), { recursive: true });
    writeFileSync(path.join(root, "blueprints", "planned", "feature", "notes.md"), "# notes");

    const result = validateFileConventions(input("blueprints/planned/feature/notes.md", root));

    expect(result.passed).toBe(false);
    expect(result.message).toContain("requires blueprints/planned/feature/_overview.md");
  });

  it("respects FILE_CONVENTIONS_SKIP=1", () => {
    process.env.FILE_CONVENTIONS_SKIP = "1";

    const result = validateFileConventions(input("/etc/passwd"));

    expect(result).toMatchObject({ validator: "file-conventions", passed: true, skipped: true });
  });
});
