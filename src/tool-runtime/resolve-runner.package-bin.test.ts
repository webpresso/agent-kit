import { describe, expect, it } from "vitest";

import { resolveRunner } from "./resolve-runner.js";

describe("resolveRunner package-owned bins", () => {
  it("prefers an installed agent-kit package binary for TypeScript", () => {
    const resolution = resolveRunner("tsc", { outputPolicy: "structured" });

    expect(resolution.tool).toBe("tsc");
    expect(resolution.source).toBe("managed");
    expect(resolution.command).toContain("typescript");
    expect(resolution.args).toEqual([]);
  });

  it("resolves optional provider tools when installed and otherwise falls back", () => {
    const resolution = resolveRunner("wrangler", { outputPolicy: "structured" });

    expect(resolution.tool).toBe("wrangler");
    if (resolution.source === "managed") {
      expect(resolution.command).toContain("wrangler");
      expect(resolution.args).toEqual([]);
    } else {
      expect(resolution.command).toBe("vp");
      expect(resolution.args).toEqual(["exec", "wrangler"]);
    }
  });
});
