import { describe, expect, it } from "vitest";

import type { ToolInput } from "#hooks/shared/types";

import {
  collectFieldViolations,
  countTaskHeadings,
  detectWrongTaskFormat,
  extractFrontmatterBlock,
  parseFrontmatter,
  validatePlanFrontmatter,
} from "./plan-frontmatter.js";

// ---------------------------------------------------------------------------
// extractFrontmatterBlock
// ---------------------------------------------------------------------------
describe("extractFrontmatterBlock", () => {
  it("extracts YAML from a standard frontmatter block", () => {
    const content = "---\ntype: blueprint\nstatus: draft\n---\n# Body";
    expect(extractFrontmatterBlock(content)).toBe("type: blueprint\nstatus: draft");
  });

  it("returns null when there is no frontmatter", () => {
    expect(extractFrontmatterBlock("# Just a heading")).toBeNull();
  });

  it("returns null for empty content", () => {
    expect(extractFrontmatterBlock("")).toBeNull();
  });

  it("returns null for ---\n---\nbody (no closing fence)", () => {
    const content = "---\n---\nbody";
    // The content "---" between dashes has no trailing \n--- to close the frontmatter
    expect(extractFrontmatterBlock(content)).toBeNull();
  });

  it("handles frontmatter containing special YAML characters", () => {
    const content = "---\ntype: blueprint\nstatus: draft\ntags: [a, b]\n---\nbody";
    expect(extractFrontmatterBlock(content)).toBe("type: blueprint\nstatus: draft\ntags: [a, b]");
  });

  it("extracts multiline YAML values", () => {
    const content = "---\ntype: blueprint\ndescription: |\n  line 1\n  line 2\n---\nbody";
    const block = extractFrontmatterBlock(content);
    expect(block).toContain("type: blueprint");
    expect(block).toContain("line 1");
  });
});

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------
describe("parseFrontmatter", () => {
  it("parses valid YAML into an object", () => {
    const result = parseFrontmatter("type: blueprint\nstatus: draft");
    expect(result).toEqual({ type: "blueprint", status: "draft" });
  });

  it("returns null for invalid YAML", () => {
    expect(parseFrontmatter("type: [unclosed")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseFrontmatter("")).toBeNull();
  });

  it("returns null when YAML parses to a non-object scalar", () => {
    expect(parseFrontmatter("42")).toBeNull();
  });

  it("returns the parsed array when YAML parses to an array", () => {
    const result = parseFrontmatter("- one\n- two");
    expect(result).toEqual(["one", "two"]);
  });
});

// ---------------------------------------------------------------------------
// collectFieldViolations
// ---------------------------------------------------------------------------
describe("collectFieldViolations", () => {
  it("returns no violations when all fields are valid", () => {
    expect(collectFieldViolations({ type: "blueprint", status: "draft", complexity: "M" })).toEqual(
      [],
    );
  });

  it("returns violations for missing type", () => {
    const violations = collectFieldViolations({ status: "draft", complexity: "M" });
    expect(violations).toHaveLength(1);
    expect(violations[0]!.field).toBe("type");
    expect(violations[0]!.message).toContain("Missing required field");
  });

  it("returns violations for invalid type", () => {
    const violations = collectFieldViolations({
      type: "unknown",
      status: "draft",
      complexity: "M",
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]!.field).toBe("type");
    expect(violations[0]!.message).toContain("Invalid type");
    expect(violations[0]!.message).toContain("blueprint");
  });

  it("returns violations for missing status", () => {
    const violations = collectFieldViolations({ type: "blueprint", complexity: "M" });
    expect(violations).toHaveLength(1);
    expect(violations[0]!.field).toBe("status");
  });

  it("returns violations for invalid status", () => {
    const violations = collectFieldViolations({
      type: "blueprint",
      status: "bogus",
      complexity: "M",
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]!.field).toBe("status");
    expect(violations[0]!.message).toContain("Invalid status");
  });

  it("returns violations for missing complexity", () => {
    const violations = collectFieldViolations({ type: "blueprint", status: "draft" });
    expect(violations).toHaveLength(1);
    expect(violations[0]!.field).toBe("complexity");
  });

  it("returns violations for invalid complexity", () => {
    const violations = collectFieldViolations({
      type: "blueprint",
      status: "draft",
      complexity: "XXL",
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]!.field).toBe("complexity");
    expect(violations[0]!.message).toContain("Invalid complexity");
  });

  it("returns all violations when multiple fields are wrong", () => {
    const violations = collectFieldViolations({ type: "nope", status: "bogus", complexity: "XXL" });
    expect(violations).toHaveLength(3);
  });

  it("accepts all valid type values", () => {
    expect(collectFieldViolations({ type: "blueprint", status: "draft", complexity: "S" })).toEqual(
      [],
    );
    expect(
      collectFieldViolations({ type: "parent-roadmap", status: "draft", complexity: "S" }),
    ).toEqual([]);
  });

  it("accepts all valid status values", () => {
    for (const status of ["draft", "planned", "parked", "in-progress", "completed", "archived"]) {
      expect(collectFieldViolations({ type: "blueprint", status, complexity: "S" })).toEqual([]);
    }
  });

  it("accepts all valid complexity values", () => {
    for (const complexity of ["XS", "S", "M", "L", "XL"]) {
      expect(collectFieldViolations({ type: "blueprint", status: "draft", complexity })).toEqual(
        [],
      );
    }
  });

  it("treats undefined fields as missing", () => {
    const violations = collectFieldViolations({
      type: undefined,
      status: undefined,
      complexity: undefined,
    });
    expect(violations).toHaveLength(3);
    expect(violations[0]!.message).toContain("Missing required field");
    expect(violations[1]!.message).toContain("Missing required field");
    expect(violations[2]!.message).toContain("Missing required field");
  });

  it("treats non-string values as invalid", () => {
    const violations = collectFieldViolations({ type: 42, status: true, complexity: null });
    expect(violations).toHaveLength(3);
    for (const v of violations) {
      expect(v.message).toContain("Invalid");
    }
  });
});

