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
import { z } from 'zod';
/**
 * Valid tracked document status values (aligned with blueprint lifecycle).
 */
export declare const trackedDocumentStatusSchema: z.ZodEnum<{
    completed: "completed";
    draft: "draft";
    planned: "planned";
    parked: "parked";
    "in-progress": "in-progress";
    archived: "archived";
}>;
export type TrackedDocumentStatus = z.infer<typeof trackedDocumentStatusSchema>;
/**
 * Blueprint slug - kebab-case identifier for a blueprint
 * Used to prevent accidental mixing of different document slug types
 * @example "implement-auth-flow"
 */
export declare const BlueprintSlug: z.core.$ZodBranded<z.ZodString, "BlueprintSlug", "out">;
export type BlueprintSlug = z.infer<typeof BlueprintSlug>;
/**
 * TechDebt slug - kebab-case identifier for a tech debt item
 * Used to prevent accidental mixing of different document slug types
 * @example "refactor-payment-service"
 */
export declare const TechDebtSlug: z.core.$ZodBranded<z.ZodString, "TechDebtSlug", "out">;
export type TechDebtSlug = z.infer<typeof TechDebtSlug>;
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
export declare const trackedDocumentFrontmatterSchema: z.ZodObject<{
    type: z.ZodString;
    status: z.ZodEnum<{
        completed: "completed";
        draft: "draft";
        planned: "planned";
        parked: "parked";
        "in-progress": "in-progress";
        archived: "archived";
    }>;
    last_updated: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodDate]>>;
    created: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodDate]>>;
}, z.core.$strip>;
export type TrackedDocumentFrontmatter = z.infer<typeof trackedDocumentFrontmatterSchema>;
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
//# sourceMappingURL=schema.d.ts.map