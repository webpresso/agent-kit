import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BlueprintService } from "./BlueprintService.js";

describe("BlueprintService - mutant basics", () => {
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

  describe("mutant-killing: handleParseSummaryError non-Error exception", () => {
    it("should return null for non-Error exceptions during plan parsing (kills return null fallback)", async () => {
      const planDir = path.join(testDir, "webpresso/blueprints/broken-yaml-plan");
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
# Broken YAML Plan
#### Task 1.1: Some task
**Status:** todo

`,
      );

      // Also create a valid plan to ensure the service still works
      const validDir = path.join(testDir, "webpresso/blueprints/valid-plan");
      await fs.mkdir(validDir, { recursive: true });
      await fs.writeFile(
        path.join(validDir, "_overview.md"),
        `---
type: blueprint
status: draft
complexity: M
last_updated: 2024-01-01
created: 2024-01-01
---
# Valid Plan
#### Task 1.1: Valid task
**Status:** todo

`,
      );

      // Now delete the broken plan's file after the test setup
      // to force a read error in toBlueprintRecord
      await fs.unlink(path.join(planDir, "_overview.md"));

      // Act - query should not throw; the broken plan returns null and is skipped
      const result = await service.query();

      // Assert - only the valid plan should be returned
      expect(result.plans).toHaveLength(1);
      expect(result.plans[0]?.name).toBe("valid-plan");
    });
  });

  describe("mutant-killing: toBlueprintRecord date fallback", () => {
    it("should use current date when plan has no lastUpdated field", async () => {
      // Arrange - create plan without last_updated in frontmatter
      const planDir = path.join(testDir, "webpresso/blueprints/no-date-plan");
      await fs.mkdir(planDir, { recursive: true });
      await fs.writeFile(
        path.join(planDir, "_overview.md"),
        `---
type: blueprint
status: draft
complexity: S
---
# No Date Plan
#### Task 1.1: Some task
**Status:** todo

`,
      );

      // Act
      const beforeQuery = new Date();
      const result = await service.query();
      const afterQuery = new Date();

      // Assert - lastUpdated should be approximately "now" since no last_updated was provided
      expect(result.plans).toHaveLength(1);
      const plan = result.plans[0];
      expect(plan?.name).toBe("no-date-plan");
      // The fallback is new Date(), so lastUpdated should be between beforeQuery and afterQuery
      expect(plan?.lastUpdated.getTime()).toBeGreaterThanOrEqual(beforeQuery.getTime() - 1000);
      expect(plan?.lastUpdated.getTime()).toBeLessThanOrEqual(afterQuery.getTime() + 1000);
      // Freshness should be very high (close to 1.0) since it was "just updated"
      expect(plan?.freshness.score).toBeGreaterThan(0.99);
      expect(plan?.freshness.status).toBe("fresh");
    });
  });

  describe("mutant-killing: extractTitle edge cases", () => {
    it("should fall back to slug when content has no H1 heading", async () => {
      // Arrange - create plan without any H1 heading in the content
      const planDir = path.join(testDir, "webpresso/blueprints/no-heading-plan");
      await fs.mkdir(planDir, { recursive: true });
      await fs.writeFile(
        path.join(planDir, "_overview.md"),
        `---
type: blueprint
status: draft
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
This plan has no H1 heading at all.
Just some body text.
#### Task 1.1: A task
**Status:** todo

`,
      );

      // Act
      const result = await service.query();

      // Assert - title should fall back to the slug since no H1 heading exists
      expect(result.plans).toHaveLength(1);
      expect(result.plans[0]?.title).toBe("no-heading-plan");
    });

    it("should extract H1 heading with extra whitespace", async () => {
      // Arrange - create plan with H1 that has extra whitespace
      const planDir = path.join(testDir, "webpresso/blueprints/whitespace-heading");
      await fs.mkdir(planDir, { recursive: true });
      await fs.writeFile(
        path.join(planDir, "_overview.md"),
        `---
type: blueprint
status: draft
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
#   Whitespace Title
#### Task 1.1: A task
**Status:** todo

`,
      );

      // Act
      const result = await service.query();

      // Assert - title should be trimmed
      expect(result.plans).toHaveLength(1);
      expect(result.plans[0]?.title).toBe("Whitespace Title");
    });
  });

  describe("mutant-killing: extractFilesTouched edge cases", () => {
    it("should return empty array when Files section has no actual file paths", async () => {
      // Arrange - create plan with **Files:** but no parseable paths
      const planDir = path.join(testDir, "webpresso/blueprints/empty-files-plan");
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
# Empty Files Plan
#### Task 1.1: A task
**Status:** todo

**Files:** None specified
`,
      );

      // Act
      const result = await service.query();

      // Assert
      expect(result.plans).toHaveLength(1);
      expect(result.plans[0]?.filesTouched).toEqual([]);
    });

    it("should deduplicate file paths across multiple tasks", async () => {
      // Arrange - create plan where same file appears in multiple tasks
      const planDir = path.join(testDir, "webpresso/blueprints/dup-files-plan");
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
# Duplicate Files Plan
#### Task 1.1: First task
**Status:** todo

**Files:** \`src/shared/utils.ts\`, \`src/auth/login.ts\`
#### Task 1.2: Second task
**Status:** todo

**Files:** \`src/shared/utils.ts\`, \`src/db/connection.ts\`
`,
      );

      // Act
      const result = await service.query();

      // Assert - src/shared/utils.ts should appear only once due to Set deduplication
      expect(result.plans).toHaveLength(1);
      const files = result.plans[0]?.filesTouched ?? [];
      const utilsOccurrences = files.filter((f) => f === "src/shared/utils.ts");
      expect(utilsOccurrences).toHaveLength(1);
      // Should have exactly 3 unique files
      expect(files).toHaveLength(3);
      expect(files).toContain("src/shared/utils.ts");
      expect(files).toContain("src/auth/login.ts");
      expect(files).toContain("src/db/connection.ts");
    });
  });

  describe("mutant-killing: filter with array values", () => {
    it("should filter by array of statuses", async () => {
      // Arrange - create plans with different statuses
      const draftDir = path.join(testDir, "webpresso/blueprints/draft-arr");
      const progressDir = path.join(testDir, "webpresso/blueprints/progress-arr");
      const archivedDir = path.join(testDir, "webpresso/blueprints/archived-arr");
      await fs.mkdir(draftDir, { recursive: true });
      await fs.mkdir(progressDir, { recursive: true });
      await fs.mkdir(archivedDir, { recursive: true });

      await fs.writeFile(
        path.join(draftDir, "_overview.md"),
        `---
type: blueprint
status: draft
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# Draft Array
`,
      );
      await fs.writeFile(
        path.join(progressDir, "_overview.md"),
        `---
type: blueprint
status: in-progress
complexity: M
last_updated: 2024-01-01
created: 2024-01-01
---
# Progress Array
`,
      );
      await fs.writeFile(
        path.join(archivedDir, "_overview.md"),
        `---
type: blueprint
status: archived
complexity: L
last_updated: 2024-01-01
created: 2024-01-01
---
# Archived Array
`,
      );

      // Act - filter with array of statuses
      const result = await service.query({
        filters: { status: ["draft", "archived"] },
      });

      // Assert - should include draft and archived, but not in-progress
      expect(result.plans).toHaveLength(2);
      const slugs = result.plans.map((p) => p.name).toSorted();
      expect(slugs).toEqual(["archived-arr", "draft-arr"]);
    });

    it("should filter by array of groups", async () => {
      // Arrange - create plans in different groups
      const group1Plan = path.join(testDir, "webpresso/blueprints/alpha/plan-a1");
      const group2Plan = path.join(testDir, "webpresso/blueprints/beta/plan-b1");
      const group3Plan = path.join(testDir, "webpresso/blueprints/gamma/plan-g1");
      await fs.mkdir(group1Plan, { recursive: true });
      await fs.mkdir(group2Plan, { recursive: true });
      await fs.mkdir(group3Plan, { recursive: true });

      await fs.writeFile(
        path.join(group1Plan, "_overview.md"),
        `---
type: blueprint
status: draft
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# Plan A1
`,
      );
      await fs.writeFile(
        path.join(group2Plan, "_overview.md"),
        `---
type: blueprint
status: draft
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# Plan B1
`,
      );
      await fs.writeFile(
        path.join(group3Plan, "_overview.md"),
        `---
type: blueprint
status: draft
complexity: S
last_updated: 2024-01-01
created: 2024-01-01
---
# Plan G1
`,
      );

      // Act - filter by array of groups
      const result = await service.query({
        filters: { group: ["alpha", "gamma"] },
      });

      // Assert - should include plans from alpha and gamma, not beta
      expect(result.plans).toHaveLength(2);
      const groups = result.plans.map((p) => p.group).toSorted();
      expect(groups).toEqual(["alpha", "gamma"]);
    });

    it("should filter by array of complexities", async () => {
      // Arrange - create plans with different complexities
      const xsDir = path.join(testDir, "webpresso/blueprints/xs-plan");
      const mDir = path.join(testDir, "webpresso/blueprints/m-plan");
      const xlDir = path.join(testDir, "webpresso/blueprints/xl-plan");
      await fs.mkdir(xsDir, { recursive: true });
      await fs.mkdir(mDir, { recursive: true });
      await fs.mkdir(xlDir, { recursive: true });

      await fs.writeFile(
        path.join(xsDir, "_overview.md"),
        `---
type: blueprint
status: draft
complexity: XS
last_updated: 2024-01-01
created: 2024-01-01
---
# XS Plan
`,
      );
      await fs.writeFile(
        path.join(mDir, "_overview.md"),
        `---
type: blueprint
status: draft
complexity: M
last_updated: 2024-01-01
created: 2024-01-01
---
# M Plan
`,
      );
      await fs.writeFile(
        path.join(xlDir, "_overview.md"),
        `---
type: blueprint
status: draft
complexity: XL
last_updated: 2024-01-01
created: 2024-01-01
---
# XL Plan
`,
      );

      // Act - filter by array of complexities
      const result = await service.query({
        filters: { complexity: ["XS", "XL"] },
      });

      // Assert - should include XS and XL, not M
      expect(result.plans).toHaveLength(2);
      const complexities = result.plans.map((p) => p.complexity).toSorted();
      expect(complexities).toEqual(["XL", "XS"]);
    });
  });

  describe("mutant-killing: handleParseSummaryError Error fallback", () => {
    it("should set taskCount to 0 and progress to 0 for malformed plans", async () => {
      const planDir = path.join(testDir, "webpresso/blueprints/malformed-detail");
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
# Malformed Detail
#### Not A Valid Task Format Here
`,
      );

      const plans = await service.list();

      // Plan has valid frontmatter but invalid task format -- should still parse
      const plan = plans.find((p) => p.name === "malformed-detail");
      expect(plan).toMatchObject({
        name: "malformed-detail",
        taskCount: 0,
        progress: 0,
        status: "in-progress",
        complexity: "M",
      });
    });
  });

  describe("mutant-killing: filesTouched filter interaction", () => {
    it("should match plans when any of the filter files are touched", async () => {
      // Arrange - plan touches file A and B, we filter for file B and C
      const planDir = path.join(testDir, "webpresso/blueprints/partial-match");
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
# Partial Match
#### Task 1.1: Work
**Status:** todo

**Files:** \`src/a.ts\`, \`src/b.ts\`
`,
      );

      // Act - filter by files, one of which matches
      const result = await service.query({
        filters: { filesTouched: ["src/b.ts", "src/c.ts"] },
      });

      // Assert - plan should match because src/b.ts is touched
      expect(result.plans).toHaveLength(1);
      expect(result.plans[0]?.name).toBe("partial-match");
    });

    it("should not match plans when none of the filter files are touched", async () => {
      // Arrange
      const planDir = path.join(testDir, "webpresso/blueprints/no-file-match");
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
# No File Match
#### Task 1.1: Work
**Status:** todo

**Files:** \`src/x.ts\`, \`src/y.ts\`
`,
      );

      // Act - filter by files that don't match
      const result = await service.query({
        filters: { filesTouched: ["src/z.ts", "src/w.ts"] },
      });

      // Assert - no plans should match
      expect(result.plans).toHaveLength(0);
    });
  });
});
