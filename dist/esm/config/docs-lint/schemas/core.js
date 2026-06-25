import { z } from "zod";
import { baseFrontmatter, dateString } from "./common.js";
/**
 * Frontmatter schema for core documentation files.
 * Located at docs/*.md (root level) - VISION.md, etc.
 */
export const coreFrontmatter = baseFrontmatter.extend({
    type: z.literal("core").optional(),
    /** Last update date (required for core docs) */
    last_updated: dateString,
    /** Document owner */
    owner: z.string().optional(),
});
/**
 * Frontmatter schema for README files.
 */
export const readmeFrontmatter = baseFrontmatter.extend({
    type: z.literal("readme").optional(),
});
/**
 * Frontmatter schema for security docs.
 * Located in docs/security/
 */
export const securityFrontmatter = baseFrontmatter.extend({
    type: z.literal("security").optional(),
    last_updated: dateString,
    severity: z.enum(["critical", "high", "medium", "low", "info"]).optional(),
});
/**
 * Frontmatter schema for design docs.
 * Located in docs/design/
 */
export const designFrontmatter = baseFrontmatter.extend({
    type: z.literal("design").optional(),
    status: z.enum(["draft", "approved", "implemented", "deprecated"]).optional(),
});
/**
 * Frontmatter schema for troubleshooting docs.
 * Located in docs/troubleshooting/
 */
export const troubleshootingFrontmatter = baseFrontmatter.extend({
    type: z.literal("troubleshooting").optional(),
    status: z.enum(["open", "resolved", "wont-fix", "active", "draft"]).optional(),
    affected_versions: z.array(z.string()).optional(),
});
/**
 * Frontmatter schema for agent-guide.md (formerly AGENTS.md).
 */
export const agentsFrontmatter = baseFrontmatter.extend({
    type: z.literal("agents").optional(),
    last_updated: dateString,
    version: z.string().optional(),
});
//# sourceMappingURL=core.js.map