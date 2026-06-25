import { z } from "zod";

/**
 * Date that can be either a YYYY-MM-DD string or a Date object.
 * gray-matter parses YAML dates as Date objects, so we need to handle both.
 */
export const dateString = z.union([
  z.string().date(),
  z.date().transform((d) => d.toISOString().split("T")[0]),
]);

/**
 * Base frontmatter fields shared by all document types.
 * All fields are optional to allow incremental adoption.
 */
export const baseFrontmatter = z.object({
  /** Explicit doc type override (normally inferred from path) */
  type: z.string().optional(),

  /** Document title (overrides H1 detection) */
  title: z.string().optional(),

  /** Last update date in YYYY-MM-DD format or Date object */
  last_updated: dateString.optional(),

  /** Document status */
  status: z
    .enum([
      "draft",
      "review",
      "active",
      "accepted",
      "deprecated",
      "archived",
      "complete",
      "completed",
      "planned",
      "in-progress",
      "monitoring",
      "needs-remediation",
      "deferred",
      "backlog",
      "blocked",
      "open",
      "resolved",
      "wont-fix",
      "current",
      "superseded",
    ])
    .optional(),

  /** List of authors */
  authors: z.array(z.string()).optional(),

  /** Tags for categorization */
  tags: z.array(z.string()).optional(),

  /** Related document paths */
  related: z.array(z.string()).optional(),
});

export type BaseFrontmatter = z.infer<typeof baseFrontmatter>;

/**
 * Status values for implementation plans
 */
export const implementationStatus = z.enum([
  "draft",
  "in-progress",
  "complete",
  "completed",
  "archived",
  "parked",
  "deprioritized",
  "future",
  "planned",
  "deferred",
  "current",
]);

/**
 * Complexity levels for implementation plans
 */
export const complexity = z.enum(["XS", "S", "M", "L", "XL"]);
