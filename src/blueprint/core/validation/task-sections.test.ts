/**
 * Tests for validateTaskSections
 */

import { describe, expect, it } from "vitest";

import { validateTaskSections } from "./task-sections.js";

const BLUEPRINT_FRONTMATTER = `---
type: blueprint
status: draft
complexity: S
---

`;

const ROADMAP_FRONTMATTER = `---
type: parent-roadmap
status: draft
complexity: L
---

`;

const VALID_TASK = `#### Task 1.1: Setup database

**Depends:** None

Some description here.

**Acceptance:**

- [ ] Schema created
- [ ] Migrations pass
`;

describe("validateTaskSections", () => {
  describe("skips non-blueprint documents", () => {
    it("should pass for parent-roadmap type", () => {
      const md =
        ROADMAP_FRONTMATTER +
        `# Roadmap

#### Task 1.1: Missing sections
`;
      const result = validateTaskSections(md);
      expect(result.valid).toBe(true);
    });

    it("should pass when docType override is parent-roadmap", () => {
      const md =
        BLUEPRINT_FRONTMATTER +
        `# Blueprint

#### Task 1.1: Missing sections
`;
      const result = validateTaskSections(md, "parent-roadmap");
      expect(result.valid).toBe(true);
    });
  });

  describe("valid blueprints", () => {
    it("should pass for blueprint with complete task sections", () => {
      const md =
        BLUEPRINT_FRONTMATTER +
        `# Blueprint

` +
        VALID_TASK;
      const result = validateTaskSections(md);
      expect(result.valid).toBe(true);
    });

    it("should pass for blueprint with no tasks", () => {
      const md = BLUEPRINT_FRONTMATTER + `# Blueprint\n\nNo tasks here.\n`;
      const result = validateTaskSections(md);
      expect(result.valid).toBe(true);
    });

    it("should pass when Depends references another task", () => {
      const md =
        BLUEPRINT_FRONTMATTER +
        `# Blueprint

#### Task 1.1: First task

**Depends:** None

**Acceptance:**

- [ ] Done

#### Task 1.2: Second task

**Depends:** Task 1.1

**Acceptance:**

- [ ] Done
`;
      const result = validateTaskSections(md);
      expect(result.valid).toBe(true);
    });

    it("should accept Acceptance Criteria heading variant", () => {
      const md =
        BLUEPRINT_FRONTMATTER +
        `# Blueprint

#### Task 1.1: Task with criteria

**Depends:** None

**Acceptance Criteria:**

- [ ] Criterion one
`;
      const result = validateTaskSections(md);
      expect(result.valid).toBe(true);
    });
  });

  describe("missing Depends section", () => {
    it("should error when task is missing **Depends:** line", () => {
      const md =
        BLUEPRINT_FRONTMATTER +
        `# Blueprint

#### Task 1.1: Task missing depends

**Acceptance:**

- [ ] Done
`;
      const result = validateTaskSections(md);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Task 1.1");
      expect(result.error).toContain("**Depends:**");
    });
  });

  describe("missing Acceptance section", () => {
    it("should error when task is missing acceptance checkboxes", () => {
      const md =
        BLUEPRINT_FRONTMATTER +
        `# Blueprint

#### Task 1.1: Task missing acceptance

**Depends:** None

Some description, but no acceptance criteria.
`;
      const result = validateTaskSections(md);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Task 1.1");
      expect(result.error).toContain("Acceptance");
    });

    it("should error when Acceptance section has no checkboxes", () => {
      const md =
        BLUEPRINT_FRONTMATTER +
        `# Blueprint

#### Task 1.1: Task with empty acceptance

**Depends:** None

**Acceptance:**

No checkboxes here, just text.
`;
      const result = validateTaskSections(md);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Task 1.1");
    });
  });

  describe("multiple tasks", () => {
    it("should report all tasks with issues", () => {
      const md =
        BLUEPRINT_FRONTMATTER +
        `# Blueprint

#### Task 1.1: Task missing both

Some description.

#### Task 1.2: Task missing acceptance

**Depends:** None

#### Task 1.3: Complete task

**Depends:** None

**Acceptance:**

- [ ] Done
`;
      const result = validateTaskSections(md);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Task 1.1");
      expect(result.error).toContain("Task 1.2");
      // Task 1.3 should not appear in error
      expect(result.error).not.toContain("Task 1.3");
    });
  });
});
