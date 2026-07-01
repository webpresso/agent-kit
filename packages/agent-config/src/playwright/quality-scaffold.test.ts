import { describe, expect, it } from "vitest";

import {
  createQualityScaffoldConfig,
  qualityScaffoldTestDir,
} from "./quality-scaffold.js";

describe("quality scaffold Playwright config", () => {
  it("points at package-owned smoke specs by default", () => {
    const config = createQualityScaffoldConfig();

    expect(config.testDir).toBe(qualityScaffoldTestDir);
    expect(qualityScaffoldTestDir).toMatch(/playwright[\\/]quality-scaffold$/u);
    expect(config.fullyParallel).toBe(true);
    expect(config.reporter).toEqual([["list"]]);
    expect(config.use).toMatchObject({ trace: "retain-on-failure" });
  });

  it("preserves caller overrides without dropping default trace behavior", () => {
    const config = createQualityScaffoldConfig({
      timeout: 30_000,
      use: {
        baseURL: "http://127.0.0.1:4173",
      },
    });

    expect(config.timeout).toBe(30_000);
    expect(config.use).toMatchObject({
      baseURL: "http://127.0.0.1:4173",
      trace: "retain-on-failure",
    });
  });
});
