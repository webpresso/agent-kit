import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { COMPILED_TOOL_REGISTRY } from "./_registry.js";

const DOC_PATHS = ["README.md", "docs/guides/session-memory.md"] as const;

function readDocs(): Map<string, string> {
  return new Map(DOC_PATHS.map((path) => [path, readFileSync(path, "utf8")]));
}

function registeredSessionTools(): string[] {
  return COMPILED_TOOL_REGISTRY.map((tool) => tool.name)
    .filter((name) => name.startsWith("wp_session_"))
    .sort();
}

function documentedSessionTools(text: string): string[] {
  return [...new Set(text.match(/\bwp_session_[a-z_]+\b/gu) ?? [])].sort();
}

describe("session-memory public docs", () => {
  it("list only tested registered session-memory MCP tools", () => {
    const allowed = registeredSessionTools();

    for (const [path, text] of readDocs()) {
      const documented = documentedSessionTools(text);
      expect(documented, path).toEqual(allowed);
    }
  });

  it("document safety bounds and non-goals without private path examples", () => {
    const guide = readFileSync("docs/guides/session-memory.md", "utf8");

    expect(guide).toContain("local-only");
    expect(guide).toContain("bounded");
    expect(guide).toContain("confirm: true");
    expect(guide).toContain("allowGlobal: true");
    expect(guide).toContain("Unsupported modes and non-goals");
    expect(guide).not.toMatch(/\/Users\/|\/home\/|C:\\\\/u);
  });
});
