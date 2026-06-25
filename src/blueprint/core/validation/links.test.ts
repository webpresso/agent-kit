import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkChangelog, validatePlanLinks } from "./links.js";

describe("validatePlanLinks", () => {
  let testDir: string;
  let planPath: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "val-links-"));
    planPath = join(testDir, "plan.md");
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("valid links", () => {
    it("should validate when no links exist", () => {
      const markdown = "# Plan with no links";
      const result = validatePlanLinks(markdown, planPath);
      expect(result.valid).toBe(true);
      expect(result.brokenLinks).toHaveLength(0);
    });

    it("should validate existing relative file", () => {
      const targetPath = join(testDir, "target.md");
      writeFileSync(targetPath, "# Target");

      const markdown = "[Link](./target.md)";
      const result = validatePlanLinks(markdown, planPath);
      expect(result.valid).toBe(true);
      expect(result.brokenLinks).toHaveLength(0);
    });

    it("should validate existing parent directory file", () => {
      // Use a subdirectory so ../parent.md resolves inside testDir (no stray files in tmpdir)
      const subDir = join(testDir, "sub");
      mkdirSync(subDir, { recursive: true });
      const subPlanPath = join(subDir, "plan.md");
      const parentFile = join(testDir, "parent.md");
      writeFileSync(parentFile, "# Parent", { flag: "w" });

      const markdown = "[Link](../parent.md)";
      const result = validatePlanLinks(markdown, subPlanPath);
      expect(result.valid).toBe(true);
      expect(result.brokenLinks).toHaveLength(0);
    });

    it("should ignore http links", () => {
      const markdown = "[External](https://example.com)";
      const result = validatePlanLinks(markdown, planPath);
      expect(result.valid).toBe(true);
      expect(result.brokenLinks).toHaveLength(0);
    });

    it("should ignore http (non-secure) links", () => {
      const markdown = "[External](http://example.com)";
      const result = validatePlanLinks(markdown, planPath);
      expect(result.valid).toBe(true);
      expect(result.brokenLinks).toHaveLength(0);
    });

    it("should ignore anchor links", () => {
      const markdown = "[Anchor](#section)";
      const result = validatePlanLinks(markdown, planPath);
      expect(result.valid).toBe(true);
      expect(result.brokenLinks).toHaveLength(0);
    });

    it("should validate multiple existing files", () => {
      writeFileSync(join(testDir, "file1.md"), "# File 1");
      writeFileSync(join(testDir, "file2.md"), "# File 2");

      const markdown = `
[First](./file1.md)
[Second](./file2.md)
      `;
      const result = validatePlanLinks(markdown, planPath);
      expect(result.valid).toBe(true);
      expect(result.brokenLinks).toHaveLength(0);
    });
  });

  describe("broken links", () => {
    it("should detect missing relative file", () => {
      const markdown = "[Link](./missing.md)";
      const result = validatePlanLinks(markdown, planPath);
      expect(result.valid).toBe(false);
      expect(result.brokenLinks).toContain("./missing.md");
    });

    it("should detect missing parent directory file", () => {
      const markdown = "[Link](../missing.md)";
      const result = validatePlanLinks(markdown, planPath);
      expect(result.valid).toBe(false);
      expect(result.brokenLinks).toContain("../missing.md");
    });

    it("should detect multiple broken links", () => {
      const markdown = `
[First](./missing1.md)
[Second](./missing2.md)
[Third](../missing3.md)
      `;
      const result = validatePlanLinks(markdown, planPath);
      expect(result.valid).toBe(false);
      expect(result.brokenLinks).toHaveLength(3);
      expect(result.brokenLinks).toContain("./missing1.md");
      expect(result.brokenLinks).toContain("./missing2.md");
      expect(result.brokenLinks).toContain("../missing3.md");
    });

    it("should detect broken links while ignoring valid external links", () => {
      const markdown = `
[External](https://example.com)
[Broken](./missing.md)
[Anchor](#section)
      `;
      const result = validatePlanLinks(markdown, planPath);
      expect(result.valid).toBe(false);
      expect(result.brokenLinks).toHaveLength(1);
      expect(result.brokenLinks).toContain("./missing.md");
    });

    it("should handle mixed valid and broken links", () => {
      writeFileSync(join(testDir, "exists.md"), "# Exists");

      const markdown = `
[Valid](./exists.md)
[Broken](./missing.md)
      `;
      const result = validatePlanLinks(markdown, planPath);
      expect(result.valid).toBe(false);
      expect(result.brokenLinks).toHaveLength(1);
      expect(result.brokenLinks).toContain("./missing.md");
    });
  });

  describe("link format variations", () => {
    it("should not match links with nested brackets", () => {
      const markdown = "[Link [with] brackets](./missing.md)";
      const result = validatePlanLinks(markdown, planPath);
      // Regex doesn't handle nested brackets - won't match the link
      expect(result.valid).toBe(true);
      expect(result.brokenLinks).toHaveLength(0);
    });

    it("should handle links with spaces in text", () => {
      const markdown = "[Link with spaces](./missing.md)";
      const result = validatePlanLinks(markdown, planPath);
      expect(result.valid).toBe(false);
      expect(result.brokenLinks).toContain("./missing.md");
    });

    it("should not match empty link text", () => {
      const markdown = "[](./missing.md)";
      const result = validatePlanLinks(markdown, planPath);
      // Regex requires at least one char in link text - won't match
      expect(result.valid).toBe(true);
      expect(result.brokenLinks).toHaveLength(0);
    });

    it("should handle links with query parameters", () => {
      const targetPath = join(testDir, "target.md");
      writeFileSync(targetPath, "# Target");

      const markdown = "[Link](./target.md?param=value)";
      // This will fail because file path includes query params
      const result = validatePlanLinks(markdown, planPath);
      expect(result.valid).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle empty markdown", () => {
      const result = validatePlanLinks("", planPath);
      expect(result.valid).toBe(true);
      expect(result.brokenLinks).toHaveLength(0);
    });

    it("should handle markdown with no links", () => {
      const markdown = "Just plain text without any links";
      const result = validatePlanLinks(markdown, planPath);
      expect(result.valid).toBe(true);
    });

    it("should handle links without path", () => {
      const markdown = "[Text]()";
      const result = validatePlanLinks(markdown, planPath);
      expect(result.valid).toBe(true);
      expect(result.brokenLinks).toHaveLength(0);
    });

    it("should skip links starting with http", () => {
      const markdown = "[Link](http://example.com)";
      const result = validatePlanLinks(markdown, planPath);
      expect(result.valid).toBe(true);
      expect(result.brokenLinks).toHaveLength(0);
    });

    it("should skip links starting with hash", () => {
      const markdown = "[Link](#anchor)";
      const result = validatePlanLinks(markdown, planPath);
      expect(result.valid).toBe(true);
      expect(result.brokenLinks).toHaveLength(0);
    });

    it("should handle deeply nested paths", () => {
      const nestedDir = join(testDir, "a", "b", "c");
      mkdirSync(nestedDir, { recursive: true });
      const nestedFile = join(nestedDir, "deep.md");
      writeFileSync(nestedFile, "# Deep");

      const markdown = "[Deep](./a/b/c/deep.md)";
      const result = validatePlanLinks(markdown, planPath);
      expect(result.valid).toBe(true);
    });
  });
});

