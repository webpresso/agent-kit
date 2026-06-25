import { describe, expect, it } from "vitest";
import { z } from "zod";

import { openDb } from "./connection.js";
import { QUERY_TEMPLATES, findTemplate } from "./templates.js";
import { runTemplate } from "./template-runner.js";

// ---------------------------------------------------------------------------
// Direct-insert helpers — no ingester dependency
// ---------------------------------------------------------------------------

function insertBlueprint(
  db: ReturnType<typeof openDb>["db"],
  overrides: {
    slug: string;
    title?: string;
    status?: string;
    complexity?: string;
    owner?: string;
    completed_at?: string | null;
  },
): void {
  const {
    slug,
    title = slug,
    status = "in-progress",
    complexity = "M",
    owner = "test-owner",
    completed_at = null,
  } = overrides;

  db.prepare(
    `INSERT INTO blueprints
       (slug, title, status, complexity, owner, file_path, byte_size,
        content_hash, ingested_at, organization, visibility, completed_at)
     VALUES
       (?, ?, ?, ?, ?, ?, 100, 'hash-' || ?, 1234567890, 'test-org', 'private', ?)`,
  ).run(
    slug,
    title,
    status,
    complexity,
    owner,
    "/fake/" + slug + "/_overview.md",
    slug,
    completed_at,
  );
}

function insertTask(
  db: ReturnType<typeof openDb>["db"],
  opts: {
    blueprintSlug: string;
    taskId: string;
    title?: string;
    status?: string;
  },
): number {
  const { blueprintSlug, taskId, title = taskId, status = "todo" } = opts;
  const info = db
    .prepare(
      `INSERT INTO tasks (blueprint_slug, task_id, title, status)
       VALUES (?, ?, ?, ?)`,
    )
    .run(blueprintSlug, taskId, title, status);
  return Number(info.lastInsertRowid);
}

function insertTechDebt(
  db: ReturnType<typeof openDb>["db"],
  opts: {
    slug: string;
    status?: string;
    severity?: string;
    nextReview?: string | null;
  },
): void {
  const { slug, status = "accepted", severity = "medium", nextReview = null } = opts;
  db.prepare(
    `INSERT INTO tech_debt_items
       (slug, status, severity, category, review_cadence, next_review,
        file_path, byte_size, organization, visibility)
     VALUES
       (?, ?, ?, 'maintenance', 'monthly', ?, ?, 100, 'test-org', 'private')`,
  ).run(slug, status, severity, nextReview, "/fake/tech-debt/" + slug + ".md");
}

