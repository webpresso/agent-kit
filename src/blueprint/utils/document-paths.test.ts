import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  BLUEPRINT_OVERVIEW_FILENAME,
  getBlueprintAlternateDocumentPath,
  getBlueprintDocumentCandidates,
  getBlueprintDocumentPaths,
  isBlueprintSupportingMarkdownRelativePath,
  parseBlueprintDocumentRelativePath,
} from "./document-paths.js";

describe("document-paths", () => {
  it("parses flat blueprint documents", () => {
    expect(parseBlueprintDocumentRelativePath("planned/my-feature.md")).toEqual({
      relativePath: "planned/my-feature.md",
      shape: "flat",
      slug: "my-feature",
      state: "planned",
    });
  });

  it("parses folder blueprint overview documents", () => {
    expect(parseBlueprintDocumentRelativePath("planned/my-feature/_overview.md")).toEqual({
      relativePath: `planned/my-feature/${BLUEPRINT_OVERVIEW_FILENAME}`,
      shape: "folder",
      slug: "my-feature",
      state: "planned",
    });
  });

  it("does not treat supporting docs as canonical blueprints", () => {
    expect(parseBlueprintDocumentRelativePath("planned/my-feature/notes.md")).toBeNull();
    expect(isBlueprintSupportingMarkdownRelativePath("planned/my-feature/notes.md")).toBe(true);
  });

  it("returns both flat and folder candidates for a lifecycle slug", () => {
    const root = "/repo/blueprints";
    const candidates = getBlueprintDocumentCandidates(root, "planned/my-feature");
    expect(candidates).toEqual([
      path.join(root, "planned", "my-feature.md"),
      path.join(root, "planned", "my-feature", "_overview.md"),
    ]);
  });

  it("returns the alternate shape path for a canonical document path", () => {
    const root = "/repo/blueprints";
    const { flat, folder } = getBlueprintDocumentPaths(root, "planned", "my-feature");
    expect(getBlueprintAlternateDocumentPath(root, flat)).toBe(folder);
    expect(getBlueprintAlternateDocumentPath(root, folder)).toBe(flat);
  });
});
