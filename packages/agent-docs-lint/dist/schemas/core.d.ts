import { z } from 'zod';
/**
 * Frontmatter schema for core documentation files.
 * Located at docs/*.md (root level) - VISION.md, etc.
 */
export declare const coreFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["draft", "review", "active", "accepted", "deprecated", "archived", "complete", "completed", "planned", "in-progress", "monitoring", "needs-remediation", "deferred", "backlog", "blocked", "open", "resolved", "wont-fix", "current", "superseded"]>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    related: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
} & {
    type: z.ZodOptional<z.ZodLiteral<"core">>;
    last_updated: z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>;
    owner: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status?: "draft" | "review" | "active" | "accepted" | "deprecated" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "monitoring" | "needs-remediation" | "deferred" | "backlog" | "blocked" | "open" | "resolved" | "wont-fix" | "current" | "superseded" | undefined;
    last_updated?: string | undefined;
    type?: "core" | undefined;
    owner?: string | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
}, {
    last_updated: string | Date;
    status?: "draft" | "review" | "active" | "accepted" | "deprecated" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "monitoring" | "needs-remediation" | "deferred" | "backlog" | "blocked" | "open" | "resolved" | "wont-fix" | "current" | "superseded" | undefined;
    type?: "core" | undefined;
    owner?: string | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
}>;
export type CoreFrontmatter = z.infer<typeof coreFrontmatter>;
/**
 * Frontmatter schema for README files.
 */
export declare const readmeFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    last_updated: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>>;
    status: z.ZodOptional<z.ZodEnum<["draft", "review", "active", "accepted", "deprecated", "archived", "complete", "completed", "planned", "in-progress", "monitoring", "needs-remediation", "deferred", "backlog", "blocked", "open", "resolved", "wont-fix", "current", "superseded"]>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    related: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
} & {
    type: z.ZodOptional<z.ZodLiteral<"readme">>;
}, "strip", z.ZodTypeAny, {
    status?: "draft" | "review" | "active" | "accepted" | "deprecated" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "monitoring" | "needs-remediation" | "deferred" | "backlog" | "blocked" | "open" | "resolved" | "wont-fix" | "current" | "superseded" | undefined;
    last_updated?: string | undefined;
    type?: "readme" | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
}, {
    status?: "draft" | "review" | "active" | "accepted" | "deprecated" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "monitoring" | "needs-remediation" | "deferred" | "backlog" | "blocked" | "open" | "resolved" | "wont-fix" | "current" | "superseded" | undefined;
    last_updated?: string | Date | undefined;
    type?: "readme" | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
}>;
export type ReadmeFrontmatter = z.infer<typeof readmeFrontmatter>;
/**
 * Frontmatter schema for security docs.
 * Located in docs/security/
 */
export declare const securityFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["draft", "review", "active", "accepted", "deprecated", "archived", "complete", "completed", "planned", "in-progress", "monitoring", "needs-remediation", "deferred", "backlog", "blocked", "open", "resolved", "wont-fix", "current", "superseded"]>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    related: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
} & {
    type: z.ZodOptional<z.ZodLiteral<"security">>;
    last_updated: z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>;
    severity: z.ZodOptional<z.ZodEnum<["critical", "high", "medium", "low", "info"]>>;
}, "strip", z.ZodTypeAny, {
    status?: "draft" | "review" | "active" | "accepted" | "deprecated" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "monitoring" | "needs-remediation" | "deferred" | "backlog" | "blocked" | "open" | "resolved" | "wont-fix" | "current" | "superseded" | undefined;
    last_updated?: string | undefined;
    type?: "security" | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
    severity?: "info" | "critical" | "high" | "medium" | "low" | undefined;
}, {
    last_updated: string | Date;
    status?: "draft" | "review" | "active" | "accepted" | "deprecated" | "archived" | "complete" | "completed" | "planned" | "in-progress" | "monitoring" | "needs-remediation" | "deferred" | "backlog" | "blocked" | "open" | "resolved" | "wont-fix" | "current" | "superseded" | undefined;
    type?: "security" | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
    severity?: "info" | "critical" | "high" | "medium" | "low" | undefined;
}>;
export type SecurityFrontmatter = z.infer<typeof securityFrontmatter>;
/**
 * Frontmatter schema for design docs.
 * Located in docs/design/
 */
export declare const designFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    last_updated: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    related: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
} & {
    type: z.ZodOptional<z.ZodLiteral<"design">>;
    status: z.ZodOptional<z.ZodEnum<["draft", "approved", "implemented", "deprecated"]>>;
}, "strip", z.ZodTypeAny, {
    status?: "draft" | "deprecated" | "approved" | "implemented" | undefined;
    last_updated?: string | undefined;
    type?: "design" | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
}, {
    status?: "draft" | "deprecated" | "approved" | "implemented" | undefined;
    last_updated?: string | Date | undefined;
    type?: "design" | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
}>;
export type DesignFrontmatter = z.infer<typeof designFrontmatter>;
/**
 * Frontmatter schema for troubleshooting docs.
 * Located in docs/troubleshooting/
 */
export declare const troubleshootingFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    last_updated: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodDate, string | undefined, Date>]>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    related: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
} & {
    type: z.ZodOptional<z.ZodLiteral<"troubleshooting">>;
    status: z.ZodOptional<z.ZodEnum<["open", "resolved", "wont-fix", "active", "draft"]>>;
    affected_versions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    status?: "draft" | "active" | "open" | "resolved" | "wont-fix" | undefined;
    last_updated?: string | undefined;
    type?: "troubleshooting" | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
    affected_versions?: string[] | undefined;
}, {
    status?: "draft" | "active" | "open" | "resolved" | "wont-fix" | undefined;
    last_updated?: string | Date | undefined;
    type?: "troubleshooting" | undefined;
    title?: string | undefined;
    authors?: string[] | undefined;
    tags?: string[] | undefined;
    related?: string[] | undefined;
    affected_versions?: string[] | undefined;
}>;
export type TroubleshootingFrontmatter = z.infer<typeof troubleshootingFrontmatter>;
/**
 * Frontmatter schema for agent-guide.md (formerly AGENTS.md).
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
