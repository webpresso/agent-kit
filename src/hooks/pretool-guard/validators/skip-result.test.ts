import { describe, expect, it } from "vitest";

import { createSkipResult } from "./skip-result.js";

describe("createSkipResult", () => {
  it("returns the standard passed skipped shape with the default reason", () => {
    const result = createSkipResult("example-validator");

    expect(result).toMatchObject({
      validator: "example-validator",
      passed: true,
      skipped: true,
    });
    expect(result.skipReason).toContain("Bypass enabled");
  });

  it("preserves a custom skip reason", () => {
    expect(createSkipResult("example-validator", "not applicable")).toEqual({
      validator: "example-validator",
      passed: true,
      skipped: true,
      skipReason: "not applicable",
    });
  });
});
