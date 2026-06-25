import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import * as foldedIndex from "./index.js";
import * as foldedPlaywright from "./playwright.js";

const PARENT_RELATIVE_SEGMENT = [".", "."].join("/");

describe("folded e2e preset parity", () => {
  it("preserves the canonical public export surface", async () => {
    expect(Object.keys(foldedIndex).sort()).toEqual([
      "createPlaywrightE2ePreset",
      "defineE2ePresetSuite",
      "normalizeE2ePresetPath",
      "resolveE2ePresetSuite",
    ]);
    expect(foldedPlaywright).toMatchObject({
      createPlaywrightE2ePreset: foldedIndex.createPlaywrightE2ePreset,
    });
  });

  it("builds the canonical createPlaywrightE2ePreset result", async () => {
    const options = {
      testDir: "e2e",
      timeout: 30_000,
      fullyParallel: false,
      trace: "on-first-retry" as const,
    };

    expect(foldedIndex.createPlaywrightE2ePreset(options)).toEqual(
      expect.objectContaining({
        testDir: "e2e",
        timeout: 30_000,
        fullyParallel: false,
      }),
    );
  });

  it("keeps suite helper behavior stable", async () => {
    const suites = [
      foldedIndex.defineE2ePresetSuite({
        id: "journeys",
        runner: "playwright",
        configPath: "playwright.config.ts",
        fileMatchers: ["journeys/"],
      }),
    ];

    expect(foldedIndex.normalizeE2ePresetPath("apps/e2e/journeys/login.spec.ts")).toBe(
      "journeys/login.spec.ts",
    );
    expect(foldedIndex.normalizeE2ePresetPath("apps\\e2e\\journeys\\login.spec.ts")).toBe(
      "journeys/login.spec.ts",
    );
    expect(
      foldedIndex.resolveE2ePresetSuite({ file: "apps/e2e/journeys/login.spec.ts", suites }),
    ).toEqual(suites[0]);
    expect(foldedIndex.resolveE2ePresetSuite({ suite: "journeys", suites })).toEqual(suites[0]);
  });

  it("folds source locally instead of re-exporting from archived packages", () => {
    for (const fileName of ["index.ts", "playwright.ts"]) {
      const source = readFileSync(join(import.meta.dirname, fileName), "utf8");

      expect(source).not.toContain(`packages/${"agent-e2e-preset"}`);
      expect(source).not.toContain(PARENT_RELATIVE_SEGMENT);
    }
  });
});
