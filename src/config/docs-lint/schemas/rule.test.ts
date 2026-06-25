import { describe, expect, it } from "vitest";

import { ruleFrontmatter, ruleSections } from "./rule";

describe("ruleFrontmatter schema", () => {
  describe("valid frontmatter", () => {
    it("accepts valid rule frontmatter with all required fields", () => {
      const valid = {
        type: "rule",
        priority: "critical",
        enforcement: "automated",
        last_updated: "2026-01-08",
      };
      const result = ruleFrontmatter.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it("accepts all priority levels", () => {
      const priorities = ["critical", "high", "medium", "low"] as const;
      for (const priority of priorities) {
        const result = ruleFrontmatter.safeParse({
          type: "rule",
          priority,
          enforcement: "automated",
          last_updated: "2026-01-08",
        });
        expect(result.success).toBe(true);
      }
    });

    it("accepts all enforcement types", () => {
      const enforcements = ["automated", "manual", "hybrid"] as const;
      for (const enforcement of enforcements) {
        const result = ruleFrontmatter.safeParse({
          type: "rule",
          priority: "high",
          enforcement,
          last_updated: "2026-01-08",
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("invalid frontmatter", () => {
    it("rejects missing type", () => {
      const invalid = {
        priority: "critical",
        enforcement: "automated",
        last_updated: "2026-01-08",
      };
      const result = ruleFrontmatter.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects wrong type value", () => {
      const invalid = {
        type: "guide",
        priority: "critical",
        enforcement: "automated",
        last_updated: "2026-01-08",
      };
      const result = ruleFrontmatter.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects missing priority", () => {
      const invalid = {
        type: "rule",
        enforcement: "automated",
        last_updated: "2026-01-08",
      };
      const result = ruleFrontmatter.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects invalid priority value", () => {
      const invalid = {
        type: "rule",
        priority: "urgent",
        enforcement: "automated",
        last_updated: "2026-01-08",
      };
      const result = ruleFrontmatter.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects missing enforcement", () => {
      const invalid = {
        type: "rule",
        priority: "high",
        last_updated: "2026-01-08",
      };
      const result = ruleFrontmatter.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects invalid enforcement value", () => {
      const invalid = {
        type: "rule",
        priority: "high",
        enforcement: "optional",
        last_updated: "2026-01-08",
      };
      const result = ruleFrontmatter.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });
});

describe("ruleSections", () => {
  it("requires title heading", () => {
    expect(ruleSections).toContain("# ");
  });

  it("requires policy quote block", () => {
    expect(ruleSections).toContain("> **Policy**:");
  });
});
