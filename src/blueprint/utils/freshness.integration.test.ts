import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { calculateFreshness } from "./freshness.js";

describe("freshness (integration)", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "freshness-"));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("calculates freshness for recent date and writes result", () => {
    const result = calculateFreshness(new Date(), "in-progress");
    const filePath = join(tempDir, "freshness.json");
    writeFileSync(filePath, JSON.stringify(result));
    const readBack = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(readBack.status).toBe("fresh");
  });

  it("calculates freshness for stale date", () => {
    const staleDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const result = calculateFreshness(staleDate, "in-progress");
    expect(result.daysSinceUpdate).toBeGreaterThanOrEqual(89);
    expect(result.status).not.toBe("fresh");
  });
});
