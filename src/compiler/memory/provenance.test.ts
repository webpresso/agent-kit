import { describe, expect, it } from "vitest";

import { buildProvenance } from "./provenance.js";
import type { ProvenanceEntry } from "./provenance.js";

describe("buildProvenance", () => {
  it("returns a ProvenanceMap with correct fields", () => {
    const entries: ProvenanceEntry[] = [
      { sectionSlug: "build", sourcePath: "/a/AGENTS.md", op: "base", layerIndex: 0 },
    ];
    const result = buildProvenance(entries, ["/a/AGENTS.md"]);
    expect(result.sourceFiles).toEqual(["/a/AGENTS.md"]);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.sectionSlug).toBe("build");
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("handles empty entries", () => {
    const result = buildProvenance([], []);
    expect(result.sections).toHaveLength(0);
    expect(result.sourceFiles).toHaveLength(0);
  });

  it("preserves multiple sources", () => {
    const entries: ProvenanceEntry[] = [
      { sectionSlug: "build", sourcePath: "/a/AGENTS.md", op: "base", layerIndex: 0 },
      { sectionSlug: "build", sourcePath: "/b/AGENTS.md", op: "override", layerIndex: 1 },
    ];
    const result = buildProvenance(entries, ["/a/AGENTS.md", "/b/AGENTS.md"]);
    expect(result.sections).toHaveLength(2);
    expect(result.sourceFiles).toHaveLength(2);
  });
});
