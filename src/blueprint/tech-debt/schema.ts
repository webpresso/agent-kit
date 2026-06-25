/**
 * Zod schema for TechDebt frontmatter validation
 *
 * This schema defines the structure and validation rules for tech debt documents.
 * Using Zod v4 features:
 * - Branded types for type-safe slugs
 * - Transform functions for computed fields (nextReview, basePriority)
 * - Refinements for cross-field validation
 * - Enum schemas for constrained string values
 *
 * Follows the Agentic Context Standard for technical debt tracking.
 */

import { z } from "zod";

/**
 * Valid tech debt status values
 * Maps to lifecycle: needs-remediation → monitoring → resolved
 * 'accepted' = acknowledged debt that won't be fixed immediately
 */
export const techDebtStatusSchema = z.enum([
  "accepted",
  "needs-remediation",
  "monitoring",
  "resolved",
]);

/**
 * Valid severity levels
 * Used to compute base priority score
 */
export const severitySchema = z.enum(["critical", "high", "medium", "low"]);

/**
 * Valid debt categories
 * Categories align with common technical debt types
 */
export const categorySchema = z.enum([
  "complexity",
  "testing",
  "mutation",
  "duplication",
  "dependency",
  "security",
  "documentation",
]);

/**
 * Valid review cadence intervals
 * Determines how often debt should be reviewed
 */
export const reviewCadenceSchema = z.enum(["weekly", "biweekly", "monthly", "quarterly"]);

/**
 * Branded slug type for type-safe TechDebt identification
 * Ensures slugs are non-empty strings with compile-time type safety
 */
export const techDebtSlugSchema = z.string().min(1).brand<"TechDebtSlug">();

/**
 * Compute next review date based on last review and cadence
 * @param lastReviewed - ISO date string of last review
 * @param cadence - Review frequency
 * @returns ISO date string for next scheduled review
 */
function computeNextReview(
  lastReviewed: string | Date,
  cadence: z.infer<typeof reviewCadenceSchema>,
): string {
  const lastDate = new Date(lastReviewed);

  // Map cadence to days
  const daysMap = {
    weekly: 7,
    biweekly: 14,
    monthly: 30,
    quarterly: 90,
  };

  const days = daysMap[cadence];
  // Use UTC arithmetic to avoid timezone/DST off-by-one when the input is an ISO date string
  const nextDate = new Date(
    Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), lastDate.getUTCDate() + days),
  );

  return nextDate.toISOString().slice(0, 10);
}

/**
 * Compute base priority score from severity level
 * Used in priority scoring algorithm
 */
function computeBasePriority(severity: z.infer<typeof severitySchema>): number {
  const scoreMap = {
    critical: 40,
    high: 30,
    medium: 20,
    low: 10,
  };
  return scoreMap[severity];
}

/**
 * TechDebt frontmatter schema with transforms and refinements
 *
 * Required fields:
 * - type: Always 'tech-debt'
 * - status: Current debt status
 * - severity: Severity level (affects priority)
 * - category: Type of technical debt
 * - review_cadence: How often to review
 * - last_reviewed: Last review date (ISO format YYYY-MM-DD)
 *
 * Optional fields:
 * - created: Date debt was first identified
 * - linked_blueprints: Array of blueprint slugs referencing this debt
 * - affected_modules: Array of affected module/package names
 *
 * Computed fields (added by transform):
 * - nextReview: Calculated from last_reviewed + review_cadence
 * - basePriority: Score derived from severity (10-40)
 */
export const techDebtFrontmatterSchema = z
  .object({
    type: z.literal("tech-debt"),
    status: techDebtStatusSchema,
    severity: severitySchema,
    category: categorySchema,
    review_cadence: reviewCadenceSchema,
    // Date fields - support both string and Date for flexibility
    last_reviewed: z.union([z.string(), z.date()]),
    created: z.union([z.string(), z.date()]).optional(),
    // Cross-references
    linked_blueprints: z
      .array(z.string())
      .optional()
      .default(() => []),
    affected_modules: z
      .array(z.string())
      .optional()
      .default(() => []),
    // Auto-filing: content-hash idempotency key set by `wp tech-debt new --from-audit`
    auto_filed_hash: z.string().optional(),
  })
  .transform((data) => ({
    ...data,
    // Compute next review date at parse time
    nextReview: computeNextReview(data.last_reviewed, data.review_cadence),
    // Compute base priority score at parse time
    basePriority: computeBasePriority(data.severity),
  }))
  .refine(
    (data) => {
      // Critical severity must have weekly cadence for timely attention
      if (data.severity === "critical" && data.review_cadence !== "weekly") {
        return false;
      }
      return true;
    },
    {
      message: "Critical severity technical debt must have weekly review cadence",
      path: ["review_cadence"],
    },
  );

/**
 * Infer TypeScript types from schemas
 */
export type TechDebtFrontmatter = z.infer<typeof techDebtFrontmatterSchema>;
export type TechDebtStatus = z.infer<typeof techDebtStatusSchema>;
export type TechDebtSeverity = z.infer<typeof severitySchema>;
export type TechDebtCategory = z.infer<typeof categorySchema>;
export type ReviewCadence = z.infer<typeof reviewCadenceSchema>;
export type TechDebtSlug = z.infer<typeof techDebtSlugSchema>;