describe("checkChangelog", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "chk-changelog-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("completed plans", () => {
    it("should require CHANGELOG.md for completed plans", () => {
      const planPath = join(testDir, "completed", "my-plan", "plan.md");
      mkdirSync(join(testDir, "completed", "my-plan"), { recursive: true });

      const result = checkChangelog(planPath);
      expect(result.hasChangelog).toBe(false);
      expect(result.warning).toBe("Completed plan missing CHANGELOG.md (recommended)");
    });

    it("should pass when CHANGELOG.md exists for completed plans", () => {
      const planDir = join(testDir, "completed", "my-plan");
      mkdirSync(planDir, { recursive: true });
      writeFileSync(join(planDir, "CHANGELOG.md"), "# Changelog");

      const planPath = join(planDir, "plan.md");
      const result = checkChangelog(planPath);
      expect(result.hasChangelog).toBe(true);
      expect(result.warning).toBe(undefined);
    });

    it("should handle /completed/ anywhere in path", () => {
      const planPath = join(testDir, "docs", "completed", "plan.md");
      mkdirSync(join(testDir, "docs", "completed"), { recursive: true });

      const result = checkChangelog(planPath);
      expect(result.hasChangelog).toBe(false);
      expect(typeof result.warning).toBe("string");
    });

    it("should not match completed/ without leading slash", () => {
      const planPath = "completed/my-plan/plan.md";
      const result = checkChangelog(planPath);
      // Only matches /completed/ with leading slash
      expect(result.hasChangelog).toBe(true);
      expect(result.warning).toBe(undefined);
    });
  });

  describe("non-completed plans", () => {
    it("should not require CHANGELOG.md for in-progress plans", () => {
      const planPath = join(testDir, "in-progress", "my-plan", "plan.md");
      const result = checkChangelog(planPath);
      expect(result.hasChangelog).toBe(true);
      expect(result.warning).toBe(undefined);
    });

    it("should not require CHANGELOG.md for draft plans", () => {
      const planPath = join(testDir, "draft", "my-plan", "plan.md");
      const result = checkChangelog(planPath);
      expect(result.hasChangelog).toBe(true);
      expect(result.warning).toBe(undefined);
    });

    it("should not require CHANGELOG.md for drafts/ folder paths", () => {
      const planPath = join(testDir, "drafts", "my-plan", "plan.md");
      const result = checkChangelog(planPath);
      expect(result.hasChangelog).toBe(true);
    });

    it("should pass for plans without status folder", () => {
      const planPath = join(testDir, "plan.md");
      const result = checkChangelog(planPath);
      expect(result.hasChangelog).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should handle empty path", () => {
      const result = checkChangelog("");
      expect(result.hasChangelog).toBe(true);
    });

    it('should handle path with "completed" in filename but not folder', () => {
      const planPath = join(testDir, "plans", "completed-feature.md");
      const result = checkChangelog(planPath);
      expect(result.hasChangelog).toBe(true);
    });

    it('should be case sensitive for "completed"', () => {
      const planPath = join(testDir, "COMPLETED", "plan.md");
      const result = checkChangelog(planPath);
      // Should pass because it's not lowercase "completed"
      expect(result.hasChangelog).toBe(true);
    });
  });
});
