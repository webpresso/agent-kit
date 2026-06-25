import { describe, expect, it } from "vitest";

import {
  err,
  finishPayload,
  jsonContent,
  parseStructuredJson,
} from "#mcp/blueprint/_shared/errors";
import type { ToolHandlerResult } from "#mcp/auto-discover.js";

describe("blueprint error/envelope helpers", () => {
  it("builds JSON tool content with structured content", () => {
    const payload = { summary: "ok" };

    expect(jsonContent(payload)).toEqual({
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
      isError: false,
    });
  });

  it("parses structured content before text content", () => {
    const result: ToolHandlerResult = {
      content: [{ type: "text", text: '{"summary":"text"}' }],
      structuredContent: { summary: "structured" },
    };

    expect(parseStructuredJson(result)).toEqual({ summary: "structured" });
  });

  it("returns an error summary envelope", () => {
    expect(err("failed", "bad input")).toMatchObject({
      isError: true,
      structuredContent: {
        summary: "failed",
        failures: ["bad input"],
        bytes: 0,
        tokensSaved: 0,
      },
    });
  });

  it("adds the byte count before returning the payload", () => {
    const result = finishPayload({ summary: "done", failures: [], tokensSaved: 0 });

    expect(result.structuredContent).toMatchObject({
      summary: "done",
      failures: [],
      tokensSaved: 0,
      bytes: expect.any(Number),
    });
  });
});
