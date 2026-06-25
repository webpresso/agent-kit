import type { BlueprintQueryResult } from "#query/types";

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BlueprintService } from "./BlueprintService.js";

describe("BlueprintService - core", () => {
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

  describe("listPlans", () => {
    it("should list plans from webpresso/blueprints/", async () => {
      // Arrange - create plan structure
      const planDir = path.join(testDir, "webpresso/blueprints/@test-feature");
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
# @test-feature
#### Task 1.1: First task
**Status:** todo

`,
      );

      // Act
      const plans = await service.list();

      // Assert
      expect(plans).toHaveLength(1);
      expect(plans[0]!.name).toBe("@test-feature");
      expect(plans[0]!.status).toBe("in-progress");
    });
  });

  describe("getPlan", () => {
    it("should return full plan with tasks and phases", async () => {
      // Arrange
      const planDir = path.join(testDir, "webpresso/blueprints/@my-feature");
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
# @my-feature
### Phase 1: Setup [Complexity: S]
#### Task 1.1: First task
**Status:** todo

**Depends:** None
#### Task 1.2: Second task
**Status:** todo

**Depends:** Task 1.1
`,
      );

      // Act
      const plan = await service.get("@my-feature");

      // Assert
      expect(plan.name).toBe("@my-feature");
      expect(plan.tasks).toHaveLength(2);
      expect(plan.phases).toHaveLength(1);
      expect(plan.tasks[1]!.depends).toEqual(["1.1"]);
    });
  });

  describe("query", () => {
    it("should return all plans when no filters provided", async () => {
      // Arrange - create multiple plans
      const plan1Dir = path.join(testDir, "webpresso/blueprints/feature-one");
      const plan2Dir = path.join(testDir, "webpresso/blueprints/feature-two");
      await fs.mkdir(plan1Dir, { recursive: true });
      await fs.mkdir(plan2Dir, { recursive: true });

      await fs.writeFile(
        path.join(plan1Dir, "_overview.md"),
        `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2024-12-01
created: 2024-12-01
---
# Feature One
#### Task 1.1: First task
**Status:** todo

`,
      );
      await fs.writeFile(
        path.join(plan2Dir, "_overview.md"),
        `---
type: blueprint
status: draft
complexity: M
last_updated: 2024-12-15
created: 2024-12-15
---
# Feature Two
#### Task 1.1: Second task
**Status:** todo

`,
      );

      // Act
      const result: BlueprintQueryResult = await service.query();

      // Assert
      expect(result.plans).toHaveLength(2);
      expect(result.summary.total).toBe(2);
      expect(result.summary.byStatus).toEqual({
        "in-progress": 1,
        draft: 1,
      });
    });

    it("should filter plans by status", async () => {
      // Arrange
      const plan1Dir = path.join(testDir, "webpresso/blueprints/active-plan");
      const plan2Dir = path.join(testDir, "webpresso/blueprints/draft-plan");
      await fs.mkdir(plan1Dir, { recursive: true });
      await fs.mkdir(plan2Dir, { recursive: true });

      await fs.writeFile(
        path.join(plan1Dir, "_overview.md"),
        `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2024-12-01
created: 2024-12-01
---
# Active Plan
`,
      );
      await fs.writeFile(
        path.join(plan2Dir, "_overview.md"),
        `---
type: blueprint
status: draft
complexity: M
last_updated: 2024-12-15
created: 2024-12-15
---
# Draft Plan
`,
      );

      // Act
      const result = await service.query({
        filters: { status: "in-progress" },
      });

      // Assert
      expect(result.plans).toHaveLength(1);
      expect(result.plans[0]?.status).toBe("in-progress");
      expect(result.plans[0]?.name).toBe("active-plan");
    });

    it("should filter plans by group", async () => {
      // Arrange - create grouped and standalone plans
      const groupedDir = path.join(testDir, "webpresso/blueprints/my-group/sub-plan");
      const standaloneDir = path.join(testDir, "webpresso/blueprints/standalone-plan");
      await fs.mkdir(groupedDir, { recursive: true });
      await fs.mkdir(standaloneDir, { recursive: true });

      await fs.writeFile(
        path.join(groupedDir, "_overview.md"),
        `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2024-12-01
created: 2024-12-01
---
# Grouped Plan
`,
      );
      await fs.writeFile(
        path.join(standaloneDir, "_overview.md"),
        `---
type: blueprint
status: draft
complexity: S
last_updated: 2024-12-15
created: 2024-12-15
---
# Standalone Plan
`,
      );

      // Act
      const result = await service.query({
        filters: { group: "my-group" },
      });

      // Assert
      expect(result.plans).toHaveLength(1);
      expect(result.plans[0]?.group).toBe("my-group");
    });

    it("should filter plans by complexity", async () => {
      // Arrange
      const smallDir = path.join(testDir, "webpresso/blueprints/small-plan");
      const largeDir = path.join(testDir, "webpresso/blueprints/large-plan");
      await fs.mkdir(smallDir, { recursive: true });
      await fs.mkdir(largeDir, { recursive: true });

      await fs.writeFile(
        path.join(smallDir, "_overview.md"),
        `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2024-12-01
created: 2024-12-01
---
# Small Plan
`,
      );
      await fs.writeFile(
        path.join(largeDir, "_overview.md"),
        `---
type: blueprint
status: in-progress
complexity: L
last_updated: 2024-12-15
created: 2024-12-15
---
# Large Plan
`,
      );

      // Act
      const result = await service.query({
        filters: { complexity: "L" },
      });

      // Assert
      expect(result.plans).toHaveLength(1);
      expect(result.plans[0]?.complexity).toBe("L");
      expect(result.plans[0]?.name).toBe("large-plan");
    });

    it("should filter stale plans", async () => {
      // Arrange - create fresh and stale plans
      const freshDir = path.join(testDir, "webpresso/blueprints/fresh-plan");
      const staleDir = path.join(testDir, "webpresso/blueprints/stale-plan");
      await fs.mkdir(freshDir, { recursive: true });
      await fs.mkdir(staleDir, { recursive: true });

      const today = new Date();
      const freshDate = new Date(today);
      freshDate.setDate(today.getDate() - 3); // 3 days ago
      const staleDate = new Date(today);
      staleDate.setDate(today.getDate() - 20); // 20 days ago (stale for in-progress)

      await fs.writeFile(
        path.join(freshDir, "_overview.md"),
        `---
type: blueprint
status: in-progress
complexity: S
last_updated: ${freshDate.toISOString().split("T")[0]}
created: ${freshDate.toISOString().split("T")[0]}
---
# Fresh Plan
`,
      );
      await fs.writeFile(
        path.join(staleDir, "_overview.md"),
        `---
type: blueprint
status: in-progress
complexity: M
last_updated: ${staleDate.toISOString().split("T")[0]}
created: ${staleDate.toISOString().split("T")[0]}
---
# Stale Plan
`,
      );

      // Act
      const result = await service.query({
        filters: { stale: true },
      });

      // Assert
      expect(result.plans).toHaveLength(1);
      expect(result.plans[0]?.name).toBe("stale-plan");
      expect(["stale", "critical"]).toContain(result.plans[0]?.freshness.status);
    });

    it("should sort plans by freshness ascending", async () => {
      // Arrange
      const plan1Dir = path.join(testDir, "webpresso/blueprints/older-plan");
      const plan2Dir = path.join(testDir, "webpresso/blueprints/newer-plan");
      await fs.mkdir(plan1Dir, { recursive: true });
      await fs.mkdir(plan2Dir, { recursive: true });

      const today = new Date();
      const olderDate = new Date(today);
      olderDate.setDate(today.getDate() - 10);
      const newerDate = new Date(today);
      newerDate.setDate(today.getDate() - 2);

      await fs.writeFile(
        path.join(plan1Dir, "_overview.md"),
        `---
type: blueprint
status: in-progress
complexity: S
last_updated: ${olderDate.toISOString().split("T")[0]}
created: ${olderDate.toISOString().split("T")[0]}
---
# Older Plan
`,
      );
      await fs.writeFile(
        path.join(plan2Dir, "_overview.md"),
        `---
type: blueprint
status: in-progress
complexity: M
last_updated: ${newerDate.toISOString().split("T")[0]}
created: ${newerDate.toISOString().split("T")[0]}
---
# Newer Plan
`,
      );

      // Act
      const result = await service.query({
        sort: { field: "freshness", direction: "asc" },
      });

      // Assert - ascending freshness means lower scores first (older)
      expect(result.plans).toHaveLength(2);
      expect(result.plans[0]?.name).toBe("older-plan");
      expect(result.plans[1]?.name).toBe("newer-plan");
    });

    it("should sort plans by lastUpdated descending", async () => {
      // Arrange
      const plan1Dir = path.join(testDir, "webpresso/blueprints/plan-a");
      const plan2Dir = path.join(testDir, "webpresso/blueprints/plan-b");
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
# Plan A
`,
      );
      await fs.writeFile(
        path.join(plan2Dir, "_overview.md"),
        `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2024-06-01
created: 2024-06-01
---
# Plan B
`,
      );

      // Act
      const result = await service.query({
        sort: { field: "lastUpdated", direction: "desc" },
      });

      // Assert - descending means newer first
      expect(result.plans).toHaveLength(2);
      expect(result.plans[0]?.name).toBe("plan-b");
      expect(result.plans[1]?.name).toBe("plan-a");
    });

    it("should apply pagination with limit and offset", async () => {
      // Arrange - create multiple plans
      for (let i = 1; i <= 5; i++) {
        const planDir = path.join(testDir, `webpresso/blueprints/plan-${i}`);
        await fs.mkdir(planDir, { recursive: true });
        await fs.writeFile(
          path.join(planDir, "_overview.md"),
          `---
type: blueprint
status: in-progress
complexity: S
last_updated: 2024-0${i}-01
created: 2024-0${i}-01
---
# Plan ${i}
`,
        );
      }

      // Act
      const result = await service.query({
        sort: { field: "name", direction: "asc" },
        limit: 2,
        offset: 1,
      });

      // Assert
      expect(result.plans).toHaveLength(2);
      expect(result.plans[0]?.name).toBe("plan-2");
      expect(result.plans[1]?.name).toBe("plan-3");
      expect(result.summary.total).toBe(5); // Total before pagination
    });
  });
});
