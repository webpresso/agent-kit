/**
 * Base Zod schema for tracked documents (Blueprints, TechDebt, etc.)
 *
 * This schema defines shared structure and validation rules for all tracked document types.
 * Tracked documents are markdown files with YAML frontmatter that track status over time.
 *
 * Using Zod provides:
 * - Type-safe validation with automatic TypeScript inference
 * - Detailed error messages for invalid frontmatter
 * - Declarative schema definition
 * - Foundation for discriminated unions when multiple document types exist
 */

import { z } from "zod";

// =============================================================================
// Shared Status Enum
// =============================================================================

/**
 * Valid tracked document status values (aligned with blueprint lifecycle).
 */
export const trackedDocumentStatusSchema = z.enum([
  "draft",
  "planned",
  "parked",
  "in-progress",
  "completed",
  "archived",
]);

export type TrackedDocumentStatus = z.infer<typeof trackedDocumentStatusSchema>;

// =============================================================================
// Branded Slug Types (Nominal Typing)
// =============================================================================

/**
 * Blueprint slug - kebab-case identifier for a blueprint
 * Used to prevent accidental mixing of different document slug types
 * @example "implement-auth-flow"
 */
export const BlueprintSlug = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Must be kebab-case")
  .brand<"BlueprintSlug">();

export type BlueprintSlug = z.infer<typeof BlueprintSlug>;

/**
 * TechDebt slug - kebab-case identifier for a tech debt item
 * Used to prevent accidental mixing of different document slug types
 * @example "refactor-payment-service"
 */
export const TechDebtSlug = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Must be kebab-case")
  .brand<"TechDebtSlug">();

export type TechDebtSlug = z.infer<typeof TechDebtSlug>;

// =============================================================================
// Base Frontmatter Schema
// =============================================================================

/**
 * Shared frontmatter fields for all tracked documents
 *
 * Required fields:
 * - type: Document type discriminator (e.g., 'blueprint', 'tech-debt')
 * - status: Current document status
 *
 * Optional fields:
 * - last_updated: Date document was last modified (YYYY-MM-DD)
 * - created: Date document was created (YYYY-MM-DD)
 */
export const trackedDocumentFrontmatterSchema = z.object({
  type: z.string(), // Will be discriminated by specific document types
  status: trackedDocumentStatusSchema,
  last_updated: z.union([z.string(), z.date()]).optional(),
  created: z.union([z.string(), z.date()]).optional(),
});

export type TrackedDocumentFrontmatter = z.infer<typeof trackedDocumentFrontmatterSchema>;

// =============================================================================
// Discriminated Union Foundation
// =============================================================================

/**
 * Discriminated union of all tracked document types
 *
 * Currently only includes Blueprint type. When TechDebt schema is added,
 * this will become a true discriminated union:
 *
 * @example
 * export const trackedDocumentSchema = z.discriminatedUnion('type', [
 *   blueprintFrontmatterSchema,
 *   techDebtFrontmatterSchema,
 * ])
 *
 * This allows type-safe parsing where the 'type' field determines
 * which schema variant is used for validation.
 */

// Note: The discriminated union will be completed when TechDebt schema exists.
// For now, this file provides the foundation and shared types.
