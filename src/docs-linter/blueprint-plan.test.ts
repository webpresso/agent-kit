import { describe, expect, it } from "vitest";

import {
  checkDependencyFormat,
  extractComplexity,
  extractFrontmatter,
  findMalformedTaskIds,
  findWrongTaskHeaders,
  hasCompletionSummary,
  isCompleted,
  validateBlueprintPlan,
} from "./blueprint-plan.js";

describe("findWrongTaskHeaders", () => {
  it("returns zero count for correct #### Task format", () => {
    const content = `
#### Task 1.1: Correct Format
- [ ] Criterion
`;
    const result = findWrongTaskHeaders(content);
    expect(result.count).toBe(0);
    expect(result.firstLineNumber).toBeNull();
  });

  it("detects single ### Task header", () => {
    const content = `
### Task 1.1: Wrong Format
- [ ] Criterion
`;
    const result = findWrongTaskHeaders(content);
    expect(result.count).toBe(1);
    expect(result.firstLineNumber).toBe(2); // Line 2 (1-indexed)
  });

  it("counts multiple ### Task headers", () => {
    const content = `
### Task 1.1: First
- [ ] A
### Task 1.2: Second
- [ ] B
### Task 2.1: Third
- [ ] C
`;
    const result = findWrongTaskHeaders(content);
    expect(result.count).toBe(3);
    expect(result.firstLineNumber).toBe(2); // First occurrence
  });

  it("finds correct line number when task is not at start", () => {
    const content = `# Plan Title

Some preamble text
Another line

### Task 1.1: Wrong Format
- [ ] Criterion
`;
    const result = findWrongTaskHeaders(content);
    expect(result.count).toBe(1);
    expect(result.firstLineNumber).toBe(6);
  });

  it("ignores ### headings that are not tasks", () => {
    const content = `
### Phase 1: Foundation
Some text
### Overview
`;
    const result = findWrongTaskHeaders(content);
    expect(result.count).toBe(0);
    expect(result.firstLineNumber).toBeNull();
  });

  it("only matches Task with numeric ID format", () => {
    const content = `
### Task A: Non-numeric ID
### Task One: Named ID
### Task 1.1: Correct numeric (wrong hash count)
`;
    const result = findWrongTaskHeaders(content);
    expect(result.count).toBe(1); // Only the numeric one
    expect(result.firstLineNumber).toBe(4);
  });

  it("handles empty content", () => {
    const result = findWrongTaskHeaders("");
    expect(result.count).toBe(0);
    expect(result.firstLineNumber).toBeNull();
  });

  it("handles content with no tasks", () => {
    const content = `# My Plan
Just some regular markdown content.
No tasks here.
`;
    const result = findWrongTaskHeaders(content);
    expect(result.count).toBe(0);
    expect(result.firstLineNumber).toBeNull();
  });
});

describe("findMalformedTaskIds", () => {
  it("returns zero for correct numeric task IDs", () => {
    const content = `
#### Task 1.1: First Task
#### Task 1.2: Second Task
#### Task 2.1: Third Task
`;
    const count = findMalformedTaskIds(content);
    expect(count).toBe(0);
  });

  it("returns zero for correct lane-prefixed numeric task IDs", () => {
    const content = `
#### [backend] Task 1.1: First Task
#### [schema] Task 1.2: Second Task
#### [qa] Task 2.1: Third Task
`;
    const count = findMalformedTaskIds(content);
    expect(count).toBe(0);
  });

  it("returns zero for alphanumeric split task IDs", () => {
    const content = `
#### Task 2.1a: Dependency bump
#### Task 2.1b: Manifest cutover
#### [infra] Task 3.4c: Follow-up
`;
    const count = findMalformedTaskIds(content);
    expect(count).toBe(0);
  });

  it("detects task with non-numeric ID", () => {
    const content = `
#### Task A: Bad ID
- [ ] Criterion
`;
    const count = findMalformedTaskIds(content);
    expect(count).toBe(1);
  });

  it("detects task with named ID", () => {
    const content = `
#### Task One: Bad ID
- [ ] Criterion
`;
    const count = findMalformedTaskIds(content);
    expect(count).toBe(1);
  });

  it("counts multiple malformed task IDs", () => {
    const content = `
#### Task A: First Bad
#### Task 1.1: Good
#### Task B: Second Bad
#### Task Two: Third Bad
`;
    const count = findMalformedTaskIds(content);
    expect(count).toBe(3);
  });

  it("detects malformed lane-prefixed task IDs", () => {
    const content = `
#### [backend] Task A: First Bad
#### [schema] Task 1.1: Good
#### [qa] Task One: Second Bad
`;
    const count = findMalformedTaskIds(content);
    expect(count).toBe(2);
  });

  it("handles empty content", () => {
    const count = findMalformedTaskIds("");
    expect(count).toBe(0);
  });

  it("ignores #### headings that are not tasks", () => {
    const content = `
#### Overview
#### Phase Summary
`;
    const count = findMalformedTaskIds(content);
    expect(count).toBe(0);
  });
});

