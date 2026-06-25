import type { ToolHandlerResult } from "#mcp/auto-discover.js";
import { bytes } from "#mcp/blueprint/_shared/payload";

export function jsonContent(payload: unknown, isError = false): ToolHandlerResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload as Record<string, unknown>,
    isError,
  };
}

export function parseStructuredJson(result: ToolHandlerResult): Record<string, unknown> {
  if (result.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent as Record<string, unknown>;
  }
  const text = result.content.find((item) => item.type === "text");
  if (!text || typeof text.text !== "string") return {};
  try {
    return JSON.parse(text.text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function err(summary: string, error: string): ToolHandlerResult {
  return jsonContent({ summary, failures: [error], bytes: 0, tokensSaved: 0 }, true);
}

export function finishPayload(payload: Record<string, unknown>): ToolHandlerResult {
  payload["bytes"] = bytes(JSON.stringify(payload));
  return jsonContent(payload);
}