// ---------------------------------------------------------------------------
// countTaskHeadings
// ---------------------------------------------------------------------------
describe("countTaskHeadings", () => {
  it("counts zero when no task headings exist", () => {
    expect(countTaskHeadings("# Plan\n\nSome text")).toBe(0);
  });

  it("counts a single task heading", () => {
    expect(countTaskHeadings("#### Task 1.1: Do something")).toBe(1);
  });

  it("counts multiple task headings", () => {
    const content = "#### Task 1.1: First\n#### Task 1.2: Second\n#### Task 2.1: Third";
    expect(countTaskHeadings(content)).toBe(3);
  });

  it("does not count wrong-format ### task headings", () => {
    expect(countTaskHeadings("### Task 1.1: Wrong format")).toBe(0);
  });

  it("counts task headings with dot-separated numeric IDs", () => {
    expect(countTaskHeadings("#### Task 1.1.1: Deep subtask")).toBe(1);
  });

  it("returns 0 for empty content", () => {
    expect(countTaskHeadings("")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// detectWrongTaskFormat
// ---------------------------------------------------------------------------
describe("detectWrongTaskFormat", () => {
  it("returns 0 when no wrong-format task headings exist", () => {
    expect(detectWrongTaskFormat("#### Task 1.1: Good")).toBe(0);
  });

  it("detects a single wrong-format task heading", () => {
    expect(detectWrongTaskFormat("### Task 1.1: Wrong")).toBe(1);
  });

  it("detects multiple wrong-format task headings", () => {
    const content = "### Task 1.1: First\n### Task 1.2: Second";
    expect(detectWrongTaskFormat(content)).toBe(2);
  });

  it("does not count correct-format headings", () => {
    const content = "#### Task 1.1: Good\n### Task 1.2: Bad";
    expect(detectWrongTaskFormat(content)).toBe(1);
  });

  it("returns 0 for empty content", () => {
    expect(detectWrongTaskFormat("")).toBe(0);
  });

  it("handles multiline content", () => {
    const content = "### Task 1.1: Wrong\nsome body\n### Task 1.2: Also wrong";
    expect(detectWrongTaskFormat(content)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// validatePlanFrontmatter (integrated)
// ---------------------------------------------------------------------------
describe("validatePlanFrontmatter", () => {
  const validBlueprintPath = "webpresso/blueprints/planned/my-feat/_overview.md";
  const validFlatBlueprintPath = "webpresso/blueprints/planned/my-flat-feat.md";

  function writeInput(filePath: string, content: string): ToolInput {
    return { tool_input: { file_path: filePath, content } };
  }

  it("passes when filePath is missing", () => {
    const input: ToolInput = { tool_input: { content: "some content" } };
    const result = validatePlanFrontmatter(input);
    expect(result.passed).toBe(true);
  });

  it("passes for non-blueprint paths", () => {
    const result = validatePlanFrontmatter(writeInput("src/index.ts", "code"));
    expect(result.passed).toBe(true);
  });

  it("passes when tool_input has old_string (edit, not write) on a valid path", () => {
    const input: ToolInput = {
      tool_input: { file_path: validBlueprintPath, old_string: "old", new_string: "new" },
    };
    const result = validatePlanFrontmatter(input);
    expect(result.passed).toBe(true);
  });

  it("passes when content is missing", () => {
    const input: ToolInput = { tool_input: { file_path: validBlueprintPath } };
    const result = validatePlanFrontmatter(input);
    expect(result.passed).toBe(true);
  });

  it("fails when frontmatter block is missing on a valid path", () => {
    const result = validatePlanFrontmatter(writeInput(validBlueprintPath, "# No frontmatter"));
    expect(result.passed).toBe(false);
    expect(result.message).toContain("Missing YAML frontmatter");
  });

  it("fails when YAML is invalid on a valid path", () => {
    const result = validatePlanFrontmatter(
      writeInput(validBlueprintPath, "---\ntype: [bad yaml\n---\nbody"),
    );
    expect(result.passed).toBe(false);
    expect(result.message).toContain("Invalid YAML");
  });

  it("fails when type is missing from frontmatter", () => {
    const result = validatePlanFrontmatter(
      writeInput(validBlueprintPath, "---\nstatus: draft\ncomplexity: M\n---\nbody"),
    );
    expect(result.passed).toBe(false);
    expect(result.message).toContain("Missing required field: type");
  });

  it("fails when status has an invalid value", () => {
    const result = validatePlanFrontmatter(
      writeInput(
        validBlueprintPath,
        "---\ntype: blueprint\nstatus: invalid\ncomplexity: M\n---\nbody",
      ),
    );
    expect(result.passed).toBe(false);
    expect(result.message).toContain("Invalid status");
  });

  it("fails when wrong-format task headings exist", () => {
    const content =
      "---\ntype: blueprint\nstatus: draft\ncomplexity: M\n---\n### Task 1.1: Wrong format";
    const result = validatePlanFrontmatter(writeInput(validBlueprintPath, content));
    expect(result.passed).toBe(false);
    expect(result.message).toContain("wrong format");
  });

  it("fails with multiple violations reported together", () => {
    const content = "---\ntype: bad-type\nstatus: bad-status\n---\n### Task 1.1: Wrong";
    const result = validatePlanFrontmatter(writeInput(validBlueprintPath, content));
    expect(result.passed).toBe(false);
    expect(result.message).toContain("Invalid type");
    expect(result.message).toContain("Invalid status");
    expect(result.message).toContain("Missing required field: complexity");
  });

  it("shows all violations when there are exactly 4 (no truncation)", () => {
    const content =
      "---\ntype: bad\nstatus: bad\n---\n" +
      Array.from({ length: 1 }, (_, i) => `### Task 1.${i + 1}: Wrong`).join("\n");
    const result = validatePlanFrontmatter(writeInput(validBlueprintPath, content));
    expect(result.passed).toBe(false);
    // With 3 field violations + 1 task_format = 4, all are shown without "...and" overflow
    expect(result.message).toContain("type:");
    expect(result.message).toContain("status:");
    expect(result.message).toContain("complexity:");
    expect(result.message).toContain("task_format:");
    expect(result.message).not.toContain("...and");
  });

  it("passes with all valid fields and correct task headings", () => {
    const content =
      "---\ntype: blueprint\nstatus: in-progress\ncomplexity: L\n---\n# Plan\n\n#### Task 1.1: First\n#### Task 1.2: Second";
    const result = validatePlanFrontmatter(writeInput(validBlueprintPath, content));
    expect(result.passed).toBe(true);
  });

  it("validates flat-file blueprints the same way as folder blueprints", () => {
    const content =
      "---\ntype: blueprint\nstatus: planned\ncomplexity: M\n---\n# Plan\n\n#### Task 1.1: First";
    const result = validatePlanFrontmatter(writeInput(validFlatBlueprintPath, content));
    expect(result.passed).toBe(true);
  });

  it("warns when valid but no task headings found", () => {
    const content = "---\ntype: blueprint\nstatus: draft\ncomplexity: M\n---\n# Plan with no tasks";
    const result = validatePlanFrontmatter(writeInput(validBlueprintPath, content));
    expect(result.passed).toBe(true);
    expect(result.message).toContain("Warning");
    expect(result.message).toContain("no task headings");
  });

  it("detects non-canonical planning path (markdown outside blueprints/)", () => {
    const input: ToolInput = { tool_input: { file_path: "docs/blueprints/my-plan.md" } };
    const result = validatePlanFrontmatter(input);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("Planning markdown must live under");
  });

  it("detects legacy platform planning paths", () => {
    const input: ToolInput = { tool_input: { file_path: "platform/services/some-plan.md" } };
    const result = validatePlanFrontmatter(input);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("Legacy planning paths");
  });

  it("passes for non-overview blueprint files", () => {
    const input: ToolInput = {
      tool_input: { file_path: "webpresso/blueprints/in-progress/my-blueprint/support.md" },
    };
    const result = validatePlanFrontmatter(input);
    expect(result.passed).toBe(true);
  });

  it("handles README.md as a valid overview filename", () => {
    const content = "---\ntype: blueprint\nstatus: draft\ncomplexity: M\n---\n# Plan";
    const result = validatePlanFrontmatter(
      writeInput("webpresso/blueprints/planned/my-feat/README.md", content),
    );
    expect(result.passed).toBe(true);
  });

  it("handles tech-debt paths", () => {
    const content = "---\ntype: blueprint\nstatus: draft\ncomplexity: M\n---\n# Plan";
    const result = validatePlanFrontmatter(
      writeInput("webpresso/tech-debt/my-ticket/_overview.md", content),
    );
    expect(result.passed).toBe(true);
  });
});
