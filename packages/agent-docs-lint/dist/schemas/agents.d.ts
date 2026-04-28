import { z } from 'zod';
/**
 * Frontmatter schema for agent-guide.md (Single Source of Truth, formerly AGENTS.md)
 */
export declare const agentsFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["draft", "review", "active", "accepted", "deprecated", "archived", "complete", "completed", "planned", "in-progress", "monitoring", "needs-remediation", "deferred", "backlog", "blocked", "open", "resolved", "wont-fix", "current", "superseded"]>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    related: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
} & {
    type: z.ZodOptional<z.ZodLiteral<"agents">>;
    last_updated: z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>;
    version: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status?: "draft" | "review" | "active" | "accepted" | "deprecated" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "monitoring" | "needs-remediation" | "deferred" | "backlog" | "blocked" | "open" | "resolved" | "wont-fix" | "current" | "superseded" | undefined;
    last_updated?: string | undefined;
    type?: "agents" | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
    version?: string | undefined;
}, {
    last_updated: string | Date;
    status?: "draft" | "review" | "active" | "accepted" | "deprecated" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "monitoring" | "needs-remediation" | "deferred" | "backlog" | "blocked" | "open" | "resolved" | "wont-fix" | "current" | "superseded" | undefined;
    type?: "agents" | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
    version?: string | undefined;
}>;
export type AgentsFrontmatter = z.infer<typeof agentsFrontmatter>;
/**
 * Required sections for agent-guide.md to prevent structure drift.
 */
export declare const agentsSections: string[];
/**
 * Frontmatter schema for agent entry points (CLAUDE.md, GEMINI.md)
 * These are pointer files and have lighter validation.
 */
export declare const agentEntryFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["draft", "review", "active", "accepted", "deprecated", "archived", "complete", "completed", "planned", "in-progress", "monitoring", "needs-remediation", "deferred", "backlog", "blocked", "open", "resolved", "wont-fix", "current", "superseded"]>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    related: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
} & {
    type: z.ZodOptional<z.ZodLiteral<"agent-entry">>;
    last_updated: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>>;
}, "strip", z.ZodTypeAny, {
    status?: "draft" | "review" | "active" | "accepted" | "deprecated" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "monitoring" | "needs-remediation" | "deferred" | "backlog" | "blocked" | "open" | "resolved" | "wont-fix" | "current" | "superseded" | undefined;
    last_updated?: string | undefined;
    type?: "agent-entry" | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
}, {
    status?: "draft" | "review" | "active" | "accepted" | "deprecated" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "monitoring" | "needs-remediation" | "deferred" | "backlog" | "blocked" | "open" | "resolved" | "wont-fix" | "current" | "superseded" | undefined;
    last_updated?: string | Date | undefined;
    type?: "agent-entry" | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
}>;
export type AgentEntryFrontmatter = z.infer<typeof agentEntryFrontmatter>;
