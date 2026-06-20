/**
 * `wp_audit` MCP tool.
 *
 * Wraps the existing `wp audit *` subcommands behind one MCP tool with a
 * `kind` enum. Returns a structured `{passed, kind, details}` payload wrapped
 * in MCP `text` content blocks.
 *
 * All kinds dispatch directly to the library functions exported from
 * `#audit/repo-guardrails`, `#audit/tech-debt`, `#audit/audit-tph-runner`,
 * `#audit/audit-tph-e2e-runner`, and `../../vite/local`.
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
        "reference-parity-matrix": "reference-parity-matrix";
        agents: "agents";
        "tech-debt": "tech-debt";
        "consumer-agent-kit-dependency": "consumer-agent-kit-dependency";
        "hook-surface": "hook-surface";
        "no-dev-vars": "no-dev-vars";
        "secret-provider-quarantine": "secret-provider-quarantine";
        "secrets-config": "secrets-config";
        "secrets-policy": "secrets-policy";
        tph: "tph";
        "tph-e2e": "tph-e2e";
        "catalog-drift": "catalog-drift";
        "package-surface": "package-surface";
        "docs-frontmatter": "docs-frontmatter";
        "blueprint-readme-drift": "blueprint-readme-drift";
        "blueprint-pr-coverage": "blueprint-pr-coverage";
        "blueprint-lifecycle": "blueprint-lifecycle";
        "architecture-drift": "architecture-drift";
        "cloudflare-deploy-contract": "cloudflare-deploy-contract";
        "absolute-path-policy": "absolute-path-policy";
        "no-first-party-mjs": "no-first-party-mjs";
        "roadmap-links": "roadmap-links";
        "bundle-budget": "bundle-budget";
        "commit-message": "commit-message";
        "harness-surfaces": "harness-surfaces";
        "weakness-mining": "weakness-mining";
        "harness-overlay-evidence": "harness-overlay-evidence";
        "ai-contracts": "ai-contracts";
        "toolchain-isolation": "toolchain-isolation";
        "open-source-licenses": "open-source-licenses";
        "session-memory-hardcut": "session-memory-hardcut";
    }>;
    cwd: z.ZodOptional<z.ZodString>;
    directory: z.ZodOptional<z.ZodString>;
    messageFile: z.ZodOptional<z.ZodString>;
    baseRef: z.ZodOptional<z.ZodString>;
    strict: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type AkAuditInput = z.infer<typeof inputSchema>;
declare const tool: ToolDescriptor;
export default tool;
//# sourceMappingURL=audit.d.ts.map