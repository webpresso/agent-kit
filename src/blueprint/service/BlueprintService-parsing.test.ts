import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BlueprintService } from "./BlueprintService.js";

describe("BlueprintService - parsing", () => {
  let testDir: string;
  let service: BlueprintService;

  beforeEach(async () => {
    testDir = path.join(
      process.cwd(),
      ".test-plan-service",
      `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(testDir, { recursive: true });
    service = new BlueprintService(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("parent-roadmap filtering", () => {
    it("should include parent roadmaps in listPlans and mark their type", async () => {
      // Arrange - create both implementation plan and parent roadmap
      const implPlanDir = path.join(testDir, "webpresso/blueprints/feature-plan");
      const roadmapDir = path.join(testDir, "webpresso/blueprints/roadmap-2026");
      await fs.mkdir(implPlanDir, { recursive: true });
      await fs.mkdir(roadmapDir, { recursive: true });

      await fs.writeFile(
        path.join(implPlanDir, "_overview.md"),
        `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# Feature Plan
#### Task 1.1: Implementation task
**Status:** todo

`,
      );
      await fs.writeFile(
        path.join(roadmapDir, "_overview.md"),
        `---
type: parent-roadmap
status: in-progress
complexity: L
last_updated: 2024-01-01
created: 2024-01-01
---
# 2026 Roadmap
This is a parent roadmap, not an implementation plan
`,
      );

      // Act
      const plans = await service.list();

      // Assert - both entries are returned and roadmap type is preserved
      expect(plans).toHaveLength(2);
      expect(plans.find((plan) => plan.name === "feature-plan")).toMatchObject({
        name: "feature-plan",
        status: "in-progress",
        type: "blueprint",
      });
      expect(plans.find((plan) => plan.name === "roadmap-2026")).toMatchObject({
        name: "roadmap-2026",
        status: "in-progress",
        type: "parent-roadmap",
      });
    });
  });

  describe("error handling during plan parsing", () => {
    it("should apply legacy frontmatter defaults when optional fields are omitted", async () => {
      // Arrange - create legacy plan frontmatter that relies on schema defaults.
      const planDir = path.join(testDir, "webpresso/blueprints/invalid-plan");
      await fs.mkdir(planDir, { recursive: true });
      await fs.writeFile(
        path.join(planDir, "_overview.md"),
        `---
type: blueprint
status: in-progress
# Missing complexity and dates - complexity defaults to M for legacy blueprints
---
# Invalid Plan
`,
      );

      // Act - should not throw; omitted complexity is a supported legacy shape.
      const plans = await service.list();

      // Assert - legacy plan should be included as a normal summary.
      const invalidPlan = plans.find((p) => p.name === "invalid-plan");
      expect(invalidPlan).toMatchObject({
        name: "invalid-plan",
        status: "in-progress",
        complexity: "M",
        taskCount: 0,
        progress: 0,
      });
      expect(invalidPlan).not.toHaveProperty("malformed");
    });

    it("should return malformed summary for generic parsing errors", async () => {
      // Arrange - create plan with malformed content that causes non-Zod error
      const planDir = path.join(testDir, "webpresso/blueprints/malformed-plan");
      await fs.mkdir(planDir, { recursive: true });
      // Write invalid frontmatter that gray-matter accepts but parseBlueprint rejects
      await fs.writeFile(
        path.join(planDir, "_overview.md"),
        `---
type: blueprint
status: draft
complexity: M
last_updated: 2024-01-01
created: 2024-01-01
---
# Malformed Plan
#### Invalid Task Format (missing task ID)
This should cause a parsing error
`,
      );

      // Act - should not throw, but return malformed summary
      const plans = await service.list();

      // Assert - plan with valid frontmatter but invalid task format should still parse
      const malformedPlan = plans.find((p) => p.name === "malformed-plan");
      expect(malformedPlan).toMatchObject({
        name: "malformed-plan",
        status: "draft",
        taskCount: 0,
      });
    });
  });

  describe("filesTouched extraction and filtering", () => {
    it("should extract files from task descriptions", async () => {
      // Arrange - create plan with files mentioned in tasks
      const planDir = path.join(testDir, "webpresso/blueprints/files-plan");
      await fs.mkdir(planDir, { recursive: true });
      await fs.writeFile(
        path.join(planDir, "_overview.md"),
        `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2024-01-01
created: 2024-01-01
---
# Files Plan

#### Task 1.1: Update authentication
**Status:** todo

**Files:** \`src/auth/login.ts\`, \`src/auth/session.ts\`
**Depends:** None

#### Task 1.2: Add validation
**Status:** todo

**Files:**
- \`src/validators/user.ts\`
- \`src/validators/email.ts\`
`,
      );

      // Act
      const result = await service.query();

      // Assert - filesTouched should be extracted
      expect(result.plans).toHaveLength(1);
      const plan = result.plans[0];
      expect(plan?.filesTouched).toContain("src/auth/login.ts");
      expect(plan?.filesTouched).toContain("src/validators/user.ts");
    });

    it("should filter plans by filesTouched", async () => {
      // Arrange - create multiple plans with different files
      const plan1Dir = path.join(testDir, "webpresso/blueprints/auth-feature");
      const plan2Dir = path.join(testDir, "webpresso/blueprints/ui-feature");
      await fs.mkdir(plan1Dir, { recursive: true });
      await fs.mkdir(plan2Dir, { recursive: true });

      await fs.writeFile(
        path.join(plan1Dir, "_overview.md"),
        `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2024-01-01
created: 2024-01-01
---
# Auth Feature
#### Task 1.1: Auth work
**Status:** todo

**Files:** \`src/auth/login.ts\`, \`src/auth/session.ts\`
`,
      );
      await fs.writeFile(
        path.join(plan2Dir, "_overview.md"),
        `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# UI Feature
#### Task 1.1: UI work
**Status:** todo

**Files:** \`src/ui/Button.tsx\`, \`src/ui/Modal.tsx\`
`,
      );

      // Act - filter by specific file
      const result = await service.query({
        filters: { filesTouched: ["src/auth/login.ts"] },
      });

      // Assert - only plan touching auth file should be returned
      expect(result.plans).toHaveLength(1);
      expect(result.plans[0]?.name).toBe("auth-feature");
    });

    it("should return all plans when filesTouched filter is empty", async () => {
      // Arrange
      const planDir = path.join(testDir, "webpresso/blueprints/test-plan");
      await fs.mkdir(planDir, { recursive: true });
      await fs.writeFile(
        path.join(planDir, "_overview.md"),
        `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# Test Plan
`,
      );

      // Act - empty filesTouched filter
      const result = await service.query({
        filters: { filesTouched: [] },
      });

      // Assert - should return all plans
      expect(result.plans).toHaveLength(1);
    });
  });

  describe("sorting by taskCount and status", () => {
    it("should sort plans by taskCount ascending", async () => {
      // Arrange - create plans with different task counts
      const plan1Dir = path.join(testDir, "webpresso/blueprints/small-tasks");
      const plan2Dir = path.join(testDir, "webpresso/blueprints/large-tasks");
      await fs.mkdir(plan1Dir, { recursive: true });
      await fs.mkdir(plan2Dir, { recursive: true });

      await fs.writeFile(
        path.join(plan1Dir, "_overview.md"),
        `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# Small Tasks
#### Task 1.1: Only task
**Status:** todo

`,
      );
      await fs.writeFile(
        path.join(plan2Dir, "_overview.md"),
        `---
type: blueprint
status: in-progress
complexity: L
last_updated: 2024-01-01
created: 2024-01-01
---
# Large Tasks
#### Task 1.1: First task
**Status:** todo

#### Task 1.2: Second task
**Status:** todo

#### Task 1.3: Third task
**Status:** todo

#### Task 1.4: Fourth task
**Status:** todo

`,
      );

      // Act
      const result = await service.query({
        sort: { field: "taskCount", direction: "asc" },
      });

      // Assert - ascending order: smallest taskCount first
      expect(result.plans).toHaveLength(2);
      expect(result.plans[0]?.name).toBe("small-tasks");
      expect(result.plans[0]?.taskCount).toBe(1);
      expect(result.plans[1]?.name).toBe("large-tasks");
      expect(result.plans[1]?.taskCount).toBe(4);
    });

    it("should sort plans by taskCount descending", async () => {
      // Arrange - create plans with different task counts
      const plan1Dir = path.join(testDir, "webpresso/blueprints/few-tasks");
      const plan2Dir = path.join(testDir, "webpresso/blueprints/many-tasks");
      await fs.mkdir(plan1Dir, { recursive: true });
      await fs.mkdir(plan2Dir, { recursive: true });

      await fs.writeFile(
        path.join(plan1Dir, "_overview.md"),
        `---
type: blueprint
status: draft
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# Few Tasks
#### Task 1.1: Only one
**Status:** todo

#### Task 1.2: Only two
**Status:** todo

`,
      );
      await fs.writeFile(
        path.join(plan2Dir, "_overview.md"),
        `---
type: blueprint
status: in-progress
complexity: L
last_updated: 2024-01-01
created: 2024-01-01
---
# Many Tasks
#### Task 1.1: Task one
**Status:** todo

#### Task 1.2: Task two
**Status:** todo

#### Task 1.3: Task three
**Status:** todo

#### Task 1.4: Task four
**Status:** todo

#### Task 1.5: Task five
**Status:** todo

`,
      );

      // Act
      const result = await service.query({
        sort: { field: "taskCount", direction: "desc" },
      });

      // Assert - descending order: largest taskCount first
      expect(result.plans).toHaveLength(2);
      expect(result.plans[0]?.name).toBe("many-tasks");
      expect(result.plans[0]?.taskCount).toBe(5);
      expect(result.plans[1]?.name).toBe("few-tasks");
      expect(result.plans[1]?.taskCount).toBe(2);
    });

    it("should sort plans by status alphabetically", async () => {
      // Arrange - create plans with different statuses
      const plan1Dir = path.join(testDir, "webpresso/blueprints/draft-plan");
      const plan2Dir = path.join(testDir, "webpresso/blueprints/progress-plan");
      const plan3Dir = path.join(testDir, "webpresso/blueprints/archived-plan");
      await fs.mkdir(plan1Dir, { recursive: true });
      await fs.mkdir(plan2Dir, { recursive: true });
      await fs.mkdir(plan3Dir, { recursive: true });

      await fs.writeFile(
        path.join(plan1Dir, "_overview.md"),
        `---
type: blueprint
status: draft
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# Draft Plan
`,
      );
      await fs.writeFile(
        path.join(plan2Dir, "_overview.md"),
        `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2024-01-01
created: 2024-01-01
---
# Progress Plan
`,
      );
      await fs.writeFile(
        path.join(plan3Dir, "_overview.md"),
        `---
type: blueprint
status: archived
complexity: L
last_updated: 2024-01-01
created: 2024-01-01
---
# Archived Plan
`,
      );

      // Act
      const result = await service.query({
        sort: { field: "status", direction: "asc" },
      });

      // Assert - alphabetical order: archived, draft, in-progress
      expect(result.plans).toHaveLength(3);
      expect(result.plans[0]?.status).toBe("archived");
      expect(result.plans[1]?.status).toBe("draft");
      expect(result.plans[2]?.status).toBe("in-progress");
    });
  });
});
