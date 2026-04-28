import { z } from 'zod';
/**
 * Date that can be either a YYYY-MM-DD string or a Date object.
 * gray-matter parses YAML dates as Date objects, so we need to handle both.
 */
export declare const dateString: z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>;
/**
 * Base frontmatter fields shared by all document types.
 * All fields are optional to allow incremental adoption.
 */
export declare const baseFrontmatter: z.ZodObject<{
    /** Explicit doc type override (normally inferred from path) */
    type: z.ZodOptional<z.ZodString>;
    /** Document title (overrides H1 detection) */
    title: z.ZodOptional<z.ZodString>;
    /** Last update date in YYYY-MM-DD format or Date object */
    last_updated: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>>;
    /** Document status */
    status: z.ZodOptional<z.ZodEnum<["draft", "review", "active", "accepted", "deprecated", "archived", "complete", "completed", "planned", "in-progress", "monitoring", "needs-remediation", "deferred", "backlog", "blocked", "open", "resolved", "wont-fix", "current", "superseded"]>>;
    /** List of authors */
    authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /** Tags for categorization */
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /** Related document paths */
    related: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    status?: "draft" | "review" | "active" | "accepted" | "deprecated" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "monitoring" | "needs-remediation" | "deferred" | "backlog" | "blocked" | "open" | "resolved" | "wont-fix" | "current" | "superseded" | undefined;
    last_updated?: string | undefined;
    type?: string | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
}, {
    status?: "draft" | "review" | "active" | "accepted" | "deprecated" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "monitoring" | "needs-remediation" | "deferred" | "backlog" | "blocked" | "open" | "resolved" | "wont-fix" | "current" | "superseded" | undefined;
    last_updated?: string | Date | undefined;
    type?: string | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
}>;
export type BaseFrontmatter = z.infer<typeof baseFrontmatter>;
/**
 * Status values for implementation plans
 */
export declare const implementationStatus: z.ZodEnum<["draft", "in-progress", "complete", "completed", "archived", "parked", "deprioritized", "future", "planned", "deferred", "current"]>;
/**
 * Complexity levels for implementation plans
 */
export declare const complexity: z.ZodEnum<["XS", "S", "M", "L", "XL"]>;
