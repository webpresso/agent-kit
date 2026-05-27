/**
 * `wp_audit` MCP tool.
 *
 * Wraps the existing `wp audit *` subcommands behind one MCP tool with a
 * `kind` enum. Returns a structured `{passed, kind, details}` payload wrapped
 * in MCP `text` content blocks.
 *
 * Most kinds dispatch directly to the library functions exported from
 * `#audit/repo-guardrails`, `#audit/tech-debt`, and `../../vite/local`.
 * The `tph` kind shells out to `bun` because the implementation is a
 * Bun-native script (`src/audit/audit-tph.ts`).
 *
 * Audit failures (whether represented as `ok: false` from the library or
 * as a thrown error) are caught and returned as `{passed: false, ...}`
 * — the handler never throws out, so the MCP server stays responsive.
 */
import { z } from 'zod';
import type { ToolDescriptor } from '#mcp/auto-discover';
declare const inputSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        "no-relative-package-scripts": "no-relative-package-scripts";
        agents: "agents";
        "hook-surface": "hook-surface";
        "tech-debt": "tech-debt";
        tph: "tph";
        "tph-e2e": "tph-e2e";
        "bundle-budget": "bundle-budget";
        "commit-message": "commit-message";
        "blueprint-lifecycle": "blueprint-lifecycle";
        "roadmap-links": "roadmap-links";
        "docs-frontmatter": "docs-frontmatter";
        "catalog-drift": "catalog-drift";
        "package-surface": "package-surface";
        "architecture-drift": "architecture-drift";
        "ai-contracts": "ai-contracts";
    }>;
    cwd: z.ZodOptional<z.ZodString>;
    directory: z.ZodOptional<z.ZodString>;
    messageFile: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type AkAuditInput = z.infer<typeof inputSchema>;
declare const tool: ToolDescriptor;
export default tool;
//# sourceMappingURL=audit.d.ts.map