describe("checkDependencyFormat", () => {
  it("returns false for correct Task X.Y format", () => {
    const content = `
#### Task 2.1: With Dependencies
**Depends:** Task 1.1, Task 1.2
`;
    const result = checkDependencyFormat(content);
    expect(result.hasBareReferences).toBe(false);
    expect(result.exampleLine).toBeNull();
  });

  it("detects bare numeric references", () => {
    const content = `
#### Task 2.1: Bad Dependencies
**Depends:** 1.1, 1.2
`;
    const result = checkDependencyFormat(content);
    expect(result.hasBareReferences).toBe(true);
    expect(result.exampleLine).toBe("1.1, 1.2");
  });

  it("detects single bare reference", () => {
    const content = `
#### Task 2.1: Bad Dependency
**Depends:** 1.1
`;
    const result = checkDependencyFormat(content);
    expect(result.hasBareReferences).toBe(true);
    expect(result.exampleLine).toBe("1.1");
  });

  it('ignores "None" dependency', () => {
    const content = `
#### Task 1.1: No Dependencies
**Depends:** None
`;
    const result = checkDependencyFormat(content);
    expect(result.hasBareReferences).toBe(false);
    expect(result.exampleLine).toBeNull();
  });

  it("ignores empty dependency", () => {
    const content = `
#### Task 1.1: Empty Dependency
**Depends:** 
`;
    const result = checkDependencyFormat(content);
    expect(result.hasBareReferences).toBe(false);
    expect(result.exampleLine).toBeNull();
  });

  it('handles mixed case "Depends"', () => {
    const content = `
#### Task 2.1: Mixed Case
**depends:** Task 1.1
`;
    const result = checkDependencyFormat(content);
    expect(result.hasBareReferences).toBe(false);
    expect(result.exampleLine).toBeNull();
  });

  it("handles content with no depends lines", () => {
    const content = `
#### Task 1.1: No Depends
- [ ] Criterion
`;
    const result = checkDependencyFormat(content);
    expect(result.hasBareReferences).toBe(false);
    expect(result.exampleLine).toBeNull();
  });

  it("returns first bad example when multiple bad depends exist", () => {
    const content = `
#### Task 2.1: First Bad
**Depends:** 1.1

#### Task 2.2: Second Bad
**Depends:** 1.2
`;
    const result = checkDependencyFormat(content);
    expect(result.hasBareReferences).toBe(true);
    expect(result.exampleLine).toBe("1.1");
  });

  it("handles mixed good and bad dependencies", () => {
    const content = `
#### Task 2.1: Good
**Depends:** Task 1.1

#### Task 2.2: Bad
**Depends:** 1.2
`;
    const result = checkDependencyFormat(content);
    expect(result.hasBareReferences).toBe(true);
    expect(result.exampleLine).toBe("1.2");
  });

  it("handles empty content", () => {
    const result = checkDependencyFormat("");
    expect(result.hasBareReferences).toBe(false);
    expect(result.exampleLine).toBeNull();
  });

  it('handles lowercase "task" prefix', () => {
    const content = `
#### Task 2.1: Lowercase
**Depends:** task 1.1
`;
    const result = checkDependencyFormat(content);
    expect(result.hasBareReferences).toBe(false);
    expect(result.exampleLine).toBeNull();
  });
});

