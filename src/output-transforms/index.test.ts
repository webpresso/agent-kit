import { describe, expect, it, afterEach } from "vitest";

import {
  applyOutputTransform,
  clearTransformsForTest,
  normalizeToolName,
  registerTransform,
} from "./index.js";

afterEach(() => {
  clearTransformsForTest();
});

describe("output transform dispatcher", () => {
  it("uses the generic errors-only fallback with bytes when no transform is registered", () => {
    const result = applyOutputTransform("hello\nERROR one", {
      toolName: "wp_custom",
      persistOverflow: false,
    });

    expect(result).toMatchObject({
      rawOutput: "ERROR one",
      transform: {
        toolName: "wp_custom",
        normalizedToolName: "custom",
        tier: "registered",
        rawBytes: 15,
      },
    });
  });

  it("normalizes dynamic audit tool names for lookup", () => {
    expect(normalizeToolName("wp_audit-blueprint-lifecycle")).toBe("audit");

    registerTransform("audit", (rawOutput, context) => ({
      rawOutput: `registered:${rawOutput}`,
      transform: {
        toolName: context.toolName,
        normalizedToolName: context.normalizedToolName,
        tier: "registered",
        rawBytes: Buffer.byteLength(rawOutput ?? ""),
      },
    }));

    const result = applyOutputTransform("ok", {
      toolName: "wp_audit-blueprint-lifecycle",
    });

    expect(result).toMatchObject({
      rawOutput: "registered:ok",
      transform: {
        toolName: "wp_audit-blueprint-lifecycle",
        normalizedToolName: "audit",
        tier: "registered",
        rawBytes: 2,
      },
    });
  });

  it("normalizes CLI lint/typecheck/test variants to their intended transforms", () => {
    expect(normalizeToolName("lint-oxlint")).toBe("lint-oxlint");
    expect(normalizeToolName("wp_lint-vp")).toBe("lint-oxlint");
    expect(normalizeToolName("typecheck-cli")).toBe("typecheck");
    expect(normalizeToolName("wp_test-summary")).toBe("test");
  });
});
