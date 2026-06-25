import { describe, expect, it } from "vitest";

import { parseDocument, serializeDocument } from "./precedence.js";

describe("parseDocument", () => {
  it("parses h2 sections", () => {
    const doc = parseDocument("## Build\nbuild content\n\n## Test\ntest content\n");
    expect(doc.sections).toHaveLength(2);
    expect(doc.sections[0]?.slug).toBe("build");
    expect(doc.sections[0]?.heading).toBe("Build");
    expect(doc.sections[0]?.content.trim()).toBe("build content");
    expect(doc.sections[1]?.slug).toBe("test");
  });

  it("parses frontmatter", () => {
    const doc = parseDocument("---\ntitle: My AGENTS\n---\n## Build\ncontent\n");
    expect(doc.frontmatter).toEqual({ title: "My AGENTS" });
    expect(doc.sections).toHaveLength(1);
  });

  it("returns empty sections for doc with no h2 headings", () => {
    const doc = parseDocument("Just some text\nno headings here\n");
    expect(doc.sections).toHaveLength(0);
  });

  it("slugifies headings with spaces", () => {
    const doc = parseDocument("## My Long Heading\ncontent\n");
    expect(doc.sections[0]?.slug).toBe("my-long-heading");
  });

  it("handles empty content", () => {
    const doc = parseDocument("");
    expect(doc.sections).toHaveLength(0);
    expect(doc.frontmatter).toEqual({});
  });
});

describe("serializeDocument", () => {
  it("round-trips sections back to markdown", () => {
    const sections = new Map([
      ["build", { heading: "Build", content: "build content" }],
      ["test", { heading: "Test", content: "test content" }],
    ]);
    const result = serializeDocument({}, sections);
    expect(result).toContain("## Build");
    expect(result).toContain("build content");
    expect(result).toContain("## Test");
    expect(result).toContain("test content");
  });

  it("includes frontmatter when present", () => {
    const sections = new Map([["build", { heading: "Build", content: "content" }]]);
    const result = serializeDocument({ title: "test" }, sections);
    expect(result).toContain("title: test");
  });

  it("omits frontmatter block when empty", () => {
    const sections = new Map([["build", { heading: "Build", content: "content" }]]);
    const result = serializeDocument({}, sections);
    expect(result).not.toContain("---");
  });
});