describe("validateBlueprintPlan", () => {
  const filePath = "test-plan.md";

  it("returns empty array for non-blueprint doc types", () => {
    const content = `### Task 1.1: Wrong Format`;
    const errors = validateBlueprintPlan(filePath, content, "research");
    expect(errors).toEqual([]);
  });

  it("returns empty array for correct Blueprint format", () => {
    const content = `---
type: blueprint
title: Correct Format
owner: test
status: in-progress
complexity: M
last_updated: 2026-06-04
---
#### Task 1.1: Correct Format
**Status:** todo
**Depends:** None
- [ ] Criterion
`;
    const errors = validateBlueprintPlan(filePath, content, "blueprint");
    expect(errors).toEqual([]);
  });

  it("returns error for ### Task format", () => {
    const content = `
---
status: in-progress
---
### Task 1.1: Wrong Format
- [ ] Criterion
`;
    const errors = validateBlueprintPlan(filePath, content, "blueprint");
    expect(errors.some((error) => error.ruleId === "blueprint-task-format")).toBe(true);
  });

  it("returns error for malformed task ID", () => {
    const content = `
---
status: in-progress
---
#### Task A: Bad ID
- [ ] Criterion
`;
    const errors = validateBlueprintPlan(filePath, content, "blueprint");
    expect(errors.some((error) => error.ruleId === "blueprint-task-id-format")).toBe(true);
  });

  it("returns error for malformed lane-prefixed task ID", () => {
    const content = `
---
status: in-progress
---
#### [backend] Task A: Bad ID
**Status:** todo
- [ ] Criterion
`;
    const errors = validateBlueprintPlan(filePath, content, "blueprint");
    expect(errors.some((error) => error.ruleId === "blueprint-task-id-format")).toBe(true);
  });

  it("returns error for bare dependency reference", () => {
    const content = `
---
status: in-progress
---
#### Task 2.1: With Bad Depends
**Status:** todo
**Depends:** 1.1
`;
    const errors = validateBlueprintPlan(filePath, content, "blueprint");
    expect(errors.some((error) => error.ruleId === "blueprint-depends-format")).toBe(true);
  });

  it("returns error for bare alphanumeric dependency reference", () => {
    const content = `
---
status: in-progress
---
#### Task 2.1b: With Bad Depends
**Status:** todo
**Depends:** 2.1a
`;
    const errors = validateBlueprintPlan(filePath, content, "blueprint");
    expect(errors.some((error) => error.ruleId === "blueprint-depends-format")).toBe(true);
  });

  it("returns multiple errors for multiple violations", () => {
    const content = `
---
status: in-progress
---
### Task 1.1: Wrong header (3 hashes)
**Depends:** 1.2
#### Task A: Bad ID (non-numeric)
`;
    const errors = validateBlueprintPlan(filePath, content, "blueprint");
    const ruleIds = errors.map((e) => e.ruleId);
    expect(ruleIds).toContain("blueprint-status");
    expect(ruleIds).toContain("blueprint-depends-format");
    expect(ruleIds).toContain("blueprint-task-format");
    expect(ruleIds).toContain("blueprint-task-id-format");
  });

  it("sets file path correctly in errors", () => {
    const content = `### Task 1.1: Wrong`;
    const customPath = "custom/path/plan.md";
    const errors = validateBlueprintPlan(customPath, content, "blueprint");
    expect(errors[0]!.file).toBe(customPath);
  });

  it("handles complex plan with correct format", () => {
    const content = `---
type: blueprint
title: My Plan
owner: test
status: in-progress
complexity: M
last_updated: 2026-06-04
---
# My Plan

## Phase 1: Foundation

#### Task 1.1: Setup
**Status:** todo
**Depends:** None
- [ ] Criterion 1
- [ ] Criterion 2

#### Task 1.2: Build
**Status:** todo
**Depends:** Task 1.1
- [ ] Criterion

## Phase 2: Integration

#### Task 2.1: Deploy
**Status:** todo
**Depends:** Task 1.1, Task 1.2
- [ ] Criterion
`;
    const errors = validateBlueprintPlan(filePath, content, "blueprint");
    expect(errors).toEqual([]);
  });

  it("detects count correctly in error message", () => {
    const content = `
### Task 1.1: First
### Task 1.2: Second
### Task 2.1: Third
`;
    const errors = validateBlueprintPlan(filePath, content, "blueprint");
    expect(errors[0]!.message).toContain("3 task(s)");
  });

  it("includes reference to docs template in error message", () => {
    const content = `### Task 1.1: Wrong`;
    const errors = validateBlueprintPlan(filePath, content, "blueprint");
    expect(errors[0]!.message).toContain("docs/templates/blueprint.md");
  });
});

