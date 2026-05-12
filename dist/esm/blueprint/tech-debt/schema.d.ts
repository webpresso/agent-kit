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
import { z } from 'zod';
/**
 * Valid tech debt status values
 * Maps to lifecycle: needs-remediation → monitoring → resolved
 * 'accepted' = acknowledged debt that won't be fixed immediately
 */
export declare const techDebtStatusSchema: z.ZodEnum<{
    accepted: "accepted";
    "needs-remediation": "needs-remediation";
    monitoring: "monitoring";
    resolved: "resolved";
}>;
/**
 * Valid severity levels
 * Used to compute base priority score
 */
export declare const severitySchema: z.ZodEnum<{
    low: "low";
    medium: "medium";
    high: "high";
    critical: "critical";
}>;
/**
 * Valid debt categories
 * Categories align with common technical debt types
 */
export declare const categorySchema: z.ZodEnum<{
    complexity: "complexity";
    testing: "testing";
    mutation: "mutation";
    duplication: "duplication";
    dependency: "dependency";
    security: "security";
    documentation: "documentation";
}>;
/**
 * Valid review cadence intervals
 * Determines how often debt should be reviewed
 */
export declare const reviewCadenceSchema: z.ZodEnum<{
    weekly: "weekly";
    biweekly: "biweekly";
    monthly: "monthly";
    quarterly: "quarterly";
}>;
/**
 * Branded slug type for type-safe TechDebt identification
 * Ensures slugs are non-empty strings with compile-time type safety
 */
export declare const techDebtSlugSchema: z.core.$ZodBranded<z.ZodString, "TechDebtSlug", "out">;
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
export declare const techDebtFrontmatterSchema: z.ZodPipe<z.ZodObject<{
    type: z.ZodLiteral<"tech-debt">;
    status: z.ZodEnum<{
        accepted: "accepted";
        "needs-remediation": "needs-remediation";
        monitoring: "monitoring";
        resolved: "resolved";
    }>;
    severity: z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
        critical: "critical";
    }>;
    category: z.ZodEnum<{
        complexity: "complexity";
        testing: "testing";
        mutation: "mutation";
        duplication: "duplication";
        dependency: "dependency";
        security: "security";
        documentation: "documentation";
    }>;
    review_cadence: z.ZodEnum<{
        weekly: "weekly";
        biweekly: "biweekly";
        monthly: "monthly";
        quarterly: "quarterly";
    }>;
    last_reviewed: z.ZodUnion<readonly [z.ZodString, z.ZodDate]>;
    created: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodDate]>>;
    linked_blueprints: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
    affected_modules: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
    auto_filed_hash: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodTransform<{
    nextReview: string;
    basePriority: number;
    type: "tech-debt";
    status: "accepted" | "needs-remediation" | "monitoring" | "resolved";
    severity: "low" | "medium" | "high" | "critical";
    category: "complexity" | "testing" | "mutation" | "duplication" | "dependency" | "security" | "documentation";
    review_cadence: "weekly" | "biweekly" | "monthly" | "quarterly";
    last_reviewed: string | Date;
    linked_blueprints: string[];
    affected_modules: string[];
    created?: string | Date | undefined;
    auto_filed_hash?: string | undefined;
}, {
    type: "tech-debt";
    status: "accepted" | "needs-remediation" | "monitoring" | "resolved";
    severity: "low" | "medium" | "high" | "critical";
    category: "complexity" | "testing" | "mutation" | "duplication" | "dependency" | "security" | "documentation";
    review_cadence: "weekly" | "biweekly" | "monthly" | "quarterly";
    last_reviewed: string | Date;
    linked_blueprints: string[];
    affected_modules: string[];
    created?: string | Date | undefined;
    auto_filed_hash?: string | undefined;
}>>;
/**
 * Infer TypeScript types from schemas
 */
export type TechDebtFrontmatter = z.infer<typeof techDebtFrontmatterSchema>;
export type TechDebtStatus = z.infer<typeof techDebtStatusSchema>;
export type TechDebtSeverity = z.infer<typeof severitySchema>;
export type TechDebtCategory = z.infer<typeof categorySchema>;
export type ReviewCadence = z.infer<typeof reviewCadenceSchema>;
export type TechDebtSlug = z.infer<typeof techDebtSlugSchema>;
//# sourceMappingURL=schema.d.ts.map