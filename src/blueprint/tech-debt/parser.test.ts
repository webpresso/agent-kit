import { describe, expect, it } from "vitest";

import { extractCheckboxStatus, parseTechDebt, serializeTechDebt } from "./parser.js";

const FRONTMATTER = `---
type: tech-debt
status: accepted
severity: medium
category: complexity
review_cadence: monthly
last_reviewed: 2026-02-01
---`;

describe("extractCheckboxStatus", () => {
  it("should extract checkbox counts from section", () => {
    const section = `
- [x] First item
- [ ] Second item
- [x] Third item
`;
    const result = extractCheckboxStatus(section);
    expect(result.total).toBe(3);
    expect(result.checked).toBe(2);
  });

  it("should handle sections with no checkboxes", () => {
    const section = `Just some text without checkboxes`;
    const result = extractCheckboxStatus(section);
    expect(result.total).toBe(0);
    expect(result.checked).toBe(0);
  });

  it("should only count markdown checkboxes (not text)", () => {
    const section = `
- [x] Real checkbox
Some text with [ ] brackets
- [ ] Another checkbox
`;
    const result = extractCheckboxStatus(section);
    expect(result.total).toBe(2);
    expect(result.checked).toBe(1);
  });
});

describe("parseTechDebt", () => {
  describe("hazard ID extraction", () => {
    it("should extract hazard ID from H1 heading", () => {
      const md = `${FRONTMATTER}

# H-001: Legacy CLI Complexity

Some content
`;
      const item = parseTechDebt(md, "legacy-cli");
      expect(item.hazardId).toBe("H-001");
      expect(item.title).toBe("Legacy CLI Complexity");
    });

    it("should handle multi-digit hazard IDs", () => {
      const md = `${FRONTMATTER}

# H-123: Complex Issue

Content
`;
      const item = parseTechDebt(md, "complex-issue");
      expect(item.hazardId).toBe("H-123");
    });

    it("should return null hazard ID when not present", () => {
      const md = `${FRONTMATTER}

# Just a Regular Title

No hazard ID here
`;
      const item = parseTechDebt(md, "regular");
      expect(item.hazardId).toBeNull();
      expect(item.title).toBe("Just a Regular Title");
    });

    it("should handle title without H1", () => {
      const md = `${FRONTMATTER}

Some content without H1
`;
      const item = parseTechDebt(md, "no-title");
      expect(item.hazardId).toBeNull();
      expect(item.title).toBe("Untitled");
    });
  });

  describe("remediation step extraction", () => {
    it("should extract remediation steps with checkboxes", () => {
      const md = `${FRONTMATTER}

# H-001: Test Item

## Remediation Plan

#### Step 1: Complete cli2 migration
- [x] Migrate commands
- [x] Update docs

#### Step 2: Deprecate old package
- [ ] Add deprecation notice
- [ ] Update README

#### Step 3: Remove package
- [ ] Delete files
`;
      const item = parseTechDebt(md, "test-item");

      expect(item.remediationSteps).toHaveLength(3);

      expect(item.remediationSteps[0]).toEqual({
        id: "1",
        title: "Complete cli2 migration",
        checked: true, // All checkboxes checked
      });

      expect(item.remediationSteps[1]).toEqual({
        id: "2",
        title: "Deprecate old package",
        checked: false, // No checkboxes checked
      });

      expect(item.remediationSteps[2]).toEqual({
        id: "3",
        title: "Remove package",
        checked: false,
      });
    });

    it("should handle steps with partial checkbox completion", () => {
      const md = `${FRONTMATTER}

# H-001: Test

#### Step 1: Mixed progress
- [x] Done item
- [ ] Todo item
`;
      const item = parseTechDebt(md, "test");

      expect(item.remediationSteps[0]).toEqual({
        id: "1",
        title: "Mixed progress",
        checked: true, // At least one checkbox checked
      });
    });

    it("should handle tech debt with no remediation steps", () => {
      const md = `${FRONTMATTER}

# H-001: Accepted Debt

This is just narrative content explaining why we accepted this debt.
No remediation steps needed.
`;
      const item = parseTechDebt(md, "narrative-only");
      expect(item.remediationSteps).toHaveLength(0);
    });

    it("should handle steps without checkboxes", () => {
      const md = `${FRONTMATTER}

# H-001: Test

#### Step 1: No checkboxes
Just some narrative text
`;
      const item = parseTechDebt(md, "test");
      expect(item.remediationSteps).toHaveLength(1);
      expect(item.remediationSteps[0]?.checked).toBe(false);
    });
  });

  describe("frontmatter parsing", () => {
    it("should parse all frontmatter fields", () => {
      const md = `---
type: tech-debt
status: needs-remediation
severity: high
category: testing
review_cadence: weekly
last_reviewed: 2026-02-01
linked_blueprints:
  - cli-migration
  - test-coverage
---

# H-001: Test
`;
      const item = parseTechDebt(md, "test-item");

      expect(item.status).toBe("needs-remediation");
      expect(item.severity).toBe("high");
      expect(item.category).toBe("testing");
      expect(item.reviewCadence).toBe("weekly");
      expect(item.lastReviewed).toBe("2026-02-01");
      expect(item.linkedBlueprints).toEqual(["cli-migration", "test-coverage"]);
    });

    it("should compute nextReview from Zod transform", () => {
      const md = `${FRONTMATTER}

# H-001: Test
`;
      const item = parseTechDebt(md, "test");

      // Monthly cadence from 2026-02-01 → 2026-03-03 (30 days)
      expect(item.nextReview).toBe("2026-03-03");
    });

    it("should compute basePriority from severity", () => {
      const mdCritical = `---
type: tech-debt
status: accepted
severity: critical
category: security
review_cadence: weekly
last_reviewed: 2026-02-01
---

# H-001: Critical Issue
`;
      const mdLow = `---
type: tech-debt
status: accepted
severity: low
category: documentation
review_cadence: quarterly
last_reviewed: 2026-02-01
---

# H-002: Low Priority
`;
      const critical = parseTechDebt(mdCritical, "critical");
      const low = parseTechDebt(mdLow, "low");

      expect(critical.basePriority).toBe(40); // Critical = 40
      expect(low.basePriority).toBe(10); // Low = 10
    });

    it("should throw ZodError for invalid frontmatter", () => {
      const md = `---
type: tech-debt
status: invalid-status
severity: medium
category: testing
review_cadence: monthly
last_reviewed: 2026-02-01
---

# H-001: Test
`;
      expect(() => parseTechDebt(md, "test")).toThrow();
    });

    it("should throw ZodError for missing required fields", () => {
      const md = `---
type: tech-debt
status: accepted
---

# H-001: Test
`;
      expect(() => parseTechDebt(md, "test")).toThrow();
    });

    it("should enforce critical severity + weekly cadence rule", () => {
      const md = `---
type: tech-debt
status: accepted
severity: critical
category: security
review_cadence: monthly
last_reviewed: 2026-02-01
---

# H-001: Test
`;
      expect(() => parseTechDebt(md, "test")).toThrow(/weekly review cadence/);
    });
  });

  describe("full document parsing", () => {
    it("should parse a complete tech debt document", () => {
      const md = `---
type: tech-debt
status: accepted
severity: medium
category: complexity
review_cadence: quarterly
last_reviewed: 2026-02-01
linked_blueprints:
  - cli-migration
---

# H-001: Legacy CLI Package Complexity Violations

**Problem**:
- 15 complexity violations in packages/cli
- Decision framework commands have complexity 16-46

**Why Accepted**:
- Package scheduled for deprecation

## Remediation Plan

#### Step 1: Complete cli2 migration
- [x] Migrate core commands
- [x] Update documentation

#### Step 2: Deprecate packages/cli
- [ ] Add deprecation notice
- [ ] Update migration guide

#### Step 3: Remove package entirely
- [ ] Delete package
- [ ] Update monorepo config
`;
      const item = parseTechDebt(md, "legacy-cli");

      expect(item.slug).toBe("legacy-cli");
      expect(item.hazardId).toBe("H-001");
      expect(item.title).toBe("Legacy CLI Package Complexity Violations");
      expect(item.status).toBe("accepted");
      expect(item.severity).toBe("medium");
      expect(item.category).toBe("complexity");
      expect(item.reviewCadence).toBe("quarterly");
      expect(item.linkedBlueprints).toEqual(["cli-migration"]);
      expect(item.remediationSteps).toHaveLength(3);
      expect(item.raw).toBe(md);

      // Verify remediation steps
      expect(item.remediationSteps[0]).toEqual({
        id: "1",
        title: "Complete cli2 migration",
        checked: true,
      });
      expect(item.remediationSteps[1]).toEqual({
        id: "2",
        title: "Deprecate packages/cli",
        checked: false,
      });
    });

    it("extracts mermaid diagram blocks into diagrams field", () => {
      const md = `${FRONTMATTER}

# H-001: Mermaid Coverage

\`\`\`mermaid
graph TD
A-->B
\`\`\`

\`\`\`mermaid
graph LR
X-->Y
\`\`\`
`;

      const item = parseTechDebt(md, "mermaid-coverage");

      expect(item.diagrams).toEqual(["graph TD\nA-->B", "graph LR\nX-->Y"]);
    });

    it("returns empty diagrams when no mermaid blocks are present", () => {
      const md = `${FRONTMATTER}

# H-001: No Diagram

Plain markdown content only.
`;

      const item = parseTechDebt(md, "no-diagram");

      expect(item.diagrams).toEqual([]);
    });
  });
});

describe("serializeTechDebt", () => {
  it("should serialize item back to markdown", () => {
    const md = `${FRONTMATTER}

# H-001: Test Item

Some content
`;
    const item = parseTechDebt(md, "test");
    const serialized = serializeTechDebt(item);

    // Should preserve content
    expect(serialized).toContain("# H-001: Test Item");
    expect(serialized).toContain("Some content");

    // Should preserve frontmatter
    expect(serialized).toContain("type: tech-debt");
    expect(serialized).toContain("status: accepted");
  });

  it("should update status field", () => {
    const md = `${FRONTMATTER}

# H-001: Test
`;
    const item = parseTechDebt(md, "test");
    item.status = "resolved";

    const serialized = serializeTechDebt(item);
    expect(serialized).toContain("status: resolved");
  });

  it("should remove computed fields from frontmatter", () => {
    const md = `${FRONTMATTER}

# H-001: Test
`;
    const item = parseTechDebt(md, "test");
    const serialized = serializeTechDebt(item);

    // Computed fields should not appear in frontmatter
    expect(serialized).not.toContain("nextReview:");
    expect(serialized).not.toContain("basePriority:");
  });
});