describe("extractFrontmatter", () => {
  it("extracts valid frontmatter fields", () => {
    const content = `---
type: blueprint
status: completed
complexity: L
---

# Content`;
    const frontmatter = extractFrontmatter(content);
    expect(frontmatter).toEqual({
      type: "blueprint",
      status: "completed",
      complexity: "L",
    });
  });

  it("returns null when no frontmatter present", () => {
    const content = `# Content without frontmatter`;
    const frontmatter = extractFrontmatter(content);
    expect(frontmatter).toBeNull();
  });

  it("handles frontmatter with extra whitespace", () => {
    const content = `---
status:    completed  
complexity:  M  
---

# Content`;
    const frontmatter = extractFrontmatter(content);
    expect(frontmatter?.status).toBe("completed");
    expect(frontmatter?.complexity).toBe("M");
  });

  it("ignores malformed frontmatter lines", () => {
    const content = `---
type: blueprint
invalid line without colon
complexity: M
---

# Content`;
    const frontmatter = extractFrontmatter(content);
    expect(frontmatter).toEqual({
      type: "blueprint",
      complexity: "M",
    });
  });
});

describe("isCompleted", () => {
  it("returns true when frontmatter status is completed", () => {
    const content = `---
status: completed
---

# Content`;
    const result = isCompleted("/path/to/file.md", content);
    expect(result).toBe(true);
  });

  it("returns false when frontmatter status is complete", () => {
    const content = `---
status: complete
---

# Content`;
    const result = isCompleted("/path/to/file.md", content);
    expect(result).toBe(false);
  });

  it("returns true when frontmatter status is COMPLETED (case-insensitive)", () => {
    const content = `---
status: COMPLETED
---

# Content`;
    const result = isCompleted("/path/to/file.md", content);
    expect(result).toBe(true);
  });

  it("returns false when frontmatter status is in-progress", () => {
    const content = `---
status: in-progress
---

# Content`;
    const result = isCompleted("/path/to/file.md", content);
    expect(result).toBe(false);
  });

  it("returns true when file path contains /completed/", () => {
    const content = `# Content without frontmatter`;
    const result = isCompleted("/blueprints/completed/my-plan/_overview.md", content);
    expect(result).toBe(true);
  });

  it("returns false when file path does not contain /completed/", () => {
    const content = `# Content without frontmatter`;
    const result = isCompleted("/blueprints/in-progress/my-plan/_overview.md", content);
    expect(result).toBe(false);
  });

  it("prioritizes frontmatter over file path (frontmatter wins)", () => {
    const content = `---
status: in-progress
---

# Content`;
    const result = isCompleted("/blueprints/completed/my-plan/_overview.md", content);
    expect(result).toBe(false); // Frontmatter says in-progress, so return false
  });

  it("returns true when frontmatter is completed but path is in-progress", () => {
    const content = `---
status: completed
---

# Content`;
    const result = isCompleted("/blueprints/in-progress/my-plan/_overview.md", content);
    expect(result).toBe(true); // Frontmatter wins
  });

  it("returns false for archived status", () => {
    const content = `---
status: archived
---

# Content`;
    const result = isCompleted("/blueprints/completed/my-plan/_overview.md", content);
    expect(result).toBe(false);
  });
});

