import { z } from "zod";
/**
 * Frontmatter schema for agent-guide.md (Single Source of Truth, formerly AGENTS.md)
 */
export declare const agentsFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<{
        draft: "draft";
        planned: "planned";
        "in-progress": "in-progress";
        completed: "completed";
        archived: "archived";
        blocked: "blocked";
        open: "open";
        superseded: "superseded";
        accepted: "accepted";
        review: "review";
        deferred: "deferred";
        "needs-remediation": "needs-remediation";
        monitoring: "monitoring";
        resolved: "resolved";
        complete: "complete";
        current: "current";
        deprecated: "deprecated";
        active: "active";
        backlog: "backlog";
        "wont-fix": "wont-fix";
    }>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    related: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodOptional<z.ZodLiteral<"agents">>;
    last_updated: z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>;
    version: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type AgentsFrontmatter = z.infer<typeof agentsFrontmatter>;
/**
 * Required sections for agent-guide.md to prevent structure drift.
 */
export declare const agentsSections: string[];
/**
 * Frontmatter schema for agent entry points (CLAUDE.md).
 * These are pointer files and have lighter validation.
 */
export declare const agentEntryFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<{
        draft: "draft";
        planned: "planned";
        "in-progress": "in-progress";
        completed: "completed";
        archived: "archived";
        blocked: "blocked";
        open: "open";
        superseded: "superseded";
        accepted: "accepted";
        review: "review";
        deferred: "deferred";
        "needs-remediation": "needs-remediation";
        monitoring: "monitoring";
        resolved: "resolved";
        complete: "complete";
        current: "current";
        deprecated: "deprecated";
        active: "active";
        backlog: "backlog";
        "wont-fix": "wont-fix";
    }>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    related: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodOptional<z.ZodLiteral<"agent-entry">>;
    last_updated: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>>;
}, z.core.$strip>;
export type AgentEntryFrontmatter = z.infer<typeof agentEntryFrontmatter>;
//# sourceMappingURL=agents.d.ts.map