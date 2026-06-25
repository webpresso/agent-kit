import { describe, expect, it } from "vitest";

import { buildRedirectMessage } from "./mcp-redirect.js";

describe("buildRedirectMessage", () => {
  it.each([
    ["test", "mcp__webpresso__wp_test(...)"],
    ["lint", "mcp__webpresso__wp_lint(...)"],
    ["typecheck", "mcp__webpresso__wp_typecheck(...)"],
    ["blueprint", "mcp__webpresso__wp_blueprint(...)"],
    ["unknown", "mcp__webpresso__wp_qa(...)"],
  ] as const)("uses MCP tool format for %s when MCP is ready", (category, matcher) => {
    const message = buildRedirectMessage({
      category,
      command: "vp run test",
      fallbackHint: "wp_test MCP tool with package/file scope",
      mcpReady: true,
    });

    expect(message).toContain('"vp run test" denied — use wp MCP tool:');
    expect(message).toContain(matcher);
    expect(message).toContain("Fallback if MCP unavailable:");
  });

  it.each([
    ["test", "wp_test MCP tool with package/file scope"],
    ["lint", "wp_lint MCP tool with package/file scope"],
    ["typecheck", "wp_typecheck MCP tool with package/file scope"],
    ["unknown", "repo-approved MCP/tooling entrypoint"],
  ] as const)("falls back cleanly for %s when MCP is not ready", (category, fallbackHint) => {
    const message = buildRedirectMessage({
      category,
      command: "vp run test",
      fallbackHint,
      mcpReady: false,
    });

    expect(message).toBe(`"vp run test" denied — MCP not ready. Use: ${fallbackHint}`);
  });

  it("uses config overrides for server name and tool prefix", () => {
    const message = buildRedirectMessage({
      category: "test",
      command: "vp run test",
      fallbackHint: "wp_test MCP tool with package/file scope",
      mcpReady: true,
      mcp: { serverName: "custom-server", toolPrefix: "tool_" },
    });

    expect(message).toContain("mcp__custom-server__tool_test(...)");
  });
});
