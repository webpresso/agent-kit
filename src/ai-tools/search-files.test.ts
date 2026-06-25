import { describe, expect, it } from "vitest";

import { searchFilesTool } from "./search-files.js";

import type { ToolContext } from "./types.js";

describe("searchFilesTool", () => {
  const context: ToolContext = {
    projectId: "project",
    orgId: "org",
    userId: "user",
  };

  it("rejects over-length regex patterns before storage search", async () => {
    const result = await searchFilesTool.execute({ pattern: "a".repeat(4097) }, context);

    expect(result.success).toBe(false);
    expect(result.output).toContain("Search pattern is too long");
    expect(result.error).toContain("4096");
  });
});
