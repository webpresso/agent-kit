import { z } from 'zod';
/**
 * Frontmatter schema for core documentation files.
 * Located at docs/*.md (root level) - VISION.md, etc.
 */
export declare const coreFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<{
        blocked: "blocked";
        completed: "completed";
        draft: "draft";
        planned: "planned";
        "in-progress": "in-progress";
        archived: "archived";
        superseded: "superseded";
        accepted: "accepted";
        "needs-remediation": "needs-remediation";
        monitoring: "monitoring";
        resolved: "resolved";
        open: "open";
        deprecated: "deprecated";
        current: "current";
        complete: "complete";
        active: "active";
        review: "review";
        deferred: "deferred";
        backlog: "backlog";
        "wont-fix": "wont-fix";
    }>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    related: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodOptional<z.ZodLiteral<"core">>;
    last_updated: z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>;
    owner: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type CoreFrontmatter = z.infer<typeof coreFrontmatter>;
/**
 * Frontmatter schema for README files.
 */
export declare const readmeFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    last_updated: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>>;
    status: z.ZodOptional<z.ZodEnum<{
        blocked: "blocked";
        completed: "completed";
        draft: "draft";
        planned: "planned";
        "in-progress": "in-progress";
        archived: "archived";
        superseded: "superseded";
        accepted: "accepted";
        "needs-remediation": "needs-remediation";
        monitoring: "monitoring";
        resolved: "resolved";
        open: "open";
        deprecated: "deprecated";
        current: "current";
        complete: "complete";
        active: "active";
        review: "review";
        deferred: "deferred";
        backlog: "backlog";
        "wont-fix": "wont-fix";
    }>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    related: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodOptional<z.ZodLiteral<"readme">>;
}, z.core.$strip>;
export type ReadmeFrontmatter = z.infer<typeof readmeFrontmatter>;
/**
 * Frontmatter schema for security docs.
 * Located in docs/security/
 */
export declare const securityFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<{
        blocked: "blocked";
        completed: "completed";
        draft: "draft";
        planned: "planned";
        "in-progress": "in-progress";
        archived: "archived";
        superseded: "superseded";
        accepted: "accepted";
        "needs-remediation": "needs-remediation";
        monitoring: "monitoring";
        resolved: "resolved";
        open: "open";
        deprecated: "deprecated";
        current: "current";
        complete: "complete";
        active: "active";
        review: "review";
        deferred: "deferred";
        backlog: "backlog";
        "wont-fix": "wont-fix";
    }>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    related: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodOptional<z.ZodLiteral<"security">>;
    last_updated: z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>;
    severity: z.ZodOptional<z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
        critical: "critical";
        info: "info";
    }>>;
}, z.core.$strip>;
export type SecurityFrontmatter = z.infer<typeof securityFrontmatter>;
/**
 * Frontmatter schema for design docs.
 * Located in docs/design/
 */
export declare const designFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    last_updated: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    related: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodOptional<z.ZodLiteral<"design">>;
    status: z.ZodOptional<z.ZodEnum<{
        draft: "draft";
        deprecated: "deprecated";
        approved: "approved";
        implemented: "implemented";
    }>>;
}, z.core.$strip>;
export type DesignFrontmatter = z.infer<typeof designFrontmatter>;
/**
 * Frontmatter schema for troubleshooting docs.
 * Located in docs/troubleshooting/
 */
export declare const troubleshootingFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    last_updated: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodDate, z.ZodTransform<string | undefined, Date>>]>>;
    authors: z.ZodOptional<z.ZodArray<z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    related: z.ZodOptional<z.ZodArray<z.ZodString>>;
    type: z.ZodOptional<z.ZodLiteral<"troubleshooting">>;
    status: z.ZodOptional<z.ZodEnum<{
        draft: "draft";
        resolved: "resolved";
        open: "open";
        active: "active";
        "wont-fix": "wont-fix";
    }>>;
    affected_versions: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type TroubleshootingFrontmatter = z.infer<typeof troubleshootingFrontmatter>;
/**
 * Frontmatter schema for agent-guide.md (formerly AGENTS.md).
 */
export declare const agentsFrontmatter: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<{
        blocked: "blocked";
        completed: "completed";
        draft: "draft";
        planned: "planned";
        "in-progress": "in-progress";
        archived: "archived";
        superseded: "superseded";
        accepted: "accepted";
        "needs-remediation": "needs-remediation";
        monitoring: "monitoring";
        resolved: "resolved";
        open: "open";
        deprecated: "deprecated";
        current: "current";
        complete: "complete";
        active: "active";
        review: "review";
        deferred: "deferred";
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
//# sourceMappingURL=core.d.ts.map