function insertRisk(
  db: ReturnType<typeof openDb>["db"],
  opts: {
    blueprintSlug: string;
    riskId: string;
    severity: string;
    description?: string;
    mitigation?: string;
  },
): void {
  const { blueprintSlug, riskId, severity, description = "desc", mitigation = "fix it" } = opts;
  db.prepare(
    `INSERT INTO risks (blueprint_slug, risk_id, severity, description, mitigation)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(blueprintSlug, riskId, severity, description, mitigation);
}

// ---------------------------------------------------------------------------
// 1. Syntax validity: every template's SQL can be prepared against a fresh DB
// ---------------------------------------------------------------------------

describe("QUERY_TEMPLATES — SQL syntax validity", () => {
  it("every template SQL can be prepared against a fresh database", () => {
    const conn = openDb(":memory:");
    try {
      for (const template of QUERY_TEMPLATES) {
        // Replace :named params with NULL so prepare() doesn't reject unknown bindings
        const safeSql = template.sql.replace(/:([a-zA-Z_]+)/g, "NULL");
        expect(
          () => conn.db.prepare(safeSql),
          `Template "${template.id}" SQL is invalid`,
        ).not.toThrow();
      }
    } finally {
      conn.close();
    }
  });

  it("exports at least 8 templates", () => {
    expect(QUERY_TEMPLATES.length).toBeGreaterThanOrEqual(8);
  });

  it("all template IDs are unique", () => {
    const ids = QUERY_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every template has a non-empty description", () => {
    for (const t of QUERY_TEMPLATES) {
      expect(t.description.length, `Template "${t.id}" description is empty`).toBeGreaterThan(0);
    }
  });

  it("every template maxRows is a positive integer", () => {
    for (const t of QUERY_TEMPLATES) {
      expect(
        Number.isInteger(t.maxRows) && t.maxRows > 0,
        `Template "${t.id}" maxRows invalid`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. next-ready-task correctness
// ---------------------------------------------------------------------------

describe("next-ready-task", () => {
  it("returns todo tasks in in-progress blueprints with no unmet dependencies", () => {
    const conn = openDb(":memory:");
    try {
      insertBlueprint(conn.db, { slug: "alpha", status: "in-progress", complexity: "M" });
      const t1 = insertTask(conn.db, { blueprintSlug: "alpha", taskId: "T1", status: "todo" });
      const t2 = insertTask(conn.db, { blueprintSlug: "alpha", taskId: "T2", status: "todo" });
      // T2 depends on T1
      conn.db.prepare("INSERT INTO task_dependencies VALUES (?, ?)").run(t2, t1);

      const result = runTemplate(conn.db, "next-ready-task", {});
      // Only T1 has no unmet deps
      expect(result.rows.length).toBe(1);
      const row = result.rows[0] as Record<string, unknown>;
      expect(row["task_id"]).toBe("T1");
      expect(row["blueprint_slug"]).toBe("alpha");
    } finally {
      conn.close();
    }
  });

  it("does not return tasks from planned blueprints", () => {
    const conn = openDb(":memory:");
    try {
      insertBlueprint(conn.db, { slug: "planned-bp", status: "planned" });
      insertTask(conn.db, { blueprintSlug: "planned-bp", taskId: "T1", status: "todo" });

      const result = runTemplate(conn.db, "next-ready-task", { limit: 100 });
      expect(result.rows).toHaveLength(0);
    } finally {
      conn.close();
    }
  });

  it("does not return tasks whose dependencies are not yet done", () => {
    const conn = openDb(":memory:");
    try {
      insertBlueprint(conn.db, { slug: "blocked-bp", status: "in-progress" });
      const t1 = insertTask(conn.db, {
        blueprintSlug: "blocked-bp",
        taskId: "T1",
        status: "in-progress",
      });
      const t2 = insertTask(conn.db, { blueprintSlug: "blocked-bp", taskId: "T2", status: "todo" });
      conn.db.prepare("INSERT INTO task_dependencies VALUES (?, ?)").run(t2, t1);

      const result = runTemplate(conn.db, "next-ready-task", {});
      const ids = (result.rows as Array<Record<string, unknown>>).map((r) => r["task_id"]);
      expect(ids).not.toContain("T2");
    } finally {
      conn.close();
    }
  });

  it("respects the limit param", () => {
    const conn = openDb(":memory:");
    try {
      insertBlueprint(conn.db, { slug: "limit-bp", status: "in-progress" });
      for (let i = 1; i <= 10; i++) {
        insertTask(conn.db, { blueprintSlug: "limit-bp", taskId: `T${i}`, status: "todo" });
      }

      const result = runTemplate(conn.db, "next-ready-task", { limit: 3 });
      expect(result.rows.length).toBe(3);
    } finally {
      conn.close();
    }
  });

  it("orders by complexity (XL first) then task_id", () => {
    const conn = openDb(":memory:");
    try {
      insertBlueprint(conn.db, { slug: "xl-bp", status: "in-progress", complexity: "XL" });
      insertBlueprint(conn.db, { slug: "m-bp", status: "in-progress", complexity: "M" });
      insertTask(conn.db, { blueprintSlug: "m-bp", taskId: "T1", status: "todo" });
      insertTask(conn.db, { blueprintSlug: "xl-bp", taskId: "T1", status: "todo" });

      const result = runTemplate(conn.db, "next-ready-task", { limit: 10 });
      const slugs = (result.rows as Array<Record<string, unknown>>).map((r) => r["blueprint_slug"]);
      expect(slugs[0]).toBe("xl-bp");
    } finally {
      conn.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. tech-debt-due-soon correctness
// ---------------------------------------------------------------------------

describe("tech-debt-due-soon", () => {
  it("returns items due within the specified window", () => {
    const conn = openDb(":memory:");
    try {
      // tomorrow → due soon
      insertTechDebt(conn.db, {
        slug: "due-soon",
        status: "accepted",
        nextReview: "date('now', '+1 day')",
      });
      // Use a literal date instead
      conn.db
        .prepare(
          `INSERT INTO tech_debt_items
           (slug, status, severity, category, review_cadence, next_review,
            file_path, byte_size, organization, visibility)
         VALUES
           ('near', 'accepted', 'high', 'testing', 'weekly',
            date('now', '+5 days'),
            '/fake/near.md', 100, 'test-org', 'private')`,
        )
        .run();

      conn.db
        .prepare(
          `INSERT INTO tech_debt_items
           (slug, status, severity, category, review_cadence, next_review,
            file_path, byte_size, organization, visibility)
         VALUES
           ('far', 'accepted', 'low', 'maintenance', 'quarterly',
            date('now', '+180 days'),
            '/fake/far.md', 100, 'test-org', 'private')`,
        )
        .run();

      const result = runTemplate(conn.db, "tech-debt-due-soon", { days: 14, limit: 100 });
      const slugs = (result.rows as Array<Record<string, unknown>>).map((r) => r["slug"]);
      expect(slugs).toContain("near");
      expect(slugs).not.toContain("far");
    } finally {
      conn.close();
    }
  });

  it("also returns overdue items (past next_review)", () => {
    const conn = openDb(":memory:");
    try {
      conn.db
        .prepare(
          `INSERT INTO tech_debt_items
           (slug, status, severity, category, review_cadence, next_review,
            file_path, byte_size, organization, visibility)
         VALUES
           ('overdue', 'needs-remediation', 'critical', 'security', 'monthly',
            date('now', '-30 days'),
            '/fake/overdue.md', 100, 'test-org', 'private')`,
        )
        .run();

      const result = runTemplate(conn.db, "tech-debt-due-soon", { days: 14, limit: 100 });
      const slugs = (result.rows as Array<Record<string, unknown>>).map((r) => r["slug"]);
      expect(slugs).toContain("overdue");
    } finally {
      conn.close();
    }
  });

  it("does not return resolved items", () => {
    const conn = openDb(":memory:");
    try {
      conn.db
        .prepare(
          `INSERT INTO tech_debt_items
           (slug, status, severity, category, review_cadence, next_review,
            file_path, byte_size, organization, visibility)
         VALUES
           ('resolved-item', 'resolved', 'low', 'docs', 'monthly',
            date('now', '-1 day'),
            '/fake/resolved.md', 100, 'test-org', 'private')`,
        )
        .run();

      const result = runTemplate(conn.db, "tech-debt-due-soon", { days: 30, limit: 100 });
      const slugs = (result.rows as Array<Record<string, unknown>>).map((r) => r["slug"]);
      expect(slugs).not.toContain("resolved-item");
    } finally {
      conn.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 4. blueprint-risk-profile
// ---------------------------------------------------------------------------

describe("blueprint-risk-profile", () => {
  it("returns HIGH and CRITICAL risks from planned/in-progress blueprints", () => {
    const conn = openDb(":memory:");
    try {
      insertBlueprint(conn.db, { slug: "risky-bp", status: "in-progress" });
      insertBlueprint(conn.db, { slug: "done-bp", status: "completed" });
      insertRisk(conn.db, { blueprintSlug: "risky-bp", riskId: "R1", severity: "CRITICAL" });
      insertRisk(conn.db, { blueprintSlug: "risky-bp", riskId: "R2", severity: "HIGH" });
      insertRisk(conn.db, { blueprintSlug: "risky-bp", riskId: "R3", severity: "MEDIUM" });
      insertRisk(conn.db, { blueprintSlug: "done-bp", riskId: "R1", severity: "CRITICAL" });

      const result = runTemplate(conn.db, "blueprint-risk-profile", {});
      const riskIds = (result.rows as Array<Record<string, unknown>>).map((r) => r["risk_id"]);
      expect(riskIds).toContain("R1");
      expect(riskIds).toContain("R2");
      expect(riskIds).not.toContain("R3"); // MEDIUM excluded
      // done-bp risks excluded
      const bpSlugs = (result.rows as Array<Record<string, unknown>>).map(
        (r) => r["blueprint_slug"],
      );
      expect(bpSlugs).not.toContain("done-bp");
    } finally {
      conn.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 5. runTemplate — error cases
// ---------------------------------------------------------------------------

describe("runTemplate — error handling", () => {
  it("throws on unknown template ID", () => {
    const conn = openDb(":memory:");
    try {
      expect(() => runTemplate(conn.db, "does-not-exist", {})).toThrow(
        /Unknown template id: "does-not-exist"/,
      );
    } finally {
      conn.close();
    }
  });

  it("throws ZodError on invalid params (negative limit)", () => {
    const conn = openDb(":memory:");
    try {
      expect(() => runTemplate(conn.db, "next-ready-task", { limit: -5 })).toThrow(z.ZodError);
    } finally {
      conn.close();
    }
  });

  it("throws ZodError when param has wrong type", () => {
    const conn = openDb(":memory:");
    try {
      expect(() => runTemplate(conn.db, "next-ready-task", { limit: "not-a-number" })).toThrow(
        z.ZodError,
      );
    } finally {
      conn.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Row cap is respected
// ---------------------------------------------------------------------------

describe("runTemplate — row cap", () => {
  it("caps results at the requested limit and sets capped: true", () => {
    const conn = openDb(":memory:");
    try {
      insertBlueprint(conn.db, { slug: "cap-bp", status: "in-progress", complexity: "M" });

      for (let i = 1; i <= 20; i++) {
        insertTask(conn.db, { blueprintSlug: "cap-bp", taskId: `T${i}`, status: "todo" });
      }

      const result = runTemplate(conn.db, "next-ready-task", { limit: 5 });
      expect(result.rows.length).toBe(5);
      expect(result.capped).toBe(true);
      expect(result.rowCount).toBe(5);
    } finally {
      conn.close();
    }
  });

  it("capped is false when fewer rows than limit are returned", () => {
    const conn = openDb(":memory:");
    try {
      insertBlueprint(conn.db, { slug: "small-bp", status: "in-progress" });
      insertTask(conn.db, { blueprintSlug: "small-bp", taskId: "T1", status: "todo" });
      insertTask(conn.db, { blueprintSlug: "small-bp", taskId: "T2", status: "todo" });

      const result = runTemplate(conn.db, "next-ready-task", { limit: 50 });
      expect(result.rows.length).toBe(2);
      expect(result.capped).toBe(false);
    } finally {
      conn.close();
    }
  });

  it("enforces maxRows even if caller requests more", () => {
    const conn = openDb(":memory:");
    try {
      // next-ready-task has maxRows: 50. Insert 60 tasks.
      insertBlueprint(conn.db, { slug: "big-bp", status: "in-progress" });
      for (let i = 1; i <= 60; i++) {
        insertTask(conn.db, { blueprintSlug: "big-bp", taskId: `T${i}`, status: "todo" });
      }

      const result = runTemplate(conn.db, "next-ready-task", { limit: 1000 });
      expect(result.rows.length).toBeLessThanOrEqual(50);
    } finally {
      conn.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 7. findTemplate helper
// ---------------------------------------------------------------------------

describe("findTemplate", () => {
  it("returns the template for a known id", () => {
    const t = findTemplate("next-ready-task");
    expect(t).toBeDefined();
    expect(t?.id).toBe("next-ready-task");
  });

  it("returns undefined for unknown id", () => {
    expect(findTemplate("no-such-template")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 8. completed-this-month
// ---------------------------------------------------------------------------

describe("completed-this-month", () => {
  it("returns blueprints completed this month", () => {
    const conn = openDb(":memory:");
    try {
      // Use a completed_at that is the first of the current month
      conn.db
        .prepare(
          `INSERT INTO blueprints
           (slug, title, status, complexity, file_path, byte_size,
            content_hash, ingested_at, organization, visibility, completed_at)
         VALUES
           ('this-month', 'This Month', 'completed', 'S',
            '/fake/this-month/_overview.md', 100, 'hash1', 1234567890,
            'test-org', 'private', strftime('%Y-%m-01', 'now'))`,
        )
        .run();

      conn.db
        .prepare(
          `INSERT INTO blueprints
           (slug, title, status, complexity, file_path, byte_size,
            content_hash, ingested_at, organization, visibility, completed_at)
         VALUES
           ('last-month', 'Last Month', 'completed', 'M',
            '/fake/last-month/_overview.md', 100, 'hash2', 1234567890,
            'test-org', 'private', date('now', '-40 days'))`,
        )
        .run();

      const result = runTemplate(conn.db, "completed-this-month", {});
      const slugs = (result.rows as Array<Record<string, unknown>>).map((r) => r["slug"]);
      expect(slugs).toContain("this-month");
      expect(slugs).not.toContain("last-month");
    } finally {
      conn.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 9. overdue-tech-debt
// ---------------------------------------------------------------------------

describe("overdue-tech-debt", () => {
  it("returns only unresolved items past their review date", () => {
    const conn = openDb(":memory:");
    try {
      conn.db
        .prepare(
          `INSERT INTO tech_debt_items
           (slug, status, severity, category, review_cadence, next_review,
            file_path, byte_size, organization, visibility)
         VALUES
           ('overdue-item', 'accepted', 'high', 'architecture', 'monthly',
            date('now', '-10 days'), '/fake/o.md', 100, 'test-org', 'private')`,
        )
        .run();

      conn.db
        .prepare(
          `INSERT INTO tech_debt_items
           (slug, status, severity, category, review_cadence, next_review,
            file_path, byte_size, organization, visibility)
         VALUES
           ('future-item', 'accepted', 'low', 'maintenance', 'monthly',
            date('now', '+30 days'), '/fake/f.md', 100, 'test-org', 'private')`,
        )
        .run();

      conn.db
        .prepare(
          `INSERT INTO tech_debt_items
           (slug, status, severity, category, review_cadence, next_review,
            file_path, byte_size, organization, visibility)
         VALUES
           ('resolved-overdue', 'resolved', 'critical', 'security', 'weekly',
            date('now', '-5 days'), '/fake/r.md', 100, 'test-org', 'private')`,
        )
        .run();

      const result = runTemplate(conn.db, "overdue-tech-debt", { limit: 100 });
      const slugs = (result.rows as Array<Record<string, unknown>>).map((r) => r["slug"]);
      expect(slugs).toContain("overdue-item");
      expect(slugs).not.toContain("future-item");
      expect(slugs).not.toContain("resolved-overdue");
    } finally {
      conn.close();
    }
  });
});
