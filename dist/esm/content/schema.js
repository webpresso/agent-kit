/**
 * Zod schemas for consumer-rule + consumer-skill content frontmatter.
 *
 * Single discriminated union on `type` with two variants — `rule` and `skill`.
 * Built-in normalization for the legacy `paths` frontmatter shape:
 * an array of glob strings collapses to a single `scope: 'path:<joined>'`
 * value at parse time (multiple entries joined with `,`). See refinement
 * finding F12 in the consumer-content extraction plan.
 *
 * Cross-field rule: `deprecation_date` is required iff `status === 'deprecated'`,
 * forbidden otherwise.
 */
import { z } from "zod";
/**
 * Document type — narrows the discriminated union below.
 */
export const contentTypeSchema = z.enum(["rule", "skill"]);
/**
 * Lifecycle status. New content is `active`; once retired it is `deprecated`
 * and MUST carry a `deprecation_date`.
 */
export const contentStatusSchema = z.enum(["active", "deprecated"]);
/**
 * Audience markers — at least one entry is required.
 */
export const appliesToSchema = z.enum(["agents", "humans"]);
/**
 * Slug shape — kebab-case, lowercase letters / digits / hyphens, must start
 * with a letter or digit.
 */
const slugPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const slugSchema = z
    .string()
    .min(1)
    .regex(slugPattern, "slug must be kebab-case (lowercase letters, digits, hyphens)");
/**
 * ISO calendar date (YYYY-MM-DD).
 */
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const isoDateSchema = z.string().regex(isoDatePattern, "date must be ISO YYYY-MM-DD");
/**
 * Scope shape — `repo`, `package:<name>`, or `path:<glob>`.
 */
const scopePattern = /^(?:repo|package:[^\s]+|path:[^\s]+)$/;
const scopeSchema = z
    .string()
    .regex(scopePattern, "scope must be repo | package:<name> | path:<glob>");
/**
 * Common fields shared by every content variant.
 */
const baseShape = {
    slug: slugSchema,
    title: z.string().min(1, "title is required"),
    status: contentStatusSchema.default("active"),
    scope: scopeSchema.default("repo"),
    applies_to: z.array(appliesToSchema).min(1, "applies_to must be non-empty"),
    related: z
        .array(slugSchema)
        .optional()
        .default(() => []),
    created: isoDateSchema,
    last_reviewed: isoDateSchema,
    deprecation_date: isoDateSchema.optional(),
};
/**
 * Pre-validation normalization that promotes the legacy `paths: [...]` field
 * to the canonical `scope: 'path:<joined>'` shape. Runs only when `scope` is
 * not explicitly set — explicit scope always wins.
 */
function normalizeLegacyPaths(input) {
    if (typeof input !== "object" || input === null)
        return input;
    const record = input;
    const hasScope = typeof record["scope"] === "string" && record["scope"].length > 0;
    const paths = record["paths"];
    if (hasScope || !Array.isArray(paths) || paths.length === 0)
        return record;
    const joined = paths.filter((p) => typeof p === "string").join(",");
    if (joined.length === 0)
        return record;
    const { paths: _drop, ...rest } = record;
    return { ...rest, scope: `path:${joined}` };
}
/**
 * Cross-field check for `deprecation_date` ↔ `status`.
 */
function refineDeprecationInterlock(data, ctx) {
    if (data.status === "deprecated" && !data.deprecation_date) {
        ctx.addIssue({
            code: "custom",
            path: ["deprecation_date"],
            message: 'deprecation_date is required when status is "deprecated"',
        });
    }
    if (data.status === "active" && data.deprecation_date) {
        ctx.addIssue({
            code: "custom",
            path: ["deprecation_date"],
            message: 'deprecation_date is forbidden when status is "active"',
        });
    }
}
/**
 * Rule frontmatter — `type: 'rule'` plus the shared shape.
 */
export const ruleFrontmatterSchema = z
    .preprocess(normalizeLegacyPaths, z.object({ type: z.literal("rule"), ...baseShape }))
    .superRefine((data, ctx) => refineDeprecationInterlock(data, ctx));
/**
 * Skill frontmatter — `type: 'skill'` plus the shared shape.
 */
export const skillFrontmatterSchema = z
    .preprocess(normalizeLegacyPaths, z.object({ type: z.literal("skill"), ...baseShape }))
    .superRefine((data, ctx) => refineDeprecationInterlock(data, ctx));
/**
 * Discriminated union on `type` — pre-processes legacy `paths` first so the
 * inner discriminator only sees the canonical shape.
 */
export const contentFrontmatterSchema = z
    .preprocess(normalizeLegacyPaths, z.discriminatedUnion("type", [
    z.object({ type: z.literal("rule"), ...baseShape }),
    z.object({ type: z.literal("skill"), ...baseShape }),
]))
    .superRefine((data, ctx) => refineDeprecationInterlock(data, ctx));
//# sourceMappingURL=schema.js.map