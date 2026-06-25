import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readVt, vtPath, writeVt } from "#mcp/blueprint/_shared/validation-timestamp";

describe("blueprint validation timestamp helpers", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
  });

  it("returns an empty map before timestamps exist", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wp-vt-empty-"));
    tempDirs.push(dir);

    expect(readVt(dir)).toEqual({});
  });

  it("writes timestamps under the agent state directory", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wp-vt-write-"));
    tempDirs.push(dir);

    writeVt(dir, { blueprint: 123 });

    expect(vtPath(dir)).toBe(path.join(dir, ".agent", ".validate-timestamps.json"));
    expect(readVt(dir)).toEqual({ blueprint: 123 });
  });
});
