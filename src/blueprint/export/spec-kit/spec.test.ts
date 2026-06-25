import { describe, expect, it } from "vitest";

import type { ParsedBlueprintForDb } from "../../db/parser/blueprint-db-parser.js";

import { emitSpec } from "./spec.js";

// ---------------------------------------------------------------------------
// Shared test fixture
// ---------------------------------------------------------------------------

const BASE: ParsedBlueprintForDb = {
  slug: "test-feature",
  filePath: "/tmp/blueprints/planned/test-feature/_overview.md",
  title: "Test Feature",
  status: "planned",
  complexity: "M",
  owner: "alice",
  created: "2026-01-01",
  lastUpdated: "2026-01-02",
  completedAt: null,
  tags: ["testing"],
  dependsOn: [],
  crossRepoDependsOn: [],
  organization: "webpresso",
  visibility: "private",
  byteSize: 100,
  contentHash: "abc123",
  tasks: [
    {
      taskId: "1.1",
      wave: "Wave 1",
      title: "Parse frontmatter",
      status: "todo",
      description: null,
      acceptanceCriteria: ["All fields extracted from YAML header"],
      dependsOnTaskIds: [],
      files: [{ filePath: "src/parser.ts", op: "modify" }],
    },
    {
      taskId: "1.2",
      wave: "Wave 1",
      title: "Validate schema",
      status: "todo",
      description: null,
      acceptanceCriteria: ["Schema errors are reported clearly"],
      dependsOnTaskIds: ["1.1"],
      files: [],
    },
  ],
  risks: [
    {
      riskId: "R1",
      severity: "HIGH",
      description: "Parser may fail on malformed YAML",
      mitigation: "Add fault-tolerant parsing with fallback",
    },
  ],
  edgeCases: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("emitSpec", () => {
  it("starts with the blueprint title and Specification suffix", () => {
    const output = emitSpec(BASE);
    expect(output).toContain("# Test Feature — Specification");
  });

  it("contains an Overview section", () => {
    const output = emitSpec(BASE);
    expect(output).toContain("## Overview");
  });

  it("contains a User Scenarios section with task-derived entries", () => {
    const output = emitSpec(BASE);
    expect(output).toContain("## User Scenarios");
    expect(output).toContain("A developer can");
  });

  it("contains a Requirements section with risk descriptions", () => {
    const output = emitSpec(BASE);
    expect(output).toContain("## Requirements");
    expect(output).toContain("Parser may fail on malformed YAML");
  });

  it("contains a Review Checklist section", () => {
    const output = emitSpec(BASE);
    expect(output).toContain("## Review Checklist");
    expect(output).toContain("- [ ] All edge cases documented");
    expect(output).toContain("- [ ] Risks mitigated");
    expect(output).toContain("- [ ] Tasks have acceptance criteria");
  });

  it("handles blueprints with no tasks gracefully", () => {
    const output = emitSpec({ ...BASE, tasks: [], risks: [] });
    expect(output).toContain("_No tasks defined._");
    expect(output).toContain("_No risks documented._");
  });
});
