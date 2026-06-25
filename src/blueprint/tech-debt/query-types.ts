/**
 * TechDebt Query Types for Service Layer
 *
 * These types extend the base tech debt schema with query-specific fields
 * for filtering, sorting, and summarizing technical debt records.
 *
 * Follows the pattern established in blueprint/query-types.ts.
 */

import {
  categorySchema,
  severitySchema,
  type TechDebtCategory,
  type TechDebtSeverity,
  type TechDebtStatus,
  techDebtStatusSchema,
} from "./schema.js";

/**
 * Freshness score for a tech debt document
 * Tracks how recently the debt was reviewed
 */
export interface FreshnessScore {
  score: number;
  daysSinceUpdate: number;
  status: "fresh" | "aging" | "stale" | "critical";
}

/**
 * Summary view of a tech debt record for list displays.
 * Contains essential fields for quick overview.
 */
export interface TechDebtQuerySummary {
  /** Unique identifier derived from document filename */
  slug: string;
  /** Human-readable title extracted from document */
  title: string;
  /** Current debt status (accepted, needs-remediation, monitoring, resolved) */
  status: TechDebtStatus;
  /** Severity level (critical, high, medium, low) */
  severity: TechDebtSeverity;
  /** Type of technical debt */
  category?: TechDebtCategory;
  /** Computed priority score (higher = more urgent) */
  priorityScore: number;
  /** ISO date string for next scheduled review */
  nextReview?: string;
}

/**
 * Extended tech debt record with query-specific fields.
 * Used for detailed queries and tech debt dashboards.
 */
export interface TechDebtRecord extends TechDebtQuerySummary {
  /** Parent group derived from path (e.g., "testing"), null if top-level */
  group: string | null;
  /** Full file path to the tech debt markdown document */
  path: string;
  /** Date when the debt was last reviewed */
  lastReviewed?: Date;
  /** Calculated freshness score based on review status and last review date */
  freshness: FreshnessScore;
  /** Array of blueprint slugs that reference this tech debt */
  linkedBlueprints: string[];
}

/**
 * Query filters for tech debt searches.
 * All fields are optional; multiple values use OR logic within a field.
 */
export interface TechDebtQueryFilters {
  /** Filter by debt status (single or multiple values) */
  status?: TechDebtStatus | TechDebtStatus[];
  /** Filter by severity level (single or multiple values) */
  severity?: TechDebtSeverity | TechDebtSeverity[];
  /** Filter by category (single or multiple values) */
  category?: TechDebtCategory | TechDebtCategory[];
  /** Filter for overdue items (next_review < now) */
  overdue?: boolean;
  /** Filter for stale items only (not reviewed in N days) */
  staleDays?: number;
}

/**
 * Available fields for sorting tech debt results.
 */
export type TechDebtSortField =
  | "priorityScore"
  | "nextReview"
  | "lastReviewed"
  | "slug"
  | "severity";

/**
 * Sort direction for query results.
 */
export type SortDirection = "asc" | "desc";

/**
 * Sorting options for tech debt queries.
 */
export interface TechDebtSortOptions {
  /** Field to sort by */
  field: TechDebtSortField;
  /** Sort direction (ascending or descending) */
  direction: SortDirection;
}

/**
 * Query result with tech debt records and aggregate summary.
 * Provides both the filtered results and useful statistics.
 */
export interface TechDebtQueryResult {
  /** List of matching tech debt records */
  items: TechDebtRecord[];
  /** Aggregate summary of the query results */
  summary: {
    /** Total number of matching items */
    total: number;
    /** Count of items by status */
    byStatus: Record<string, number>;
    /** Count of items by severity */
    bySeverity: Record<string, number>;
    /** Number of overdue items (past next_review date) */
    overdueCount: number;
    /** Average priority score across all items */
    avgPriority: number;
  };
}

/**
 * Type guard to check if a string is a valid TechDebtStatus.
 * Derives valid values from the Zod schema to ensure single source of truth.
 * @param value - The string to check
 * @returns True if the value is a valid TechDebtStatus
 */
export function isTechDebtStatus(value: string): value is TechDebtStatus {
  return techDebtStatusSchema.options.includes(value as TechDebtStatus);
}

/**
 * Type guard to check if a string is a valid Severity.
 * Derives valid values from the Zod schema to ensure single source of truth.
 * @param value - The string to check
 * @returns True if the value is a valid Severity
 */
export function isSeverity(value: string): value is TechDebtSeverity {
  return severitySchema.options.includes(value as TechDebtSeverity);
}

/**
 * Type guard to check if a string is a valid TechDebtCategory.
 * Derives valid values from the Zod schema to ensure single source of truth.
 * @param value - The string to check
 * @returns True if the value is a valid TechDebtCategory
 */
export function isCategory(value: string): value is TechDebtCategory {
  return categorySchema.options.includes(value as TechDebtCategory);
}