describe("extractComplexity", () => {
  it("extracts complexity from frontmatter", () => {
    const content = `---
complexity: L
---

# Content`;
    const complexity = extractComplexity(content);
    expect(complexity).toBe("L");
  });

  it("normalizes complexity to uppercase", () => {
    const content = `---
complexity: m
---

# Content`;
    const complexity = extractComplexity(content);
    expect(complexity).toBe("M");
  });

  it("defaults to M when complexity missing", () => {
    const content = `---
type: blueprint
---

# Content`;
    const complexity = extractComplexity(content);
    expect(complexity).toBe("M");
  });

  it("defaults to M when no frontmatter", () => {
    const content = `# Content`;
    const complexity = extractComplexity(content);
    expect(complexity).toBe("M");
  });

  it("trims whitespace from complexity", () => {
    const content = `---
complexity:   XL  
---

# Content`;
    const complexity = extractComplexity(content);
    expect(complexity).toBe("XL");
  });
});

describe("hasCompletionSummary", () => {
  it('returns true when exact match "## Completion Summary"', () => {
    const content = `## Completion Summary

Some content`;
    const result = hasCompletionSummary(content);
    expect(result).toBe(true);
  });

  it("returns true when heading has trailing whitespace", () => {
    const content = `## Completion Summary   

Some content`;
    const result = hasCompletionSummary(content);
    expect(result).toBe(true);
  });

  it("returns false when heading has suffix", () => {
    const content = `## Completion Summary: 2026-02-08

Some content`;
    const result = hasCompletionSummary(content);
    expect(result).toBe(false);
  });

  it("returns false when wrong heading level (# or ###)", () => {
    const content1 = `# Completion Summary`;
    const content2 = `### Completion Summary`;
    expect(hasCompletionSummary(content1)).toBe(false);
    expect(hasCompletionSummary(content2)).toBe(false);
  });

  it("returns false when case does not match", () => {
    const content = `## completion summary`;
    const result = hasCompletionSummary(content);
    expect(result).toBe(false);
  });

  it("returns false when heading has leading whitespace", () => {
    const content = ` ## Completion Summary`;
    const result = hasCompletionSummary(content);
    expect(result).toBe(false);
  });

  it("returns false when no Completion Summary heading", () => {
    const content = `# My Plan

## Task Pool`;
    const result = hasCompletionSummary(content);
    expect(result).toBe(false);
  });

  it("returns true even if heading is in middle of document", () => {
    const content = `# My Plan

## Task Pool

## Completion Summary

Content here`;
    const result = hasCompletionSummary(content);
    expect(result).toBe(true);
  });
});

describe("validateBlueprintPlan - Completion Summary validation", () => {
  const filePath = "test-plan.md";

  it("errors when completed plan missing Completion Summary", () => {
    const content = `---
type: blueprint
status: completed
complexity: M
created: 2026-02-16
---

# My Plan

## Task Pool

#### Task 1.1: First Task
**Status:** done
**Depends:** None`;
    const errors = validateBlueprintPlan(filePath, content, "blueprint");
    expect(errors.some((error) => error.ruleId === "blueprint-completion-summary")).toBe(true);
    expect(
      errors.find((error) => error.ruleId === "blueprint-completion-summary")?.message,
    ).toContain("Completion Summary");
  });

  it("passes when completed plan has Completion Summary", () => {
    const content = `---
type: blueprint
title: My Plan
owner: test
status: completed
complexity: XS
created: 2026-02-16
last_updated: 2026-06-04
---

# My Plan

## Completion Summary

Content`;
    const errors = validateBlueprintPlan(filePath, content, "blueprint");
    expect(errors).toEqual([]);
  });

  it("skips validation when plan is in-progress", () => {
    const content = `---
type: blueprint
title: My Plan
owner: test
status: in-progress
complexity: L
last_updated: 2026-06-04
---

# My Plan

No completion summary`;
    const errors = validateBlueprintPlan(filePath, content, "blueprint");
    expect(errors).toEqual([]);
  });
});

