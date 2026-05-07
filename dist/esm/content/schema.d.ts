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
import { z } from 'zod';
/**
 * Document type — narrows the discriminated union below.
 */
export declare const contentTypeSchema: z.ZodEnum<{
    rule: "rule";
    skill: "skill";
}>;
/**
 * Lifecycle status. New content is `active`; once retired it is `deprecated`
 * and MUST carry a `deprecation_date`.
 */
export declare const contentStatusSchema: z.ZodEnum<{
    active: "active";
    deprecated: "deprecated";
}>;
/**
 * Audience markers — at least one entry is required.
 */
export declare const appliesToSchema: z.ZodEnum<{
    agents: "agents";
    humans: "humans";
}>;
/**
 * Rule frontmatter — `type: 'rule'` plus the shared shape.
 */
export declare const ruleFrontmatterSchema: z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodObject<{
    slug: z.ZodString;
    title: z.ZodString;
    status: z.ZodDefault<z.ZodEnum<{
        active: "active";
        deprecated: "deprecated";
    }>>;
    scope: z.ZodDefault<z.ZodString>;
    applies_to: z.ZodArray<z.ZodEnum<{
        agents: "agents";
        humans: "humans";
    }>>;
    related: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
    created: z.ZodString;
    last_reviewed: z.ZodString;
    deprecation_date: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"rule">;
}, z.core.$strip>>;
/**
 * Skill frontmatter — `type: 'skill'` plus the shared shape.
 */
export declare const skillFrontmatterSchema: z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodObject<{
    slug: z.ZodString;
    title: z.ZodString;
    status: z.ZodDefault<z.ZodEnum<{
        active: "active";
        deprecated: "deprecated";
    }>>;
    scope: z.ZodDefault<z.ZodString>;
    applies_to: z.ZodArray<z.ZodEnum<{
        agents: "agents";
        humans: "humans";
    }>>;
    related: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
    created: z.ZodString;
    last_reviewed: z.ZodString;
    deprecation_date: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"skill">;
}, z.core.$strip>>;
/**
 * Discriminated union on `type` — pre-processes legacy `paths` first so the
 * inner discriminator only sees the canonical shape.
 */
export declare const contentFrontmatterSchema: z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodDiscriminatedUnion<[z.ZodObject<{
    slug: z.ZodString;
    title: z.ZodString;
    status: z.ZodDefault<z.ZodEnum<{
        active: "active";
        deprecated: "deprecated";
    }>>;
    scope: z.ZodDefault<z.ZodString>;
    applies_to: z.ZodArray<z.ZodEnum<{
        agents: "agents";
        humans: "humans";
    }>>;
    related: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
    created: z.ZodString;
    last_reviewed: z.ZodString;
    deprecation_date: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"rule">;
}, z.core.$strip>, z.ZodObject<{
    slug: z.ZodString;
    title: z.ZodString;
    status: z.ZodDefault<z.ZodEnum<{
        active: "active";
        deprecated: "deprecated";
    }>>;
    scope: z.ZodDefault<z.ZodString>;
    applies_to: z.ZodArray<z.ZodEnum<{
        agents: "agents";
        humans: "humans";
    }>>;
    related: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
    created: z.ZodString;
    last_reviewed: z.ZodString;
    deprecation_date: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<"skill">;
}, z.core.$strip>], "type">>;
/**
 * Inferred TypeScript types — both per-variant and the union.
 */
export type RuleFrontmatter = z.infer<typeof ruleFrontmatterSchema>;
export type SkillFrontmatter = z.infer<typeof skillFrontmatterSchema>;
export type ContentFrontmatter = z.infer<typeof contentFrontmatterSchema>;
//# sourceMappingURL=schema.d.ts.map