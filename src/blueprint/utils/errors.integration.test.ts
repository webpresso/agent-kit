import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BlueprintNotFoundError } from "./errors.js";

describe("blueprint errors (integration)", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "bp-errors-"));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates BlueprintNotFoundError with structured data", () => {
    const error = new BlueprintNotFoundError("missing-bp", "/plans", ["plan-a", "plan-b"]);
    expect(error.message).toContain("missing-bp");
    expect(error.requestedSlug).toBe("missing-bp");
    expect(error.availableSlugs).toContain("plan-a");
  });

  it("serializes error details to a file", () => {
    const error = new BlueprintNotFoundError("my-plan", "/plans", ["alpha", "beta"]);
    const filePath = join(tempDir, "error.json");
    writeFileSync(
      filePath,
      JSON.stringify({
        slug: error.requestedSlug,
        path: error.searchedPath,
        available: error.availableSlugs,
      }),
    );
    const data = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(data.slug).toBe("my-plan");
    expect(data.available).toEqual(["alpha", "beta"]);
  });
});