describe("validateBlueprintPlan - engine semantics (blocked tasks / completed)", () => {
  const filePath = "webpresso/blueprints/planned/engine-semantics.md";

  it("allows blocked task when blueprint status is planned", () => {
    const content = `---
type: blueprint
title: Plan
owner: test
status: planned
complexity: M
last_updated: 2026-06-04
---

# Plan

#### Task 1.1: Waiting
**Status:** blocked
**Blocked:** external dependency

**Depends:** None

- [ ] a
`;
    const errors = validateBlueprintPlan(filePath, content, "blueprint");
    expect(errors).toEqual([]);
  });

  it("rejects blueprint frontmatter status blocked", () => {
    const content = `---
type: blueprint
status: blocked
complexity: M
---

# Plan

#### Task 1.1: Waiting
**Status:** todo

**Depends:** None

- [ ] a
`;
    const errors = validateBlueprintPlan(filePath, content, "blueprint");
    expect(errors.some((e) => e.ruleId === "blueprint-status")).toBe(true);
  });

  it("accepts parked blueprint frontmatter status", () => {
    const content = `---
type: blueprint
status: parked
complexity: M
---

# Plan

#### Task 1.1: Waiting
**Status:** blocked

**Depends:** None

- [ ] a
`;
    const errors = validateBlueprintPlan(filePath, content, "blueprint");
    expect(errors.some((e) => e.ruleId === "blueprint-status")).toBe(false);
  });

  it("rejects completed blueprint with any non-done task", () => {
    const content = `---
type: blueprint
status: completed
complexity: M
---

# Plan

#### Task 1.1: Open
**Status:** todo

**Depends:** None

- [ ] a

## Completion Summary

### Deliverables

Work.

### Impact

None.
`;
    const errors = validateBlueprintPlan(filePath, content, "blueprint");
    expect(errors.some((e) => e.ruleId === "blueprint-completed-requires-all-done")).toBe(true);
  });
});

describe("validateBlueprintPlan - Edge cases", () => {
  const filePath = "test-plan.md";

  it("handles plan with both task errors and completion errors", () => {
    const content = `---
type: blueprint
status: completed
complexity: L
created: 2026-02-16
---

# My Plan

### Task 1.1: Wrong header

No completion summary`;
    const errors = validateBlueprintPlan(filePath, content, "blueprint");
    // Should have task format error + completion summary error
    expect(errors.length).toBeGreaterThanOrEqual(2);
    const ruleIds = errors.map((e) => e.ruleId);
    expect(ruleIds).toContain("blueprint-task-format");
    expect(ruleIds).toContain("blueprint-completion-summary");
  });

  it("validates completed blueprint missing completion summary", () => {
    const content = `---
type: blueprint
title: My Plan
owner: test
status: completed
complexity: L
created: 2026-02-16
last_updated: 2026-06-04
---

# My Plan

No completion summary`;
    const errors = validateBlueprintPlan(filePath, content, "blueprint");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.ruleId).toBe("blueprint-completion-summary");
  });

  it("does not treat global sections after the final task as part of that task", () => {
    const content = `---
type: blueprint
status: in-progress
---

#### Task 1.1: Only task
**Status:** done

- [x] Done criterion

## Critical Files

| x | y |
| - | - |

## Zero-Defect Checklist

- [ ] Item mentioning **Blocked:** reason field
`;
    const errors = validateBlueprintPlan(filePath, content, "blueprint");
    const ruleIds = errors.map((e) => e.ruleId);
    expect(ruleIds).not.toContain("blueprint-task-blocked-reason-mismatch");
    expect(ruleIds).not.toContain("blueprint-task-done-acceptance");
  });
});
