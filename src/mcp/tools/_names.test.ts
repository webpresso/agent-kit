import { describe, expect, it } from "vitest";

import { WP_TOOL_NAMES } from "#mcp/tools/_names";
import { COMPILED_TOOL_REGISTRY } from "#mcp/tools/_registry";

describe("WP_TOOL_NAMES", () => {
  it("matches the compiled MCP tool registry names, in registry order", () => {
    expect([...WP_TOOL_NAMES]).toStrictEqual(COMPILED_TOOL_REGISTRY.map((tool) => tool.name));
  });
});
