import { z } from "zod";
import { baseFrontmatter, dateString } from "./common.js";
/**
 * Frontmatter schema for audit documents.
 * Located in docs/research/quality-audits/
 */
export const auditFrontmatter = baseFrontmatter.extend({
    type: z.literal("audit").optional(),
    /** Last audit date */
    last_updated: dateString.optional(),
    /** Audit type */
    audit_type: z
        .enum(["code-quality", "security", "performance", "accessibility", "other"])
        .optional(),
    /** Severity of findings */
    severity: z.enum(["critical", "high", "medium", "low", "info"]).optional(),
    /** Number of issues found */
    issues_count: z.number().int().nonnegative().optional(),
});
//# sourceMappingURL=audit.js.map